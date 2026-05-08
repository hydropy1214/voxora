import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption for SIP account passwords.
 *
 * We cannot use bcrypt here because FreeSWITCH needs the PLAINTEXT
 * password to send SIP REGISTER requests to providers.
 * AES-256-GCM gives us reversible encryption + authenticated encryption
 * (tamper detection) with a server-side secret key.
 *
 * Storage format: base64(<iv:12bytes><authTag:16bytes><ciphertext>)
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12;
  private readonly TAG_LENGTH = 16;

  constructor(private config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET') || 'fallback-dev-key-32-chars-minimum!';
    // Derive a 32-byte key from the JWT secret using SHA-256
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.key, iv, {
      authTagLength: this.TAG_LENGTH,
    }) as crypto.CipherGCM;

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Pack: iv | authTag | ciphertext → base64
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    try {
      const buf = Buffer.from(ciphertext, 'base64');
      const iv       = buf.subarray(0, this.IV_LENGTH);
      const authTag  = buf.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH);
      const data     = buf.subarray(this.IV_LENGTH + this.TAG_LENGTH);

      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.key, iv, {
        authTagLength: this.TAG_LENGTH,
      }) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      return decipher.update(data) + decipher.final('utf8');
    } catch (e: any) {
      this.logger.error(`Decryption failed: ${e.message}`);
      throw new Error('Failed to decrypt SIP credential');
    }
  }

  /**
   * Detect whether a stored value is AES-encrypted (new format)
   * or bcrypt-hashed (old format, starts with $2b$).
   * Used to migrate existing accounts gracefully.
   */
  isEncrypted(value: string): boolean {
    return !value.startsWith('$2b$') && !value.startsWith('$2a$');
  }
}
