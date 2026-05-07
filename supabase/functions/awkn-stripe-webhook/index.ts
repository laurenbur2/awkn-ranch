// AWKN Stripe webhook — listens for Checkout completion + cancellation events
// for AWKN bookings and updates awkn_bookings status accordingly.
//
// Required Supabase function env vars:
//   STRIPE_WEBHOOK_SECRET  — signing secret from the Stripe webhook config
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Stripe webhook config:
//   Endpoint URL:  https://<project>.functions.supabase.co/awkn-stripe-webhook
//   Events:        checkout.session.completed
//                  checkout.session.expired
//                  payment_intent.payment_failed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseSrk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !supabaseSrk) {
    return new Response("Server not configured", { status: 500, headers: corsHeaders });
  }
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400, headers: corsHeaders });
  }

  const rawBody = await req.text();

  // Verify signature manually (Stripe Node SDK isn't available in Deno runtime
  // without bundling; this matches the existing webhook in this repo).
  const ok = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!ok) {
    return new Response("Invalid signature", { status: 400, headers: corsHeaders });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseSrk);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;
      if (!bookingId) {
        // Not an AWKN booking checkout — ignore silently.
        return new Response("ignored", { status: 200, headers: corsHeaders });
      }
      await supabase
        .from("awkn_bookings")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent || null,
        })
        .eq("id", bookingId);
      console.log(`[awkn-stripe-webhook] booking ${bookingId} marked paid`);
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;
      if (bookingId) {
        // Send back to 'pending' so admin can resend or guest can retry.
        await supabase
          .from("awkn_bookings")
          .update({ status: "pending" })
          .eq("id", bookingId)
          .eq("status", "hold"); // only revert holds, not paid bookings
        console.log(`[awkn-stripe-webhook] booking ${bookingId} session expired`);
      }
    }
    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[awkn-stripe-webhook] handler error", err);
    return new Response("Handler error", { status: 500, headers: corsHeaders });
  }
});

// Stripe signature scheme: "t=<timestamp>,v1=<hmac_sha256(t.body, secret)>"
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    signature.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}
