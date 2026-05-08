import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Voxora database...')

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo-org',
      plan: 'TRIAL',
    },
  })

  // Create demo subscription
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
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
  })

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123456', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@voxora.io' },
    update: {},
    create: {
      email: 'demo@voxora.io',
      passwordHash,
      firstName: 'Demo',
      lastName: 'User',
      emailVerified: true,
      status: 'ACTIVE',
      organizationId: org.id,
    },
  })

  console.log(`✅ Created demo user: demo@voxora.io / demo123456`)
  console.log(`✅ Org: ${org.name}`)
  console.log('🎉 Seed complete!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
