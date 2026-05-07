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
 * DELETE /api/team/users/[id]
 *
 * Delete an app_user. Replaces the legacy
 * `users.js:797` direct supabase.from('app_users').delete().eq('id', userId)`
 * which executed in the browser with the operator's session token.
 *
 * Note: does NOT delete the auth.users entry. Account-level deletion is a
 * separate operation; for now this just removes the AWKN-side app_user
 * association (matches legacy behavior).
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

  if (caller.appUserId === userId) {
    return jsonError("Cannot delete yourself", 403);
  }

  auditLog({
    action: "M3.user_delete",
    caller,
    target: { app_user_id: userId },
  });

  const admin = getServiceRoleClient();
  const { error } = await admin.from("app_users").delete().eq("id", userId);

  if (error) return jsonError(error.message, 500);
  return Response.json({ deleted: true });
}
