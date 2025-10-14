// app/api/billing/portal/route.ts
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ensure Node runtime for Stripe SDK

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',             // later you can restrict to your Squarespace domain
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500, headers: corsHeaders });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const { customerId, email, returnUrl } = await req.json();

    let customer: Stripe.Customer | null = null;

    if (customerId) {
      const c = await stripe.customers.retrieve(customerId);
      if (c && !('deleted' in c)) customer = c as Stripe.Customer;
    } else if (email) {
      const list = await stripe.customers.list({ email, limit: 1 });
      customer = list.data[0] || await stripe.customers.create({ email });
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found or could not be created.' }, { status: 400, headers: corsHeaders });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || process.env.BASE_URL || 'https://google.com',
    });

    return new NextResponse(JSON.stringify({ url: portal.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ error: e.message || 'Unable to create portal session.' }), {
      status: 400,
      headers: corsHeaders,
    });
  }
}
