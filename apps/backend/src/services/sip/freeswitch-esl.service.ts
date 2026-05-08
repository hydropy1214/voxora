import {
  Injectable, OnModuleInit, OnModuleDestroy, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

// modesl is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const esl = require('modesl');

@Injectable()
export class FreeswitchEslService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreeswitchEslService.name);
  private connection: any = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30000;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Defer connection — FreeSWITCH may not be ready immediately
    setTimeout(() => this.connect(), 5000);
  }

  async onModuleDestroy() {
    this.cleanup();
  }

  private async connect() {
    const host = this.config.get('FREESWITCH_HOST', 'localhost');
    const port = this.config.get<number>('FREESWITCH_ESL_PORT', 8021);
    const password = this.config.get('FREESWITCH_ESL_PASSWORD', 'ClueCon');

    this.logger.log(`Connecting to FreeSWITCH ESL at ${host}:${port}...`);

    try {
      const conn = new esl.Connection(host, port, password, () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.logger.log(`Connected to FreeSWITCH ESL at ${host}:${port}`);

        // Subscribe to relevant events
        conn.events('plain', [
          'CHANNEL_ANSWER',
          'CHANNEL_HANGUP_COMPLETE',
          'CHANNEL_PROGRESS',
          'CHANNEL_BRIDGE',
          'CHANNEL_UNBRIDGE',
          'CUSTOM voxora::human_answer',
          'CUSTOM voxora::machine_answer',
          'CUSTOM voxora::amd_uncertain',
          'CUSTOM voxora::fax_detected',
          'CUSTOM voxora::call_complete',
        ].join(' '));

        // Event handlers
        conn.on('esl::event::CHANNEL_ANSWER::**', (evt: any) =>
          this.handleChannelEvent('CHANNEL_ANSWER', evt));

        conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::**', (evt: any) =>
          this.handleChannelEvent('CHANNEL_HANGUP_COMPLETE', evt));

        conn.on('esl::event::CHANNEL_PROGRESS::**', (evt: any) =>
          this.handleChannelEvent('CHANNEL_PROGRESS', evt));

        conn.on('esl::event::CUSTOM::**', (evt: any) => {
          const subclass = evt.getHeader('Event-Subclass') || '';
          if (subclass.startsWith('voxora::')) {
            this.handleVoxoraEvent(subclass.replace('voxora::', ''), evt);
          }
        });

        conn.on('error', (err: Error) => {
          this.logger.error(`ESL error: ${err.message}`);
          this.connected = false;
          this.scheduleReconnect();
        });
      });

      conn.on('error', (err: Error) => {
        this.logger.warn(`ESL connection error: ${err.message}`);
        this.connected = false;
        this.scheduleReconnect();
      });

      this.connection = conn;

    } catch (err: any) {
      this.logger.warn(`ESL connect failed: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private handleChannelEvent(eventName: string, evt: any) {
    const uuid = evt.getHeader('Unique-ID') || '';
    const campaignId = evt.getHeader('variable_voxora_campaign_id') || '';
    const destNum = evt.getHeader('Caller-Destination-Number') || '';

    const payload: Record<string, any> = {
      uuid,
      campaignId,
      phone: destNum,
      eventName,
      timestamp: new Date().toISOString(),
    };

    if (eventName === 'CHANNEL_HANGUP_COMPLETE') {
      payload.hangupCause    = evt.getHeader('Hangup-Cause') || 'UNKNOWN';
      payload.duration       = parseInt(evt.getHeader('variable_billsec') || '0', 10);
      payload.amdResult      = evt.getHeader('variable_amd_result') || null;
      payload.rtpPacketsLost = evt.getHeader('variable_rtp_audio_in_packet_loss_rate') || null;
      payload.rtpMos         = parseFloat(evt.getHeader('variable_rtp_audio_out_mos') || '0') || null;
    }

    if (eventName === 'CHANNEL_ANSWER') {
      payload.answeredAt = new Date().toISOString();
    }

    this.eventEmitter.emit(`freeswitch.${eventName.toLowerCase()}`, payload);
  }

  private handleVoxoraEvent(eventType: string, evt: any) {
    const payload = {
      uuid:       evt.getHeader('call_uuid') || '',
      campaignId: evt.getHeader('campaign_id') || '',
      result:     evt.getHeader('result') || '',
      toneLen:    evt.getHeader('tone_len') || '0',
      timestamp:  new Date().toISOString(),
    };
    this.eventEmitter.emit(`voxora.${eventType}`, payload);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async executeApi(command: string, args = ''): Promise<string> {
    if (!this.connected || !this.connection) {
      throw new Error('Not connected to FreeSWITCH ESL');
    }

    return new Promise((resolve, reject) => {
      this.connection.api(command, args, (res: any) => {
        try {
          const body = res.getBody ? res.getBody() : String(res);
          if (body && body.startsWith('-ERR')) {
            reject(new Error(body.trim()));
          } else {
            resolve(body || '');
          }
        } catch (e: any) {
          reject(new Error(`ESL response parse error: ${e.message}`));
        }
      });
    });
  }

  async originate(params: {
    destination: string;
    gateway: string;
    callerIdNumber?: string;
    callerIdName?: string;
    campaignId: string;
    audioFile?: string;
    voicemailAudio?: string;
    amdEnabled?: boolean;
    amdAction?: string;
    timeout?: number;
  }): Promise<{ uuid: string }> {
    const timeout = params.timeout ?? 60;

    const channelVars = [
      `voxora_campaign_id=${params.campaignId}`,
      `voxora_audio_file=${params.audioFile || ''}`,
      `voxora_voicemail_audio=${params.voicemailAudio || ''}`,
      `voxora_amd_action=${params.amdAction || 'PLAY_ON_HUMAN'}`,
      `voxora_gateway=${params.gateway}`,
      `ignore_early_media=true`,
      `origination_caller_id_name='${(params.callerIdName || 'Voxora').replace(/'/g, '')}'`,
      `origination_caller_id_number='${params.callerIdNumber || ''}'`,
      `originate_timeout=${timeout}`,
      `hangup_after_bridge=true`,
      `execute_on_answer=lua /opt/voxora/amd.lua`,
    ].join(',');

    const dialString = `{${channelVars}}sofia/gateway/${params.gateway}/${params.destination}`;
    const appArg = `&park()`;  // Park the call — AMD Lua handles playback

    const command = `originate ${dialString} ${appArg} XML voxora_outbound`;

    try {
      const result = await this.executeApi(command);
      const uuid = result.trim().replace('+OK ', '').trim();
      this.logger.debug(`Originated call to ${params.destination}: ${uuid}`);
      return { uuid };
    } catch (err: any) {
      this.logger.error(`Originate failed for ${params.destination}: ${err.message}`);
      throw new Error(`SIP originate failed: ${err.message}`);
    }
  }

  async hangup(uuid: string, cause = 'NORMAL_CLEARING'): Promise<void> {
    try {
      await this.executeApi('uuid_kill', `${uuid} ${cause}`);
    } catch (err: any) {
      this.logger.warn(`Hangup failed for ${uuid}: ${err.message}`);
    }
  }

  async getActiveCalls(): Promise<number> {
    try {
      const result = await this.executeApi('show', 'calls count');
      const match = result.match(/(\d+) total/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  async loadGateway(params: {
    id: string;
    server: string;
    username: string;
    password: string;
    port: number;
    transport: string;
    proxy?: string;
    callerIdNumber?: string;
  }): Promise<void> {
    // Create gateway via sofia profile rescan
    // In production, gateways are defined in XML and loaded via sofia profile rescan
    this.logger.log(`Loading SIP gateway: ${params.id} -> ${params.server}:${params.port}`);

    try {
      await this.executeApi('sofia profile voxora_outbound rescan');
      this.logger.log(`Gateway ${params.id} loaded`);
    } catch (err: any) {
      this.logger.warn(`Gateway load warning: ${err.message}`);
    }
  }

  async unloadGateway(name: string): Promise<void> {
    try {
      await this.executeApi(`sofia profile voxora_outbound killgw ${name}`);
    } catch (err: any) {
      this.logger.warn(`Gateway unload warning: ${err.message}`);
    }
  }

  async getGatewayStatus(name: string): Promise<string> {
    try {
      const result = await this.executeApi('sofia status');
      if (result.includes(name)) {
        if (result.includes('REGED')) return 'REGISTERED';
        if (result.includes('NOREG')) return 'UNREGISTERED';
        if (result.includes('TRYING')) return 'REGISTERING';
      }
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  async getSofiaStatus(): Promise<string> {
    try {
      return await this.executeApi('sofia status');
    } catch {
      return 'not connected';
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5)),
      this.MAX_RECONNECT_DELAY,
    );
    this.logger.debug(`Scheduling ESL reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connection) {
      try { this.connection.disconnect(); } catch {}
      this.connection = null;
    }
    this.connected = false;
  }
}
