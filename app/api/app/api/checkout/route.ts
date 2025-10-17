import { NextResponse, NextRequest } from "next/server";
import Stripe from "stripe";

// Init Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Helper to choose the right price id
function pickPriceId(req: NextRequest) {
  // If you visit with ?code=PILLARZ we use the $495 price
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase();
  if (code === "PILLARZ" && process.env.STRIPE_PRICE_ID_DISCOUNT) {
    return process.env.STRIPE_PRICE_ID_DISCOUNT;
  }
  return process.env.STRIPE_PRICE_ID_STANDARD;
}

// Build success/cancel URLs (fall back to site URL if dedicated vars not set)
function urls() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://pillarz-agent.vercel.app";
  const success = process.env.STRIPE_SUCCESS_URL || `${base}/success`;
  const cancel = process.env.STRIPE_CANCEL_URL || `${base}/cancel`;
  return { success, cancel };
}

// POST returns JSON with the session url (useful for XHR)
export async function POST(req: NextRequest) {
  try {
    const price = pickPriceId(req);
    if (!price) {
      return NextResponse.json({ error: "Missing Price ID" }, { status: 400 });
    }

    const { success, cancel } = urls();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

// GET creates the session and REDIRECTS you to Stripe (easy to test in browser)
export async function GET(req: NextRequest) {
  try {
    const price = pickPriceId(req);
    if (!price) {
      return NextResponse.json({ error: "Missing Price ID" }, { status: 400 });
    }

    const { success, cancel } = urls();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
    });

    // 302 redirect to Stripe Checkout
    return NextResponse.redirect(session.url!, { status: 302 });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
