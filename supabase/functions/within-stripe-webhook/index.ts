/**
 * Within Center Stripe Webhook
 *
 * Receives webhook events from Stripe for the Within Center deposit flow.
 * On `checkout.session.completed` (with metadata.source === 'within-deposit'),
 * fires the deposit confirmation email via send-within-deposit-email.
 *
 * Deploy with: supabase functions deploy within-stripe-webhook --no-verify-jwt --project-ref gatsnhekviqooafddzey
 *
 * Required env vars on the Supabase project:
 *   STRIPE_WEBHOOK_SECRET   - whsec_... from the Stripe Dashboard webhook endpoint
 *   SUPABASE_URL            - (auto-injected by Supabase)
 *   SUPABASE_ANON_KEY       - (auto-injected) used to call the email function
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function parseStripeSignature(header: string | null): { t: string; v1: string } | null {
  if (!header) return null;
  const parts = header.split(',');
  let t = '';
  let v1 = '';
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k?.trim() === 't')  t  = v?.trim() ?? '';
    if (k?.trim() === 'v1') v1 = v?.trim() ?? '';
  }
  return t && v1 ? { t, v1 } : null;
}

async function verifyStripeSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;
  const signedPayload = `${parsed.t}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === parsed.v1;
}

async function fireDepositEmail(session: Record<string, unknown>): Promise<void> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return;
  }

  const metadata = (session.metadata || {}) as Record<string, string>;
  const customerDetails = (session.customer_details || {}) as Record<string, unknown>;

  const email =
    (typeof session.customer_email === 'string' && session.customer_email) ||
    (typeof customerDetails.email === 'string' && customerDetails.email) ||
    '';
  const firstName = metadata.first_name ||
    (typeof customerDetails.name === 'string' ? customerDetails.name.split(' ')[0] : '') ||
    '';
  const lastName = metadata.last_name || '';
  const packageSlug = metadata.package_slug || '';
  const packageName = metadata.package_name || '';
  const stayAtRanch = metadata.stay_at_ranch || '';

  if (!email || !firstName || !packageSlug) {
    console.warn('Missing required fields for deposit email', { email, firstName, packageSlug });
    return;
  }

  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : 0;
  const depositAmount = amountTotal > 0 ? `$${(amountTotal / 100).toLocaleString('en-US')}` : '';

  const payload = {
    first_name: firstName,
    last_name: lastName,
    email,
    package_slug: packageSlug,
    package_name: packageName,
    deposit_amount: depositAmount,
    stay_at_ranch: stayAtRanch,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-within-deposit-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('send-within-deposit-email failed:', res.status, text);
    } else {
      console.log('Deposit email queued:', text);
    }
  } catch (err) {
    console.error('Error calling send-within-deposit-email:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('Stripe-Signature');

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set — accepting without verification');
  } else {
    const valid = await verifyStripeSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.error('Invalid Stripe webhook signature');
      return new Response(JSON.stringify({ error: 'invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Within webhook event:', event.type, event.id);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Record<string, unknown>;
      const metadata = (session.metadata || {}) as Record<string, string>;
      if (metadata.source === 'within-deposit') {
        await fireDepositEmail(session);
      } else {
        console.log('Ignoring non-within checkout.session.completed');
      }
    } else {
      console.log('Unhandled event type:', event.type);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  // Always 200 so Stripe stops retrying once we've stored/processed the event.
  return new Response(JSON.stringify({ received: true, type: event.type }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
