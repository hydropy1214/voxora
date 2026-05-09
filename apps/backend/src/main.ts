import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

const logger = new Logger('Bootstrap');

// ── Validate critical environment variables ──────────────────────────────────
function validateEnv(config: ConfigService) {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter(k => !config.get(k));
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Copy .env.example to .env and fill in all required values.');
    process.exit(1);
  }

  const jwtSecret = config.get('JWT_SECRET', '');
  if (jwtSecret.length < 32) {
    logger.warn('JWT_SECRET is too short (minimum 32 characters). Please use a stronger secret.');
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port    = configService.get<number>('APP_PORT', 3001);
  const nodeEnv = configService.get('NODE_ENV', 'development');
  const isProd  = nodeEnv === 'production';

  // Validate env
  validateEnv(configService);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS — allow configured frontend URL + localhost in dev
  const frontendUrl = configService.get('FRONTEND_URL', 'http://localhost:3000');
  const corsOrigins = isProd
    ? [frontendUrl]
    : [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  });

  // Global API prefix
  app.setGlobalPrefix('api', { exclude: ['health', '/'] });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // permissive for forwards compatibility
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // WebSocket adapter with CORS
  const wsAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(wsAdapter);

  // Swagger (enabled in dev + staging)
  if (!isProd || configService.get('SWAGGER_ENABLED') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CallsPsy API')
      .setDescription('CallsPsy SIP Broadcasting Platform — REST API Reference')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('Auth', 'Authentication and user management')
      .addTag('Dialer', 'Web-based click-to-call')
      .addTag('Campaigns', 'Outbound voice campaign management')
      .addTag('Contacts', 'Contact list management')
      .addTag('Audio Files', 'Audio upload and management')
      .addTag('SIP Accounts', 'SIP provider configuration')
      .addTag('Analytics', 'Performance reporting and analytics')
      .addTag('System', 'Health and system status')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
      customSiteTitle: 'CallsPsy API Docs',
    });
    logger.log(`📖 API Docs: http://localhost:${port}/api/docs`);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.log(`Received ${signal} — shutting down gracefully…`);
      await app.close();
      process.exit(0);
    });
  });

  // Catch unhandled rejections (log but don't crash)
  process.on('unhandledRejection', (reason: any) => {
    logger.error(`Unhandled rejection: ${reason?.message ?? reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`, err.stack);
    // Give time to log before exit
    setTimeout(() => process.exit(1), 500);
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 CallsPsy API running on http://0.0.0.0:${port} [${nodeEnv}]`);
  logger.log(`🗄  Database connected | 📡 WebSocket ready`);
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
