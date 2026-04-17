// Refresh a scheduling_profiles row's Google access token.
// Called internally by scheduling-availability and scheduling-book.
// Input: { profile_id }
// Output: { access_token, token_expires_at } or { error, needs_reconnect }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  try {
    const { profile_id } = await req.json();
    if (!profile_id) return jsonResponse({ error: "profile_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile, error } = await supabase
      .from("scheduling_profiles")
      .select("id, google_refresh_token, google_access_token, token_expires_at")
      .eq("id", profile_id)
      .single();

    if (error || !profile) return jsonResponse({ error: "profile_not_found" }, 404);
    if (!profile.google_refresh_token) return jsonResponse({ error: "not_connected", needs_reconnect: true }, 400);

    const expiresAt = profile.token_expires_at ? new Date(profile.token_expires_at).getTime() : 0;
    if (profile.google_access_token && expiresAt - Date.now() > REFRESH_LEEWAY_MS) {
      return jsonResponse({ access_token: profile.google_access_token, token_expires_at: profile.token_expires_at });
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!,
        refresh_token: profile.google_refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      const needsReconnect = tokenData.error === "invalid_grant";
      console.error("Google refresh failed:", tokenData);
      return jsonResponse({ error: tokenData.error, needs_reconnect: needsReconnect }, 400);
    }

    const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

    await supabase
      .from("scheduling_profiles")
      .update({
        google_access_token: tokenData.access_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile_id);

    return jsonResponse({ access_token: tokenData.access_token, token_expires_at: newExpiresAt });
  } catch (err) {
    console.error("google-calendar-refresh error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
