import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { CacheModule } from '@nestjs/cache-manager';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SipAccountsModule } from './modules/sip-accounts/sip-accounts.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AudioFilesModule } from './modules/audio-files/audio-files.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { LiveMonitorModule } from './modules/live-monitor/live-monitor.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { WebsocketModule } from './gateways/websocket.module';
import { SipServiceModule } from './services/sip/sip.module';
import { CryptoModule } from './services/crypto/crypto.module';
import { SystemModule } from './modules/system/system.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 10000, limit: 100 },
      { name: 'long', ttl: 60000, limit: 1000 },
    ]),

    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      }),
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: 60,
        max: 1000,
      }),
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    SipAccountsModule,
    ContactsModule,
    AudioFilesModule,
    CampaignsModule,
    LiveMonitorModule,
    RecordingsModule,
    AnalyticsModule,
    BillingModule,
    CryptoModule,
    WebsocketModule,
    SipServiceModule,
    SystemModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
