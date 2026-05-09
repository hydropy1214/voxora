import {
  Injectable, OnModuleInit, OnModuleDestroy, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

// modesl MUST be required(), not import * as — it's a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const esl = require('modesl');

/**
 * FreeSWITCH ESL Service
 *
 * Manages the persistent Event Socket connection to FreeSWITCH.
 *
 * Responsibilities:
 * - Connection lifecycle (connect, reconnect with exponential backoff)
 * - Event subscription and forwarding to NestJS EventEmitter
 * - ESL API command execution (originate, uuid_kill, sofia status, etc.)
 *
 * Call flow:
 *   CampaignProcessor.placeCall()
 *     → this.originate(params)
 *       → FreeSWITCH places SIP INVITE via registered gateway
 *         → ESL events come back: CHANNEL_PROGRESS → CHANNEL_ANSWER → CHANNEL_HANGUP_COMPLETE
 *           → SipService handles events → updates DB + WebSocket
 */
@Injectable()
export class FreeswitchEslService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreeswitchEslService.name);
  private connection: any = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 5000;
  private readonly MAX_RECONNECT_DELAY = 60_000;
  private readonly ESL_EVENTS = [
    'CHANNEL_ANSWER',
    'CHANNEL_HANGUP_COMPLETE',
    'CHANNEL_PROGRESS',
    'CHANNEL_PROGRESS_MEDIA',
    'CHANNEL_BRIDGE',
    'CHANNEL_UNBRIDGE',
    'CHANNEL_DESTROY',
    'BACKGROUND_JOB',
    'CUSTOM',
  ].join(' ');

  constructor(
    private config: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Defer 8s — FreeSWITCH needs ~60s to start, but we try early and retry
    setTimeout(() => this.connect(), 8000);
  }

  async onModuleDestroy() {
    this.cleanup();
  }

  // ── Connection management ─────────────────────────────────────────────────

  private connect() {
    const host     = this.config.get('FREESWITCH_HOST', 'freeswitch');
    const port     = this.config.get<number>('FREESWITCH_ESL_PORT', 8021);
    const password = this.config.get('FREESWITCH_ESL_PASSWORD', 'ClueCon');

    this.logger.log(`ESL: connecting to ${host}:${port}...`);

    try {
      const conn = new esl.Connection(host, port, password, () => {
        this.connection = conn;
        this.connected  = true;
        this.reconnectDelay = 5000; // reset backoff on success

        this.logger.log(`ESL: connected to FreeSWITCH at ${host}:${port}`);

        // Subscribe to all necessary events
        conn.events('plain', this.ESL_EVENTS);

        // Bind event handlers
        conn.on('esl::event::CHANNEL_PROGRESS::**',        (e: any) => this.dispatch('CHANNEL_PROGRESS', e));
        conn.on('esl::event::CHANNEL_PROGRESS_MEDIA::**',  (e: any) => this.dispatch('CHANNEL_PROGRESS_MEDIA', e));
        conn.on('esl::event::CHANNEL_ANSWER::**',          (e: any) => this.dispatch('CHANNEL_ANSWER', e));
        conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::**', (e: any) => this.dispatch('CHANNEL_HANGUP_COMPLETE', e));
        conn.on('esl::event::CHANNEL_BRIDGE::**',          (e: any) => this.dispatch('CHANNEL_BRIDGE', e));
        conn.on('esl::event::CHANNEL_DESTROY::**',         (e: any) => this.dispatch('CHANNEL_DESTROY', e));
        conn.on('esl::event::BACKGROUND_JOB::**',          (e: any) => this.dispatchJobResult(e));

        conn.on('esl::event::CUSTOM::**', (e: any) => {
          const subclass = e.getHeader('Event-Subclass') || '';
          if (subclass.startsWith('callspsy::')) {
            this.dispatchCallsPsy(subclass.replace('callspsy::', ''), e);
          }
        });

        conn.on('error', (err: Error) => {
          this.logger.error(`ESL error: ${err.message}`);
          this.connected = false;
          this.scheduleReconnect();
        });

        // Tell SipAccountsService to re-register all gateways
        this.eventEmitter.emit('freeswitch.connected', {});
      });

      conn.on('error', (err: Error) => {
        this.logger.warn(`ESL connect error: ${err.message}`);
        this.connected = false;
        this.scheduleReconnect();
      });

      this.connection = conn;

    } catch (err: any) {
      this.logger.warn(`ESL exception: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.MAX_RECONNECT_DELAY);
    this.logger.debug(`ESL: reconnecting in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
  }

  private cleanup() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.connection) {
      try { this.connection.disconnect(); } catch {}
      this.connection = null;
    }
    this.connected = false;
  }

  // ── Event dispatchers ─────────────────────────────────────────────────────

  private dispatch(eventName: string, evt: any) {
    const uuid       = evt.getHeader('Unique-ID')                       || '';
    const campaignId = evt.getHeader('variable_callspsy_campaign_id')   || '';
    const callLogId  = evt.getHeader('variable_callspsy_call_log_id')   || '';
    const phone      = evt.getHeader('Caller-Destination-Number')       || '';

    const payload: Record<string, any> = {
      uuid, campaignId, callLogId, phone, eventName,
      timestamp: new Date().toISOString(),
    };

    if (eventName === 'CHANNEL_HANGUP_COMPLETE') {
      payload.hangupCause    = evt.getHeader('Hangup-Cause')                               || 'UNKNOWN';
      payload.duration       = parseInt(evt.getHeader('variable_billsec')           || '0', 10);
      payload.amdResult      = evt.getHeader('variable_amd_result')                        || null;
      payload.rtpPacketsLost = parseInt(evt.getHeader('variable_rtp_audio_in_jitter_packet_count') || '0', 10);
      payload.rtpMos         = parseFloat(evt.getHeader('variable_rtp_quality_percentage_set_of_five') || '0') / 20 || null;
      payload.sipStatus      = parseInt(evt.getHeader('variable_last_bridge_proto_specific_hangup_cause') || '0', 10);
    }

    if (eventName === 'CHANNEL_ANSWER') {
      payload.answeredAt = new Date().toISOString();
    }

    this.eventEmitter.emit(`freeswitch.${eventName.toLowerCase()}`, payload);
  }

  private dispatchCallsPsy(eventType: string, evt: any) {
    const payload = {
      uuid:       evt.getHeader('call_uuid')    || '',
      campaignId: evt.getHeader('campaign_id')  || '',
      callLogId:  evt.getHeader('call_log_id')  || '',
      result:     evt.getHeader('result')        || '',
      toneLen:    parseInt(evt.getHeader('tone_len') || '0', 10),
      timestamp:  new Date().toISOString(),
    };
    this.eventEmitter.emit(`callspsy.${eventType}`, payload);
  }

  private dispatchJobResult(evt: any) {
    const jobUUID = evt.getHeader('Job-UUID');
    const body    = evt.getBody();
    this.eventEmitter.emit('freeswitch.background_job', { jobUUID, body });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Execute a FreeSWITCH API command synchronously.
   * Returns the response body as a string.
   */
  async executeApi(command: string, args = ''): Promise<string> {
    if (!this.connected || !this.connection) {
      throw new Error('FreeSWITCH ESL not connected');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(`ESL API timeout: ${command}`)), 10_000);

      this.connection.api(command, args, (res: any) => {
        clearTimeout(timeoutId);
        try {
          const body = res.getBody ? String(res.getBody()) : String(res);
          if (body.startsWith('-ERR')) {
            reject(new Error(body.trim()));
          } else {
            resolve(body);
          }
        } catch (e: any) {
          reject(new Error(`ESL parse error: ${e.message}`));
        }
      });
    });
  }

  /**
   * Place an outbound call via a registered SIP gateway.
   *
   * The gateway name in FreeSWITCH is the SIP account UUID (set when the
   * user creates the account and we write the XML).
   *
   * The dialplan (callspsy_outbound) reads channel variables set here:
   *   callspsy_campaign_id, callspsy_call_log_id, callspsy_audio_file,
   *   callspsy_voicemail_audio, callspsy_amd_action
   *
   * After answer, execute_on_answer triggers the AMD Lua script.
   */
  async originate(params: {
    destination:     string;
    gatewayId:       string;   // SIP account UUID = FreeSWITCH gateway name
    callerIdNumber?: string;
    callerIdName?:   string;
    campaignId:      string;
    callLogId:       string;
    audioFile?:      string;
    voicemailAudio?: string;
    amdEnabled?:     boolean;
    amdAction?:      string;
    timeout?:        number;
  }): Promise<{ uuid: string }> {
    if (!this.connected) {
      throw new Error('FreeSWITCH ESL not connected — cannot place call');
    }

    const timeout = params.timeout ?? 60;
    const cidName = (params.callerIdName  || 'CallsPsy').replace(/'/g, '');
    const cidNum  = (params.callerIdNumber || '').replace(/'/g, '');
    const action  = params.amdAction || 'PLAY_ON_HUMAN';
    const audioPath      = params.audioFile      || '';
    const voicemailPath  = params.voicemailAudio || '';

    // Channel variables passed to FreeSWITCH dialplan and AMD Lua script
    const vars = [
      `origination_caller_id_name='${cidName}'`,
      `origination_caller_id_number='${cidNum}'`,
      `originate_timeout=${timeout}`,
      `hangup_after_bridge=true`,
      `ignore_early_media=false`,
      `callspsy_campaign_id=${params.campaignId}`,
      `callspsy_call_log_id=${params.callLogId}`,
      `callspsy_audio_file=${audioPath}`,
      `callspsy_voicemail_audio=${voicemailPath}`,
      `callspsy_amd_action=${action}`,
      `callspsy_gateway=${params.gatewayId}`,
      // Answer immediately in the dialplan, then run AMD Lua via execute_on_answer
      `execute_on_answer=lua /opt/callspsy/amd.lua`,
    ].join(',');

    // Dial string: sofia/gateway/<gateway-name>/<destination>
    // The gateway name is the SIP account UUID as written in the XML file
    const dialString = `{${vars}}sofia/gateway/${params.gatewayId}/${params.destination}`;

    // Application: &park() — the call is parked after answer.
    // The execute_on_answer Lua script handles audio playback and hangup.
    const appArg = '&park()';

    const command = `originate ${dialString} ${appArg}`;

    this.logger.debug(
      `ESL originate: ${params.destination} via gateway=${params.gatewayId}`,
    );

    try {
      const result = await this.executeApi(command);
      // +OK <uuid>  or  -ERR <reason>
      const uuid = result.replace('+OK', '').trim();
      if (!uuid) throw new Error(`Empty UUID in originate response: "${result}"`);

      this.logger.log(`Call originated: uuid=${uuid} dest=${params.destination}`);
      return { uuid };

    } catch (err: any) {
      this.logger.error(
        `Originate FAILED: dest=${params.destination} gw=${params.gatewayId} ` +
        `err=${err.message}`,
      );
      throw new Error(`SIP originate failed: ${err.message}`);
    }
  }

  /**
   * Hang up an active call by UUID.
   */
  async hangup(uuid: string, cause = 'NORMAL_CLEARING'): Promise<void> {
    try {
      await this.executeApi('uuid_kill', `${uuid} ${cause}`);
    } catch (err: any) {
      this.logger.warn(`hangup(${uuid}): ${err.message}`);
    }
  }

  /**
   * Get the number of active calls from FreeSWITCH.
   */
  async getActiveCalls(): Promise<number> {
    try {
      const result = await this.executeApi('show calls count');
      const match  = result.match(/(\d+)\s+total/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get the full sofia profile status (for admin/debug).
   */
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
}
