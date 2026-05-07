import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { appUsers } from "~/server/db/schema";
import { env } from "~/env";

/**
 * Server-side helpers for the M3 production-ready Server Actions
 * (introduced 2026-05-06 per Phase 6a.2 of the team-subdomain spec).
 *
 * The legacy BOS does Supabase writes directly from the browser using the
 * operator's session token. That works but means UI-side bugs can fire
 * privileged DB ops with the operator's auth. The 5 highest-risk operator
 * mutations (role changes, user delete, permission reset, payment-link
 * creation, lead delete) get wrapped in API routes that:
 *
 *   1. Require an explicit Origin header from the team subdomain
 *      (CSRF-immunity belt-and-suspenders — bearer tokens already aren't
 *       attached cross-origin by browsers, but the explicit check rejects
 *       any rogue caller that sets its own Origin)
 *   2. Validate the bearer token from `Authorization: Bearer <token>` via
 *      Supabase auth (resolves to an auth_user_id)
 *   3. Look up the matching `app_users` row to get the canonical role
 *   4. Enforce a per-operation role allowlist
 *   5. Validate inputs with Zod schemas (UUIDs constrained, payloads typed)
 *   6. Audit log a structured JSON line via console.log (captured by
 *      Vercel function logs; persistent table is Phase 6b)
 *   7. Perform the mutation via a service-role client (bypasses RLS so the
 *      DB-level row-restrict policies don't block the legitimate admin op)
 *
 * Frontend (legacy JS) sends:
 *
 *   const { data: { session } } = await supabase.auth.getSession();
 *   const res = await fetch('/api/team/users/123/role', {
 *     method: 'PATCH',
 *     credentials: 'omit',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'Authorization': `Bearer ${session.access_token}`,
 *     },
 *     body: JSON.stringify({ role: newRole }),
 *   });
 */

// All AWKN roles (mirrors the role column on app_users). Strictly typed for
// Zod usage in handlers. `oracle` is a super-admin tier used by founders.
export const ALL_ROLES = [
  "oracle",
  "admin",
  "staff",
  "demo",
  "resident",
  "associate",
  "public",
] as const;
export type AppRole = (typeof ALL_ROLES)[number];

export type ApiCaller = {
  authUserId: string;
  email: string | null;
  appUserId: string | null;
  role: AppRole;
};

const ALLOWED_ORIGINS = [
  "https://team.awknranch.com",
  "http://team.localhost:3000",
  // Vercel preview deployments — exposed via VERCEL_URL at runtime
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
];

/**
 * Reject cross-origin POSTs. Browsers don't attach Authorization: Bearer
 * headers to cross-origin requests by default, so this is belt + suspenders
 * against a rogue caller setting its own Origin.
 *
 * Same-origin server-to-server calls (or curl with no Origin) are allowed
 * through — Origin header is only present on cross-origin browser contexts.
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Validate the bearer token from `Authorization: Bearer <token>`. Returns
 * the resolved caller (auth user id + role) or null if the token is absent
 * or invalid.
 */
export async function validateBearer(req: Request): Promise<ApiCaller | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;

  const userClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  let appUserId: string | null = null;
  let role: AppRole = "public";
  try {
    const rows = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.authUserId, user.id))
      .limit(1);
    if (rows[0]) {
      appUserId = rows[0].id;
      const r = rows[0].role as string | null;
      if (r && (ALL_ROLES as readonly string[]).includes(r)) {
        role = r as AppRole;
      }
    }
  } catch {
    // DB lookup failure → caller defaults to public role; will fail the
    // role gate. Don't crash the handler.
  }

  return {
    authUserId: user.id,
    email: user.email ?? null,
    appUserId,
    role,
  };
}

/** Service-role Supabase client for privileged mutations. Bypasses RLS. */
export function getServiceRoleClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY not set — required for M3 endpoints",
    );
  }
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Structured audit-log emit. Captured by Vercel function logs in prod;
 * persisted-table version is Phase 6b. Format chosen to be greppable +
 * jq-able from raw log output.
 */
export function auditLog(entry: {
  action: string;
  caller: ApiCaller;
  target: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): void {
  console.log(
    JSON.stringify({
      audit: entry.action,
      timestamp: new Date().toISOString(),
      actor: {
        auth_user_id: entry.caller.authUserId,
        app_user_id: entry.caller.appUserId,
        role: entry.caller.role,
        email: entry.caller.email,
      },
      target: entry.target,
      payload: entry.payload ?? null,
    }),
  );
}

/** Convenience: return JSON error response with appropriate status. */
export function jsonError(
  message: string,
  status: number,
): Response {
  return Response.json({ error: message }, { status });
}
