import { z } from "zod";
import {
  auditLog,
  checkOrigin,
  jsonError,
  validateBearer,
} from "~/lib/api-auth";
import { env } from "~/env";

const ALLOWED_CALLER_ROLES = ["oracle", "admin", "staff"] as const;

const BodySchema = z.object({
  amount: z.number().int().positive(),
  description: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  // mode is the Stripe payment mode toggle (production vs test). Falls
  // through to the underlying create-payment-link edge function which
  // reads stripe_config.test_mode from the DB.
  mode: z.enum(["live", "test"]).optional(),
});

/**
 * POST /api/team/payments/create-link
 *
 * Create a Stripe payment link via the existing create-payment-link
 * Supabase edge function. Replaces the legacy crm.js:2938 fetch site
 * which embedded the operator's session token + anon key directly.
 *
 * This endpoint exists primarily as an authorization gate: the
 * underlying edge function is what actually talks to Stripe. We:
 *  1. Verify the caller has admin/staff role server-side
 *  2. Validate the input shape (amount, description)
 *  3. Audit log the creation attempt
 *  4. Forward the request to the edge function with the caller's token
 *  5. Return the response (containing the payment link URL)
 */
export async function POST(req: Request) {
  if (!checkOrigin(req)) return jsonError("Forbidden origin", 403);

  const caller = await validateBearer(req);
  if (!caller) return jsonError("Unauthorized", 401);
  if (!(ALLOWED_CALLER_ROLES as readonly string[]).includes(caller.role)) {
    return jsonError("Insufficient role", 403);
  }

  const bodyRaw = (await req.json().catch(() => null)) as unknown;
  const bodyResult = BodySchema.safeParse(bodyRaw);
  if (!bodyResult.success) return jsonError("Invalid body", 400);

  auditLog({
    action: "M3.stripe_payment_link_create",
    caller,
    target: {},
    payload: {
      amount: bodyResult.data.amount,
      mode: bodyResult.data.mode ?? "(default)",
      description: bodyResult.data.description ?? null,
    },
  });

  // Forward to the existing edge function. We already validated the
  // caller's session, so we use the anon key for the edge-function call
  // (the function is auth'd via verify_jwt: true at the Supabase gateway,
  // BUT we just validated the caller's bearer ourselves; we re-pass the
  // bearer so the edge function's auth context matches).
  const authHeader = req.headers.get("authorization") ?? "";
  const upstream = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-payment-link`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(bodyResult.data),
    },
  );

  const result = (await upstream.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!upstream.ok) {
    return jsonError(
      typeof result.error === "string"
        ? result.error
        : "Payment link creation failed",
      upstream.status,
    );
  }
  return Response.json(result);
}
