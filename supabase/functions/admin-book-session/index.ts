// Admin-initiated session booking. Creates a scheduling_bookings row tied to a
// staff member (no Calendly profile / event_type) and optionally links it to a
// client_package_sessions slot. Relies on the partial unique index
// scheduling_bookings_staff_slot_unique for atomic double-book protection.
//
// Auth note: verify_jwt must be patched to false after every deploy because the
// project's ES256 signing key breaks the Edge Functions gateway — see memory
// project_es256_jwt_gateway_bug.
//
// Body: {
//   lead_id, service_id, staff_user_id, start_datetime (iso),
//   duration_minutes?, space_id?, package_session_id?, notes?
// }

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

    const lead_id = String(body.lead_id || "").trim();
    const service_id = String(body.service_id || "").trim();
    const staff_user_id = String(body.staff_user_id || "").trim();
    const start_iso = String(body.start_datetime || "").trim();
    const space_id = body.space_id ? String(body.space_id) : null;
    const package_session_id = body.package_session_id ? String(body.package_session_id) : null;
    const notes = body.notes ? String(body.notes) : null;
    const override_duration = body.duration_minutes != null ? Number(body.duration_minutes) : null;

    if (!lead_id || !service_id || !staff_user_id || !start_iso) {
      return json({ error: "missing_fields" }, 400);
    }
    const startDate = new Date(start_iso);
    if (isNaN(startDate.getTime())) return json({ error: "invalid_start_datetime" }, 400);

    const { data: service, error: svcErr } = await supabase
      .from("services")
      .select("id, name, duration_minutes, is_active")
      .eq("id", service_id)
      .maybeSingle();
    if (svcErr || !service) return json({ error: "service_not_found" }, 404);
    if (!service.is_active) return json({ error: "service_inactive" }, 400);

    const duration = override_duration && override_duration > 0
      ? Math.round(override_duration)
      : service.duration_minutes;
    const endDate = new Date(startDate.getTime() + duration * 60_000);

    const { data: lead, error: leadErr } = await supabase
      .from("crm_leads")
      .select("id, name, email")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr || !lead) return json({ error: "lead_not_found" }, 404);

    if (package_session_id) {
      const { data: sess } = await supabase
        .from("client_package_sessions")
        .select("id, package_id, service_id, status, client_packages!inner(lead_id)")
        .eq("id", package_session_id)
        .maybeSingle();
      if (!sess) return json({ error: "session_not_found" }, 404);
      // @ts-ignore nested shape
      if (sess.client_packages?.lead_id !== lead_id) return json({ error: "session_lead_mismatch" }, 400);
      if (sess.service_id !== service_id) return json({ error: "session_service_mismatch" }, 400);
      if (sess.status === "completed" || sess.status === "cancelled") {
        return json({ error: "session_not_bookable" }, 400);
      }
    }

    const { data: staff } = await supabase
      .from("app_users")
      .select("id, display_name, email, can_schedule, role, is_archived")
      .eq("id", staff_user_id)
      .maybeSingle();
    if (!staff) return json({ error: "staff_not_found" }, 404);
    if (staff.is_archived) return json({ error: "staff_archived" }, 400);

    const bookerName = lead.name || "Client";
    const bookerEmail = (lead.email || "").trim().toLowerCase() || "noreply@within.center";

    const { data: booking, error: insErr } = await supabase
      .from("scheduling_bookings")
      .insert({
        profile_id: null,
        event_type_id: null,
        staff_user_id,
        lead_id,
        service_id,
        space_id,
        package_session_id,
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

    if (package_session_id) {
      const { error: sessErr } = await supabase
        .from("client_package_sessions")
        .update({
          booking_id: booking.id,
          scheduled_at: startDate.toISOString(),
          status: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", package_session_id);
      if (sessErr) console.warn("session link failed:", sessErr.message);
    }

    return json({
      booking_id: booking.id,
      start_datetime: booking.start_datetime,
      end_datetime: booking.end_datetime,
    });
  } catch (e) {
    console.error("admin-book-session unhandled:", e);
    return json({ error: "unhandled", details: String(e) }, 500);
  }
});
