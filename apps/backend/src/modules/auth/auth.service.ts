import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailVerifyToken = uuidv4();

    // Create org + user atomically
    const org = await this.prisma.organization.create({
      data: {
        name: dto.organizationName || `${dto.firstName}'s Workspace`,
        slug: await this.generateOrgSlug(dto.firstName),
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        emailVerifyToken,
        organizationId: org.id,
        status: 'PENDING',
      },
    });

    // Create free trial subscription
    await this.prisma.subscription.create({
      data: {
        organizationId: org.id,
        plan: 'TRIAL',
        status: 'TRIALING',
        maxConcurrentCalls: 2,
        maxCampaigns: 1,
        maxContacts: 1000,
        maxAudioFiles: 5,
        maxSipAccounts: 1,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    try {
      await this.mailService.sendVerificationEmail(user.email, emailVerifyToken, user.firstName);
    } catch (err) {
      this.logger.warn(`Could not send verification email: ${err.message}`);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (tokenRecord.userId !== userId) throw new UnauthorizedException('Token mismatch');

    await this.prisma.refreshToken.update({ where: { id: tokenRecord.id }, data: { revoked: true } });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.generateTokens(user.id, user.email, user.role);
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, token: refreshToken },
      data: { revoked: true },
    });
    return { success: true };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({ where: { emailVerifyToken: token } });
    if (!user) throw new BadRequestException('Invalid verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, status: 'ACTIVE' },
    });

    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { success: true }; // Don't reveal if email exists

    const token = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    try {
      await this.mailService.sendPasswordResetEmail(user.email, token, user.firstName);
    } catch (err) {
      this.logger.warn(`Could not send password reset email: ${err.message}`);
    }

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } });

    return { success: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { include: { subscription: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user, true);
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any, includeOrg = false) {
    const { passwordHash, emailVerifyToken, passwordResetToken, ...safe } = user;
    if (!includeOrg) delete safe.organization;
    return safe;
  }

  private async generateOrgSlug(firstName: string): Promise<string> {
    const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 7);
    const existing = await this.prisma.organization.findUnique({ where: { slug: base } });
    return existing ? base + '-' + Math.random().toString(36).slice(2, 5) : base;
  }
}
