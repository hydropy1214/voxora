// Shared types between frontend and backend

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'VIEWER';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type SipTransport = 'UDP' | 'TCP' | 'TLS';
export type SipAccountStatus = 'REGISTERED' | 'UNREGISTERED' | 'REGISTERING' | 'FAILED' | 'TESTING';
export type CampaignType = 'BROADCAST' | 'VOICEMAIL_DROP';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type AmdAction = 'PLAY_ON_HUMAN' | 'VOICEMAIL_DROP' | 'HANGUP_ON_MACHINE' | 'PLAY_ON_BOTH';
export type AmdResult = 'HUMAN' | 'MACHINE' | 'FAX' | 'NOTSURE';
export type CallStatus = 'QUEUED' | 'DIALING' | 'RINGING' | 'ANSWERED' | 'BUSY' | 'NOANSWER' | 'FAILED' | 'COMPLETED' | 'CANCELLED';
export type BillingPlan = 'TRIAL' | 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type AudioFileStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface WsEvent {
  type: string;
  timestamp: string;
  campaignId?: string;
  uuid?: string;
  phone?: string;
}

export interface CallEvent extends WsEvent {
  hangupCause?: string;
  duration?: number;
  amdResult?: AmdResult;
  rtpMos?: number;
}

export interface CampaignStatsEvent extends WsEvent {
  activeCalls: number;
  callsPerMinute: number;
  humanAnswers: number;
  machineAnswers: number;
}
