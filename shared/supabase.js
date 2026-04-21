// Supabase client configuration with auth support
const SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

// Classic <script src=".../supabase.min.js"> tags in <body> always finish before
// deferred module scripts start evaluating, so window.supabase.createClient is
// guaranteed to exist here. If it doesn't, the UMD tag is missing from the page
// — throw loudly so Safari surfaces a real error instead of hanging on a silent
// top-level-await rejection.
if (!window.supabase?.createClient) {
  const err = new Error(
    'Supabase UMD script not loaded — the page is missing <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js"> before its module scripts.'
  );
  console.error('[supabase.js]', err);
  throw err;
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'awkn-ranch-auth',
    flowType: 'pkce',
  },
});

/**
 * Lightweight connectivity probe (HEAD request to REST endpoint).
 * Returns true if Supabase is reachable, false otherwise.
 * Used by supabase-health.js for recovery detection.
 */
async function pingSupabase() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/brand_config?select=id&limit=1`, {
      method: 'HEAD',
      headers: { 'apikey': SUPABASE_ANON_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

// Proactively refresh the session when the page returns from background.
// Mobile browsers suspend tabs when backgrounded — the auto-refresh timer
// doesn't fire, so the JWT can expire. This handler ensures the refresh
// token is exchanged for a new JWT as soon as the user comes back.
if (typeof document !== 'undefined') {
  let lastVisibleAt = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const elapsed = Date.now() - lastVisibleAt;
      // Only bother refreshing if backgrounded for > 5 minutes
      if (elapsed > 5 * 60 * 1000) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data?.session) {
            // No session — try an explicit refresh using the stored refresh token
            supabase.auth.refreshSession();
          }
        });
      }
      lastVisibleAt = Date.now();
    } else {
      lastVisibleAt = Date.now();
    }
  });
}

// Export for use in other modules
export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, pingSupabase };
