import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { FreeswitchEslService } from './freeswitch-esl.service';
import { CryptoService } from '../crypto/crypto.service';

export interface GatewayConfig {
  id: string;           // Used as gateway name in FreeSWITCH (unique per SIP account)
  name: string;         // Human-readable name (for display)
  sipServer: string;
  sipPort: number;
  username: string;
  password: string;     // Plaintext — used directly in FreeSWITCH XML
  transport: 'udp' | 'tcp' | 'tls';
  proxy?: string;
  outboundProxy?: string;
  fromDomain?: string;
  callerIdNumber?: string;
  callerIdName?: string;
  maxConcurrentCalls: number;
}

/**
 * GatewayManagerService
 *
 * Manages FreeSWITCH SIP gateway registration by:
 * 1. Writing per-account XML files to the gateway directory
 * 2. Signalling FreeSWITCH to reload via ESL (sofia profile rescan)
 * 3. Monitoring registration status
 *
 * Gateway directory is a writable volume shared between backend and
 * FreeSWITCH containers. FreeSWITCH's sofia profile scans this directory.
 *
 * Layout:
 *   /var/callspsy/gateways/<account-id>.xml
 *
 * FreeSWITCH sofia profile references:
 *   <X-PRE-PROCESS cmd="include" data="/var/callspsy/gateways/*.xml"/>
 */
@Injectable()
export class GatewayManagerService implements OnModuleInit {
  private readonly logger = new Logger(GatewayManagerService.name);
  private readonly gatewayDir: string;

  constructor(
    private config: ConfigService,
    private esl: FreeswitchEslService,
    private crypto: CryptoService,
  ) {
    this.gatewayDir = config.get('FREESWITCH_GATEWAY_DIR', '/var/callspsy/gateways');
  }

  async onModuleInit() {
    // Ensure directory exists
    try {
      fs.mkdirSync(this.gatewayDir, { recursive: true });
      this.logger.log(`Gateway directory ready: ${this.gatewayDir}`);
    } catch (e: any) {
      this.logger.warn(`Cannot create gateway directory ${this.gatewayDir}: ${e.message}`);
    }
  }

  /**
   * Register a SIP account as a FreeSWITCH gateway.
   * Writes XML config and triggers sofia reload.
   */
  async register(cfg: GatewayConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const xml = this.buildGatewayXml(cfg);
      const filePath = path.join(this.gatewayDir, `${cfg.id}.xml`);

      await fs.promises.writeFile(filePath, xml, 'utf8');
      this.logger.log(`Gateway XML written: ${filePath}`);

      // Ask FreeSWITCH to reload
      await this.reloadSofiaProfile();

      return { success: true };
    } catch (e: any) {
      this.logger.error(`Gateway registration failed for ${cfg.id}: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Remove a gateway and reload FreeSWITCH.
   */
  async unregister(accountId: string): Promise<void> {
    const filePath = path.join(this.gatewayDir, `${accountId}.xml`);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.log(`Gateway XML removed: ${filePath}`);
      }

      // Kill the gateway in FreeSWITCH if ESL is connected
      if (this.esl.isConnected()) {
        await this.esl.executeApi(
          'sofia profile callspsy_outbound killgw',
          accountId,
        ).catch(() => {}); // Ignore if gateway wasn't registered
      }
    } catch (e: any) {
      this.logger.warn(`Gateway unregister warning for ${accountId}: ${e.message}`);
    }
  }

  /**
   * Get registration status of a specific gateway.
   */
  async getStatus(accountId: string): Promise<string> {
    if (!this.esl.isConnected()) return 'ESL_DISCONNECTED';

    try {
      const result = await this.esl.executeApi('sofia status gateway', accountId);
      if (result.includes('REGED'))   return 'REGISTERED';
      if (result.includes('TRYING'))  return 'REGISTERING';
      if (result.includes('FAILED'))  return 'FAILED';
      if (result.includes('NOREG'))   return 'UNREGISTERED';
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  /**
   * List all registered gateways and their status from FreeSWITCH.
   */
  async listGateways(): Promise<Array<{ id: string; status: string; realm: string }>> {
    if (!this.esl.isConnected()) return [];

    try {
      const result = await this.esl.executeApi('sofia status');
      const gateways: Array<{ id: string; status: string; realm: string }> = [];
      const lines = result.split('\n');

      for (const line of lines) {
        // FreeSWITCH sofia status gateway line format:
        // gateway-name     realm         username     status
        const match = line.match(/^\s+([\w-]+)\s+(\S+)\s+\S+\s+(REGED|NOREG|TRYING|FAILED)/);
        if (match) {
          gateways.push({
            id: match[1],
            realm: match[2],
            status: this.normalizeStatus(match[3]),
          });
        }
      }
      return gateways;
    } catch {
      return [];
    }
  }

  /**
   * Re-register all gateways that have XML files on disk.
   * Called at startup and after FreeSWITCH reconnects.
   */
  async reloadAll(): Promise<void> {
    this.logger.log('Reloading all gateways...');
    try {
      const files = fs.readdirSync(this.gatewayDir).filter(f => f.endsWith('.xml'));
      this.logger.log(`Found ${files.length} gateway config file(s)`);
      if (files.length > 0) {
        await this.reloadSofiaProfile();
      }
    } catch (e: any) {
      this.logger.warn(`Gateway reload warning: ${e.message}`);
    }
  }

  /**
   * Convert stored (AES-encrypted) password to plaintext for XML.
   */
  decryptPassword(storedPassword: string): string {
    if (!this.crypto.isEncrypted(storedPassword)) {
      // Old bcrypt hash — cannot decrypt. Return placeholder.
      // User must re-save the account to update the password.
      this.logger.warn('Cannot decrypt bcrypt-hashed SIP password. User must re-save account.');
      return 'PLEASE_RESAVE_ACCOUNT';
    }
    return this.crypto.decrypt(storedPassword);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async reloadSofiaProfile(): Promise<void> {
    if (!this.esl.isConnected()) {
      this.logger.warn('ESL not connected — gateway config written to disk but not loaded yet');
      return;
    }

    try {
      // sofia profile rescan reads new/changed gateway XML files
      await this.esl.executeApi('sofia profile callspsy_outbound rescan');
      this.logger.log('FreeSWITCH sofia profile rescanned');
    } catch (e: any) {
      this.logger.warn(`Sofia rescan warning: ${e.message}`);
    }
  }

  private buildGatewayXml(cfg: GatewayConfig): string {
    const proxy = cfg.proxy || `${cfg.sipServer}:${cfg.sipPort}`;
    const outboundProxy = cfg.outboundProxy || proxy;
    const fromDomain = cfg.fromDomain || cfg.sipServer;
    const transport = cfg.transport.toLowerCase();

    return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  CallsPsy SIP Gateway: ${cfg.name}
  Account ID: ${cfg.id}
  Auto-generated — do not edit manually.
-->
<include>
  <gateway name="${cfg.id}">

    <!-- Server -->
    <param name="realm"           value="${cfg.sipServer}"/>
    <param name="proxy"           value="${proxy}"/>
    <param name="register-proxy"  value="${outboundProxy}"/>

    <!-- Credentials -->
    <param name="username"        value="${cfg.username}"/>
    <param name="password"        value="${cfg.password}"/>
    <param name="from-user"       value="${cfg.username}"/>
    <param name="from-domain"     value="${fromDomain}"/>

    <!-- Transport -->
    <param name="transport"       value="${transport}"/>

    <!-- Caller ID -->
    <param name="caller-id-in-from" value="false"/>
    <param name="extension"       value="${cfg.callerIdNumber || cfg.username}"/>
    <param name="extension-in-contact" value="true"/>

    <!-- Registration -->
    <param name="register"        value="true"/>
    <param name="register-transport" value="${transport}"/>
    <param name="retry-seconds"   value="30"/>
    <param name="expire-seconds"  value="600"/>
    <param name="ping"            value="25"/>
    <param name="ping-max"        value="3"/>
    <param name="ping-min"        value="1"/>

    <!-- Outbound calls -->
    <param name="outbound-proxy"  value="${outboundProxy}"/>
    <param name="context"         value="callspsy_outbound"/>

    <!-- Suppress CNG (comfort noise) -->
    <param name="suppress-cng"    value="true"/>

    <!-- Max concurrent calls handled in campaign processor, not here -->

  </gateway>
</include>
`;
  }

  private normalizeStatus(fsStatus: string): string {
    const map: Record<string, string> = {
      REGED: 'REGISTERED',
      NOREG: 'UNREGISTERED',
      TRYING: 'REGISTERING',
      FAILED: 'FAILED',
    };
    return map[fsStatus] ?? fsStatus;
  }
}
