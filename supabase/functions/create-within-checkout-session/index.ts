/**
 * Create Within Center Stripe Checkout Session
 *
 * Creates a Stripe Checkout (hosted) session for a Within Center package deposit
 * and returns the session URL. The browser then redirects to that URL.
 *
 * On successful payment, Stripe fires `checkout.session.completed` to the
 * within-stripe-webhook function, which fires the deposit confirmation email.
 *
 * Deploy with: supabase functions deploy create-within-checkout-session --no-verify-jwt --project-ref gatsnhekviqooafddzey
 *
 * Required env vars on the Supabase project:
 *   STRIPE_SECRET_KEY      - sk_test_... (test mode) or sk_live_...
 *   WITHIN_SITE_URL        - e.g. https://laurenburandt.github.io/awkn-ranch
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PackageDef {
  name: string;
  price: number;        // total package price in USD
  depositPct: number;   // 0.10 = 10%
}

const PACKAGES: Record<string, PackageDef> = {
  discover:    { name: 'Discover',   price: 799,  depositPct: 0.10 },
  heal:        { name: 'Heal',       price: 3300, depositPct: 0.10 },
  awkn:        { name: 'AWKN',       price: 5500, depositPct: 0.10 },
  'twin-flame':{ name: 'Twin Flame', price: 1650, depositPct: 0.10 },
  'immersive-private':       { name: 'Six-Day Retreat (Private Room)',   price: 4999, depositPct: 0.10 },
  'immersive-shared':        { name: 'Six-Day Retreat (Shared Room)',    price: 3999, depositPct: 0.10 },
  'immersive-3day-private':  { name: 'Three-Day Retreat (Private Room)', price: 1699, depositPct: 0.10 },
  'immersive-3day-shared':   { name: 'Three-Day Retreat (Shared Room)',  price: 1499, depositPct: 0.10 },
};

interface CheckoutPayload {
  package_slug?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  stay_at_ranch?: string;
  retreat_start_date?: string;
  retreat_end_date?: string;
  retreat_nights?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: CheckoutPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const slug = (body.package_slug || '').trim();
  const pkg = PACKAGES[slug];
  if (!pkg) {
    return json({ error: 'Unknown package_slug' }, 400);
  }

  const firstName = (body.first_name || '').trim();
  const lastName  = (body.last_name  || '').trim();
  const email     = (body.email      || '').trim();
  const phone     = (body.phone      || '').trim();
  const stay      = (body.stay_at_ranch || '').trim();
  const retreatStart  = (body.retreat_start_date || '').trim();
  const retreatEnd    = (body.retreat_end_date   || '').trim();
  const retreatNights = (body.retreat_nights     || '').trim();

  if (!firstName || !email) {
    return json({ error: 'first_name and email are required' }, 400);
  }

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  if (!STRIPE_SECRET_KEY) {
    return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500);
  }

  const SITE_URL = (Deno.env.get('WITHIN_SITE_URL') || 'https://laurenbur2.github.io/awkn-ranch').replace(/\/$/, '');

  const depositCents = Math.round(pkg.price * pkg.depositPct * 100);
  const productName = `${pkg.name} Package — Deposit (10%)`;
  const productDesc = `Refundable deposit to reserve your ${pkg.name} package with Within Center. Full balance due once you are medically cleared.`;

  // Build Stripe Checkout Session via REST (no SDK needed)
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('payment_method_types[0]', 'card');
  params.append('customer_email', email);

  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', 'usd');
  params.append('line_items[0][price_data][unit_amount]', String(depositCents));
  params.append('line_items[0][price_data][product_data][name]', productName);
  params.append('line_items[0][price_data][product_data][description]', productDesc);

  // success_url MUST contain {CHECKOUT_SESSION_ID} so Stripe substitutes the real id.
  const retreatQuery = retreatStart ? `&retreat_start=${encodeURIComponent(retreatStart)}&retreat_end=${encodeURIComponent(retreatEnd)}` : '';
  const successUrl = `${SITE_URL}/within-center/book/schedule/?pkg=${encodeURIComponent(slug)}${retreatQuery}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${SITE_URL}/within-center/book/?pkg=${encodeURIComponent(slug)}&canceled=1`;
  params.append('success_url', successUrl);
  params.append('cancel_url',  cancelUrl);

  // Metadata — read by the webhook to know which email template to send
  params.append('metadata[source]',        'within-deposit');
  params.append('metadata[package_slug]',  slug);
  params.append('metadata[package_name]',  pkg.name);
  params.append('metadata[first_name]',    firstName);
  params.append('metadata[last_name]',     lastName);
  params.append('metadata[phone]',         phone);
  params.append('metadata[stay_at_ranch]', stay);
  if (retreatStart)  params.append('metadata[retreat_start_date]', retreatStart);
  if (retreatEnd)    params.append('metadata[retreat_end_date]',   retreatEnd);
  if (retreatNights) params.append('metadata[retreat_nights]',     retreatNights);

  // Also stash on payment_intent so it appears in the dashboard for the charge
  params.append('payment_intent_data[metadata][source]',       'within-deposit');
  params.append('payment_intent_data[metadata][package_slug]', slug);
  params.append('payment_intent_data[description]',            productName);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe error:', data);
      return json({ error: data?.error?.message || 'Stripe error', stripe: data }, 502);
    }

    return json({ id: data.id, url: data.url });
  } catch (err) {
    console.error('create-within-checkout-session error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
