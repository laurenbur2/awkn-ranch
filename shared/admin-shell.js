/**
 * Admin Shell - Shared module for all admin pages
 * Provides: auth flow, tab navigation, toast notifications, lightbox
 */

import { supabase } from './supabase.js';
import { initAuth, getAuthState, signOut, onAuthStateChange, hasAnyPermission, hasPermission } from './auth.js';
import { errorLogger } from './error-logger.js';
import { supabaseHealth } from './supabase-health.js';
import { renderHeader, initSiteComponents } from './site-components.js';
import { setupVersionInfo } from './version-info.js';
import { initNavTabList, scrollActiveIntoView } from './tab-utils.js';
import { getEnabledFeatures } from './feature-registry.js';

// =============================================
// TAB DEFINITIONS
// =============================================
// Permission keys for staff/admin section detection
const STAFF_PERMISSION_KEYS = [
  'view_dashboard', 'view_staff_directory',
  'view_spaces', 'view_rentals', 'view_events', 'view_media', 'view_sms',
  'view_purchases', 'view_hours', 'view_faq', 'view_voice', 'view_todo', 'view_appdev', 'view_inventory',
  'view_crm', 'view_memberships', 'view_scheduler', 'view_calendar',
];
const ADMIN_PERMISSION_KEYS = [
  'view_users', 'view_passwords', 'view_settings', 'view_templates', 'view_accounting', 'view_testdev', 'view_openclaw', 'view_devcontrol',
  'manage_users', 'manage_job_titles',
];

// Compact SVG icons for tabs (16x16, stroke-based)
const _i = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TAB_ICONS = {
  spaces:     _i('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
  rentals:    _i('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  reservations: _i('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>'),
  memberships:  _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  events:     _i('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  media:      _i('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  sms:        _i('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  purchases:  _i('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>'),
  hours:      _i('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  faq:        _i('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  voice:      _i('<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
  todo:       _i('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
  phyprop:    _i('<path d="M2 22V8l10-6 10 6v14"/><path d="M6 12v10"/><path d="M18 12v10"/><path d="M2 22h20"/><rect x="9" y="14" width="6" height="8"/>'),
  appdev:     _i('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  inventory:  _i('<path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="10" y1="12" x2="14" y2="12"/>'),
  users:      _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  passwords:  _i('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
  settings:   _i('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  releases:   _i('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'),
  templates:  _i('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  brand:      _i('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  accounting: _i('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  testdev:    _i('<path d="M9 3h6v4H9z"/><path d="M10 7v5l-4 8h12l-4-8V7"/>'),
  lifeofpai:  _i('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>'),
  openclaw:   _i('<path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1"/>'),
  devcontrol: _i('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'),
  crm:        _i('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  clients:    _i('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>'),
  scheduling: _i('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="15" r="2"/>'),
  'within-schedule': _i('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  'venue-events':    _i('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2"/><path d="M14 14h2"/><path d="M8 18h8"/>'),
  'venue-spaces':    _i('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  'venue-clients':   _i('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/>'),
  'retreat-overview': _i('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>'),
  dashboard:  _i('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'),
  staff:      _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  jobtitles:  _i('<path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v12a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/><line x1="9" y1="7" x2="15" y2="7"/>'),
  packages:   _i('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
};

// Tab definitions with optional `feature` key for config-driven visibility.
// Tabs without a `feature` key are always shown (core admin tabs).
// When property_config.features exists, tabs whose feature is disabled are hidden.
// When property_config.features is NOT set, all tabs show (backward compatible).
//
// `pillars` (staff-section tabs only): which business pillar(s) this tab belongs to.
// Values: 'master' (Master Calendar — default landing),
// 'within' (Within Center), 'ranch' (AWKN Ranch venue), 'retreat' (AWKN Retreat House).
// A tab can list multiple pillars if it surfaces in more than one.
// Tabs with no `pillars` are pillar-agnostic (visible in any staff pillar) — used for hidden direct-URL tabs.
export const ALL_ADMIN_TABS = [
  // Pillar-exclusive landing tabs (listed first so they win as the pillar's first-available
  // tab in renderContextSwitcher's firstTabForPillar lookup).
  { id: 'reservations', label: 'Schedules', href: 'reservations.html', permission: 'view_rentals', section: 'staff', feature: 'rentals', pillars: ['master'] },
  { id: 'retreat-overview', label: 'Rooms', href: 'retreat-house.html', permission: 'view_rentals', section: 'staff', feature: 'rentals', pillars: ['retreat'] },
  { id: 'venue-events', label: 'Events', href: 'venue-events.html', permission: 'view_crm', section: 'staff', pillars: ['ranch'] },
  { id: 'venue-spaces', label: 'Spaces', href: 'venue-spaces.html', permission: 'view_crm', section: 'staff', pillars: ['ranch'] },
  { id: 'venue-clients', label: 'Clients', href: 'venue-clients.html', permission: 'view_crm', section: 'staff', pillars: ['ranch'] },
  // Staff section — primary admin tabs (Mindbody-style)
  // Dashboard / Staff / Sales / Inventory used to live under the 'shared'
  // (Today) pillar, which has been removed. Pages still load via direct
  // URL but they no longer surface in the pillar nav.
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', permission: 'view_dashboard', section: 'staff', feature: '_hidden' },
  { id: 'staff', label: 'Staff', href: 'staff.html', permission: 'view_staff_directory', section: 'staff', feature: '_hidden' },
  { id: 'within-schedule', label: 'Schedule', href: 'within-schedule.html', permission: 'view_crm', section: 'staff', pillars: ['within'] },
  { id: 'facilitators', label: 'Facilitators', href: 'facilitators.html', permission: 'view_crm', section: 'staff', pillars: ['within'] },
  { id: 'memberships', label: 'Memberships', href: 'memberships.html', permission: 'view_rentals', section: 'staff', feature: 'rentals', pillars: ['memberships'] },
  { id: 'clients', label: 'Clients', href: 'clients.html', permission: 'view_crm', section: 'staff', pillars: ['within'] },
  { id: 'crm', label: 'CRM', href: 'crm.html', permission: 'view_crm', section: 'staff', pillars: ['within', 'ranch', 'retreat'] },
  { id: 'packages', label: 'Packages', href: 'packages.html', permission: 'view_crm', section: 'staff', pillars: ['within', 'ranch', 'retreat'] },
  // Old events.html still exists at its URL but is no longer in the pillar
  // nav — it's been superseded by the unified Events page (venue-events.html)
  // which handles both list and calendar views off crm_leads.
  { id: 'events', label: 'Events', href: 'events.html', permission: 'view_events', section: 'staff', feature: '_hidden' },
  { id: 'purchases', label: 'Sales', href: 'purchases.html', permission: 'view_purchases', section: 'staff', feature: '_hidden' },
  { id: 'inventory', label: 'Inventory', href: 'inventory.html', permission: 'view_inventory', section: 'staff', feature: '_hidden' },
  // Hidden but still accessible via direct URL — no pillar filtering.
  // (The old generic spaces admin page was retired — see spaces.html which
  // now redirects to the dashboard. Venue Rental's "Spaces" tab is the
  // current resource-calendar replacement.)
  { id: 'media', label: 'Media', href: 'media.html', permission: 'view_media', section: 'staff', feature: '_hidden' },
  { id: 'sms', label: 'SMS', href: 'sms-messages.html', permission: 'view_sms', section: 'staff', feature: 'sms' },
  { id: 'hours', label: 'Workstuff', href: 'worktracking.html', permission: 'view_hours', section: 'staff', feature: 'associates' },
  { id: 'faq', label: 'FAQ/AI', href: 'faq.html', permission: 'view_faq', section: 'staff', feature: 'pai' },
  { id: 'voice', label: 'Concierge', href: 'voice.html', permission: 'view_voice', section: 'staff', feature: 'voice' },
  { id: 'todo', label: 'Todo', href: 'planlist.html', section: 'staff', feature: '_hidden' },
  { id: 'phyprop', label: 'PhyProp', href: 'phyprop.html', permission: 'view_spaces', section: 'staff', feature: '_hidden' },
  { id: 'appdev', label: 'App Dev', href: 'appdev.html', permission: 'view_appdev', section: 'staff', feature: '_hidden' },
  // Admin section
  { id: 'users', label: 'Users', href: 'users.html', permission: 'view_users', section: 'admin' },
  { id: 'jobtitles', label: 'Job Titles', href: 'job-titles.html', permission: 'manage_job_titles', section: 'admin' },
  { id: 'passwords', label: 'Passwords', href: 'passwords.html', permission: 'view_passwords', section: 'admin' },
  { id: 'settings', label: 'Settings', href: 'settings.html', permission: 'view_settings', section: 'admin' },
  { id: 'releases', label: 'Releases', href: 'releases.html', permission: 'view_settings', section: 'admin' },
  { id: 'templates', label: 'Templates', href: 'templates.html', permission: 'view_templates', section: 'admin', feature: 'documents' },
  { id: 'accounting', label: 'Accounting', href: 'accounting.html', permission: 'view_accounting', section: 'admin' },
  { id: 'lifeofpai', label: 'Life of PAI', href: '/residents/lifeofpaiadmin.html', permission: 'admin_pai_settings', section: 'admin', feature: 'pai' },
  { id: 'openclaw', label: 'AlpaClaw', href: 'alpaclaw.html', permission: 'view_openclaw', section: 'admin', feature: 'pai' },
  // Removed from Admin nav per request: Brand, Notifications, Test Dev, DevControl.
  // Their pages now redirect to the dashboard for any cached link. Permission
  // keys (view_devcontrol, view_testdev) intentionally kept in
  // STAFF_PERMISSION_KEYS so existing user/permission rows still validate.
];

// =============================================
// PILLARS — top-level business groupings in the context switcher
// =============================================
// Within the staff section, tabs are filtered by the active pillar.
// Pillar buttons appear in this display order. Admin / DevControl are
// rendered separately at the end (they're sections, not pillars).
const PILLAR_ORDER = ['master', 'within', 'ranch', 'retreat', 'memberships'];
const PILLAR_LABELS = {
  master:      'Master Calendar',
  memberships: 'Memberships',
  within:      'Within',
  ranch:       'Venue Rental',
  retreat:     'Retreat House',
};
const PILLAR_STORAGE_KEY = 'awkn.activePillar';
const DEFAULT_PILLAR = 'master';

/**
 * Resolve the active pillar from the URL (?pillar=) or localStorage.
 * Side effect: when a valid pillar is in the URL, it's persisted to localStorage
 * so subsequent navigations without the param remember the user's last context.
 */
export function getActivePillar() {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('pillar');
    if (fromUrl && PILLAR_ORDER.includes(fromUrl)) {
      try { localStorage.setItem(PILLAR_STORAGE_KEY, fromUrl); } catch (e) { /* ignore */ }
      return fromUrl;
    }
  } catch (e) { /* ignore */ }
  try {
    const stored = localStorage.getItem(PILLAR_STORAGE_KEY);
    if (stored && PILLAR_ORDER.includes(stored)) return stored;
  } catch (e) { /* ignore */ }
  return DEFAULT_PILLAR;
}

/** Append ?pillar=X to a tab href so navigation preserves pillar context. */
function appendPillarParam(href, pillar) {
  if (!pillar) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}pillar=${encodeURIComponent(pillar)}`;
}

// =============================================
// TOAST NOTIFICATIONS
// =============================================
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
    error: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
    warning: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    info: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }
}

// =============================================
// TAB PERMISSION SYNC
// =============================================
// Ensures every tab's permission key exists in the DB.
// Returns true if new permissions were inserted (caller should refresh user perms).
let _permSyncDone = false;
async function syncTabPermissions() {
  if (_permSyncDone) return false;
  _permSyncDone = true;
  try {
    const tabPermKeys = [...new Set(ALL_ADMIN_TABS.map(t => t.permission).filter(Boolean))];
    const { data: existing } = await supabase
      .from('permissions')
      .select('key')
      .in('key', tabPermKeys);
    const existingKeys = new Set((existing || []).map(p => p.key));
    const missing = tabPermKeys.filter(k => !existingKeys.has(k));
    if (missing.length === 0) return false;

    const permRows = missing.map(key => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const tab = ALL_ADMIN_TABS.find(t => t.permission === key);
      const category = tab ? tab.section : 'staff';
      return { key, label, description: 'Auto-synced from tab definition', category, sort_order: 100 };
    });
    const { error: insertErr } = await supabase.from('permissions').insert(permRows);
    if (insertErr) { console.warn('Permission sync insert error:', insertErr); return false; }

    const viewKeys = missing.filter(k => k.startsWith('view_'));
    if (viewKeys.length > 0) {
      const roleRows = [];
      for (const role of ['staff', 'admin', 'oracle']) {
        for (const key of viewKeys) {
          roleRows.push({ role, permission_key: key });
        }
      }
      await supabase.from('role_permissions').insert(roleRows);
    }
    console.log(`Synced ${missing.length} new permission(s):`, missing);
    return true;
  } catch (err) {
    console.warn('Permission sync failed:', err);
    return false;
  }
}

// =============================================
// TAB NAVIGATION
// =============================================
export async function renderTabNav(activeTab, authState, section = 'staff', pillar = null) {
  const tabsContainer = document.querySelector('.manage-tabs');
  if (!tabsContainer) return;

  // Show context switcher for users with any staff/admin permissions
  const switcher = document.getElementById('contextSwitcher');
  if (switcher) {
    const hasStaffPerms = authState.hasAnyPermission?.(...STAFF_PERMISSION_KEYS);
    const hasAdminPerms = authState.hasAnyPermission?.(...ADMIN_PERMISSION_KEYS);
    if (hasStaffPerms || hasAdminPerms) {
      switcher.classList.remove('hidden');
    }
  }

  // Filter tabs by section, permission, AND enabled features
  const enabledFeatures = await getEnabledFeatures();
  const permissionsLoaded = authState.permissions?.size > 0;
  const isAdminRole = ['admin', 'oracle'].includes(authState.appUser?.role);
  const tabs = ALL_ADMIN_TABS
    .filter(tab => tab.section === section)
    .filter(tab => !tab.feature || enabledFeatures[tab.feature])
    .filter(tab => {
      // Pillar filter (staff section only). Tabs without a `pillars` array are
      // pillar-agnostic — they only surface via direct URL, never in the tab bar.
      if (section === 'staff' && pillar) {
        if (!tab.pillars || !tab.pillars.includes(pillar)) return false;
      }
      // If permissions haven't loaded yet but user has admin role, show all tabs
      if (!permissionsLoaded && isAdminRole) return true;
      return authState.hasPermission?.(tab.permission);
    });

  // DevControl manages its own sub-tabs via renderDevControlTabs() — don't overwrite
  if (section !== 'devcontrol') {
    tabsContainer.innerHTML = tabs.map(tab => {
      const isActive = tab.id === activeTab;
      const icon = TAB_ICONS[tab.id] || '';
      // Preserve pillar context when navigating between staff tabs
      const href = (section === 'staff' && pillar) ? appendPillarParam(tab.href, pillar) : tab.href;
      return `<a href="${href}" class="manage-tab${isActive ? ' active' : ''}">${icon}${tab.label}</a>`;
    }).join('');
  }

  // ARIA + auto-scroll active tab into view on mobile
  initNavTabList(tabsContainer, '.manage-tab');
  if (switcher) initNavTabList(switcher, '.context-switcher-btn');
  scrollActiveIntoView(tabsContainer);
}

// =============================================
// USER INFO (HEADER AVATAR + NAME)
// =============================================

function renderUserInfo(el, appUser, profileHref) {
  if (!el) return;
  const name = appUser.display_name || appUser.email;
  const initials = getInitials(name);
  const avatarUrl = appUser.avatar_url;

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="" class="user-avatar">`
    : `<span class="user-avatar user-avatar--initials">${initials}</span>`;

  el.innerHTML = `
    <button class="user-menu-trigger" aria-haspopup="true" aria-expanded="false">
      ${avatarHtml}<span class="user-profile-name">${escapeHtml(name)}</span>
    </button>
    <div class="user-menu-dropdown hidden">
      <a href="${profileHref}" class="user-menu-item">Profile</a>
      <a href="/residents/lighting.html" class="user-menu-item">Intranet</a>
      <button class="user-menu-item user-menu-signout" id="headerSignOutBtn">Sign Out</button>
    </div>`;

  const trigger = el.querySelector('.user-menu-trigger');
  const dropdown = el.querySelector('.user-menu-dropdown');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', open);
    trigger.setAttribute('aria-expanded', !open);
  });
  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// =============================================
// CONTEXT SWITCHER (Devices / Resident / Associate / Staff / Admin)
// =============================================
async function renderContextSwitcher(userRole, activeSection = 'staff', activePillar = null) {
  const switcher = document.getElementById('contextSwitcher');
  if (!switcher) return;

  // Show context switcher if user has any staff or admin permissions
  const hasStaffPerms = hasAnyPermission(...STAFF_PERMISSION_KEYS);
  const hasAdminPerms = hasAnyPermission(...ADMIN_PERMISSION_KEYS);
  if (!hasStaffPerms && !hasAdminPerms) {
    switcher.classList.add('hidden');
    return;
  }

  // Feature filtering uses the cached result from getEnabledFeatures (already loaded by renderTabNav)
  const enabledFeatures = await getEnabledFeatures();

  // For each business pillar, find the first tab the user has access to.
  // The pillar button deep-links there (with ?pillar= so the page knows its context).
  function firstTabForPillar(pillar) {
    return ALL_ADMIN_TABS.find(t =>
      t.section === 'staff' &&
      t.pillars?.includes(pillar) &&
      (!t.feature || enabledFeatures[t.feature]) &&
      hasAnyPermission(t.permission)
    );
  }
  function buildPillarHref(tab, pillar) {
    if (!tab) return appendPillarParam('/awkn-ranch/spaces/admin/dashboard.html', pillar);
    const base = tab.href.startsWith('/') ? tab.href : `/awkn-ranch/spaces/admin/${tab.href}`;
    return appendPillarParam(base, pillar);
  }

  const tabs = [];
  if (hasStaffPerms) {
    for (const pillar of PILLAR_ORDER) {
      const firstTab = firstTabForPillar(pillar);
      if (!firstTab) continue;
      tabs.push({
        id: pillar,
        label: PILLAR_LABELS[pillar],
        href: buildPillarHref(firstTab, pillar),
        kind: 'pillar',
      });
    }
  }
  if (hasAdminPerms) {
    const firstAdminTab = ALL_ADMIN_TABS.find(t => t.section === 'admin' && (!t.feature || enabledFeatures[t.feature]) && hasAnyPermission(t.permission));
    const adminHref = firstAdminTab
      ? (firstAdminTab.href.startsWith('/') ? firstAdminTab.href : `/awkn-ranch/spaces/admin/${firstAdminTab.href}`)
      : '/awkn-ranch/spaces/admin/users.html';
    tabs.push({ id: 'admin', label: 'Admin', href: adminHref, kind: 'section' });
    // DevControl pillar removed per request — page retired (devcontrol.html
    // now redirects to dashboard). Permission key 'view_devcontrol' kept in
    // STAFF_PERMISSION_KEYS so existing user profiles still validate.
  }

  // Hide if only one tab (nothing to switch between)
  if (tabs.length <= 1) {
    switcher.classList.add('hidden');
    return;
  }

  // Resolve which button is active. Section-level (admin/devcontrol) wins;
  // otherwise highlight the active pillar inside the staff section.
  const activeId = activeSection === 'devcontrol' ? 'devcontrol'
                 : (activeSection === 'admin' && hasAdminPerms) ? 'admin'
                 : (activePillar || DEFAULT_PILLAR);

  switcher.innerHTML = tabs.map(tab => {
    const activeClass = tab.id === activeId ? ' active' : '';
    return `<a href="${tab.href}" class="context-switcher-btn${activeClass}" data-pillar="${tab.id}">${tab.label}</a>`;
  }).join('');
}

// =============================================
// SITE NAV INJECTION
// =============================================
let siteNavInitialized = false;

function injectSiteNav() {
  if (siteNavInitialized) return;
  const target = document.getElementById('siteHeader');
  if (!target) return;

  // Team-portal pages get the dedicated branded header: large AWKN logo
  // image, "Team Portal" subtag below. Public nav is hidden — admins use the
  // pillar tabs rendered separately by this shell.
  //
  // The team-portal layout is taller than the public site's 44px header. Set
  // a class on the html root so the CSS rule injected by renderHeader bumps
  // --aap-header-height, which #appContent uses for its padding-top — that's
  // what keeps the pillar nav and page content from sliding under the header.
  document.documentElement.classList.add('team-portal-active');
  target.innerHTML = renderHeader({
    transparent: false,
    light: false,
    version: '',
    showRoleBadge: true,
    logoHref: '/awkn-ranch/spaces/admin/dashboard.html',
    teamPortal: true,
  });

  initSiteComponents();
  setupVersionInfo();
  siteNavInitialized = true;
}

// =============================================
// AUTH & PAGE INITIALIZATION
// =============================================

// =============================================
// ACCESS DENIED OVERLAY
// =============================================

function renderAccessDenied(state, activeTab) {
  const overlay = document.getElementById('unauthorizedOverlay');
  if (!overlay) return;

  const displayName = state.appUser?.display_name || state.appUser?.email || state.user?.email || 'Unknown';
  const role = state.appUser?.role || 'none';
  const email = state.appUser?.email || state.user?.email || '';
  const pageName = document.title?.split(' - ')[0] || activeTab || window.location.pathname.split('/').pop()?.replace('.html', '') || 'this page';

  overlay.innerHTML = `
    <div class="unauthorized-card">
      <h2>Access Denied</h2>
      <p style="font-size:1.05em;color:var(--text);margin-bottom:0.25rem"><strong>${escapeHtml(displayName)}</strong></p>
      <p style="opacity:0.6;font-size:0.85em;margin-bottom:1rem">${escapeHtml(role)}</p>
      <p style="color:var(--text-muted)">You are trying to access <strong>${escapeHtml(pageName)}</strong>, for which you don't have permission.</p>
      <p style="color:var(--text-muted);font-size:0.85em;margin-top:0.75rem">You may request access below.</p>
      <div style="margin-top:1rem">
        <textarea id="accessRequestMsg" rows="2" placeholder="Reason for access (optional)" style="width:100%;padding:0.5rem 0.75rem;border:1px solid var(--border,#ddd);border-radius:8px;font-family:inherit;font-size:0.85rem;resize:vertical;background:var(--bg,#fff);color:var(--text,#333)"></textarea>
      </div>
      <div class="unauthorized-actions" style="flex-direction:column;align-items:stretch">
        <button id="requestAccessBtn" class="btn-secondary" style="background:var(--accent,#d4883a);color:#fff;border:none;padding:0.6rem 1rem;border-radius:8px;cursor:pointer;font-weight:600">Request Access</button>
        <div style="display:flex;gap:0.75rem;justify-content:center">
          <a href="/spaces/" class="btn-secondary">View Public Spaces</a>
          <button id="signOutBtn" class="btn-secondary">Sign Out</button>
        </div>
      </div>
    </div>
  `;

  // Wire up Sign Out
  const signOutBtn = overlay.querySelector('#signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOut();
      window.location.href = '/awkn-ranch/login/';
    });
  }

  // Wire up Request Access
  const requestBtn = overlay.querySelector('#requestAccessBtn');
  if (requestBtn) {
    requestBtn.addEventListener('click', async () => {
      requestBtn.disabled = true;
      requestBtn.textContent = 'Sending...';
      try {
        const msg = overlay.querySelector('#accessRequestMsg')?.value?.trim() || '';
        await supabase.functions.invoke('send-email', {
          body: {
            template: 'access_request',
            to: 'team@awknranch.com',
            data: {
              user_name: displayName,
              user_email: email,
              user_role: role,
              page_name: pageName,
              page_url: window.location.href,
              message: msg
            }
          }
        });
        requestBtn.textContent = 'Request Sent';
        requestBtn.style.opacity = '0.6';
      } catch (e) {
        console.error('Failed to send access request:', e);
        requestBtn.textContent = 'Failed — try again';
        requestBtn.disabled = false;
      }
    });
  }
}

/**
 * Initialize an admin page with auth flow.
 * @param {Object} options
 * @param {string} options.activeTab - Which tab to highlight in nav
 * @param {string} options.requiredRole - Minimum role required ('staff' or 'admin'). Default: 'staff'
 * @param {Function} options.onReady - Called with authState when authorized
 * @returns {Promise<Object>} authState
 */
export async function initAdminPage({ activeTab, requiredRole = 'staff', requiredPermission, section = 'staff', onReady }) {
  // Set up global error handlers + health banner
  errorLogger.setupGlobalHandlers();
  supabaseHealth.injectBanner();

  function removeStrayBootLogos() {
    const topLevelLogoSelectors = [
      '#loadingOverlay .loading-overlay__logo',
      '#appContent > .loading-overlay__logo',
      '#appContent > img[src*="/housephotos/logos/logo-black-transparent.png"]',
    ];
    document.querySelectorAll(topLevelLogoSelectors.join(',')).forEach((el) => el.remove());
  }

  removeStrayBootLogos();
  const rootEl = document.documentElement;
  const loadingOverlayEl = document.getElementById('loadingOverlay');
  loadingOverlayEl?.querySelector('.loading-overlay__logo')?.classList.add('hidden');
  const unauthorizedOverlayEl = document.getElementById('unauthorizedOverlay');
  const appContentEl = document.getElementById('appContent');
  let hasCachedAuthHint = rootEl.hasAttribute('data-cached-auth');
  if (!hasCachedAuthHint) {
    try {
      const raw = localStorage.getItem('awkn-ranch-cached-auth');
      if (raw) {
        const cached = JSON.parse(raw);
        const ageMs = Date.now() - (cached?.timestamp || 0);
        const likelyValid = ageMs >= 0 && ageMs <= 90 * 24 * 60 * 60 * 1000;
        const hasIdentity = !!(cached?.appUser || cached?.userId || cached?.email);
        if (likelyValid && hasIdentity) {
          hasCachedAuthHint = true;
          rootEl.setAttribute('data-cached-auth', '1');
        }
      }
    } catch (e) {
      // Ignore parse/storage errors and continue normal boot.
    }
  }
  let authState = getAuthState();
  let pageContentShown = false;
  let onReadyCalled = false;
  let bootState = 'init';

  function transitionBootState(nextState) {
    if (bootState === nextState) return;
    bootState = nextState;

    if (nextState !== 'booting') rootEl.removeAttribute('data-cached-auth');

    if (nextState === 'booting') {
      unauthorizedOverlayEl?.classList.add('hidden');
      if (hasCachedAuthHint) {
        // Keep cached sessions loaderless to avoid white flash.
        loadingOverlayEl?.classList.add('hidden');
      } else {
        loadingOverlayEl?.classList.remove('hidden');
      }
      return;
    }

    if (nextState === 'authorized') {
      loadingOverlayEl?.classList.add('hidden');
      unauthorizedOverlayEl?.classList.add('hidden');
      appContentEl?.classList.remove('hidden');
      return;
    }

    if (nextState === 'unauthorized') {
      loadingOverlayEl?.classList.add('hidden');
      appContentEl?.classList.add('hidden');
      unauthorizedOverlayEl?.classList.remove('hidden');
      return;
    }

    if (nextState === 'redirecting') {
      loadingOverlayEl?.classList.add('hidden');
    }
  }

  transitionBootState('booting');
  removeStrayBootLogos();
  await initAuth();
  authState = getAuthState();

  async function handleAuthState(state) {
    authState = state;

    // Set user context for error logging
    if (state.appUser) {
      errorLogger.setUserContext({
        userId: state.appUser.id,
        role: state.appUser.role,
        email: state.appUser.email,
      });
    }

    // Check if user meets the required permission or role
    const userRole = state.appUser?.role;
    let meetsRequirement;
    if (requiredPermission) {
      meetsRequirement = state.hasPermission?.(requiredPermission);
      // If permissions haven't loaded yet (empty set from cache/timeout) but the user's
      // role would normally grant access, don't deny — keep loading and wait for fresh perms.
      if (!meetsRequirement && state.permissions?.size === 0) {
        const ROLE_LEVEL = { oracle: 4, admin: 3, staff: 2, demo: 2, resident: 1, associate: 1 };
        const userLevel = ROLE_LEVEL[userRole] || 0;
        const requiredLevel = ROLE_LEVEL[requiredRole] || 0;
        if (userLevel >= requiredLevel) {
          // Permissions not loaded yet — stay on loading screen, don't show denied
          return;
        }
      }
    } else if (userRole === 'demo') {
      const tabDef = ALL_ADMIN_TABS.find(t => t.id === activeTab);
      const tabPermission = tabDef?.permission;
      meetsRequirement = !!(tabPermission && state.hasPermission?.(tabPermission));
    } else {
      const ROLE_LEVEL = { oracle: 4, admin: 3, staff: 2, demo: 2, resident: 1, associate: 1 };
      const userLevel = ROLE_LEVEL[userRole] || 0;
      const requiredLevel = ROLE_LEVEL[requiredRole] || 0;
      meetsRequirement = userLevel >= requiredLevel;
      // Also allow access if the user has the specific tab permission (e.g. resident with view_appdev)
      if (!meetsRequirement) {
        const tabDef = ALL_ADMIN_TABS.find(t => t.id === activeTab);
        if (tabDef?.permission && state.hasPermission?.(tabDef.permission)) {
          meetsRequirement = true;
        }
      }
    }

    if (state.appUser && meetsRequirement) {
      transitionBootState('authorized');
      injectSiteNav();

      // Render user info into site nav auth container (replaces Sign In link)
      const siteAuthEl = document.getElementById('aapHeaderAuth');
      const legacyUserInfo = document.getElementById('userInfo');
      if (siteAuthEl) {
        renderUserInfo(siteAuthEl, state.appUser, '/residents/profile.html');
        siteAuthEl.classList.add('user-info');
        const signInLink = document.getElementById('aapSignInLink');
        if (signInLink) signInLink.style.display = 'none';
        const mobileSignInLink = document.getElementById('aapMobileSignInLink');
        if (mobileSignInLink) mobileSignInLink.closest('li')?.remove();
        if (legacyUserInfo) legacyUserInfo.style.display = 'none';
      } else if (legacyUserInfo) {
        renderUserInfo(legacyUserInfo, state.appUser, '/residents/profile.html');
      }

      // Update role badge and admin-only visibility
      const roleBadge = document.getElementById('roleBadge');
      if (roleBadge) {
        const role = state.appUser.role || 'staff';
        roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        roleBadge.className = 'role-badge ' + role;
      }
      if (['admin', 'oracle'].includes(state.appUser.role)) {
        document.body.classList.add('is-admin');
      } else {
        document.body.classList.remove('is-admin');
      }
      if (state.appUser.role === 'demo') {
        document.body.classList.add('is-demo-mode');
      } else {
        document.body.classList.remove('is-demo-mode');
      }

      const userIsAdmin = ['admin', 'oracle'].includes(state.appUser.role);
      const isDemo = state.appUser.role === 'demo';
      const resolvedSection = section === 'devcontrol' && userIsAdmin ? 'devcontrol' : (section === 'admin' && userIsAdmin ? 'admin' : 'staff');
      // For staff section: resolve active pillar from URL/localStorage. Admin/DevControl
      // sections aren't pillar-scoped (they show the full admin tab list).
      const resolvedPillar = resolvedSection === 'staff' ? getActivePillar() : null;

      // Sync tab permissions to DB — if new perms were created, refresh user's permission set
      const synced = await syncTabPermissions();
      if (synced && state.appUser?.id) {
        const { data: permData } = await supabase.rpc('get_effective_permissions', { p_app_user_id: state.appUser.id });
        if (permData) {
          state.permissions = new Set(permData);
          state.hasPermission = (key) => state.permissions.has(key);
          state.hasAnyPermission = (...keys) => keys.some(k => state.permissions.has(k));
        }
      }

      await renderTabNav(activeTab, state, resolvedSection, resolvedPillar);
      await renderContextSwitcher(state.appUser?.role, resolvedSection, resolvedPillar);

      let demoBanner = document.getElementById('demoModeBanner');
      if (isDemo && document.getElementById('appContent')) {
        const appContent = document.getElementById('appContent');
        if (!demoBanner) {
          demoBanner = document.createElement('div');
          demoBanner.id = 'demoModeBanner';
          demoBanner.className = 'demo-mode-banner';
          demoBanner.setAttribute('role', 'status');
          demoBanner.textContent = "You're viewing the app in demo mode. Names and dollar amounts are sample data only.";
          appContent.insertBefore(demoBanner, appContent.firstChild);
        }
        demoBanner.classList.remove('hidden');
      } else if (demoBanner) {
        demoBanner.classList.add('hidden');
      }

      if (!pageContentShown) {
        const handleSignOut = async () => {
          await signOut();
          window.location.href = '/awkn-ranch/login/';
        };
        document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
        const userInfoEl = document.getElementById('userInfo') || document.getElementById('aapHeaderAuth');
        userInfoEl?.addEventListener('click', (e) => {
          if (e.target.closest('#headerSignOutBtn') || e.target.closest('.user-menu-signout')) {
            e.preventDefault();
            e.stopPropagation();
            handleSignOut();
          }
        });
        setupVersionInfo();
      }

      pageContentShown = true;
      if (onReady && !onReadyCalled) {
        onReadyCalled = true;
        // Ensure Supabase has a real session before onReady queries RLS-protected tables.
        // Cached auth resolves initAuth() before the JWT is ready, so getSession() forces
        // the client to establish the actual session first.
        let { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          // JWT expired (common on mobile after backgrounding) — try refreshing
          console.warn('[admin-shell] No active session — attempting token refresh');
          const { data: refreshData } = await supabase.auth.refreshSession();
          sessionData = refreshData;
        }
        if (!sessionData?.session) {
          // Refresh also failed — force re-login
          console.warn('[admin-shell] Token refresh failed — redirecting to login');
          try { localStorage.removeItem('awkn-ranch-cached-auth'); } catch (e) { /* ignore */ }
          transitionBootState('redirecting');
          window.location.href = '/awkn-ranch/login/?redirect=' + encodeURIComponent(window.location.pathname);
          return;
        }
        onReady(state);
      }
    } else if (state.appUser || (state.isAuthenticated && state.isUnauthorized)) {
      // If the page was already authorized and working, don't disrupt it with a
      // transient auth failure (e.g. app_users query timeout during token refresh).
      if (onReadyCalled) {
        console.warn('[admin-shell] Transient auth state change after page authorized — keeping current state');
        return;
      }
      transitionBootState('unauthorized');
      renderAccessDenied(state, activeTab);
    } else if (!state.isAuthenticated && !pageContentShown) {
      // Only redirect to login if we haven't already shown page content.
      // Prevents disruptive redirects when Supabase session expires while
      // cached auth was keeping the page functional.
      transitionBootState('redirecting');
      window.location.href = '/awkn-ranch/login/?redirect=' + encodeURIComponent(window.location.pathname);
    }
  }

  onAuthStateChange(handleAuthState);
  handleAuthState(authState);

  return authState;
}

// =============================================
// LIGHTBOX
// =============================================
let lightboxGallery = [];
let lightboxIndex = 0;
let currentGalleryUrls = [];

export function setCurrentGallery(photos) {
  currentGalleryUrls = photos.map(p => p.url);
}

export function openLightbox(imageUrl, galleryUrls = null) {
  const lightbox = document.getElementById('imageLightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  if (lightbox && lightboxImage) {
    if (galleryUrls && galleryUrls.length > 0) {
      lightboxGallery = [...galleryUrls];
      lightboxIndex = lightboxGallery.indexOf(imageUrl);
      if (lightboxIndex === -1) lightboxIndex = 0;
    } else if (currentGalleryUrls.length > 0 && currentGalleryUrls.includes(imageUrl)) {
      lightboxGallery = [...currentGalleryUrls];
      lightboxIndex = lightboxGallery.indexOf(imageUrl);
    } else {
      lightboxGallery = [imageUrl];
      lightboxIndex = 0;
    }
    lightboxImage.src = imageUrl;
    lightbox.classList.remove('hidden');
    updateLightboxNav();
  }
}

function updateLightboxNav() {
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');
  if (prevBtn && nextBtn) {
    const showNav = lightboxGallery.length > 1;
    prevBtn.style.display = showNav ? 'flex' : 'none';
    nextBtn.style.display = showNav ? 'flex' : 'none';
  }
}

export function lightboxPrev() {
  if (lightboxIndex > 0) {
    lightboxIndex--;
    document.getElementById('lightboxImage').src = lightboxGallery[lightboxIndex];
    updateLightboxNav();
  }
}

export function lightboxNext() {
  if (lightboxIndex < lightboxGallery.length - 1) {
    lightboxIndex++;
    document.getElementById('lightboxImage').src = lightboxGallery[lightboxIndex];
    updateLightboxNav();
  }
}

export function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    lightbox.classList.add('hidden');
    document.getElementById('lightboxImage').src = '';
    lightboxGallery = [];
    lightboxIndex = 0;
  }
}

/**
 * Set up lightbox event listeners. Call once on page init.
 */
export function setupLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (!lightbox) return;

  lightbox.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.getElementById('lightboxPrev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    lightboxPrev();
  });
  document.getElementById('lightboxNext')?.addEventListener('click', (e) => {
    e.stopPropagation();
    lightboxNext();
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
    }
  });
}
