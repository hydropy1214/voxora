import {
  Injectable, OnModuleInit, OnModuleDestroy, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as esl from 'modesl';

interface EslEvent {
  'Event-Name': string;
  'Unique-ID'?: string;
  'Answer-State'?: string;
  'Hangup-Cause'?: string;
  'variable_voxora_campaign_id'?: string;
  'variable_amd_result'?: string;
  'variable_billsec'?: string;
  'variable_duration'?: string;
  'variable_rtp_audio_in_packet_loss_rate'?: string;
  'variable_rtp_audio_out_mos'?: string;
  body?: string;
  [key: string]: any;
}

@Injectable()
export class FreeswitchEslService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreeswitchEslService.name);
  private connection: any;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.cleanup();
  }

  private async connect() {
    const host = this.config.get('FREESWITCH_HOST', 'localhost');
    const port = this.config.get<number>('FREESWITCH_ESL_PORT', 8021);
    const password = this.config.get('FREESWITCH_ESL_PASSWORD', 'ClueCon');

    try {
      this.connection = new esl.Connection(host, port, password, () => {
        this.connected = true;
        this.logger.log(`Connected to FreeSWITCH ESL at ${host}:${port}`);

        // Subscribe to all events
        this.connection.events('plain', 'ALL');

        this.connection.on('error', (err: Error) => {
          this.logger.error(`ESL error: ${err.message}`);
          this.connected = false;
          this.scheduleReconnect();
        });

        this.connection.on('esl::event::CHANNEL_ANSWER::**', (evt: any) => {
          this.handleEvent('CHANNEL_ANSWER', evt);
        });

        this.connection.on('esl::event::CHANNEL_HANGUP_COMPLETE::**', (evt: any) => {
          this.handleEvent('CHANNEL_HANGUP_COMPLETE', evt);
        });

        this.connection.on('esl::event::CUSTOM::**', (evt: any) => {
          const subclass = evt.getHeader('Event-Subclass');
          if (subclass?.startsWith('voxora::')) {
            this.handleVoxoraEvent(subclass, evt);
          }
        });

        this.connection.on('esl::event::CHANNEL_PROGRESS::**', (evt: any) => {
          this.handleEvent('CHANNEL_PROGRESS', evt);
        });

        this.connection.on('esl::event::CHANNEL_BRIDGE::**', (evt: any) => {
          this.handleEvent('CHANNEL_BRIDGE', evt);
        });
      });

      this.connection.on('error', (err: Error) => {
        this.logger.warn(`ESL connection error: ${err.message}`);
        this.connected = false;
        this.scheduleReconnect();
      });

    } catch (err) {
      this.logger.warn(`ESL connection failed: ${err.message}. Will retry...`);
      this.scheduleReconnect();
    }
  }

  private handleEvent(eventName: string, evt: any) {
    const uuid = evt.getHeader('Unique-ID');
    const campaignId = evt.getHeader('variable_voxora_campaign_id');
    const callerId = evt.getHeader('Caller-Destination-Number');

    const payload: any = {
      uuid,
      campaignId,
      phone: callerId,
      eventName,
    };

    if (eventName === 'CHANNEL_HANGUP_COMPLETE') {
      payload.hangupCause = evt.getHeader('Hangup-Cause');
      payload.duration = parseInt(evt.getHeader('variable_billsec') || '0');
      payload.amdResult = evt.getHeader('variable_amd_result');
      payload.rtpPacketsLost = evt.getHeader('variable_rtp_audio_in_packet_loss_rate');
      payload.rtpMos = parseFloat(evt.getHeader('variable_rtp_audio_out_mos') || '0');
    }

    if (eventName === 'CHANNEL_ANSWER') {
      payload.answeredAt = new Date().toISOString();
    }

    this.eventEmitter.emit(`freeswitch.${eventName.toLowerCase()}`, payload);
  }

  private handleVoxoraEvent(subclass: string, evt: any) {
    const eventType = subclass.replace('voxora::', '');
    const payload = {
      uuid: evt.getHeader('call_uuid'),
      campaignId: evt.getHeader('campaign_id'),
      result: evt.getHeader('result'),
      toneLen: evt.getHeader('tone_len'),
    };

    this.eventEmitter.emit(`voxora.${eventType}`, payload);
  }

  async executeApi(command: string, args?: string): Promise<string> {
    if (!this.connected) throw new Error('Not connected to FreeSWITCH ESL');

    return new Promise((resolve, reject) => {
      this.connection.api(command, args || '', (res: any) => {
        const body = res.getBody();
        if (body.startsWith('-ERR')) {
          reject(new Error(body));
        } else {
          resolve(body);
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
    const callerId = `${params.callerIdName || 'Voxora'} <${params.callerIdNumber || 'unknown'}>`;

    const channelVars = [
      `voxora_campaign_id=${params.campaignId}`,
      `voxora_audio_file=${params.audioFile || ''}`,
      `voxora_voicemail_audio=${params.voicemailAudio || ''}`,
      `voxora_amd_action=${params.amdAction || 'PLAY_ON_HUMAN'}`,
      `ignore_early_media=true`,
      `origination_caller_id_name='${params.callerIdName || 'Voxora'}'`,
      `origination_caller_id_number='${params.callerIdNumber || ''}'`,
      `originate_timeout=${timeout}`,
      `hangup_after_bridge=true`,
    ].join(',');

    const dialString = `{${channelVars}}sofia/gateway/${params.gateway}/${params.destination}`;
    const dialplan = params.amdEnabled ? '&lua(/opt/voxora/amd.lua)' : `&playback(${params.audioFile})`;

    const command = `originate ${dialString} ${dialplan} XML voxora_outbound`;

    try {
      const result = await this.executeApi(command);
      const uuid = result.trim().replace('+OK ', '');
      return { uuid };
    } catch (err) {
      throw new Error(`Originate failed: ${err.message}`);
    }
  }

  async hangup(uuid: string, cause = 'NORMAL_CLEARING') {
    return this.executeApi('uuid_kill', `${uuid} ${cause}`);
  }

  async loadGateway(params: {
    name: string;
    server: string;
    username: string;
    password: string;
    port: number;
    transport: string;
  }) {
    const gatewayXml = `<gateway name="${params.name}">
      <param name="realm" value="${params.server}"/>
      <param name="proxy" value="${params.server}:${params.port}"/>
      <param name="username" value="${params.username}"/>
      <param name="password" value="${params.password}"/>
      <param name="transport" value="${params.transport.toLowerCase()}"/>
      <param name="register" value="true"/>
      <param name="ping" value="25"/>
    </gateway>`;

    await this.executeApi('sofia profile voxora_outbound rescan');
  }

  async unloadGateway(name: string) {
    await this.executeApi(`sofia profile voxora_outbound killgw ${name}`);
  }

  async getGatewayStatus(name: string): Promise<string> {
    try {
      const result = await this.executeApi('sofia status');
      if (result.includes(`${name}`) && result.includes('REGED')) return 'REGISTERED';
      if (result.includes(`${name}`) && result.includes('NOREG')) return 'UNREGISTERED';
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private scheduleReconnect(delay = 5000) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connection) {
      try { this.connection.disconnect(); } catch {}
    }
  }
}
