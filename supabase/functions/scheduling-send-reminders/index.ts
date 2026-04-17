// Cron-triggered: sends 24h and 1h booking reminder emails.
// Expected to run hourly (via pg_cron or Supabase scheduled function).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const sendEmail = async (type: string, data: Record<string, unknown>, to: string) => {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ to, type, data }),
        },
      );
    };

    // 24h window: [now+23h, now+25h]
    const w24Start = new Date(now + 23 * 3600_000).toISOString();
    const w24End = new Date(now + 25 * 3600_000).toISOString();
    const { data: bookings24 } = await supabase
      .from("scheduling_bookings")
      .select("id, booker_name, booker_email, start_datetime, booking_token, scheduling_event_types(name, duration_minutes, location_type, location_detail)")
      .is("cancelled_at", null)
      .is("reminder_24h_sent_at", null)
      .in("status", ["confirmed", "pending"])
      .gte("start_datetime", w24Start)
      .lte("start_datetime", w24End);

    let sent24 = 0;
    for (const b of bookings24 ?? []) {
      try {
        await sendEmail("scheduling_reminder_24h", {
          booker_name: b.booker_name,
          event_name: b.scheduling_event_types?.name,
          start_iso: b.start_datetime,
          duration_minutes: b.scheduling_event_types?.duration_minutes,
          location_type: b.scheduling_event_types?.location_type,
          location_detail: b.scheduling_event_types?.location_detail,
          reschedule_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${b.booking_token}&a=reschedule`,
          cancel_url: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch"}/schedule/manage.html?t=${b.booking_token}&a=cancel`,
        }, b.booker_email);
        await supabase.from("scheduling_bookings").update({ reminder_24h_sent_at: new Date().toISOString() }).eq("id", b.id);
        sent24 += 1;
      } catch (e) {
        console.warn("reminder 24h send failed for", b.id, e);
      }
    }

    // 1h window: [now+50min, now+70min]
    const w1Start = new Date(now + 50 * 60_000).toISOString();
    const w1End = new Date(now + 70 * 60_000).toISOString();
    const { data: bookings1 } = await supabase
      .from("scheduling_bookings")
      .select("id, booker_name, booker_email, start_datetime, booking_token, scheduling_event_types(name, duration_minutes, location_type, location_detail)")
      .is("cancelled_at", null)
      .is("reminder_1h_sent_at", null)
      .in("status", ["confirmed", "pending"])
      .gte("start_datetime", w1Start)
      .lte("start_datetime", w1End);

    let sent1 = 0;
    for (const b of bookings1 ?? []) {
      try {
        await sendEmail("scheduling_reminder_1h", {
          booker_name: b.booker_name,
          event_name: b.scheduling_event_types?.name,
          start_iso: b.start_datetime,
          duration_minutes: b.scheduling_event_types?.duration_minutes,
          location_type: b.scheduling_event_types?.location_type,
          location_detail: b.scheduling_event_types?.location_detail,
        }, b.booker_email);
        await supabase.from("scheduling_bookings").update({ reminder_1h_sent_at: new Date().toISOString() }).eq("id", b.id);
        sent1 += 1;
      } catch (e) {
        console.warn("reminder 1h send failed for", b.id, e);
      }
    }

    return jsonResponse({ ok: true, sent_24h: sent24, sent_1h: sent1 });
  } catch (err) {
    console.error("scheduling-send-reminders error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
