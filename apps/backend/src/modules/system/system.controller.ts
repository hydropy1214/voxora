import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemService } from './system.service';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private service: SystemService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Full system status — all services, ports, env vars' })
  getStatus() {
    return this.service.getFullStatus();
  }

  @Get('ping')
  @ApiOperation({ summary: 'Quick liveness check' })
  ping() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
