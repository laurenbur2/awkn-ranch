// Admin-initiated session booking. Creates a scheduling_bookings row tied to a
// staff member or facilitator (no Calendly profile / event_type).
//
// 1:1 body (unchanged):
//   { lead_id, service_id, start_datetime,
//     staff_user_id OR facilitator_id, package_session_id?, ...}
//
// Class body (new — when service.is_group_class = true):
//   { service_id, start_datetime, facilitator_id (or staff_user_id),
//     attendees: [{ lead_id, package_session_id? }, ...], ... }
//
// Auth note: verify_jwt must be patched to false after every deploy because the
// project's ES256 signing key breaks the Edge Functions gateway — see memory
// project_es256_jwt_gateway_bug.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: appUser } = await supabase
      .from("app_users")
      .select("id, role, can_schedule")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!appUser) return json({ error: "no_app_user" }, 403);
    const isAdmin = appUser.role === "admin" || appUser.role === "oracle";
    if (!isAdmin && !appUser.can_schedule) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid_body" }, 400);

    const service_id = String(body.service_id || "").trim();
    const staff_user_id = body.staff_user_id ? String(body.staff_user_id).trim() : "";
    const facilitator_id = body.facilitator_id ? String(body.facilitator_id).trim() : "";
    const start_iso = String(body.start_datetime || "").trim();
    const space_id = body.space_id ? String(body.space_id) : null;
    const notes = body.notes ? String(body.notes) : null;
    const override_duration = body.duration_minutes != null ? Number(body.duration_minutes) : null;

    // 1:1 path inputs
    const lead_id = String(body.lead_id || "").trim();
    const package_session_id = body.package_session_id ? String(body.package_session_id) : null;

    // Class path inputs
    const rawAttendees = Array.isArray(body.attendees) ? body.attendees as Array<Record<string, unknown>> : null;

    if (!service_id || !start_iso) return json({ error: "missing_fields" }, 400);
    if (!staff_user_id && !facilitator_id) return json({ error: "missing_assignee" }, 400);
    if (staff_user_id && facilitator_id) return json({ error: "only_one_assignee" }, 400);

    const startDate = new Date(start_iso);
    if (isNaN(startDate.getTime())) return json({ error: "invalid_start_datetime" }, 400);

    const { data: service, error: svcErr } = await supabase
      .from("services")
      .select("id, name, duration_minutes, is_active, is_group_class, max_capacity")
      .eq("id", service_id)
      .maybeSingle();
    if (svcErr || !service) return json({ error: "service_not_found" }, 404);
    if (!service.is_active) return json({ error: "service_inactive" }, 400);

    const duration = override_duration && override_duration > 0
      ? Math.round(override_duration)
      : service.duration_minutes;
    const endDate = new Date(startDate.getTime() + duration * 60_000);

    // Normalize the attendee list. For a class booking we require `attendees`.
    // For 1:1 we synthesize a one-entry attendee list from lead_id + package_session_id
    // so the downstream logic can be shared.
    type Attendee = { lead_id: string; package_session_id: string | null };
    let attendees: Attendee[] = [];

    if (service.is_group_class) {
      if (!rawAttendees || rawAttendees.length === 0) {
        return json({ error: "attendees_required" }, 400);
      }
      for (const a of rawAttendees) {
        const lid = String(a?.lead_id || "").trim();
        if (!lid) return json({ error: "attendee_missing_lead" }, 400);
        const pid = a?.package_session_id ? String(a.package_session_id) : null;
        attendees.push({ lead_id: lid, package_session_id: pid });
      }
      // De-dupe by lead_id (a client can't double-book themselves in the same class).
      const seen = new Set<string>();
      attendees = attendees.filter(a => {
        if (seen.has(a.lead_id)) return false;
        seen.add(a.lead_id);
        return true;
      });
      if (service.max_capacity && attendees.length > service.max_capacity) {
        return json({ error: "over_capacity", max: service.max_capacity }, 400);
      }
    } else {
      if (!lead_id) return json({ error: "missing_fields" }, 400);
      attendees = [{ lead_id, package_session_id }];
    }

    // Validate assignee exists + is active.
    if (staff_user_id) {
      const { data: staff } = await supabase
        .from("app_users")
        .select("id, is_archived")
        .eq("id", staff_user_id)
        .maybeSingle();
      if (!staff) return json({ error: "staff_not_found" }, 404);
      if (staff.is_archived) return json({ error: "staff_archived" }, 400);
    } else {
      const { data: fac } = await supabase
        .from("facilitators")
        .select("id, is_active")
        .eq("id", facilitator_id)
        .maybeSingle();
      if (!fac) return json({ error: "facilitator_not_found" }, 404);
      if (!fac.is_active) return json({ error: "facilitator_inactive" }, 400);
    }

    // Validate every attendee's lead + (optional) package session.
    const leadIds = attendees.map(a => a.lead_id);
    const { data: leadRows, error: leadQueryErr } = await supabase
      .from("crm_leads")
      .select("id, first_name, last_name, email")
      .in("id", leadIds);
    if (leadQueryErr) return json({ error: "lead_query_failed", details: leadQueryErr.message }, 500);
    type LeadRow = { id: string; first_name: string | null; last_name: string | null; email: string | null };
    const leadsById = new Map<string, LeadRow>(((leadRows || []) as LeadRow[]).map(l => [l.id, l]));
    for (const a of attendees) {
      if (!leadsById.has(a.lead_id)) return json({ error: "lead_not_found", lead_id: a.lead_id }, 404);
    }

    // Validate + fetch each attendee's package_session_id, if supplied.
    for (const a of attendees) {
      if (!a.package_session_id) continue;
      const { data: sess } = await supabase
        .from("client_package_sessions")
        .select("id, service_id, status, client_packages!inner(lead_id)")
        .eq("id", a.package_session_id)
        .maybeSingle();
      if (!sess) return json({ error: "session_not_found", session_id: a.package_session_id }, 404);
      // @ts-ignore nested shape
      if (sess.client_packages?.lead_id !== a.lead_id) {
        return json({ error: "session_lead_mismatch", session_id: a.package_session_id }, 400);
      }
      if (sess.service_id !== service_id) {
        return json({ error: "session_service_mismatch", session_id: a.package_session_id }, 400);
      }
      if (sess.status === "completed" || sess.status === "cancelled") {
        return json({ error: "session_not_bookable", session_id: a.package_session_id }, 400);
      }
    }

    // Build the primary lead_id / package_session_id fields on the booking row.
    // 1:1: populate both so existing reads keep working.
    // Class: leave both null — attendee rows carry the roster.
    const bookingLeadId = service.is_group_class ? null : attendees[0].lead_id;
    const bookingPkgSessionId = service.is_group_class ? null : attendees[0].package_session_id;
    const primaryLead = leadsById.get(attendees[0].lead_id);
    const bookerName = service.is_group_class
      ? (service.name + " class")
      : (`${primaryLead?.first_name || ""} ${primaryLead?.last_name || ""}`.trim() || "Client");
    const bookerEmail = service.is_group_class
      ? "noreply@within.center"
      : ((primaryLead?.email || "").trim().toLowerCase() || "noreply@within.center");

    const { data: booking, error: insErr } = await supabase
      .from("scheduling_bookings")
      .insert({
        profile_id: null,
        event_type_id: null,
        staff_user_id: staff_user_id || null,
        facilitator_id: facilitator_id || null,
        lead_id: bookingLeadId,
        service_id,
        space_id,
        package_session_id: bookingPkgSessionId,
        created_by_admin_id: appUser.id,
        booker_name: bookerName,
        booker_email: bookerEmail,
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        status: "confirmed",
        notes,
      })
      .select("id, booking_token, start_datetime, end_datetime")
      .single();

    if (insErr) {
      if (insErr.code === "23505") return json({ error: "slot_taken" }, 409);
      console.error("admin-book-session insert failed:", insErr);
      return json({ error: "insert_failed", details: insErr.message }, 500);
    }

    // Insert attendee rows for every class booking (and also for 1:1 — gives a
    // consistent read path going forward, even though 1:1 still has lead_id on
    // the booking row).
    if (service.is_group_class) {
      const attendeeRows = attendees.map(a => ({
        booking_id: booking.id,
        lead_id: a.lead_id,
        package_session_id: a.package_session_id,
        status: "confirmed",
      }));
      const { error: attErr } = await supabase
        .from("scheduling_booking_attendees")
        .insert(attendeeRows);
      if (attErr) {
        // Roll back the booking if the roster couldn't be written — otherwise
        // we'd have a facilitator slot locked with nobody attached to it.
        await supabase.from("scheduling_bookings").delete().eq("id", booking.id);
        console.error("attendee insert failed:", attErr);
        return json({ error: "attendee_insert_failed", details: attErr.message }, 500);
      }
    }

    // Flip every attendee's package_session to scheduled.
    for (const a of attendees) {
      if (!a.package_session_id) continue;
      const { error: sessErr } = await supabase
        .from("client_package_sessions")
        .update({
          booking_id: booking.id,
          scheduled_at: startDate.toISOString(),
          status: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", a.package_session_id);
      if (sessErr) console.warn("session link failed for", a.package_session_id, sessErr.message);
    }

    return json({
      booking_id: booking.id,
      start_datetime: booking.start_datetime,
      end_datetime: booking.end_datetime,
      attendee_count: attendees.length,
    });
  } catch (e) {
    console.error("admin-book-session unhandled:", e);
    return json({ error: "unhandled", details: String(e) }, 500);
  }
});
