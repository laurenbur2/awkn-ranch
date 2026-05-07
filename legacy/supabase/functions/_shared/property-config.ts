/**
 * Property configuration loader for edge functions.
 * Fetches operational identity from `property_config` table.
 * Per-invocation cache (edge functions are short-lived).
 */

const FALLBACK_CONFIG: Record<string, any> = {
  property: {
    name: "AWKN Ranch",
    short_name: "AWKN Team Portal",
    tagline: "We put the AI into Propertys",
    address: "7600 Stillridge Dr, Austin, TX 78736",
    city: "Austin",
    state: "TX",
    zip: "00000",
    country: "US",
    latitude: 30.13,
    longitude: -97.46,
    timezone: "America/Chicago",
  },
  domain: {
    primary: "awknranch.com",
    github_pages: "USERNAME.github.io/REPO",
    camera_proxy: "YOUR_CAMERA_PROXY",
  },
  email: {
    team: "team@awknranch.com",
    admin_gmail: "admin@awknranch.com",
    notifications_from: "notifications@awknranch.com",
    noreply_from: "noreply@awknranch.com",
    automation: "automation@awknranch.com",
  },
  payment: {
    zelle_email: "admin@awknranch.com",
    venmo_handle: "@PropertyPlayhouse",
  },
  ai_assistant: {
    name: "PAI",
    full_name: "Prompt Property Intelligence",
    personality: "the AI assistant for the property",
    email_from: "pai@awknranch.com",
  },
  wifi: {
    network_name: "Black Rock City",
  },
  mobile_app: {
    name: "AWKN Ranch",
    id: "com.awknranch.app",
  },
};

let _cached: Record<string, any> | null = null;

export async function getPropertyConfig(
  supabase: any
): Promise<Record<string, any>> {
  if (_cached) return _cached;

  try {
    const { data, error } = await supabase
      .from("property_config")
      .select("config")
      .eq("id", 1)
      .single();

    if (error || !data?.config) {
      _cached = FALLBACK_CONFIG;
    } else {
      _cached = { ...FALLBACK_CONFIG, ...data.config };
    }
  } catch (_e) {
    _cached = FALLBACK_CONFIG;
  }

  return _cached!;
}

export function getFallbackConfig(): Record<string, any> {
  return FALLBACK_CONFIG;
}
