// AWKN booking → Stripe Checkout Session.
//
// Public-facing: anyone with a valid booking_id (just-inserted into
// awkn_bookings via the public form) can request a Stripe Checkout URL.
// The function:
//   1. Looks up the booking and its listing
//   2. Builds a Checkout Session with the booking's stored line items
//      (server-side total — never trusts a client-supplied amount)
//   3. Stamps stripe_checkout_url + status='hold' on the booking
//   4. Returns { url } so the client can redirect
//
// Required Supabase function env vars:
//   STRIPE_SECRET_KEY  — Stripe live or test secret
//   PUBLIC_SITE_ORIGIN — e.g. https://awknranch.com  or  https://laurenbur2.github.io/awkn-ranch
//   (success/cancel URLs are derived from this)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody {
  booking_id: string;
  origin?: string; // optional client-side origin for success/cancel URLs (validated below)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSrk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicOrigin = Deno.env.get("PUBLIC_SITE_ORIGIN") ||
      "https://laurenbur2.github.io/awkn-ranch";
    if (!stripeKey || !supabaseUrl || !supabaseSrk) {
      return json({ error: "Server not fully configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseSrk);

    const body: ReqBody = await req.json();
    if (!body?.booking_id) return json({ error: "Missing booking_id" }, 400);

    // Resolve origin: prefer trusted env, otherwise accept the request origin
    // only if it ends with a known host (defense against open-redirect via the
    // success_url field). Falls back to the env default.
    const allowedOrigins = [
      publicOrigin,
      "https://awknranch.com",
      "https://laurenbur2.github.io/awkn-ranch",
    ];
    let origin = publicOrigin;
    if (body.origin && allowedOrigins.some((o) => body.origin?.startsWith(o))) {
      origin = body.origin;
    }

    // Fetch the booking + listing in one round-trip
    const { data: booking, error: bookingErr } = await supabase
      .from("awkn_bookings")
      .select(
        "id,status,start_at,end_at,mode,guests,total_amount,guest_name,guest_email," +
          "listing:awkn_listings(name,slug)",
      )
      .eq("id", body.booking_id)
      .maybeSingle();

    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }
    if (!["pending", "hold"].includes(booking.status)) {
      return json({ error: `Booking is in status '${booking.status}', cannot checkout` }, 409);
    }
    if (!booking.total_amount || Number(booking.total_amount) <= 0) {
      return json({ error: "Booking has no total amount" }, 400);
    }

    // Build a single line-item from the booking total. (The booking already
    // contains the breakdown in addons/cleaning_fee/etc; we use the snapshot
    // total to keep the Stripe charge in lockstep.)
    const listing = (booking as any).listing;
    const listingName = listing?.name || "AWKN Ranch booking";
    const dates = formatDateRange(booking.start_at, booking.end_at, booking.mode);
    const description = `${listingName} — ${dates}`;
    const amountCents = Math.round(Number(booking.total_amount) * 100);

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][unit_amount]", amountCents.toString());
    params.append("line_items[0][price_data][product_data][name]", listingName);
    params.append("line_items[0][price_data][product_data][description]", description);
    params.append("line_items[0][quantity]", "1");
    params.append("customer_email", booking.guest_email);
    params.append(
      "success_url",
      `${origin}/book/confirmation/?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}`,
    );
    params.append(
      "cancel_url",
      `${origin}/book/listing/?slug=${listing?.slug || ""}&cancelled=1`,
    );
    params.append("metadata[booking_id]", booking.id);
    params.append("metadata[listing_slug]", listing?.slug || "");
    params.append("metadata[mode]", booking.mode);

    const stripeRes = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const stripeData = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error("[awkn-create-checkout] Stripe error", stripeData);
      return json({ error: stripeData.error?.message || "Stripe error" }, 502);
    }

    // Stamp the booking with the checkout URL and move to 'hold'
    await supabase
      .from("awkn_bookings")
      .update({
        stripe_checkout_url: stripeData.url,
        status: "hold",
      })
      .eq("id", booking.id);

    return json({ url: stripeData.url, session_id: stripeData.id });
  } catch (err) {
    console.error("[awkn-create-checkout] error", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDateRange(startISO: string, endISO: string, mode: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (mode === "hourly") {
    const t = (d: Date) =>
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${s.toLocaleDateString("en-US", opts)}, ${t(s)} → ${t(e)}`;
  }
  return `${s.toLocaleDateString("en-US", opts)} → ${e.toLocaleDateString("en-US", opts)}`;
}
