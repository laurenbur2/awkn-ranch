// Cron-triggered (every ~5 min): retry Google Calendar writes for bookings
// stuck in 'pending'. If retry still fails after MAX_ATTEMPTS age, mark
// them 'calendar_failed' and notify staff by email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const MIN_AGE_MS = 2 * 60_000;
const GIVE_UP_AGE_MS = 60 * 60_000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
    const giveUpCutoff = new Date(Date.now() - GIVE_UP_AGE_MS).toISOString();

    const { data: stuck } = await supabase
      .from("scheduling_bookings")
      .select("*, scheduling_event_types(*), scheduling_profiles(app_user_id, google_calendar_id)")
      .eq("status", "pending")
      .is("cancelled_at", null)
      .is("google_event_id", null)
      .lte("created_at", cutoff)
      .limit(50);

    let retried = 0, succeeded = 0, failed = 0;

    for (const b of stuck ?? []) {
      retried += 1;
      try {
        const tokenRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
            body: JSON.stringify({ profile_id: b.profile_id }),
          },
        );
        const tokenJson = await tokenRes.json();

        if (!tokenJson.access_token) {
          if (b.created_at < giveUpCutoff) {
            await supabase.from("scheduling_bookings").update({ status: "calendar_failed" }).eq("id", b.id);
            failed += 1;
          }
          continue;
        }

        const calId = b.scheduling_profiles?.google_calendar_id || "primary";
        const evRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: `${b.scheduling_event_types?.name ?? "Meeting"} — ${b.booker_name}`,
              description: [
                b.notes ? `Notes: ${b.notes}` : null,
                `Booker: ${b.booker_name} <${b.booker_email}>${b.booker_phone ? ` / ${b.booker_phone}` : ""}`,
              ].filter(Boolean).join("\n"),
              location: b.scheduling_event_types?.location_detail || undefined,
              start: { dateTime: b.start_datetime },
              end: { dateTime: b.end_datetime },
              attendees: [{ email: b.booker_email }],
            }),
          },
        );
        const evJson = await evRes.json();

        if (evJson.id) {
          await supabase
            .from("scheduling_bookings")
            .update({ status: "confirmed", google_event_id: evJson.id })
            .eq("id", b.id);
          succeeded += 1;
        } else if (b.created_at < giveUpCutoff) {
          await supabase.from("scheduling_bookings").update({ status: "calendar_failed" }).eq("id", b.id);
          failed += 1;
        }
      } catch (e) {
        console.warn("sweeper retry failed for", b.id, e);
      }
    }

    return jsonResponse({ ok: true, retried, succeeded, failed });
  } catch (err) {
    console.error("scheduling-pending-sweeper error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
