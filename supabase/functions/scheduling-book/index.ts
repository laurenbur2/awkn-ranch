// Atomic booking creation.
// Input: { profile_slug, event_type_slug, start_datetime (ISO UTC),
//          booker_name, booker_email, booker_phone?, booker_timezone, notes? }
// Output: { booking_id, booking_token, confirmation_url } or { error: 'slot_taken', status: 409 }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const PIPELINE_BOOKING_STAGE_BY_BIZ: Record<string, string> = {
  within: "consultation_scheduled",
  awkn_ranch: "tour_call",
};

// Per-IP rate limit.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) { rateBuckets.set(ip, { count: 1, resetAt: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= max;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!rateLimit(ip)) return jsonResponse({ error: "rate_limited" }, 429);

  try {
    const body = await req.json();
    const { profile_slug, event_type_slug, start_datetime, booker_name, booker_email, booker_phone, booker_timezone, notes } = body;

    if (!profile_slug || !event_type_slug || !start_datetime || !booker_name || !booker_email) {
      return jsonResponse({ error: "missing required fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("scheduling_profiles")
      .select("id, app_user_id, booking_slug, google_calendar_id, is_bookable, timezone")
      .eq("booking_slug", profile_slug)
      .single();
    if (!profile || !profile.is_bookable) return jsonResponse({ error: "profile_not_bookable" }, 404);

    const { data: eventType } = await supabase
      .from("scheduling_event_types")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("slug", event_type_slug)
      .eq("is_active", true)
      .single();
    if (!eventType) return jsonResponse({ error: "event_type_not_found" }, 404);

    const startDate = new Date(start_datetime);
    const endDate = new Date(startDate.getTime() + eventType.duration_minutes * 60_000);

    // Atomic insert — UNIQUE(profile_id, event_type_id, start_datetime) WHERE cancelled_at IS NULL
    // will raise 23505 if another booking just took the slot.
    const { data: booking, error: insErr } = await supabase
      .from("scheduling_bookings")
      .insert({
        profile_id: profile.id,
        event_type_id: eventType.id,
        booker_name,
        booker_email: booker_email.toLowerCase().trim(),
        booker_phone: booker_phone || null,
        booker_timezone: booker_timezone || null,
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        notes: notes || null,
        status: "pending",
      })
      .select("id, booking_token")
      .single();

    if (insErr) {
      if (insErr.code === "23505") return jsonResponse({ error: "slot_taken" }, 409);
      console.error("booking insert failed:", insErr);
      return jsonResponse({ error: "insert_failed", details: insErr.message }, 500);
    }

    // Lead auto-link + pipeline advance (best-effort; failure shouldn't kill the booking).
    try {
      const emailLc = booker_email.toLowerCase().trim();
      const { data: leads } = await supabase
        .from("crm_leads")
        .select("id, business_line, stage_id, status")
        .ilike("email", emailLc)
        .in("status", ["open", "contacted", "new"]) // open-ish statuses
        .limit(1);
      const lead = leads?.[0];

      if (lead) {
        const targetStageSlug = PIPELINE_BOOKING_STAGE_BY_BIZ[lead.business_line];
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (targetStageSlug) {
          const { data: stage } = await supabase
            .from("crm_pipeline_stages")
            .select("id")
            .eq("business_line", lead.business_line)
            .eq("slug", targetStageSlug)
            .maybeSingle();
          if (stage?.id) updates.stage_id = stage.id;
        }

        await supabase.from("crm_leads").update(updates).eq("id", lead.id);
        await supabase.from("scheduling_bookings").update({ lead_id: lead.id }).eq("id", booking.id);
      }
    } catch (e) {
      console.warn("lead auto-link failed:", e);
    }

    // Google Calendar event create (best-effort; if it fails, leave pending for sweeper).
    let googleEventId: string | null = null;
    try {
      const tokenRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ profile_id: profile.id }),
        },
      );
      const tokenJson = await tokenRes.json();
      if (tokenJson.access_token) {
        const calId = profile.google_calendar_id || "primary";
        const evRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: `${eventType.name} — ${booker_name}`,
              description: [
                notes ? `Notes: ${notes}` : null,
                `Booker: ${booker_name} <${booker_email}>${booker_phone ? ` / ${booker_phone}` : ""}`,
                booker_timezone ? `Booker timezone: ${booker_timezone}` : null,
              ].filter(Boolean).join("\n"),
              location: eventType.location_detail || undefined,
              start: { dateTime: startDate.toISOString() },
              end: { dateTime: endDate.toISOString() },
              attendees: [{ email: booker_email }],
            }),
          },
        );
        const evJson = await evRes.json();
        if (evJson.id) googleEventId = evJson.id;
      }
    } catch (e) {
      console.warn("google calendar create failed:", e);
    }

    await supabase
      .from("scheduling_bookings")
      .update({
        status: googleEventId ? "confirmed" : "pending",
        google_event_id: googleEventId,
      })
      .eq("id", booking.id);

    // Confirmation email (best-effort).
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            to: booker_email,
            type: "scheduling_booking_confirmed",
            data: {
              booker_name,
              event_name: eventType.name,
              start_iso: startDate.toISOString(),
              duration_minutes: eventType.duration_minutes,
              location_type: eventType.location_type,
              location_detail: eventType.location_detail,
              reschedule_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${booking.booking_token}&a=reschedule`,
              cancel_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${booking.booking_token}&a=cancel`,
            },
          }),
        },
      );
    } catch (e) {
      console.warn("confirmation email failed:", e);
    }

    // Staff SMS (opt-in per event type).
    if (eventType.notify_sms_on_booking) {
      try {
        const { data: staff } = await supabase
          .from("app_users").select("phone, display_name").eq("id", profile.app_user_id).single();
        if (staff?.phone) {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
              body: JSON.stringify({
                to: staff.phone,
                message: `New booking: ${eventType.name} with ${booker_name} on ${startDate.toISOString()}`,
              }),
            },
          );
        }
      } catch (e) {
        console.warn("staff SMS failed:", e);
      }
    }

    return jsonResponse({
      booking_id: booking.id,
      booking_token: booking.booking_token,
      status: googleEventId ? "confirmed" : "pending",
    });
  } catch (err) {
    console.error("scheduling-book error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
