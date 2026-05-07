import { z } from "zod";
import {
  auditLog,
  checkOrigin,
  getServiceRoleClient,
  jsonError,
  validateBearer,
} from "~/lib/api-auth";

const ALLOWED_CALLER_ROLES = ["oracle", "admin", "staff"] as const;
const UuidSchema = z.string().uuid();

/**
 * DELETE /api/team/leads/[id]
 *
 * Delete a CRM lead + cascade delete its activities. Replaces the legacy
 * crm.js:2375-2376 sites which executed both deletes directly from the
 * browser:
 *
 *   await supabase.from('crm_activities').delete().eq('lead_id', lead.id);
 *   await supabase.from('crm_leads').delete().eq('id', lead.id);
 *
 * Both happen here as a server-side sequence with audit log + role gate.
 * Customer data deletion is high-risk; gating it behind an admin/staff
 * role check + audit trail is the production-readiness upgrade.
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
  if (!idResult.success) return jsonError("Invalid lead id", 400);
  const leadId = idResult.data;

  auditLog({
    action: "M3.crm_lead_delete",
    caller,
    target: { lead_id: leadId },
  });

  const admin = getServiceRoleClient();

  // Cascade-delete activities first (FK-safe ordering).
  const { error: activitiesError } = await admin
    .from("crm_activities")
    .delete()
    .eq("lead_id", leadId);
  if (activitiesError) return jsonError(activitiesError.message, 500);

  const { error: leadError } = await admin
    .from("crm_leads")
    .delete()
    .eq("id", leadId);
  if (leadError) return jsonError(leadError.message, 500);

  return Response.json({ deleted: true });
}
