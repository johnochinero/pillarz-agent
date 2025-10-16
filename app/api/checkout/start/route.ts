// app/api/checkout/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// ✅ Only allow listed approval codes (set in env: APPROVAL_CODES="TEST,OK,PILLARZ")
function isApproved(code: string | null) {
  const allow = (process.env.APPROVAL_CODES || 'TEST')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  return code ? allow.includes(code.toUpperCase()) : false;
}

// ✅ Create a Checkout Session in SETUP mode (collect card, no charge now)
// After success, our Stripe webhook will create a 3-month subscription schedule:
//   • 7-day trial (no charge)
//   • Month 1: $500
//   • Month 2: $500
//   • Month 3: $495
export async function POST(req: NextRequest) {
  try {
    const { approvalCode = null } = await req.json().catch(() => ({}));

    if (!isApproved(approvalCode)) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }

    // These must be set in your Vercel env:
    // STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL
    const successUrl = process.env.STRIPE_SUCCESS_URL;
    const cancelUrl = process.env.STRIPE_CANCEL_URL;

    if (!successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: 'Missing STRIPE_SUCCESS_URL or STRIPE_CANCEL_URL' },
        { status: 500 }
      );
    }

    // Collect payment method now; no charge until day 8 (via trial in webhook-created schedule)
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer_creation: 'always',
      setup_intent_data: { usage: 'off_session' },
      // send user back to site; we’ll use the session in the webhook
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        product: 'Traction in One Week',
        schedule_plan: 'TIW-500-500-495',
        trial_days: '7',
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error('checkout/start error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
