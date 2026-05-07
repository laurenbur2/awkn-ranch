// Venue Spaces — resource calendar showing each rentable space across a
// rolling 14-day window. Pulls bookings from `crm_leads` (the same source
// the Events list/calendar uses) plus rate/capacity from `spaces` and
// `crm_venue_catalog`. Click a booking → details modal. Click an empty
// cell → jump to the Events page with that space + date pre-filled in
// the new-event form.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

// ============================================================================
// State
// ============================================================================
// View mode: 'week' (7 days, Sun → Sat) or 'month' (the full calendar month).
// Persisted to localStorage so the user's last preference sticks.
let viewMode = (() => {
  try { return localStorage.getItem('awkn.venueSpaces.viewMode') === 'month' ? 'month' : 'week'; }
  catch (e) { return 'week'; }
})();
let viewStart = viewMode === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date());

// Number of days currently visible in the resource calendar.
function daysVisible() {
  if (viewMode === 'month') return daysInMonth(viewStart);
  return 7;
}
let allSpaces = [];        // rentable spaces + their derived rate info
let allBookings = [];      // crm_leads bookings overlapping the window
let allStages = [];        // pipeline stages (for status pill class)

// ============================================================================
// Boot
// ============================================================================
(async function () {
  await initAdminPage({
    activeTab: 'venue-spaces',
    section: 'staff',
    requiredPermission: 'view_crm',
    onReady: async () => {
      bindToolbar();
      bindModal();
      await loadAll();
      render();
    },
  });
})();

// ============================================================================
// Data
// ============================================================================
async function loadAll() {
  const winStart = new Date(viewStart);
  const winEnd = addDays(viewStart, daysVisible());

  const [spacesRes, leadsRes, stagesRes] = await Promise.all([
    supabase
      .from('spaces')
      .select('id, name, slug, hourly_rate, full_day_rate, overnight_rate, max_residents, beds_king, beds_queen, beds_double, beds_twin')
      .eq('booking_category', 'rental_space')
      .eq('is_archived', false)
      .order('booking_display_order', { nullsLast: true })
      .order('name'),
    supabase
      .from('crm_leads')
      .select(`
        id, first_name, last_name, email, phone,
        event_date, event_start_time, event_end_time, event_type, guest_count,
        space_id, stage_id, estimated_value, actual_revenue, notes, internal_staff_notes,
        space:spaces(id, name),
        stage:crm_pipeline_stages(id, slug, name)
      `)
      .eq('business_line', 'awkn_ranch')
      .not('event_date', 'is', null)
      .not('space_id', 'is', null)
      .gte('event_date', toIsoDate(winStart))
      .lt('event_date',  toIsoDate(winEnd))
      .order('event_date'),
    supabase
      .from('crm_pipeline_stages')
      .select('id, slug, name')
      .eq('business_line', 'awkn_ranch'),
  ]);

  if (spacesRes.error) console.warn('spaces load error:', spacesRes.error);
  if (leadsRes.error)  console.warn('leads load error:',  leadsRes.error);
  if (stagesRes.error) console.warn('stages load error:', stagesRes.error);

  allSpaces   = spacesRes.data || [];
  // Spaces calendar only shows CONFIRMED bookings — stages from invoice_paid
  // forward (invoice_paid / event_scheduled / event_complete /
  // feedback_form_sent). Earlier-stage leads stay in the CRM pipeline but
  // don't clutter the resource calendar with maybes.
  allBookings = (leadsRes.data || []).filter(isConfirmedBooking);
  allStages   = stagesRes.data || [];
}

const CONFIRMED_STAGE_SLUGS = new Set([
  'invoice_paid',
  'event_scheduled',
  'event_complete',
  'feedback_form_sent',
]);
function isConfirmedBooking(lead) {
  return CONFIRMED_STAGE_SLUGS.has((lead?.stage?.slug || '').toLowerCase());
}

// ============================================================================
// Render
// ============================================================================
function render() {
  // Sync DOM-level state (CSS class + custom property) so the gridlines and
  // min-width math respect the current mode.
  document.body.classList.toggle('vs-mode-month', viewMode === 'month');
  document.querySelector('.vs-grid')?.style?.setProperty('--vs-day-count', String(daysVisible()));
  document.querySelectorAll('.vs-view-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === viewMode));
  renderRange();
  renderStats();
  renderGrid();
  // After the grid is in the DOM, set the custom property on it directly
  // (the renderGrid call replaces the .vs-grid contents).
  document.querySelector('.vs-grid')?.style?.setProperty('--vs-day-count', String(daysVisible()));
}

function renderRange() {
  const end = addDays(viewStart, daysVisible() - 1);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (viewMode === 'month') {
    const monthLabel = viewStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const today = new Date();
    let prefix = '';
    if (isSameMonth(viewStart, today)) prefix = 'This month · ';
    else if (isSameMonth(viewStart, new Date(today.getFullYear(), today.getMonth() + 1, 1))) prefix = 'Next month · ';
    else if (isSameMonth(viewStart, new Date(today.getFullYear(), today.getMonth() - 1, 1))) prefix = 'Last month · ';
    setText('vsRange', `${prefix}${monthLabel}`);
    return;
  }

  // Week mode
  const thisWeekStart = startOfWeek(new Date());
  const weekDelta = Math.round((viewStart - thisWeekStart) / (7 * 86400000));
  let prefix = '';
  if (weekDelta === 0) prefix = 'This week · ';
  else if (weekDelta === 1) prefix = 'Next week · ';
  else if (weekDelta === -1) prefix = 'Last week · ';
  const label = `${prefix}${fmt(viewStart)} – ${fmt(end)}, ${end.getFullYear()}`;
  setText('vsRange', label);
}

function renderStats() {
  setText('vsStatSpaces', String(allSpaces.length));
  setText('vsStatBookings', String(allBookings.length));

  // Days booked = (# bookings) since each booking is single-day in the
  // current data model. Days available = spaces × daysVisible().
  const daysBooked = allBookings.length;
  const totalDays  = allSpaces.length * daysVisible();
  setText('vsStatOccupancy', totalDays > 0 ? `${daysBooked} / ${totalDays}` : '—');

  const revenue = allBookings.reduce((sum, b) => sum + Number(b.actual_revenue || b.estimated_value || 0), 0);
  setText('vsStatRevenue', revenue > 0 ? formatMoney(revenue) : '—');
}

function renderGrid() {
  const grid = document.getElementById('vsGrid');
  if (!grid) return;

  if (allSpaces.length === 0) {
    grid.innerHTML = '<div class="vs-empty-state">No rentable spaces configured.</div>';
    return;
  }

  // Build day list for header
  const days = [];
  for (let i = 0; i < daysVisible(); i++) days.push(addDays(viewStart, i));
  const todayKey = ymd(new Date());

  // Header
  const headerHtml = [
    '<div class="vs-header-row">',
    '  <div class="vs-corner">Space</div>',
    '  <div class="vs-day-headers">',
    days.map(d => {
      const isToday = ymd(d) === todayKey;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const dow = d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
      const dn  = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
      return `<div class="vs-day-head ${isToday ? 'is-today' : ''} ${isWeekend ? 'weekend' : ''}">
        <div class="vs-day-dow">${dow}</div>
        <div class="vs-day-date">${dn}</div>
      </div>`;
    }).join(''),
    '  </div>',
    '</div>',
  ];

  // Bookings keyed by space_id
  const bookingsBySpace = new Map();
  for (const b of allBookings) {
    if (!bookingsBySpace.has(b.space_id)) bookingsBySpace.set(b.space_id, []);
    bookingsBySpace.get(b.space_id).push(b);
  }

  // Space rows
  const rowsHtml = allSpaces.map(space => {
    const bookings = bookingsBySpace.get(space.id) || [];
    const beds = formatBedSummary(space);
    const cap = space.max_residents
      ? `Capacity: ${space.max_residents}${beds ? ` · ${beds}` : ''}`
      : (beds || '');
    const ratesHtml = formatRatesHtml(space);

    // Per-day empty cells (clickable for new event)
    const emptyCells = days.map((d, idx) => {
      const dateKey = ymd(d);
      const left = (idx / daysVisible()) * 100;
      const width = (1 / daysVisible()) * 100;
      return `<div class="vs-empty-cell" data-space-id="${esc(space.id)}" data-date="${dateKey}" style="left:${left}%; width:${width}%;"></div>`;
    }).join('');

    // Today's column tint inside this row
    const todayIdx = days.findIndex(d => ymd(d) === todayKey);
    const todayOverlay = todayIdx >= 0
      ? `<div class="vs-today-overlay" style="left:${(todayIdx / daysVisible()) * 100}%; width:${(1 / daysVisible()) * 100}%;"></div>`
      : '';

    // Booking blocks
    const blocksHtml = bookings.map(b => renderBookingBlock(b, days)).filter(Boolean).join('');

    return `
      <div class="vs-space-row">
        <div class="vs-space-info">
          <span class="vs-space-name">${esc(space.name)}</span>
          ${cap ? `<span class="vs-space-cap">${esc(cap)}</span>` : ''}
          ${ratesHtml}
        </div>
        <div class="vs-timeline">
          ${todayOverlay}
          ${emptyCells}
          ${blocksHtml}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = headerHtml.join('') + rowsHtml;

  // Wire up clicks
  grid.querySelectorAll('.vs-booking').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.bookingId;
      if (id) openBookingModal(id);
    });
  });
  grid.querySelectorAll('.vs-empty-cell').forEach(el => {
    el.addEventListener('click', () => {
      const date = el.dataset.date;
      const spaceId = el.dataset.spaceId;
      // Land in the Events page; the user can confirm there or jump back.
      // Pre-fill via query params the events page can pick up later.
      window.location.href = `venue-events.html?pillar=ranch&new=1&date=${encodeURIComponent(date)}&space=${encodeURIComponent(spaceId)}`;
    });
  });
}

function renderBookingBlock(b, days) {
  if (!b.event_date) return '';
  const idx = days.findIndex(d => ymd(d) === b.event_date);
  if (idx < 0) return '';
  // Single-day blocks for now (the schema treats event_date as a single day).
  const left  = (idx / daysVisible()) * 100;
  const width = (1 / daysVisible()) * 100;
  const guest = ((b.first_name || '') + ' ' + (b.last_name || '')).trim() || '(unnamed)';
  const slug  = (b.stage?.slug || '').toLowerCase();
  let cls = '';
  if (/lost/.test(slug)) cls = 'stage-lost';
  else if (/signed/.test(slug)) cls = 'stage-signed';
  else if (/deposit/.test(slug)) cls = 'stage-deposit';
  else if (/book|confirmed|scheduled/.test(slug)) cls = 'stage-confirmed';
  const sub = [b.event_type, formatTimeShort(b.event_start_time, b.event_end_time)].filter(Boolean).join(' · ');
  return `
    <div class="vs-booking ${cls}" data-booking-id="${esc(b.id)}" style="left:calc(${left}% + 3px); width:calc(${width}% - 6px);">
      <div class="vs-booking-name">${esc(guest)}</div>
      ${sub ? `<div class="vs-booking-sub">${esc(sub)}</div>` : ''}
    </div>
  `;
}

// ============================================================================
// Booking details modal
// ============================================================================
function bindModal() {
  document.getElementById('vsModalClose')?.addEventListener('click', closeBookingModal);
  document.getElementById('vsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'vsModal') closeBookingModal();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('vsModal').classList.contains('hidden') && e.key === 'Escape') closeBookingModal();
  });
}

function openBookingModal(id) {
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  const guest = ((b.first_name || '') + ' ' + (b.last_name || '')).trim() || '(unnamed)';
  const dateStr = formatEventDate(b.event_date);
  const timeStr = formatTimeRange(b.event_start_time, b.event_end_time);
  const space = b.space?.name || '—';
  const stage = b.stage?.name || '—';
  const eventType = b.event_type || '—';
  const guestCount = b.guest_count != null ? String(b.guest_count) : '—';
  const amount = b.actual_revenue || b.estimated_value
    ? formatMoney(Number(b.actual_revenue || b.estimated_value))
    : '—';

  setText('vsModalTitle', guest);
  const body = document.getElementById('vsModalBody');
  const row = (label, value) => `<div class="vs-modal-row"><span class="vs-modal-label">${esc(label)}</span><span class="vs-modal-value">${value}</span></div>`;
  body.innerHTML = [
    row('When', `${esc(dateStr)} · ${esc(timeStr)}`),
    row('Space', esc(space)),
    row('Event type', esc(eventType)),
    row('Guest count', esc(guestCount)),
    row('Stage', esc(stage)),
    row('Estimated value', esc(amount)),
    b.email ? row('Email', esc(b.email)) : '',
    b.phone ? row('Phone', esc(b.phone)) : '',
    b.notes ? row('Notes', `<span style="white-space:pre-wrap;">${esc(b.notes)}</span>`) : '',
    b.internal_staff_notes ? row('Internal notes', `<span style="white-space:pre-wrap;color:#92400e;">${esc(b.internal_staff_notes)}</span>`) : '',
  ].filter(Boolean).join('');

  document.getElementById('vsModalFoot').innerHTML = `
    <button class="vs-btn" id="vsModalCloseBtn">Close</button>
    <a class="vs-btn vs-btn-primary" href="crm.html?pillar=ranch&lead=${encodeURIComponent(b.id)}">Open in CRM</a>
  `;
  document.getElementById('vsModalCloseBtn').addEventListener('click', closeBookingModal);

  document.getElementById('vsModal').classList.remove('hidden');
}

function closeBookingModal() {
  document.getElementById('vsModal').classList.add('hidden');
}

// ============================================================================
// Toolbar
// ============================================================================
function bindToolbar() {
  const goPrev = async () => {
    if (viewMode === 'month') {
      viewStart = new Date(viewStart.getFullYear(), viewStart.getMonth() - 1, 1);
    } else {
      viewStart = addDays(viewStart, -7);
    }
    await loadAll();
    render();
  };
  const goNext = async () => {
    if (viewMode === 'month') {
      viewStart = new Date(viewStart.getFullYear(), viewStart.getMonth() + 1, 1);
    } else {
      viewStart = addDays(viewStart, 7);
    }
    await loadAll();
    render();
  };
  const goToday = async () => {
    viewStart = viewMode === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date());
    await loadAll();
    render();
  };
  document.getElementById('vsPrev')?.addEventListener('click', goPrev);
  document.getElementById('vsNext')?.addEventListener('click', goNext);
  document.getElementById('vsToday')?.addEventListener('click', goToday);

  // View toggle (Week / Month) — switching modes resets viewStart to the
  // current week or month so the user lands on something sensible.
  document.querySelectorAll('.vs-view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      if (mode === viewMode) return;
      viewMode = mode;
      try { localStorage.setItem('awkn.venueSpaces.viewMode', mode); } catch (e) { /* ignore */ }
      viewStart = viewMode === 'month' ? startOfMonth(viewStart) : startOfWeek(viewStart);
      await loadAll();
      render();
    });
  });
}

// ============================================================================
// Helpers
// ============================================================================
function formatRatesHtml(space) {
  const lines = [];
  const fmt = (n) => '$' + Math.round(Number(n)).toLocaleString();
  if (space.hourly_rate)    lines.push(`${fmt(space.hourly_rate)}/hr`);
  if (space.full_day_rate)  lines.push(`${fmt(space.full_day_rate)} full day`);
  if (space.overnight_rate) lines.push(`${fmt(space.overnight_rate)} overnight`);
  if (lines.length === 0) return '';
  return `<span class="vs-space-rates"><span class="vs-rate-line">${lines.join(' · ')}</span></span>`;
}

function formatBedSummary(space) {
  const parts = [];
  if (space.beds_king)   parts.push(`${space.beds_king} king`);
  if (space.beds_queen)  parts.push(`${space.beds_queen} queen`);
  if (space.beds_double) parts.push(`${space.beds_double} double`);
  if (space.beds_twin)   parts.push(`${space.beds_twin} twin`);
  return parts.join(', ');
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
// Snap to Sunday (0) at the start of the week so the calendar always
// reads as Sun → Sat across the columns.
function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function toIsoDate(d) { return ymd(d); }

function formatEventDate(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTimeRange(start, end) {
  if (!start && !end) return '—';
  const fmt = (t) => {
    if (!t) return '';
    if (/^\d{1,2}:\d{2}/.test(t)) {
      const [h, m] = t.split(':');
      const hh = Number(h);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = ((hh + 11) % 12) + 1;
      return m === '00' ? `${h12} ${ampm}` : `${h12}:${m} ${ampm}`;
    }
    return t;
  };
  const s = fmt(start), e = fmt(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}
function formatTimeShort(start, end) {
  if (!start && !end) return '';
  const fmt = (t) => {
    if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || '';
    const [h, m] = t.split(':');
    const hh = Number(h);
    const ampm = hh >= 12 ? 'p' : 'a';
    const h12 = ((hh + 11) % 12) + 1;
    return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
  };
  const s = fmt(start), e = fmt(end);
  if (s && e) return `${s}–${e}`;
  return s || e;
}
function formatMoney(n) {
  if (!n) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
