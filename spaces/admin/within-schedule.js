// Within Schedule — week view (8am–10pm) showing recurring meals plus all
// Within client sessions pulled from `scheduling_bookings` (filtered to
// crm_leads with business_line='within'). Multiple sessions in the same
// time slot render side-by-side; clicking one opens a details modal.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

// ============================================================================
// Schedule constants
// ============================================================================
const DAY_START_HOUR = 8;   // 8am
const DAY_END_HOUR   = 22;  // 10pm (exclusive — last hour shown is 9pm-10pm)
const HOUR_PX        = 70;  // matches --hour-h in CSS

// Day-of-week numbers: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
// Recurring meal events. These are visualized only — not stored anywhere yet,
// just hardcoded so they show up consistently every week.
const MEALS = [
  { name: 'Continental Breakfast', daysOfWeek: [1, 2, 3, 4, 5], startHour: 9.5, durationHours: 1   }, // Mon–Fri 9:30am
  { name: 'Lunch',                 daysOfWeek: [2, 3],          startHour: 12,  durationHours: 1   }, // Tue & Wed 12pm
  { name: 'Dinner',                daysOfWeek: [0, 1, 2, 3, 4], startHour: 18,  durationHours: 1.5 }, // Sun–Thu 6pm
];

const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// State
// ============================================================================
let weekAnchor = startOfWeek(new Date()); // Sunday at 00:00 of the current week
let sessions = [];                         // raw rows for the visible window
let services = [];                         // service catalog for display + classification

// ============================================================================
// Boot
// ============================================================================
(async function () {
  await initAdminPage({
    activeTab: 'within-schedule',
    section: 'staff',
    requiredPermission: 'view_crm',
    onReady: async () => {
      bindToolbar();
      bindModal();
      await loadServices();
      await loadAndRender();
      // Refresh every 60s so the now-line updates and any new bookings appear.
      setInterval(loadAndRender, 60_000);
    },
  });
})();

async function loadServices() {
  const { data } = await supabase.from('services').select('id, slug, name, duration_minutes');
  services = data || [];
}

async function loadAndRender() {
  const winStart = new Date(weekAnchor);
  const winEnd = new Date(weekAnchor);
  winEnd.setDate(winEnd.getDate() + 7);

  const { data, error } = await supabase
    .from('scheduling_bookings')
    .select(`
      id, lead_id, service_id, space_id, status, notes,
      start_datetime, end_datetime, staff_user_id, facilitator_id,
      booker_name, booker_email, booker_phone,
      lead:crm_leads!inner(id, first_name, last_name, email, business_line),
      space:spaces(id, name)
    `)
    .eq('lead.business_line', 'within')
    .gte('start_datetime', winStart.toISOString())
    .lt('start_datetime', winEnd.toISOString())
    .order('start_datetime');

  if (error) {
    console.warn('within-schedule load error:', error);
    sessions = [];
  } else {
    sessions = (data || []).filter(s => s.status !== 'cancelled' || true); // include cancelled, render dimmed
  }

  render();
}

// ============================================================================
// Rendering
// ============================================================================
function render() {
  renderToolbar();
  renderGrid();
}

function renderToolbar() {
  const start = new Date(weekAnchor);
  const end = new Date(weekAnchor);
  end.setDate(end.getDate() + 6);
  const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);
  const sameMonth = start.getMonth() === end.getMonth();
  const label = sameMonth
    ? `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { day: 'numeric', year: 'numeric' })}`
    : `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  setText('tbRange', label);
}

function renderGrid() {
  const grid = document.getElementById('wsGrid');
  if (!grid) return;

  const todayStr = ymd(new Date());

  // Header row: blank corner + 7 day heads.
  const headerHtml = [`<div class="ws-corner"></div>`];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + i);
    const isToday = ymd(d) === todayStr;
    headerHtml.push(`
      <div class="ws-day-head ${isToday ? 'is-today' : ''}">
        <div class="ws-day-dow">${DOWS[d.getDay()]}</div>
        <div class="ws-day-date">${d.getDate()}</div>
      </div>
    `);
  }

  // Body: for each hour, one time-cell + 7 day-cells (which act as gridlines).
  // Events are rendered separately, absolutely positioned inside .ws-day-col
  // overlays we lay over the cell stack.
  const bodyHtml = [];
  for (let hr = DAY_START_HOUR; hr < DAY_END_HOUR; hr++) {
    bodyHtml.push(`<div class="ws-time-cell">${formatHourLabel(hr)}</div>`);
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      bodyHtml.push(`<div class="ws-day-cell" data-day-idx="${dayIdx}" data-hour="${hr}"></div>`);
    }
  }

  // Day-column overlays: one per day, absolutely positioned over the cell
  // stack. Each holds that day's events (meals + sessions).
  const totalHours = DAY_END_HOUR - DAY_START_HOUR;
  const totalHeight = totalHours * HOUR_PX;
  // The header row reserves 1 row (~52px). We'll position day-col absolutely
  // relative to the .ws-grid-wrap so it sits over the body cells.
  const overlayHtml = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + dayIdx);
    const events = collectDayEvents(d);
    assignColumns(events);
    // Position day-col by grid-column. Inside it, events are absolutely placed.
    overlayHtml.push(`
      <div class="ws-day-col" style="grid-column: ${dayIdx + 2}; grid-row: 2 / span ${totalHours}; height: ${totalHeight}px;">
        ${events.map(renderEvent).join('')}
      </div>
    `);
  }

  // Now line (only for today, only if within visible hour range)
  const now = new Date();
  let nowLineHtml = '';
  if (isInWeek(now, weekAnchor)) {
    const minutesFromStart = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
    if (minutesFromStart >= 0 && minutesFromStart <= totalHours * 60) {
      const dayIdx = (now.getDay() - weekAnchor.getDay() + 7) % 7;
      // Now line spans only the current day's column.
      const top = (minutesFromStart / 60) * HOUR_PX;
      nowLineHtml = `
        <div class="ws-now-line" style="grid-column: ${dayIdx + 2}; grid-row: 2 / span ${totalHours}; top: ${top}px; left: 0; right: 0;"></div>
      `;
    }
  }

  grid.innerHTML = headerHtml.join('') + bodyHtml.join('') + overlayHtml.join('') + nowLineHtml;

  // Click handler delegated on the grid
  grid.addEventListener('click', onGridClick, { once: false });
  // Make sure we don't double-bind; use a flag.
  if (!grid.dataset.bound) {
    grid.addEventListener('click', onGridClick);
    grid.dataset.bound = '1';
  }
}

function onGridClick(e) {
  const evtEl = e.target.closest('.ws-event.session');
  if (!evtEl) return;
  const id = evtEl.dataset.sessionId;
  const session = sessions.find(s => s.id === id);
  if (session) openModal(session);
}

// Build the event list for a given day (meals + sessions for that calendar date).
function collectDayEvents(date) {
  const dow = date.getDay();
  const out = [];

  for (const meal of MEALS) {
    if (!meal.daysOfWeek.includes(dow)) continue;
    const start = new Date(date);
    start.setHours(Math.floor(meal.startHour), Math.round((meal.startHour % 1) * 60), 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + meal.durationHours * 60);
    out.push({
      kind: 'meal',
      name: meal.name,
      start, end,
    });
  }

  const dayKey = ymd(date);
  for (const s of sessions) {
    const start = new Date(s.start_datetime);
    if (ymd(start) !== dayKey) continue;
    const end = new Date(s.end_datetime);
    out.push({
      kind: 'session',
      session: s,
      name: clientName(s),
      start, end,
    });
  }

  // Sort by start, then by end (longer first if same start) so the column
  // assignment is deterministic.
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  return out;
}

// Assign each event to a column index within an overlap cluster, plus the
// cluster's totalCols, so we can position with left/width %.
function assignColumns(events) {
  // Greedy: track active "lanes" — earliest-end event per lane. Place each
  // new event in the lowest-numbered lane whose latest event has already
  // ended.
  const lanes = []; // each lane = { endsAt: Date }
  for (const e of events) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].endsAt <= e.start) {
        e._col = i;
        lanes[i].endsAt = e.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      e._col = lanes.length;
      lanes.push({ endsAt: e.end });
    }
  }
  // Now figure out the max-overlap count for each event so its width is
  // 1/N of the column where N = max concurrent lanes during its span.
  // Simpler: just use total lanes used in the day. Slight overshoot but
  // visually consistent across that day.
  const totalCols = Math.max(1, lanes.length);
  for (const e of events) e._totalCols = totalCols;
}

function renderEvent(e) {
  const startMin = (e.start.getHours() - DAY_START_HOUR) * 60 + e.start.getMinutes();
  const endMin   = (e.end.getHours()   - DAY_START_HOUR) * 60 + e.end.getMinutes();
  // Clamp to visible window.
  const clampedStart = Math.max(0, startMin);
  const clampedEnd   = Math.min((DAY_END_HOUR - DAY_START_HOUR) * 60, endMin);
  if (clampedEnd <= clampedStart) return ''; // entirely outside visible hours
  const top = (clampedStart / 60) * HOUR_PX;
  const height = ((clampedEnd - clampedStart) / 60) * HOUR_PX;
  const colWidth = 100 / e._totalCols;
  const left = e._col * colWidth;
  const widthPad = e._totalCols > 1 ? 1 : 2; // px gap between columns
  const style = `top: ${top}px; height: ${Math.max(22, height - 1)}px; left: calc(${left}% + ${widthPad}px); width: calc(${colWidth}% - ${widthPad * 2}px);`;

  if (e.kind === 'meal') {
    return `
      <div class="ws-event meal" style="${style}">
        <div class="ws-event-time">${formatTimeRange(e.start, e.end)}</div>
        <div class="ws-event-title">${esc(e.name)}</div>
      </div>
    `;
  }
  // session
  const s = e.session;
  const svc = services.find(x => x.id === s.service_id);
  const serviceClass = svc ? svc.slug.replace(/[^a-z]/g, '') : '';
  const cancelledClass = s.status === 'cancelled' ? 'cancelled' : '';
  const sub = svc ? svc.name : (s.space?.name || '');
  return `
    <div class="ws-event session ${serviceClass} ${cancelledClass}" data-session-id="${esc(s.id)}" style="${style}">
      <div class="ws-event-time">${formatTimeRange(e.start, e.end)}</div>
      <div class="ws-event-title">${esc(e.name)}</div>
      ${sub ? `<div class="ws-event-sub">${esc(sub)}</div>` : ''}
    </div>
  `;
}

// ============================================================================
// Modal
// ============================================================================
function bindModal() {
  document.getElementById('wsModalClose')?.addEventListener('click', closeModal);
  document.getElementById('wsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'wsModal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('wsModal').classList.contains('hidden') && e.key === 'Escape') closeModal();
  });
}

function openModal(s) {
  const modal = document.getElementById('wsModal');
  const body = document.getElementById('wsModalBody');
  const foot = document.getElementById('wsModalFoot');
  const start = new Date(s.start_datetime);
  const end   = new Date(s.end_datetime);
  const svc = services.find(x => x.id === s.service_id);
  const guest = clientName(s);
  const dateStr = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = `${formatTime12(start)} – ${formatTime12(end)}`;

  setText('wsModalTitle', svc ? svc.name : 'Session');
  body.innerHTML = `
    <div class="ws-modal-row">
      <span class="ws-modal-label">Client</span>
      <span class="ws-modal-value">${esc(guest)}</span>
    </div>
    <div class="ws-modal-row">
      <span class="ws-modal-label">When</span>
      <span class="ws-modal-value">${esc(dateStr)} · ${esc(timeStr)}</span>
    </div>
    <div class="ws-modal-row">
      <span class="ws-modal-label">Space</span>
      <span class="ws-modal-value">${esc(s.space?.name || '—')}</span>
    </div>
    <div class="ws-modal-row">
      <span class="ws-modal-label">Status</span>
      <span class="ws-modal-value">${esc((s.status || 'scheduled').replace(/_/g, ' '))}</span>
    </div>
    ${s.lead?.email ? `<div class="ws-modal-row"><span class="ws-modal-label">Email</span><span class="ws-modal-value">${esc(s.lead.email)}</span></div>` : ''}
    ${s.notes ? `<div class="ws-modal-row"><span class="ws-modal-label">Notes</span><span class="ws-modal-value" style="white-space:pre-wrap;">${esc(s.notes)}</span></div>` : ''}
  `;
  foot.innerHTML = s.lead_id
    ? `<a class="ws-modal-link" href="clients.html?lead=${encodeURIComponent(s.lead_id)}">Open in CRM</a>`
    : '';
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('wsModal').classList.add('hidden');
}

// ============================================================================
// Toolbar handlers
// ============================================================================
function bindToolbar() {
  document.getElementById('btnPrev')?.addEventListener('click', () => {
    weekAnchor = addDays(weekAnchor, -7);
    loadAndRender();
  });
  document.getElementById('btnNext')?.addEventListener('click', () => {
    weekAnchor = addDays(weekAnchor, 7);
    loadAndRender();
  });
  document.getElementById('btnToday')?.addEventListener('click', () => {
    weekAnchor = startOfWeek(new Date());
    loadAndRender();
  });
}

// ============================================================================
// Helpers
// ============================================================================
function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // back up to Sunday
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isInWeek(d, weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return d >= weekStart && d < end;
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function formatHourLabel(hr) {
  if (hr === 0) return '12 AM';
  if (hr === 12) return '12 PM';
  return hr < 12 ? `${hr} AM` : `${hr - 12} PM`;
}
function formatTime12(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return m === '00' ? `${h} ${ampm}` : `${h}:${m} ${ampm}`;
}
function formatTimeRange(s, e) {
  return `${formatTime12(s)} – ${formatTime12(e)}`;
}

function clientName(s) {
  const lead = s.lead || {};
  const name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim();
  return name || s.booker_name || lead.email || 'Client';
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
