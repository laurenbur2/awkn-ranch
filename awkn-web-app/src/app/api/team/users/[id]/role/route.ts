import { z } from "zod";
import {
  ALL_ROLES,
  auditLog,
  checkOrigin,
  getServiceRoleClient,
  jsonError,
  validateBearer,
} from "~/lib/api-auth";

const ALLOWED_CALLER_ROLES = ["oracle", "admin"] as const;

const UuidSchema = z.string().uuid();
const BodySchema = z.object({ role: z.enum(ALL_ROLES) });

/**
 * PATCH /api/team/users/[id]/role
 *
 * Change an app_user's role. Replaces the legacy
 * `users.js:776` direct supabase.from('app_users').update({ role })`
 * which executed in the browser with the operator's session token.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkOrigin(req)) return jsonError("Forbidden origin", 403);

  const caller = await validateBearer(req);
  if (!caller) return jsonError("Unauthorized", 401);
  if (!(ALLOWED_CALLER_ROLES as readonly string[]).includes(caller.role)) {
    return jsonError("Insufficient role", 403);
  }

  const { id: rawId } = await params;
  const idResult = UuidSchema.safeParse(rawId);
  if (!idResult.success) return jsonError("Invalid user id", 400);
  const userId = idResult.data;

  const bodyRaw = (await req.json().catch(() => null)) as unknown;
  const bodyResult = BodySchema.safeParse(bodyRaw);
  if (!bodyResult.success) return jsonError("Invalid body", 400);
  const newRole = bodyResult.data.role;

  // Self-protection: never demote yourself out of admin via this endpoint
  // (would lock you out of the BOS). Self-promotion is also blocked.
  if (caller.appUserId === userId) {
    return jsonError("Cannot change your own role", 403);
  }

  auditLog({
    action: "M3.user_role_change",
    caller,
    target: { app_user_id: userId },
    payload: { new_role: newRole },
  });

  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from("app_users")
    .update({ role: newRole })
    .eq("id", userId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return Response.json({ user: data });
}
