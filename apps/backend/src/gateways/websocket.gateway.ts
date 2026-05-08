import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WebsocketGateway.name);
  private connectedUsers = new Map<string, string[]>(); // userId -> socketIds[]

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token) as { sub: string };
      socket.data.userId = payload.sub;

      // Track connection
      const existing = this.connectedUsers.get(payload.sub) || [];
      this.connectedUsers.set(payload.sub, [...existing, socket.id]);

      // Auto-join user room
      socket.join(`user:${payload.sub}`);

      this.logger.debug(`Client connected: ${socket.id} (user: ${payload.sub})`);
      socket.emit('connected', { socketId: socket.id });

    } catch (err) {
      this.logger.warn(`Auth failed for socket ${socket.id}: ${err.message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (userId) {
      const sockets = this.connectedUsers.get(userId) || [];
      const filtered = sockets.filter(id => id !== socket.id);
      if (filtered.length === 0) {
        this.connectedUsers.delete(userId);
      } else {
        this.connectedUsers.set(userId, filtered);
      }
    }
    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  @SubscribeMessage('join:campaign')
  handleJoinCampaign(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { campaignId: string },
  ) {
    socket.join(`campaign:${data.campaignId}`);
    return { status: 'joined', room: `campaign:${data.campaignId}` };
  }

  @SubscribeMessage('leave:campaign')
  handleLeaveCampaign(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { campaignId: string },
  ) {
    socket.leave(`campaign:${data.campaignId}`);
  }

  @SubscribeMessage('join:live-monitor')
  handleJoinLiveMonitor(@ConnectedSocket() socket: Socket) {
    socket.join('live-monitor');
    return { status: 'joined', room: 'live-monitor' };
  }

  // ─────────────────────────────────────────
  // Event handlers - emit to connected clients
  // ─────────────────────────────────────────

  @OnEvent('campaign.started')
  handleCampaignStarted(payload: { campaignId: string; userId: string }) {
    this.server.to(`user:${payload.userId}`).emit('campaign:started', payload);
    this.server.to('live-monitor').emit('campaign:started', payload);
  }

  @OnEvent('campaign.completed')
  handleCampaignCompleted(payload: { campaignId: string; status: string }) {
    this.server.to(`campaign:${payload.campaignId}`).emit('campaign:completed', payload);
    this.server.to('live-monitor').emit('campaign:completed', payload);
  }

  @OnEvent('campaign.paused')
  handleCampaignPaused(payload: { campaignId: string }) {
    this.server.to(`campaign:${payload.campaignId}`).emit('campaign:paused', payload);
  }

  @OnEvent('campaign.stopped')
  handleCampaignStopped(payload: { campaignId: string }) {
    this.server.to(`campaign:${payload.campaignId}`).emit('campaign:stopped', payload);
  }

  @OnEvent('freeswitch.channel_answer')
  handleCallAnswered(payload: any) {
    const event = {
      type: 'call:answered',
      uuid: payload.uuid,
      campaignId: payload.campaignId,
      phone: payload.phone,
      timestamp: new Date().toISOString(),
    };

    if (payload.campaignId) {
      this.server.to(`campaign:${payload.campaignId}`).emit('call:answered', event);
      this.server.to('live-monitor').emit('call:update', event);
    }
  }

  @OnEvent('freeswitch.channel_hangup_complete')
  handleCallHangup(payload: any) {
    const event = {
      type: 'call:hangup',
      uuid: payload.uuid,
      campaignId: payload.campaignId,
      phone: payload.phone,
      hangupCause: payload.hangupCause,
      duration: payload.duration,
      amdResult: payload.amdResult,
      rtpMos: payload.rtpMos,
      timestamp: new Date().toISOString(),
    };

    if (payload.campaignId) {
      this.server.to(`campaign:${payload.campaignId}`).emit('call:hangup', event);
      this.server.to('live-monitor').emit('call:update', event);
    }

    this.server.to('live-monitor').emit('stats:update', event);
  }

  @OnEvent('voxora.human_answer')
  handleHumanAnswer(payload: any) {
    const event = { type: 'amd:human', ...payload, timestamp: new Date().toISOString() };
    if (payload.campaignId) {
      this.server.to(`campaign:${payload.campaignId}`).emit('amd:human', event);
      this.server.to('live-monitor').emit('amd:result', event);
    }
  }

  @OnEvent('voxora.machine_answer')
  handleMachineAnswer(payload: any) {
    const event = { type: 'amd:machine', ...payload, timestamp: new Date().toISOString() };
    if (payload.campaignId) {
      this.server.to(`campaign:${payload.campaignId}`).emit('amd:machine', event);
      this.server.to('live-monitor').emit('amd:result', event);
    }
  }

  // Broadcast call events to campaign room + live monitor
  emitCampaignEvent(campaignId: string, event: string, data: any) {
    this.server.to(`campaign:${campaignId}`).emit(event, data);
    this.server.to('live-monitor').emit('call:update', { campaignId, event, ...data });
  }

  // Broadcast stats to all live monitor clients
  emitStatsUpdate(stats: any) {
    this.server.to('live-monitor').emit('stats:update', stats);
  }

  // Broadcast to specific user
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  getConnectedCount(): number {
    return this.connectedUsers.size;
  }
}
