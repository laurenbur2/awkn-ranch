// Venue Events — list/search/filter view of AWKN Ranch venue rentals.
// Reads upcoming and recent events from `crm_leads` (filtered to
// business_line='awkn_ranch' with a populated event_date) joined with the
// space catalog and pipeline stage.
//
// This is the "list view" companion to the calendar in reservations.html —
// optimized for "what events are coming up?" rather than "what's the day
// look like on the Temple?". Click any row to jump to the lead in the CRM.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

let allEvents = [];
let allStages = [];
let allSpaces = [];
let filterState = {
  search: '',
  month:  'all',
  stage:  'all',
  space:  'all',
};

(async function () {
  await initAdminPage({
    activeTab: 'venue-events',
    section: 'staff',
    requiredPermission: 'view_crm',
    onReady: async () => {
      await loadAll();
      bindControls();
      render();
    },
  });
})();

// ============================================================================
// Data load
// ============================================================================
async function loadAll() {
  // Pull venue leads for the next 18 months and previous 30 days. That window
  // should always cover what an admin reasonably wants to see; the month
  // filter narrows further client-side.
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const end = new Date();
  end.setMonth(end.getMonth() + 18);

  const [leadsRes, stagesRes, spacesRes] = await Promise.all([
    supabase
      .from('crm_leads')
      .select(`
        id, first_name, last_name, email, phone,
        event_date, event_start_time, event_end_time, event_type, guest_count,
        space_id, stage_id, estimated_value, actual_revenue,
        deposit_amount, deposit_paid_at, balance_amount, balance_paid_at,
        notes, internal_staff_notes,
        space:spaces(id, name, slug),
        stage:crm_pipeline_stages(id, slug, name)
      `)
      .eq('business_line', 'awkn_ranch')
      .not('event_date', 'is', null)
      .gte('event_date', start.toISOString().slice(0, 10))
      .lte('event_date', end.toISOString().slice(0, 10))
      .order('event_date'),

    supabase
      .from('crm_pipeline_stages')
      .select('id, slug, name, sort_order')
      .eq('business_line', 'awkn_ranch')
      .order('sort_order'),

    supabase
      .from('spaces')
      .select('id, name')
      .eq('booking_category', 'rental_space')
      .eq('is_archived', false)
      .order('name'),
  ]);

  if (leadsRes.error)  console.warn('events load error:', leadsRes.error);
  if (stagesRes.error) console.warn('stages load error:', stagesRes.error);
  if (spacesRes.error) console.warn('spaces load error:', spacesRes.error);

  allEvents = leadsRes.data || [];
  allStages = stagesRes.data || [];
  allSpaces = spacesRes.data || [];

  // Populate stage + space filter dropdowns now that we know what's available.
  const stageSel = document.getElementById('stageFilter');
  for (const s of allStages) {
    const opt = document.createElement('option');
    opt.value = s.slug;
    opt.textContent = s.name;
    stageSel.appendChild(opt);
  }
  const spaceSel = document.getElementById('spaceFilter');
  for (const s of allSpaces) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    spaceSel.appendChild(opt);
  }

  // Build month options dynamically from the events present, plus a few
  // months forward in case nothing is booked yet.
  const monthSel = document.getElementById('monthFilter');
  const monthsSeen = new Set();
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    monthsSeen.add(monthKey(d));
  }
  for (const e of allEvents) {
    if (!e.event_date) continue;
    monthsSeen.add(e.event_date.slice(0, 7)); // YYYY-MM
  }
  const orderedMonths = Array.from(monthsSeen).sort();
  for (const m of orderedMonths) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = formatMonthLabel(m);
    monthSel.appendChild(opt);
  }
}

function monthKey(d) {
  return d.toISOString().slice(0, 7);
}
function formatMonthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// ============================================================================
// Controls
// ============================================================================
function bindControls() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterState.search = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('monthFilter').addEventListener('change', (e) => {
    filterState.month = e.target.value;
    render();
  });
  document.getElementById('stageFilter').addEventListener('change', (e) => {
    filterState.stage = e.target.value;
    render();
  });
  document.getElementById('spaceFilter').addEventListener('change', (e) => {
    filterState.space = e.target.value;
    render();
  });
}

// ============================================================================
// Filter + render
// ============================================================================
function applyFilters(events) {
  const today = todayKey();
  return events.filter(e => {
    if (!e.event_date) return false;

    // Date filter: 'all' = upcoming-only (today onwards),
    // 'past' = previous 30 days, 'YYYY-MM' = specific month.
    if (filterState.month === 'all') {
      if (e.event_date < today) return false;
    } else if (filterState.month === 'past') {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() - 30);
      if (e.event_date < thirty.toISOString().slice(0, 10)) return false;
      if (e.event_date >= today) return false;
    } else {
      if (!e.event_date.startsWith(filterState.month)) return false;
    }

    // Stage filter
    if (filterState.stage !== 'all' && e.stage?.slug !== filterState.stage) return false;

    // Space filter
    if (filterState.space !== 'all' && e.space_id !== filterState.space) return false;

    // Text search across name, email, space, type, notes
    if (filterState.search) {
      const hay = [
        e.first_name, e.last_name, e.email, e.phone,
        e.space?.name, e.event_type, e.notes, e.internal_staff_notes,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(filterState.search)) return false;
    }

    return true;
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function render() {
  const filtered = applyFilters(allEvents);
  renderStats();
  renderTable(filtered);
}

function renderStats() {
  const today = todayKey();
  const upcoming = allEvents.filter(e => e.event_date && e.event_date >= today);
  const thisMonth = upcoming.filter(e => e.event_date.startsWith(today.slice(0, 7))).length;

  // Booked = stages that look like "confirmed", "agreement_signed", "deposit_paid", "event_scheduled", etc.
  const isBooked = (e) => {
    const slug = (e.stage?.slug || '').toLowerCase();
    return /book|signed|deposit|confirmed|scheduled/.test(slug);
  };
  const bookedRevenue = upcoming
    .filter(isBooked)
    .reduce((sum, e) => sum + Number(e.actual_revenue || e.estimated_value || 0), 0);
  const pipelineRevenue = upcoming
    .filter(e => !isBooked(e) && (e.stage?.slug || '') !== 'lost')
    .reduce((sum, e) => sum + Number(e.estimated_value || 0), 0);

  setText('statUpcoming',  String(upcoming.length));
  setText('statThisMonth', String(thisMonth));
  setText('statRevenue',   formatMoney(bookedRevenue));
  setText('statPipeline',  formatMoney(pipelineRevenue));
}

function renderTable(events) {
  const body = document.getElementById('eventsBody');
  if (events.length === 0) {
    const empty = anyFilterActive()
      ? '<strong>No events match these filters.</strong>Try clearing the search or month filter.'
      : '<strong>No upcoming venue events.</strong>Add a lead in the CRM with an event date to see it here.';
    body.innerHTML = `<tr><td colspan="7" class="ve-empty">${empty}</td></tr>`;
    return;
  }

  body.innerHTML = events.map(renderRow).join('');

  // Wire up clicks → open the lead in clients/CRM. Use clients.html since
  // that's the unified detail drawer; fall back to crm.html if needed.
  body.querySelectorAll('tr[data-lead-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      const id = tr.dataset.leadId;
      // Land in the CRM with the lead drawer open.
      window.location.href = `crm.html?pillar=ranch&lead=${encodeURIComponent(id)}`;
    });
  });
}

function renderRow(e) {
  const dateStr = formatEventDate(e.event_date);
  const relStr  = formatRelative(e.event_date);
  const time    = formatTime(e.event_start_time, e.event_end_time);
  const guest   = ((e.first_name || '') + ' ' + (e.last_name || '')).trim() || '(unnamed)';
  const email   = e.email ? esc(e.email) : '';
  const space   = e.space?.name || '—';
  const eventType = e.event_type ? `<span class="ve-pill type">${esc(e.event_type)}</span>` : '';
  const stagePill = renderStagePill(e.stage);
  const amount  = formatMoney(Number(e.actual_revenue || e.estimated_value || 0));
  return `
    <tr data-lead-id="${esc(e.id)}">
      <td class="ve-cell-date">${esc(dateStr)}<span class="ve-relative">${esc(relStr)}</span></td>
      <td class="ve-cell-time col-time">${esc(time)}</td>
      <td class="ve-cell-client">${esc(guest)}${email ? `<span class="ve-email">${email}</span>` : ''}</td>
      <td class="ve-cell-space">${esc(space)}</td>
      <td class="col-type">${eventType}</td>
      <td>${stagePill}</td>
      <td class="ve-cell-amount col-amount">${esc(amount)}</td>
    </tr>
  `;
}

function renderStagePill(stage) {
  if (!stage) return '<span class="ve-pill stage">—</span>';
  const slug = (stage.slug || '').toLowerCase();
  let extraClass = '';
  if (/lost/.test(slug)) extraClass = 'lost';
  else if (/signed/.test(slug)) extraClass = 'signed';
  else if (/deposit/.test(slug)) extraClass = 'deposit';
  else if (/book|confirmed|scheduled/.test(slug)) extraClass = 'confirmed';
  return `<span class="ve-pill stage ${extraClass}">${esc(stage.name || stage.slug)}</span>`;
}

function anyFilterActive() {
  return filterState.search || filterState.month !== 'all' || filterState.stage !== 'all' || filterState.space !== 'all';
}

// ============================================================================
// Formatting helpers
// ============================================================================
function formatEventDate(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(yyyymmdd) {
  if (!yyyymmdd) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0 && diffDays < 30) return `in ${diffDays} days`;
  if (diffDays < 0 && diffDays > -30) return `${Math.abs(diffDays)} days ago`;
  if (diffDays >= 30) return `in ~${Math.round(diffDays / 30)} months`;
  return `${Math.round(Math.abs(diffDays) / 30)} months ago`;
}

function formatTime(start, end) {
  if (!start && !end) return '—';
  const fmt = (t) => {
    if (!t) return '';
    // Accept "HH:MM" or "HH:MM:SS" or natural strings; just trim seconds if present.
    if (/^\d{1,2}:\d{2}/.test(t)) {
      const [h, m] = t.split(':');
      const hh = Number(h);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = ((hh + 11) % 12) + 1;
      return `${h12}:${m} ${ampm}`;
    }
    return t;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} – ${e}`;
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
