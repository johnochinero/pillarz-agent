// app/api/checkout/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'edge'; // optional, fine to remove if you prefer node

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code') ?? 'NA';
    const plan = (url.searchParams.get('plan') ?? 'A').toUpperCase();

    const priceMap: Record<'A' | 'B' | 'C', string | undefined> = {
      A: process.env.STRIPE_PRICE_A,
      B: process.env.STRIPE_PRICE_B,
      C: process.env.STRIPE_PRICE_C,
    };

    const price = priceMap[(['A','B','C'].includes(plan) ? plan : 'A') as 'A'|'B'|'C'];
    if (!price) {
      return NextResponse.json({ error: 'Missing Stripe price for plan' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // 7-day free trial; customer can cancel anytime
      subscription_data: { trial_period_days: 7, metadata: { approval_code: code } },
      allow_promotion_codes: true,
      success_url: `${process.env.BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/billing/canceled`,
    });

    return NextResponse.redirect(session.url!, 303);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Checkout error' }, { status: 500 });
  }
}
