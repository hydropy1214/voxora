import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Stripe from 'stripe';

export const PLAN_DETAILS = {
  TRIAL: {
    name: 'Trial',
    price: 0,
    maxConcurrent: 2,
    maxCampaigns: 1,
    maxContacts: 1000,
    maxAudioFiles: 5,
    maxSipAccounts: 1,
    features: ['2 concurrent calls', '1 campaign', '1,000 contacts', '14-day trial'],
  },
  STARTER: {
    name: 'Starter',
    price: 49,
    maxConcurrent: 10,
    maxCampaigns: 5,
    maxContacts: 25000,
    maxAudioFiles: 20,
    maxSipAccounts: 3,
    features: ['10 concurrent calls', '5 campaigns', '25K contacts', 'AMD included'],
  },
  GROWTH: {
    name: 'Growth',
    price: 149,
    maxConcurrent: 50,
    maxCampaigns: 20,
    maxContacts: 100000,
    maxAudioFiles: 50,
    maxSipAccounts: 10,
    features: ['50 concurrent calls', '20 campaigns', '100K contacts', 'Priority support'],
  },
  PRO: {
    name: 'Pro',
    price: 399,
    maxConcurrent: 200,
    maxCampaigns: 100,
    maxContacts: 500000,
    maxAudioFiles: 200,
    maxSipAccounts: 25,
    features: ['200 concurrent calls', 'Unlimited campaigns', '500K contacts', 'Dedicated support'],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    price: 0, // Custom
    maxConcurrent: 1000,
    maxCampaigns: -1,
    maxContacts: -1,
    maxAudioFiles: -1,
    maxSipAccounts: -1,
    features: ['1000+ concurrent calls', 'Unlimited everything', 'SLA', 'Custom integrations'],
  },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const stripeKey = config.get('STRIPE_SECRET_KEY');
    if (stripeKey && stripeKey !== 'sk_live_...') {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    }
  }

  getPlans() {
    return Object.entries(PLAN_DETAILS).map(([id, details]) => ({ id, ...details }));
  }

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          include: {
            subscription: {
              include: { invoices: { take: 5, orderBy: { createdAt: 'desc' } } },
            },
          },
        },
      },
    });

    if (!user?.organization?.subscription) {
      return { plan: 'TRIAL', ...PLAN_DETAILS.TRIAL };
    }

    const sub = user.organization.subscription;
    return {
      ...sub,
      planDetails: PLAN_DETAILS[sub.plan] || PLAN_DETAILS.TRIAL,
    };
  }

  async createCheckoutSession(userId: string, plan: string) {
    if (!this.stripe) throw new Error('Stripe not configured');

    const planDetails = PLAN_DETAILS[plan];
    if (!planDetails || !planDetails.price) throw new NotFoundException('Invalid plan');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { include: { subscription: true } } },
    });

    const priceId = this.config.get(`STRIPE_PRICE_${plan.toUpperCase()}`);
    if (!priceId) throw new Error(`Stripe price not configured for plan: ${plan}`);

    let customerId = user?.organization?.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId, organizationId: user.organizationId },
      });
      customerId = customer.id;
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.config.get('FRONTEND_URL')}/billing?success=true`,
      cancel_url: `${this.config.get('FRONTEND_URL')}/billing?cancelled=true`,
      metadata: { userId, plan },
    });

    return { url: session.url };
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    if (!this.stripe) return;

    const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { userId, plan } = session.metadata || {};
    if (!userId || !plan) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user?.organizationId) return;

    const planDetails = PLAN_DETAILS[plan] || PLAN_DETAILS.STARTER;

    await this.prisma.subscription.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        plan: plan as any,
        status: 'ACTIVE',
        stripeCustomerId: session.customer as string,
        stripeSubId: session.subscription as string,
        maxConcurrentCalls: planDetails.maxConcurrent,
        maxCampaigns: planDetails.maxCampaigns,
        maxContacts: planDetails.maxContacts,
        maxAudioFiles: planDetails.maxAudioFiles,
        maxSipAccounts: planDetails.maxSipAccounts,
      },
      update: {
        plan: plan as any,
        status: 'ACTIVE',
        stripeSubId: session.subscription as string,
        maxConcurrentCalls: planDetails.maxConcurrent,
        maxCampaigns: planDetails.maxCampaigns,
        maxContacts: planDetails.maxContacts,
        maxAudioFiles: planDetails.maxAudioFiles,
        maxSipAccounts: planDetails.maxSipAccounts,
      },
    });

    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { plan: plan as any },
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { stripeSubId: subscription.id },
      data: {
        status: subscription.status === 'active' ? 'ACTIVE' : 'PAST_DUE',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  private async handleSubscriptionCancelled(subscription: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { stripeSubId: subscription.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const sub = await this.prisma.subscription.findFirst({
      where: { stripeCustomerId: invoice.customer as string },
    });
    if (!sub) return;

    await this.prisma.invoice.create({
      data: {
        subscriptionId: sub.id,
        stripeInvoiceId: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'PAID',
        paidAt: new Date(),
        pdf: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
      },
    });
  }
}
