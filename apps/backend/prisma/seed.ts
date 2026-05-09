import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

/**
 * Replicate CryptoService.encrypt() so seed can store properly-encrypted SIP passwords.
 * Key derivation: SHA-256(JWT_SECRET) → 32-byte AES-256-GCM key
 * Storage format: base64(iv[12] | authTag[16] | ciphertext)
 */
function encryptSipPassword(plaintext: string, jwtSecret: string): string {
  const key = crypto.createHash('sha256').update(jwtSecret).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: 16,
  }) as crypto.CipherGCM
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

async function main() {
  console.log('🌱 Seeding CallsPsy database...')

  // Use JWT_SECRET from environment (must match what the backend uses at runtime)
  const jwtSecret = process.env.JWT_SECRET || 'callspsy_jwt_dev_secret_32_chars_min_ok'

  // ── Organization ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: { plan: 'GROWTH' },
    create: {
      name: 'Demo Organization',
      slug: 'demo-org',
      plan: 'GROWTH',
    },
  })

  // ── Subscription (GROWTH — enough for 100 concurrent calls) ───────────────
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {
      plan: 'GROWTH',
      status: 'ACTIVE',
      maxConcurrentCalls: 100,
      maxCampaigns: 20,
      maxContacts: 500000,
      maxAudioFiles: 100,
      maxSipAccounts: 10,
    },
    create: {
      organizationId: org.id,
      plan: 'GROWTH',
      status: 'ACTIVE',
      maxConcurrentCalls: 100,
      maxCampaigns: 20,
      maxContacts: 500000,
      maxAudioFiles: 100,
      maxSipAccounts: 10,
      trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  })

  // ── Demo user ─────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('demo123456', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@callspsy.com' },
    update: {},
    create: {
      email: 'demo@callspsy.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'User',
      emailVerified: true,
      status: 'ACTIVE',
      organizationId: org.id,
    },
  })

  // ── Vonage Edge TLS SIP account ───────────────────────────────────────────
  // Credentials:
  //   host:     edge3-tlssbc2va.prod.vonedge.com
  //   port:     5061 (SIP-TLS standard)
  //   username: VHNVhdzLwFuSAhkJoCsA
  //   password: Brokenlove121@
  //   transport: TLS
  const vonagePasswordHash = encryptSipPassword('Brokenlove121@', jwtSecret)

  const existingVonage = await prisma.sipAccount.findFirst({
    where: { userId: user.id, username: 'VHNVhdzLwFuSAhkJoCsA' },
  })

  let sipAccount
  if (existingVonage) {
    // Re-encrypt with current key (in case JWT_SECRET changed)
    sipAccount = await prisma.sipAccount.update({
      where: { id: existingVonage.id },
      data: {
        passwordHash: vonagePasswordHash,
        sipPort: 5061,
        transport: 'TLS',
        proxy: 'edge3-tlssbc2va.prod.vonedge.com:5061;transport=tls',
        outboundProxy: 'edge3-tlssbc2va.prod.vonedge.com:5061;transport=tls',
        fromDomain: 'edge3-tlssbc2va.prod.vonedge.com',
        maxConcurrentCalls: 50,
        callsPerSecond: 5.0,
      },
    })
    console.log(`🔄 Updated existing Vonage SIP account: ${sipAccount.id}`)
  } else {
    sipAccount = await prisma.sipAccount.create({
      data: {
        userId: user.id,
        name: 'Vonage Edge TLS',
        sipServer: 'edge3-tlssbc2va.prod.vonedge.com',
        sipPort: 5061,
        username: 'VHNVhdzLwFuSAhkJoCsA',
        passwordHash: vonagePasswordHash,
        transport: 'TLS',
        proxy: 'edge3-tlssbc2va.prod.vonedge.com:5061;transport=tls',
        outboundProxy: 'edge3-tlssbc2va.prod.vonedge.com:5061;transport=tls',
        fromDomain: 'edge3-tlssbc2va.prod.vonedge.com',
        callerIdName: 'CallsPsy',
        callerIdNumber: 'VHNVhdzLwFuSAhkJoCsA',
        maxConcurrentCalls: 50,
        callsPerSecond: 5.0,
        status: 'UNREGISTERED',
        active: true,
      },
    })
    console.log(`✅ Created Vonage SIP account: ${sipAccount.id}`)
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════')
  console.log('  CallsPsy Seed Complete')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Login:    demo@callspsy.com`)
  console.log(`  Password: demo123456`)
  console.log(`  API:      http://localhost:3001`)
  console.log(`  UI:       http://localhost:3000`)
  console.log('───────────────────────────────────────────────────')
  console.log(`  SIP Account ID: ${sipAccount.id}`)
  console.log(`  SIP Host: edge3-tlssbc2va.prod.vonedge.com:5061`)
  console.log(`  SIP User: VHNVhdzLwFuSAhkJoCsA`)
  console.log(`  Transport: TLS`)
  console.log('═══════════════════════════════════════════════════')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
