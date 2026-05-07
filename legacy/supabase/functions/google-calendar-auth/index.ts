// Google Calendar OAuth handshake for the scheduling tool.
// Required Supabase secrets:
//   GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET
//   GOOGLE_CALENDAR_REDIRECT_URI  (e.g. https://<project>.supabase.co/functions/v1/google-calendar-auth?action=callback)
//   PUBLIC_SITE_URL               (e.g. https://laurenbur2.github.io/awkn-ranch)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid", "email",
].join(" ");

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI")!;
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://laurenbur2.github.io/awkn-ranch";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "start") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return jsonResponse({ error: "user_id required" }, 400);

      const authUrl = new URL(GOOGLE_AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", userId);

      return Response.redirect(authUrl.toString(), 302);
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return jsonResponse({ error: "missing code/state" }, 400);

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error("Google token exchange failed:", tokenData);
        return jsonResponse({ error: tokenData.error_description || tokenData.error }, 400);
      }

      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

      const { data: existing } = await supabase
        .from("scheduling_profiles")
        .select("id, booking_slug")
        .eq("app_user_id", state)
        .maybeSingle();

      let profileId = existing?.id as string | undefined;

      if (!profileId) {
        const { data: userRow } = await supabase
          .from("app_users").select("email").eq("id", state).single();
        const slugBase = (userRow?.email?.split("@")[0] || "user")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const slug = `${slugBase}-${state.slice(0, 6)}`;

        const { data: inserted, error: insErr } = await supabase
          .from("scheduling_profiles")
          .insert({
            app_user_id: state,
            booking_slug: slug,
            google_refresh_token: tokenData.refresh_token,
            google_access_token: tokenData.access_token,
            token_expires_at: expiresAt,
            google_calendar_id: "primary",
            is_bookable: false,
          })
          .select("id").single();
        if (insErr) {
          console.error("profile insert failed:", insErr);
          return jsonResponse({ error: "profile_insert_failed" }, 500);
        }
        profileId = inserted.id;

        // Seed a default event type so the profile is usable immediately.
        await supabase.from("scheduling_event_types").insert({
          profile_id: profileId,
          slug: "default",
          name: "30 Minute Meeting",
          duration_minutes: 30,
        });
      } else {
        await supabase
          .from("scheduling_profiles")
          .update({
            google_refresh_token: tokenData.refresh_token ?? undefined,
            google_access_token: tokenData.access_token,
            token_expires_at: expiresAt,
            google_calendar_id: "primary",
            updated_at: new Date().toISOString(),
          })
          .eq("id", profileId);
      }

      return Response.redirect(`${publicSiteUrl}/spaces/admin/scheduling.html?connected=true`, 302);
    }

    return jsonResponse({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("google-calendar-auth error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
