import {
  Controller, Get, Post, Body, UseGuards, Req, Headers, RawBodyRequest, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private service: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get available plans' })
  getPlans() {
    return this.service.getPlans();
  }

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current subscription' })
  getSubscription(@Req() req) {
    return this.service.getSubscription(req.user.id);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckout(@Req() req, @Body() body: { plan: string }) {
    return this.service.createCheckoutSession(req.user.id, body.plan);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.service.handleStripeWebhook(req.rawBody, signature);
    return { received: true };
  }
}
