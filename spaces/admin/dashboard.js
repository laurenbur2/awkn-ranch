// Staff portal dashboard — permission-aware landing page.
// Widgets: Quick Actions (always), Today's Schedule (view_rentals), Staff on Shift (view_staff_directory).

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';
import { formatDateAustin, getAustinToday } from '../../shared/timezone.js';

let authState = null;

document.addEventListener('DOMContentLoaded', async () => {
  authState = await initAdminPage({
    activeTab: 'dashboard',
    requiredPermission: 'view_dashboard',
    section: 'staff',
    onReady: async (state) => {
      authState = state;
      renderHello(state);
      renderQuickActions(state);
      await Promise.all([
        state.hasPermission?.('view_rentals') ? renderSchedule(state) : Promise.resolve(),
        state.hasPermission?.('view_staff_directory') ? renderOnShift(state) : Promise.resolve(),
      ]);
    },
  });
});

// =============================================
// Hello
// =============================================
function renderHello(state) {
  const first = state.appUser?.first_name || (state.appUser?.display_name || '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashHello').textContent = `${greeting}, ${first}.`;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  });
  const roleLabel = state.appUser?.role ? state.appUser.role.charAt(0).toUpperCase() + state.appUser.role.slice(1) : '';
  document.getElementById('dashSubhead').textContent = `${today}${roleLabel ? ' — ' + roleLabel : ''}`;
}

// =============================================
// Quick Actions — tiles light up based on permissions
// =============================================
const QUICK_ACTIONS = [
  { perm: 'view_rentals',         label: 'New Booking',   sub: 'Schedule',     href: 'reservations.html',      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { perm: 'view_crm',             label: 'New Lead',      sub: 'CRM',          href: 'crm.html',               icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { perm: 'view_memberships',     label: 'Memberships',   sub: 'Members',      href: 'memberships.html',       icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
  { perm: 'view_calendar',        label: 'Calendar',      sub: 'Day view',     href: 'reservations.html',      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { perm: 'view_scheduler',       label: 'Scheduler',     sub: 'Staff shifts', href: 'scheduling.html',        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { perm: 'view_purchases',       label: 'New Sale',      sub: 'Sales',        href: 'purchases.html',         icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>' },
  { perm: 'view_inventory',       label: 'Inventory',     sub: 'Stock',        href: 'inventory.html',         icon: '<path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>' },
  { perm: 'view_events',          label: 'Events',        sub: 'Upcoming',     href: 'events.html',            icon: '<rect x="3" y="4" width="18" height="18" rx="2"/>' },
  { perm: 'view_staff_directory', label: 'Staff',         sub: 'Directory',    href: 'staff.html',             icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
  { perm: 'manage_users',         label: 'Invite User',   sub: 'Admin',        href: 'users.html',             icon: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>' },
  { perm: 'manage_job_titles',    label: 'Job Titles',    sub: 'Admin',        href: 'job-titles.html',        icon: '<path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v12a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/>' },
];

function renderQuickActions(state) {
  const target = document.getElementById('dashQuickActions');
  if (!target) return;
  const tiles = QUICK_ACTIONS.filter(a => !a.perm || state.hasPermission?.(a.perm));
  if (tiles.length === 0) {
    target.innerHTML = '<div class="dash-empty">No quick actions available.</div>';
    return;
  }
  target.innerHTML = tiles.map(a => `
    <a class="dash-qa" href="${a.href}">
      <div class="dash-qa-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg>
      </div>
      <div class="dash-qa-label">${a.label}</div>
      <div class="dash-qa-sub">${a.sub}</div>
    </a>
  `).join('');
}

// =============================================
// Today's Schedule
// =============================================
async function renderSchedule(state) {
  const card = document.getElementById('dashScheduleCard');
  const list = document.getElementById('dashSchedule');
  const countEl = document.getElementById('dashScheduleCount');
  if (!card || !list) return;
  card.classList.remove('hidden');
  list.innerHTML = '<div class="dash-empty">Loading…</div>';

  const today = getAustinToday();
  const start = today + 'T00:00:00';
  const end = today + 'T23:59:59';

  let items = [];
  try {
    // Try bookings table first (most common reservation source)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, guest_name, space_id, start_time, end_time, status')
      .gte('start_time', start).lte('start_time', end)
      .neq('status', 'cancelled')
      .order('start_time')
      .limit(25);
    if (Array.isArray(bookings)) {
      items = bookings.map(b => ({
        time: b.start_time,
        title: b.guest_name || 'Booking',
        sub: 'House stay',
        pill: b.status || '',
      }));
    }
  } catch (e) { /* table may not exist — silent fallback */ }

  try {
    const { data: rentals } = await supabase
      .from('rental_bookings')
      .select('id, renter_name, space_id, start_time, end_time, status')
      .gte('start_time', start).lte('start_time', end)
      .neq('status', 'cancelled')
      .order('start_time')
      .limit(25);
    if (Array.isArray(rentals)) {
      items = items.concat(rentals.map(r => ({
        time: r.start_time,
        title: r.renter_name || 'Rental',
        sub: 'Rental',
        pill: r.status || '',
      })));
    }
  } catch (e) { /* silent fallback */ }

  items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  countEl.textContent = items.length;
  if (items.length === 0) {
    list.innerHTML = '<div class="dash-empty">Nothing booked for today.</div>';
    return;
  }
  list.innerHTML = items.map(i => {
    const timeLabel = i.time ? formatDateAustin(i.time, { hour: 'numeric', minute: '2-digit' }) : '';
    return `
      <div class="dash-item">
        <div class="dash-item-time">${timeLabel}</div>
        <div class="dash-item-body">
          <div class="dash-item-title">${escapeHtml(i.title)}</div>
          <div class="dash-item-sub">${escapeHtml(i.sub || '')}</div>
        </div>
        ${i.pill ? `<span class="dash-item-pill">${escapeHtml(i.pill)}</span>` : ''}
      </div>
    `;
  }).join('');
}

// =============================================
// Staff on Shift (v1: active non-archived staff + is_current_resident = present)
// =============================================
async function renderOnShift() {
  const card = document.getElementById('dashShiftCard');
  const list = document.getElementById('dashShift');
  const countEl = document.getElementById('dashShiftCount');
  if (!card || !list) return;
  list.innerHTML = '<div class="dash-empty">Loading…</div>';

  const { data: staff, error } = await supabase
    .from('app_users')
    .select('id, display_name, first_name, last_name, avatar_url, is_current_resident, job_title_id')
    .in('role', ['staff','admin','oracle'])
    .eq('is_archived', false)
    .order('display_name');

  if (error) {
    list.innerHTML = `<div class="dash-empty">Couldn't load staff.</div>`;
    return;
  }

  let titles = [];
  try {
    const { data: tdata } = await supabase.from('job_titles').select('id, name, color');
    titles = tdata || [];
  } catch (e) { /* ok */ }
  const titleById = new Map(titles.map(t => [t.id, t]));

  const rows = (staff || []).map(s => {
    const name = s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || '—';
    const initials = getInitials(name);
    const title = s.job_title_id ? (titleById.get(s.job_title_id)?.name || '') : '';
    const here = s.is_current_resident;
    return `
      <div class="dash-shift-row">
        <div class="dash-shift-av">${s.avatar_url ? `<img src="${escapeHtml(s.avatar_url)}" alt="">` : escapeHtml(initials)}</div>
        <div>
          <div class="dash-shift-name">${escapeHtml(name)}</div>
          <div class="dash-shift-title">${escapeHtml(title || 'Staff')}</div>
        </div>
        ${here ? '<span class="dash-shift-present">On site</span>' : ''}
      </div>
    `;
  });

  countEl.textContent = rows.length;
  list.innerHTML = rows.length ? rows.join('') : '<div class="dash-empty">No staff configured.</div>';
}

// =============================================
// Helpers
// =============================================
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
