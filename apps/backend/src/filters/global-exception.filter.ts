import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx   = host.switchToHttp();
    const req   = ctx.getRequest<Request>();
    const res   = ctx.getResponse<Response>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as any;
        message = r.message || message;
        details = r.errors || r.details || undefined;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Log server errors with stack
      if (status === 500) {
        this.logger.error(`${req.method} ${req.url} → ${exception.message}`, exception.stack);
      }
    }

    // Log 5xx errors
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → HTTP ${status}: ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
