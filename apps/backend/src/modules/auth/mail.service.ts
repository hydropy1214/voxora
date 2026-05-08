import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('MAIL_HOST', 'localhost'),
      port: config.get<number>('MAIL_PORT', 587),
      secure: false,
      auth: {
        user: config.get('MAIL_USER'),
        pass: config.get('MAIL_PASS'),
      },
    });
  }

  async sendVerificationEmail(email: string, token: string, name: string) {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', 'noreply@voxora.io'),
      to: email,
      subject: 'Verify your Voxora account',
      html: this.verificationEmailHtml(name, verifyUrl),
    });
  }

  async sendPasswordResetEmail(email: string, token: string, name: string) {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM', 'noreply@voxora.io'),
      to: email,
      subject: 'Reset your Voxora password',
      html: this.resetPasswordEmailHtml(name, resetUrl),
    });
  }

  private verificationEmailHtml(name: string, url: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Inter, sans-serif; background: #0f0f0f; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px;">
          <h1 style="color: #6366f1; margin-bottom: 8px;">Voxora</h1>
          <h2 style="margin-top: 24px;">Welcome, ${name}!</h2>
          <p>Verify your email address to get started with Voxora.</p>
          <a href="${url}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px;">Verify Email</a>
          <p style="color: #666; margin-top: 24px; font-size: 14px;">Link expires in 24 hours.</p>
        </div>
      </body>
      </html>
    `;
  }

  private resetPasswordEmailHtml(name: string, url: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Inter, sans-serif; background: #0f0f0f; color: #fff; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 40px;">
          <h1 style="color: #6366f1; margin-bottom: 8px;">Voxora</h1>
          <h2 style="margin-top: 24px;">Password Reset</h2>
          <p>Hi ${name}, click the button below to reset your password.</p>
          <a href="${url}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px;">Reset Password</a>
          <p style="color: #666; margin-top: 24px; font-size: 14px;">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      </body>
      </html>
    `;
  }
}
