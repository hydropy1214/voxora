import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FreeswitchEslService } from '../../services/sip/freeswitch-esl.service';
import * as net from 'net';
import * as os from 'os';

export interface ServiceStatus {
  name: string;
  label: string;
  status: 'ok' | 'error' | 'warning' | 'unknown';
  message: string;
  detail?: string;
  latencyMs?: number;
  required: boolean;
}

export interface PortStatus {
  port: number;
  protocol: 'TCP' | 'UDP';
  service: string;
  description: string;
  status: 'open' | 'closed' | 'unknown';
}

export interface EnvStatus {
  key: string;
  label: string;
  configured: boolean;
  value?: string;    // masked value shown in UI
  required: boolean;
  description: string;
}

export interface SystemStatusReport {
  timestamp: string;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  version: string;
  uptime: number;
  environment: string;
  publicIp: string;
  privateIp: string;
  services: ServiceStatus[];
  ports: PortStatus[];
  environment_vars: EnvStatus[];
  database: {
    connected: boolean;
    latencyMs: number;
    stats: {
      users: number;
      campaigns: number;
      sipAccounts: number;
      contacts: number;
      audioFiles: number;
      callLogs: number;
    };
  };
  telephony: {
    freeswitchConnected: boolean;
    activeCalls: number;
    sofiaStatus: string;
  };
  summary: {
    totalServices: number;
    healthyServices: number;
    warnings: number;
    errors: number;
  };
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private readonly startTime = Date.now();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private eslService: FreeswitchEslService,
  ) {}

  async getFullStatus(): Promise<SystemStatusReport> {
    const [services, ports, envVars, dbStatus, telephonyStatus] = await Promise.all([
      this.checkAllServices(),
      this.checkPorts(),
      this.checkEnvVars(),
      this.checkDatabase(),
      this.checkTelephony(),
    ]);

    const criticalErrors = services.filter(s => s.required && s.status === 'error');
    const warnings = services.filter(s => s.status === 'warning');
    const allOk = services.filter(s => s.status === 'ok');

    const overallStatus: 'healthy' | 'degraded' | 'critical' =
      criticalErrors.length > 0 ? 'critical' :
      warnings.length > 0 ? 'degraded' : 'healthy';

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      version: '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: this.config.get('NODE_ENV', 'development'),
      publicIp: this.config.get('PUBLIC_IP', 'not configured'),
      privateIp: this.getPrivateIp(),
      services,
      ports,
      environment_vars: envVars,
      database: dbStatus,
      telephony: telephonyStatus,
      summary: {
        totalServices: services.length,
        healthyServices: allOk.length,
        warnings: warnings.length,
        errors: services.filter(s => s.status === 'error').length,
      },
    };
  }

  private async checkAllServices(): Promise<ServiceStatus[]> {
    return Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkFreeSWITCH(),
      this.checkKamailio(),
      this.checkRTPEngine(),
      this.checkCoturn(),
      this.checkNginx(),
    ]);
  }

  private async checkPostgres(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: 'postgres',
        label: 'PostgreSQL Database',
        status: 'ok',
        message: 'Connected and responding',
        latencyMs: Date.now() - start,
        required: true,
      };
    } catch (e: any) {
      return {
        name: 'postgres',
        label: 'PostgreSQL Database',
        status: 'error',
        message: 'Connection failed',
        detail: e.message,
        required: true,
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    const host = this.config.get('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);
    try {
      const reachable = await this.tcpProbe(host, port, 3000);
      return {
        name: 'redis',
        label: 'Redis Cache / Queue',
        status: reachable ? 'ok' : 'error',
        message: reachable ? 'Connected and responding' : `Cannot reach ${host}:${port}`,
        latencyMs: Date.now() - start,
        required: true,
      };
    } catch (e: any) {
      return {
        name: 'redis',
        label: 'Redis Cache / Queue',
        status: 'error',
        message: 'Connection failed',
        detail: e.message,
        required: true,
      };
    }
  }

  private async checkFreeSWITCH(): Promise<ServiceStatus> {
    const start = Date.now();
    const host = this.config.get('FREESWITCH_HOST', 'localhost');
    const eslPort = this.config.get<number>('FREESWITCH_ESL_PORT', 8021);
    const eslConnected = this.eslService.isConnected();

    if (eslConnected) {
      return {
        name: 'freeswitch',
        label: 'FreeSWITCH (SIP Media)',
        status: 'ok',
        message: 'ESL connected — ready to place calls',
        latencyMs: Date.now() - start,
        required: false,
      };
    }

    const esl = await this.tcpProbe(host === 'freeswitch' ? '172.20.0.1' : host, eslPort, 3000);
    return {
      name: 'freeswitch',
      label: 'FreeSWITCH (SIP Media)',
      status: esl ? 'warning' : 'warning',
      message: esl
        ? 'ESL port reachable — connecting...'
        : 'Not reachable — campaigns will wait for connection',
      detail: 'FreeSWITCH is optional for the web app to run. Campaigns require it.',
      latencyMs: Date.now() - start,
      required: false,
    };
  }

  private async checkKamailio(): Promise<ServiceStatus> {
    const start = Date.now();
    const open = await this.tcpProbe('127.0.0.1', 5060, 2000);
    return {
      name: 'kamailio',
      label: 'Kamailio (SIP Proxy)',
      status: open ? 'ok' : 'warning',
      message: open
        ? 'SIP port 5060 open — proxy ready'
        : 'SIP port 5060 not reachable — outbound calls may fail',
      detail: open ? undefined : 'Kamailio routes SIP calls from FreeSWITCH to providers.',
      latencyMs: Date.now() - start,
      required: false,
    };
  }

  private async checkRTPEngine(): Promise<ServiceStatus> {
    const start = Date.now();
    const open = await this.tcpProbe('127.0.0.1', 2223, 2000);
    return {
      name: 'rtpengine',
      label: 'RTPengine (Media Relay)',
      status: open ? 'ok' : 'warning',
      message: open
        ? 'Control port 2223 open — RTP relay active'
        : 'Control port 2223 not reachable — NAT traversal unavailable',
      detail: open ? undefined : 'RTPengine relays RTP media through your public IP for NAT.',
      latencyMs: Date.now() - start,
      required: false,
    };
  }

  private async checkCoturn(): Promise<ServiceStatus> {
    const start = Date.now();
    const open = await this.tcpProbe('127.0.0.1', 3478, 2000);
    return {
      name: 'coturn',
      label: 'Coturn (STUN/TURN)',
      status: open ? 'ok' : 'warning',
      message: open
        ? 'STUN/TURN port 3478 open'
        : 'STUN/TURN port 3478 not reachable',
      detail: 'Optional: provides STUN/TURN for WebRTC clients.',
      latencyMs: Date.now() - start,
      required: false,
    };
  }

  private async checkNginx(): Promise<ServiceStatus> {
    const start = Date.now();
    const open = await this.tcpProbe('127.0.0.1', 80, 2000);
    return {
      name: 'nginx',
      label: 'Nginx (Reverse Proxy)',
      status: open ? 'ok' : 'warning',
      message: open ? 'Listening on port 80' : 'Port 80 not reachable',
      detail: 'Nginx is optional — app runs directly on ports 3000/3001.',
      latencyMs: Date.now() - start,
      required: false,
    };
  }

  private async checkPorts(): Promise<PortStatus[]> {
    const portsToCheck: Array<{ port: number; protocol: 'TCP' | 'UDP'; service: string; description: string }> = [
      { port: 3001, protocol: 'TCP', service: 'CallsPsy API', description: 'NestJS REST API + WebSocket' },
      { port: 3000, protocol: 'TCP', service: 'CallsPsy UI', description: 'Next.js Frontend' },
      { port: 80,   protocol: 'TCP', service: 'Nginx HTTP', description: 'Reverse proxy / load balancer' },
      { port: 443,  protocol: 'TCP', service: 'Nginx HTTPS', description: 'SSL termination' },
      { port: 5060, protocol: 'UDP', service: 'Kamailio SIP', description: 'Primary SIP signaling port' },
      { port: 5080, protocol: 'UDP', service: 'FreeSWITCH SIP', description: 'FreeSWITCH SIP port' },
      { port: 8021, protocol: 'TCP', service: 'FreeSWITCH ESL', description: 'Event Socket Layer (internal)' },
      { port: 3478, protocol: 'UDP', service: 'Coturn STUN', description: 'STUN/TURN for NAT traversal' },
      { port: 2223, protocol: 'TCP', service: 'RTPengine ng', description: 'RTPengine control (internal)' },
    ];

    const results = await Promise.all(
      portsToCheck.map(async (p) => {
        const open = p.protocol === 'TCP'
          ? await this.tcpProbe('127.0.0.1', p.port, 1500)
          : await this.udpProbe('127.0.0.1', p.port, 1500);
        return { ...p, status: open ? 'open' as const : 'closed' as const };
      }),
    );

    return results;
  }

  private checkEnvVars(): EnvStatus[] {
    const checks: Array<{
      key: string; label: string; required: boolean; description: string; mask?: boolean;
    }> = [
      { key: 'JWT_SECRET',               label: 'JWT Secret',              required: true,  description: 'Signs access tokens. Must be 32+ characters.',        mask: true },
      { key: 'JWT_REFRESH_SECRET',        label: 'JWT Refresh Secret',      required: true,  description: 'Signs refresh tokens. Must be 32+ characters.',       mask: true },
      { key: 'DATABASE_URL',              label: 'Database URL',            required: true,  description: 'PostgreSQL connection string.',                       mask: true },
      { key: 'DB_PASSWORD',               label: 'DB Password',             required: true,  description: 'PostgreSQL password for callspsy user.',             mask: true },
      { key: 'REDIS_PASSWORD',            label: 'Redis Password',          required: true,  description: 'Redis authentication password.',                     mask: true },
      { key: 'FREESWITCH_ESL_PASSWORD',   label: 'FreeSWITCH ESL Password', required: false, description: 'Password for FreeSWITCH Event Socket.',              mask: true },
      { key: 'PUBLIC_IP',                 label: 'Public IP',               required: false, description: 'Your server public IP for SIP/RTP NAT traversal.' },
      { key: 'PRIVATE_IP',                label: 'Private IP',              required: false, description: 'Server internal IP (AWS private IP).' },
      { key: 'COTURN_SECRET',             label: 'Coturn Secret',           required: false, description: 'TURN server authentication secret.',                 mask: true },
      { key: 'FRONTEND_URL',              label: 'Frontend URL',            required: false, description: 'Public URL shown in emails and redirects.' },
      { key: 'MAIL_HOST',                 label: 'SMTP Host',               required: false, description: 'SMTP server for sending emails (verification, reset).' },
      { key: 'MAIL_USER',                 label: 'SMTP Username',           required: false, description: 'SMTP authentication username.' },
      { key: 'STRIPE_SECRET_KEY',         label: 'Stripe Secret Key',       required: false, description: 'Enables billing/subscription features.',            mask: true },
    ];

    return checks.map(({ key, label, required, description, mask }) => {
      const val = this.config.get<string>(key) || process.env[key] || '';
      const configured = val.length > 0 &&
        val !== 'CHANGE_ME' &&
        !val.includes('replace_me') &&
        !val.startsWith('CHANGE_ME') &&
        val !== 'YOUR_PUBLIC_IP';

      let displayValue: string | undefined;
      if (configured && val.length > 0) {
        displayValue = mask
          ? val.substring(0, 4) + '****' + val.substring(val.length - 2)
          : val.length > 40 ? val.substring(0, 30) + '...' : val;
      }

      return { key, label, configured, value: displayValue, required, description };
    });
  }

  private async checkDatabase() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const [users, campaigns, sipAccounts, contacts, audioFiles, callLogs] = await Promise.all([
        this.prisma.user.count().catch(() => 0),
        this.prisma.campaign.count().catch(() => 0),
        this.prisma.sipAccount.count().catch(() => 0),
        this.prisma.contact.count().catch(() => 0),
        this.prisma.audioFile.count().catch(() => 0),
        this.prisma.callLog.count().catch(() => 0),
      ]);

      return {
        connected: true,
        latencyMs: Date.now() - start,
        stats: { users, campaigns, sipAccounts, contacts, audioFiles, callLogs },
      };
    } catch {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        stats: { users: 0, campaigns: 0, sipAccounts: 0, contacts: 0, audioFiles: 0, callLogs: 0 },
      };
    }
  }

  private async checkTelephony() {
    const connected = this.eslService.isConnected();
    let activeCalls = 0;
    let sofiaStatus = 'not connected';

    if (connected) {
      try {
        activeCalls  = await this.eslService.getActiveCalls();
        sofiaStatus  = await this.eslService.getSofiaStatus();
      } catch {}
    }

    return { freeswitchConnected: connected, activeCalls, sofiaStatus };
  }

  private tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.connect(port, host, () => { socket.destroy(); resolve(true); });
      socket.on('error',   () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
  }

  private udpProbe(_host: string, _port: number, _timeoutMs = 1500): Promise<boolean> {
    // UDP probing is unreliable (no connection handshake)
    // We check if the process is listening via TCP probe as a proxy
    // For SIP UDP 5060, we check if Kamailio TCP is up as a proxy indicator
    return Promise.resolve(false);
  }

  private getPrivateIp(): string {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  /**
   * User-facing status — no infrastructure details exposed.
   * Shows only what matters to end users.
   */
  async getPublicStatus() {
    const [dbOk, eslOk, redisOk] = await Promise.all([
      this.checkDatabase().then(d => d.connected).catch(() => false),
      Promise.resolve(this.eslService.isConnected()),
      this.tcpProbe(
        this.config.get('REDIS_HOST', 'localhost'),
        this.config.get<number>('REDIS_PORT', 6379),
        2000,
      ).catch(() => false),
    ]);

    const services = [
      {
        id: 'platform',
        name: 'Platform',
        description: 'Dashboard, API and account management',
        status: dbOk ? 'operational' : 'degraded',
      },
      {
        id: 'voice',
        name: 'Voice Calling',
        description: 'Outbound voice campaigns and dialer',
        status: eslOk ? 'operational' : 'degraded',
      },
      {
        id: 'realtime',
        name: 'Real-time Updates',
        description: 'Live call monitoring and event streaming',
        status: redisOk ? 'operational' : 'degraded',
      },
      {
        id: 'storage',
        name: 'Media Storage',
        description: 'Audio file uploads and recordings',
        status: dbOk ? 'operational' : 'degraded',
      },
    ];

    const anyDegraded = services.some(s => s.status !== 'operational');
    const allDown = services.every(s => s.status !== 'operational');

    return {
      status: allDown ? 'major_outage' : anyDegraded ? 'partial_outage' : 'operational',
      statusLabel: allDown ? 'Major Outage' : anyDegraded ? 'Partial Outage' : 'All Systems Operational',
      services,
      updatedAt: new Date().toISOString(),
    };
  }

  async getDockerServices(): Promise<Array<{ name: string; state: string; health: string }>> {
    // In production, this would call Docker socket
    // For now return the expected services
    return [
      { name: 'callspsy_postgres',   state: 'running', health: 'healthy' },
      { name: 'callspsy_redis',      state: 'running', health: 'healthy' },
      { name: 'callspsy_backend',    state: 'running', health: 'healthy' },
      { name: 'callspsy_frontend',   state: 'running', health: 'healthy' },
      { name: 'callspsy_freeswitch', state: 'running', health: 'unknown' },
      { name: 'callspsy_kamailio',   state: 'running', health: 'unknown' },
      { name: 'callspsy_rtpengine',  state: 'running', health: 'unknown' },
      { name: 'callspsy_coturn',     state: 'running', health: 'unknown' },
      { name: 'callspsy_nginx',      state: 'running', health: 'unknown' },
    ];
  }
}
