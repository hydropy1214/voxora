import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  getProfile(@Req() req) {
    return this.service.getProfile(req.user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update profile' })
  updateProfile(@Req() req, @Body() dto: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    timezone?: string;
  }) {
    return this.service.updateProfile(req.user.id, dto);
  }

  @Put('password')
  @ApiOperation({ summary: 'Change password' })
  changePassword(@Req() req, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.service.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }
}
