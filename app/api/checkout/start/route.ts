// app/api/checkout/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'edge'; // optional; remove if you prefer Node

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// ✅ Allow-list of approval codes (comma-separated in env, falls back to TEST)
function isApproved(code: string | null) {
  const allow = (process.env.APPROVAL_CODES || 'TEST')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  return code ? allow.includes(code.toUpperCase()) : false;
}

// ✅ Map simple plan letters to Stripe Price IDs from env
function priceFor(planLetter: string | null) {
  const p = (planLetter || 'A').toUpperCase();
  const map: Record<'A' | 'B' | 'C', string | undefined> = {
    A: process.env.STRIPE_PRICE_A,
    B: process.env.STRIPE_PRICE_B,
    C: process.env.STRIPE_PRICE_C,
  };
  return (map as any)[p];
}

// ✅ Base URL for success/cancel redirects (e.g., https://pillarz.us)
function baseUrl() {
  return (process.env.BASE_URL || 'https://pillarz-agent.vercel.app').replace(/\/+$/, '');
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const plan = url.searchParams.get('plan'); // A, B, or C (defaults to A)

    // 1) Guard: approval code required
    if (!isApproved(code)) {
      return NextResponse.json({ error: 'Approval code required or invalid.' }, { status: 403 });
    }

    // 2) Resolve price
    const priceId = priceFor(plan);
    if (!priceId) {
      return NextResponse.json({ error: 'Missing Stripe Price for plan.' }, { status: 400 });
    }

    // 3) Create Checkout Session: 7-day free trial, monthly charge after.
    //    We’ll cap it at 3 installments in the webhook by setting cancel_at.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7, // ← first payment on day 8
        metadata: {
          plan: (plan || 'A').toUpperCase(),
          approval_code: code!,
          installments_total: '3', // helper for the webhook to auto-cancel after 3 charges
        },
      },
      allow_promotion_codes: false,
      payment_method_collection: 'always',
      customer_creation: 'always',
      // Redirects
      success_url: `${baseUrl()}/?ok=1&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/?canceled=1`,
      // Optional: show your product name at top of Stripe page
      ui_mode: 'hosted',
      metadata: {
        offering: 'Traction in One Week',
      },
    });

    return NextResponse.redirect(session.url!, { status: 303 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unable to start checkout' },
      { status: 500 },
    );
  }
}
