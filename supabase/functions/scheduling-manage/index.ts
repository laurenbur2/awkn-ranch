// Reschedule, cancel, or look up a booking via booking_token (no session required).
// Input: { action: 'lookup' | 'reschedule' | 'cancel', booking_token, new_start?, reason? }
// Output: { ok: true, ... } or { error }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// Rate limit by IP+token prefix to slow brute-forcers.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now > b.resetAt) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= max;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  try {
    const body = await req.json();
    const { action, booking_token, new_start, reason } = body;
    if (!action || !booking_token) return jsonResponse({ error: "missing action or token" }, 400);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const tokenPrefix = String(booking_token).slice(0, 8);
    if (!rateLimit(`${ip}:${tokenPrefix}`)) return jsonResponse({ error: "rate_limited" }, 429);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking } = await supabase
      .from("scheduling_bookings")
      .select("*, scheduling_event_types(*), scheduling_profiles(app_user_id, google_calendar_id, booking_slug)")
      .eq("booking_token", booking_token)
      .maybeSingle();

    if (!booking) return jsonResponse({ error: "booking_not_found" }, 404);

    if (action === "lookup") {
      // Safe-to-show subset — no Google tokens, no internal IDs beyond what's needed.
      const et = booking.scheduling_event_types;
      let staffName: string | null = null;
      if (booking.scheduling_profiles?.app_user_id) {
        const { data: appUser } = await supabase
          .from("app_users")
          .select("display_name, first_name, last_name")
          .eq("id", booking.scheduling_profiles.app_user_id)
          .maybeSingle();
        staffName = appUser?.display_name
          || [appUser?.first_name, appUser?.last_name].filter(Boolean).join(" ")
          || null;
      }
      return jsonResponse({
        ok: true,
        booking: {
          start_datetime: booking.start_datetime,
          end_datetime: booking.end_datetime,
          booker_name: booking.booker_name,
          booker_email: booking.booker_email,
          booker_timezone: booking.booker_timezone,
          status: booking.status,
          cancelled_at: booking.cancelled_at,
          notes: booking.notes,
          event_type: et ? {
            slug: et.slug,
            name: et.name,
            description: et.description,
            duration_minutes: et.duration_minutes,
            location_type: et.location_type,
            location_detail: et.location_detail,
          } : null,
          profile: booking.scheduling_profiles ? {
            booking_slug: booking.scheduling_profiles.booking_slug,
            name: staffName,
          } : null,
        },
      });
    }

    if (booking.cancelled_at) return jsonResponse({ error: "already_cancelled" }, 400);

    if (action === "cancel") {
      await supabase
        .from("scheduling_bookings")
        .update({
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason || null,
          status: "cancelled",
        })
        .eq("id", booking.id);

      // Google Calendar delete (best-effort).
      if (booking.google_event_id) {
        try {
          const tokenRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-refresh`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
              body: JSON.stringify({ profile_id: booking.profile_id }),
            },
          );
          const tokenJson = await tokenRes.json();
          if (tokenJson.access_token) {
            const calId = booking.scheduling_profiles?.google_calendar_id || "primary";
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`,
              { method: "DELETE", headers: { "Authorization": `Bearer ${tokenJson.access_token}` } },
            );
          }
        } catch (e) {
          console.warn("google event delete failed:", e);
        }
      }

      // Cancellation email (best-effort).
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({
              to: booking.booker_email,
              type: "scheduling_booking_cancelled",
              data: {
                booker_name: booking.booker_name,
                event_name: booking.scheduling_event_types?.name,
                start_iso: booking.start_datetime,
                reason: reason || null,
              },
            }),
          },
        );
      } catch (e) {
        console.warn("cancel email failed:", e);
      }

      return jsonResponse({ ok: true, action: "cancelled" });
    }

    if (action === "reschedule") {
      if (!new_start) return jsonResponse({ error: "new_start required" }, 400);
      const newStartDate = new Date(new_start);
      const eventType = booking.scheduling_event_types;
      const newEndDate = new Date(newStartDate.getTime() + eventType.duration_minutes * 60_000);

      // Insert replacement booking; UNIQUE index enforces the slot isn't taken.
      const { data: newBooking, error: insErr } = await supabase
        .from("scheduling_bookings")
        .insert({
          profile_id: booking.profile_id,
          event_type_id: booking.event_type_id,
          lead_id: booking.lead_id,
          booker_name: booking.booker_name,
          booker_email: booking.booker_email,
          booker_phone: booking.booker_phone,
          booker_timezone: booking.booker_timezone,
          start_datetime: newStartDate.toISOString(),
          end_datetime: newEndDate.toISOString(),
          notes: booking.notes,
          rescheduled_from: booking.id,
          status: "pending",
        })
        .select("id, booking_token")
        .single();

      if (insErr) {
        if (insErr.code === "23505") return jsonResponse({ error: "slot_taken" }, 409);
        return jsonResponse({ error: "insert_failed", details: insErr.message }, 500);
      }

      // Cancel the old booking.
      await supabase
        .from("scheduling_bookings")
        .update({
          cancelled_at: new Date().toISOString(),
          cancel_reason: `Rescheduled to ${newStartDate.toISOString()}`,
          status: "cancelled",
        })
        .eq("id", booking.id);

      // Update Google Calendar — patch the existing event rather than delete+create
      // so invitees see a reschedule rather than two emails.
      let newGoogleEventId: string | null = null;
      if (booking.google_event_id) {
        try {
          const tokenRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-refresh`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
              body: JSON.stringify({ profile_id: booking.profile_id }),
            },
          );
          const tokenJson = await tokenRes.json();
          if (tokenJson.access_token) {
            const calId = booking.scheduling_profiles?.google_calendar_id || "primary";
            const patchRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(booking.google_event_id)}?sendUpdates=all`,
              {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  start: { dateTime: newStartDate.toISOString() },
                  end: { dateTime: newEndDate.toISOString() },
                }),
              },
            );
            const patchJson = await patchRes.json();
            if (patchJson.id) newGoogleEventId = patchJson.id;
          }
        } catch (e) {
          console.warn("google event patch failed:", e);
        }
      }

      await supabase
        .from("scheduling_bookings")
        .update({
          status: newGoogleEventId ? "confirmed" : "pending",
          google_event_id: newGoogleEventId,
        })
        .eq("id", newBooking.id);

      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({
              to: booking.booker_email,
              type: "scheduling_booking_rescheduled",
              data: {
                booker_name: booking.booker_name,
                event_name: eventType.name,
                old_start_iso: booking.start_datetime,
                new_start_iso: newStartDate.toISOString(),
                duration_minutes: eventType.duration_minutes,
                reschedule_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${newBooking.booking_token}&a=reschedule`,
                cancel_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${newBooking.booking_token}&a=cancel`,
              },
            }),
          },
        );
      } catch (e) {
        console.warn("reschedule email failed:", e);
      }

      return jsonResponse({ ok: true, action: "rescheduled", new_booking_id: newBooking.id, new_booking_token: newBooking.booking_token });
    }

    return jsonResponse({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("scheduling-manage error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
