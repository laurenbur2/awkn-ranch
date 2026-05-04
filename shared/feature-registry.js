/**
 * Feature Registry — defines core vs optional platform modules.
 *
 * Core modules are always enabled. Optional modules can be toggled per-deployment
 * via the `features` JSONB column on the property_config or orgs table.
 *
 * Usage:
 *   import { isFeatureEnabled, FEATURES } from './feature-registry.js';
 *   if (await isFeatureEnabled('cameras')) { ... }
 */
import { getPropertyConfig } from './config-loader.js';

export const FEATURES = {
  // Core platform — always enabled, cannot be disabled
  spaces:     { label: 'Spaces',     core: true,  description: 'Space/unit management' },
  people:     { label: 'People',     core: true,  description: 'Tenant & guest records' },
  assignments:{ label: 'Assignments',core: true,  description: 'Booking & lease assignments' },
  media:      { label: 'Media',      core: true,  description: 'Photo & media library' },
  auth:       { label: 'Auth',       core: true,  description: 'User authentication & roles' },

  // Optional — toggled per-deployment via property_config.features JSONB
  // Communication
  email:      { label: 'Email',      core: false, description: 'Email notifications (Resend)' },
  sms:        { label: 'SMS',        core: false, description: 'SMS notifications (Telnyx)' },
  whatsapp:   { label: 'WhatsApp',   core: false, description: 'WhatsApp messaging' },

  // Payments
  payments_stripe: { label: 'Stripe',    core: false, description: 'Stripe payments + ACH' },
  payments_square: { label: 'Square',    core: false, description: 'Square payment processing' },
  payments_paypal: { label: 'PayPal',    core: false, description: 'PayPal payments & payouts' },

  // Documents
  esignatures:{ label: 'E-Signatures',core: false, description: 'SignWell e-signature integration' },
  documents:  { label: 'Documents',  core: false, description: 'Lease & event agreement templates' },

  // Property operations
  rentals:    { label: 'Rentals',    core: false, description: 'Rental application pipeline' },
  events:     { label: 'Events',     core: false, description: 'Event hosting pipeline' },
  associates: { label: 'Associates', core: false, description: 'Associate/staff hour tracking' },
  airbnb:     { label: 'Airbnb',     core: false, description: 'Airbnb iCal calendar sync' },
};

let _enabledCache = null;

/**
 * Returns the set of enabled features for this deployment.
 * Core features are always included. Optional features come from property_config.
 */
export async function getEnabledFeatures() {
  if (_enabledCache) return _enabledCache;

  const config = await getPropertyConfig();
  const overrides = config.features || {};

  const enabled = {};
  for (const [key, def] of Object.entries(FEATURES)) {
    if (def.core) {
      enabled[key] = true;
    } else {
      enabled[key] = overrides[key] !== undefined ? !!overrides[key] : false;
    }
  }

  _enabledCache = enabled;
  return enabled;
}

/**
 * Check if a specific feature is enabled.
 */
export async function isFeatureEnabled(featureKey) {
  const enabled = await getEnabledFeatures();
  return !!enabled[featureKey];
}

/**
 * Reset the cache (e.g. after config update).
 */
export function resetFeatureCache() {
  _enabledCache = null;
}
