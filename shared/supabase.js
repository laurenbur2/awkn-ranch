// Supabase client configuration with auth support
//
// Runtime toggle: point at a local Supabase clone instead of prod.
// Triggers (any one): ?local=1 URL param, localStorage key 'awkn_local_db'='true',
// or window.AWKN_LOCAL_DB=true. Default = prod (unchanged behavior).
// See docs/LOCAL-DEV.md.
const useLocalDb = (typeof window !== 'undefined') && (
  window.AWKN_LOCAL_DB === true ||
  new URLSearchParams(window.location.search).get('local') === '1' ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('awkn_local_db') === 'true')
);

const PROD_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
const PROD_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

// Supabase CLI local stack defaults (stable across versions). Override via
// window.AWKN_LOCAL_SUPABASE_URL / window.AWKN_LOCAL_ANON_KEY if your
// `supabase start` printed different values.
const LOCAL_URL = (typeof window !== 'undefined' && window.AWKN_LOCAL_SUPABASE_URL) || 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY = (typeof window !== 'undefined' && window.AWKN_LOCAL_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SUPABASE_URL = useLocalDb ? LOCAL_URL : PROD_URL;
const SUPABASE_ANON_KEY = useLocalDb ? LOCAL_ANON_KEY : PROD_ANON_KEY;

if (useLocalDb) {
  console.log('[supabase.js] Local DB mode active — pointing at', SUPABASE_URL);
}

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
    storageKey: useLocalDb ? 'awkn-ranch-auth-local' : 'awkn-ranch-auth',
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
