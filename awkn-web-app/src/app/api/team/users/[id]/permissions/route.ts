import { z } from "zod";
import {
  auditLog,
  checkOrigin,
  getServiceRoleClient,
  jsonError,
  validateBearer,
} from "~/lib/api-auth";

const ALLOWED_CALLER_ROLES = ["oracle", "admin"] as const;
const UuidSchema = z.string().uuid();

/**
 * DELETE /api/team/users/[id]/permissions
 *
 * Reset an app_user's per-permission overrides. After this, the user
 * inherits the default permission set for their role (no overrides).
 * Replaces the legacy users.js:1508,1525 sites that called
 * `supabase.from('user_permissions').delete().eq('app_user_id', X)` from
 * the browser.
 */
export async function DELETE(
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

  auditLog({
    action: "M3.user_permissions_reset",
    caller,
    target: { app_user_id: userId },
  });

  const admin = getServiceRoleClient();
  const { error } = await admin
    .from("user_permissions")
    .delete()
    .eq("app_user_id", userId);

  if (error) return jsonError(error.message, 500);
  return Response.json({ reset: true });
}
