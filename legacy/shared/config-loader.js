/**
 * Property configuration loader.
 * Fetches operational identity from `property_config` table.
 * Same caching pattern as brand-config.js — 5-min TTL with hardcoded fallback.
 */
import { supabase } from './supabase.js';

let cachedConfig = null;
let cacheTimestamp = 0;
let fetchPromise = null;
const CACHE_TTL = 5 * 60 * 1000;

const FALLBACK_CONFIG = {
  property: {
    name: 'AWKN Ranch',
    short_name: 'AWKN Ranch',
    tagline: 'We put the AI into Propertys',
    address: '7600 Stillridge Dr, Austin, TX 78736',
    city: 'Austin',
    state: 'TX',
    zip: '00000',
    country: 'US',
    latitude: 30.13,
    longitude: -97.46,
    timezone: 'America/Chicago',
  },
  domain: {
    primary: 'awknranch.com',
    github_pages: 'USERNAME.github.io/REPO',
    camera_proxy: 'YOUR_CAMERA_PROXY',
  },
  email: {
    team: 'team@awknranch.com',
    admin_gmail: 'admin@awknranch.com',
    notifications_from: 'notifications@awknranch.com',
    noreply_from: 'noreply@awknranch.com',
    automation: 'automation@awknranch.com',
  },
  payment: {
    zelle_email: 'admin@awknranch.com',
    venmo_handle: '@PropertyPlayhouse',
  },
  ai_assistant: {
    name: 'PAI',
    full_name: 'Prompt Property Intelligence',
    personality: 'the AI assistant for the property',
    email_from: 'pai@awknranch.com',
  },
  wifi: {
    network_name: 'Black Rock City',
  },
  mobile_app: {
    name: 'AWKN Ranch',
    id: 'com.awknranch.app',
  },
};

export async function getPropertyConfig() {
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedConfig;
  }

  // Deduplicate concurrent fetches
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('property_config')
        .select('config')
        .eq('id', 1)
        .single();

      if (error || !data?.config) {
        console.warn('property_config fetch failed, using fallback:', error?.message);
        cachedConfig = FALLBACK_CONFIG;
      } else {
        cachedConfig = { ...FALLBACK_CONFIG, ...data.config };
      }
    } catch (e) {
      console.warn('property_config fetch error, using fallback:', e.message);
      cachedConfig = FALLBACK_CONFIG;
    }
    cacheTimestamp = Date.now();
    return cachedConfig;
  })();

  return fetchPromise;
}

/** Shorthand accessors for common config paths */
export async function getPropertyName() {
  return (await getPropertyConfig()).property?.name ?? FALLBACK_CONFIG.property.name;
}

export async function getDomain() {
  return (await getPropertyConfig()).domain?.primary ?? FALLBACK_CONFIG.domain.primary;
}

export async function getTimezone() {
  return (await getPropertyConfig()).property?.timezone ?? FALLBACK_CONFIG.property.timezone;
}
