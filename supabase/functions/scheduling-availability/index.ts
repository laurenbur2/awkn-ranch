// Compute available booking slots for a public event type.
// Input: { profile_slug, event_type_slug, from_date, to_date, timezone }
//   - dates are ISO YYYY-MM-DD
//   - timezone is booker's IANA tz (e.g. "America/Los_Angeles"), informational only;
//     slots are returned as UTC ISO strings and the client renders in booker's tz.
// Output: { slots: [{ start, end }], staff_timezone, event_type: {...}, profile: {...} }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SLOT_STEP_MINUTES = 15;

// -- simple in-memory rate limit (per instance) --------------------------
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, max = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

// -- timezone math -------------------------------------------------------
function wallTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  // dateStr = "YYYY-MM-DD", timeStr = "HH:MM", tz = IANA zone
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
  const offsetPart = fmt.formatToParts(naive).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offsetPart.match(/([+-])(\d{1,2}):?(\d{2})?/);
  if (!match) return naive;
  const sign = match[1] === "+" ? 1 : -1;
  const hrs = parseInt(match[2], 10);
  const mins = parseInt(match[3] ?? "0", 10);
  const offsetMs = sign * (hrs * 3600 + mins * 60) * 1000;
  return new Date(naive.getTime() - offsetMs);
}

function dayOfWeekInTz(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const wkday = fmt.format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wkday);
}

function isoDateInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(date);
}

function parseHHMM(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!rateLimit(ip, 60, 60_000)) return jsonResponse({ error: "rate_limited" }, 429);

  try {
    const { profile_slug, event_type_slug, from_date, to_date } = await req.json();
    if (!profile_slug || !event_type_slug || !from_date || !to_date) {
      return jsonResponse({ error: "missing required fields" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("scheduling_profiles")
      .select("id, app_user_id, booking_slug, timezone, is_bookable, available_hours, google_calendar_id")
      .eq("booking_slug", profile_slug)
      .single();
    if (!profile || !profile.is_bookable) {
      return jsonResponse({ error: "profile_not_bookable" }, 404);
    }

    const { data: appUser } = await supabase
      .from("app_users")
      .select("display_name, first_name, last_name")
      .eq("id", profile.app_user_id)
      .maybeSingle();
    const staffName = appUser?.display_name
      || [appUser?.first_name, appUser?.last_name].filter(Boolean).join(" ")
      || null;

    const { data: eventType } = await supabase
      .from("scheduling_event_types")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("slug", event_type_slug)
      .eq("is_active", true)
      .single();
    if (!eventType) return jsonResponse({ error: "event_type_not_found" }, 404);

    const tz = profile.timezone || "UTC";
    const hoursConfig = eventType.available_hours ?? profile.available_hours ?? {};
    const durationMs = eventType.duration_minutes * 60_000;
    const bufferMs = eventType.buffer_minutes * 60_000;
    const minNoticeMs = eventType.min_notice_minutes * 60_000;
    const advanceMs = eventType.advance_days * 86_400_000;

    const now = new Date();
    const windowStart = new Date(Math.max(new Date(from_date + "T00:00:00Z").getTime(), now.getTime() + minNoticeMs));
    const windowEnd = new Date(Math.min(new Date(to_date + "T23:59:59Z").getTime(), now.getTime() + advanceMs));

    // Existing non-cancelled bookings within window.
    const { data: existing } = await supabase
      .from("scheduling_bookings")
      .select("start_datetime, end_datetime")
      .eq("profile_id", profile.id)
      .is("cancelled_at", null)
      .gte("start_datetime", windowStart.toISOString())
      .lt("start_datetime", windowEnd.toISOString());

    const booked: Array<[number, number]> = (existing ?? []).map((b) => [
      new Date(b.start_datetime).getTime() - bufferMs,
      new Date(b.end_datetime).getTime() + bufferMs,
    ]);

    // Google freeBusy — best-effort; skip if token unavailable/expired.
    let googleBusy: Array<[number, number]> = [];
    try {
      const tokenRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ profile_id: profile.id }),
        },
      );
      const tokenJson = await tokenRes.json();
      if (tokenJson.access_token) {
        const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokenJson.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timeMin: windowStart.toISOString(),
            timeMax: windowEnd.toISOString(),
            items: [{ id: profile.google_calendar_id || "primary" }],
          }),
        });
        const fbJson = await fbRes.json();
        const calId = profile.google_calendar_id || "primary";
        const busy = fbJson?.calendars?.[calId]?.busy ?? [];
        googleBusy = busy.map((b: { start: string; end: string }) => [
          new Date(b.start).getTime(),
          new Date(b.end).getTime(),
        ]);
      }
    } catch (e) {
      console.warn("freeBusy skipped:", e);
    }

    const allBusy = [...booked, ...googleBusy];

    // Walk each day in the range, generate slots in staff tz, filter busy.
    const slots: Array<{ start: string; end: string }> = [];
    const cursor = new Date(windowStart);
    const limit = new Date(windowEnd);
    const seenDates = new Set<string>();

    while (cursor < limit) {
      const dateStr = isoDateInTz(cursor, tz);
      if (!seenDates.has(dateStr)) {
        seenDates.add(dateStr);
        const dow = dayOfWeekInTz(cursor, tz);
        const dayCfg = hoursConfig[DAY_NAMES[dow]];

        if (dayCfg?.enabled) {
          const startMin = parseHHMM(dayCfg.start || "09:00");
          const endMin = parseHHMM(dayCfg.end || "17:00");
          for (let m = startMin; m + eventType.duration_minutes <= endMin; m += SLOT_STEP_MINUTES) {
            const hh = String(Math.floor(m / 60)).padStart(2, "0");
            const mm = String(m % 60).padStart(2, "0");
            const slotStart = wallTimeToUtc(dateStr, `${hh}:${mm}`, tz);
            const slotEnd = new Date(slotStart.getTime() + durationMs);

            if (slotStart < windowStart || slotEnd > windowEnd) continue;

            const clash = allBusy.some(([bs, be]) => slotStart.getTime() < be && slotEnd.getTime() > bs);
            if (!clash) {
              slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
            }
          }
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return jsonResponse({
      slots,
      staff_timezone: tz,
      event_type: {
        slug: eventType.slug, name: eventType.name, description: eventType.description,
        duration_minutes: eventType.duration_minutes, location_type: eventType.location_type,
        location_detail: eventType.location_detail, color: eventType.color,
      },
      profile: { booking_slug: profile.booking_slug, name: staffName },
    });
  } catch (err) {
    console.error("scheduling-availability error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
