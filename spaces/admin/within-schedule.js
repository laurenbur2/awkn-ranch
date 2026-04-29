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
let allSpaces = [];                        // every space the admin can put a session in
let nsSelectedLeadId = null;               // currently-selected client in the New Session modal
let nsSearchDebounce  = null;

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
      bindNewSessionModal();
      await loadServices();
      await loadSpaces();
      await loadAndRender();
      // Refresh every 60s so the now-line updates and any new bookings appear.
      setInterval(loadAndRender, 60_000);
    },
  });
})();

async function loadSpaces() {
  // Pull anything the admin might host a session in: session-capable spaces
  // (Wellness Rooms, Dome, Yurts, Temple) PLUS rentable spaces (since those
  // can host private sessions for Within clients too).
  const { data } = await supabase
    .from('spaces')
    .select('id, name, space_type, booking_category')
    .eq('is_archived', false)
    .or('space_type.eq.session,space_type.eq.both,booking_category.eq.rental_space')
    .order('name');
  allSpaces = data || [];
}

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
  const header = document.getElementById('wsHeader');
  const body   = document.getElementById('wsBody');
  if (!header || !body) return;

  const todayStr = ymd(new Date());
  const totalHours = DAY_END_HOUR - DAY_START_HOUR;
  const totalHeight = totalHours * HOUR_PX;

  // ── Header row: blank corner + 7 day-of-week heads ─────────────────────
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
  header.innerHTML = headerHtml.join('');

  // ── Body row: time labels column + 7 day columns ───────────────────────
  // The time column has 14 stacked hour cells, each 70px tall.
  // Each day column is a fixed-height (980px) container with gridline
  // background and absolutely-positioned events on top.
  const timeCol = ['<div class="ws-time-col" style="height:' + totalHeight + 'px;">'];
  for (let hr = DAY_START_HOUR; hr < DAY_END_HOUR; hr++) {
    timeCol.push(`<div class="ws-time-cell">${formatHourLabel(hr)}</div>`);
  }
  timeCol.push('</div>');

  const dayCols = [];
  const now = new Date();
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + dayIdx);
    const isToday = ymd(d) === todayStr;
    const events = collectDayEvents(d);
    assignColumns(events);

    // Now-line on today's column (only if current time is in the visible window)
    let nowLine = '';
    if (isToday) {
      const minutesFromStart = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
      if (minutesFromStart >= 0 && minutesFromStart <= totalHours * 60) {
        const top = (minutesFromStart / 60) * HOUR_PX;
        nowLine = `<div class="ws-now-line" style="top:${top}px;"></div>`;
      }
    }

    dayCols.push(`
      <div class="ws-day-col ${isToday ? 'is-today' : ''}" style="height:${totalHeight}px;">
        ${events.map(renderEvent).join('')}
        ${nowLine}
      </div>
    `);
  }

  body.innerHTML = timeCol.join('') + dayCols.join('');

  // Click delegation on the body for session detail open
  if (!body.dataset.bound) {
    body.addEventListener('click', onGridClick);
    body.dataset.bound = '1';
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
  document.getElementById('btnNewSession')?.addEventListener('click', openNewSessionModal);
}

// ============================================================================
// New Session modal — create a scheduling_bookings row + check conflicts
// ============================================================================
function bindNewSessionModal() {
  document.getElementById('nsClose')?.addEventListener('click', closeNewSessionModal);
  document.getElementById('nsCancel')?.addEventListener('click', closeNewSessionModal);
  document.getElementById('nsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'nsModal') closeNewSessionModal();
  });
  document.getElementById('nsSave')?.addEventListener('click', saveNewSession);

  // Service dropdown
  const svcSel = document.getElementById('nsService');
  svcSel.innerHTML = '<option value="">— Select service —</option>'
    + services.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${s.duration_minutes} min)</option>`).join('');

  // Space dropdown — list every session-capable + rentable space, plus an
  // "Other" option that reveals a free-text location field.
  const spcSel = document.getElementById('nsSpace');
  spcSel.innerHTML = '<option value="">— Select a space —</option>'
    + allSpaces.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')
    + '<option value="__other__">Other (specify location)</option>';

  // Show/hide the Other location text field based on selection
  spcSel.addEventListener('change', () => {
    document.getElementById('nsOtherWrap').style.display =
      spcSel.value === '__other__' ? '' : 'none';
    runConflictCheck();
  });

  // Re-run conflict check when date/time changes
  ['nsDate', 'nsStart', 'nsEnd'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', runConflictCheck);
  });

  // Auto-fill end time when service is picked (start + duration)
  svcSel.addEventListener('change', () => {
    const startEl = document.getElementById('nsStart');
    const endEl   = document.getElementById('nsEnd');
    const svc = services.find(s => s.id === svcSel.value);
    if (svc && startEl.value && !endEl.value) {
      endEl.value = addMinutesToTime(startEl.value, svc.duration_minutes);
      runConflictCheck();
    }
  });

  // Client search
  const searchEl  = document.getElementById('nsClientSearch');
  const resultsEl = document.getElementById('nsClientResults');
  searchEl?.addEventListener('input', () => {
    clearTimeout(nsSearchDebounce);
    const q = searchEl.value.trim();
    if (q.length < 2) {
      resultsEl.style.display = 'none';
      resultsEl.innerHTML = '';
      return;
    }
    nsSearchDebounce = setTimeout(async () => {
      const { data } = await supabase
        .from('crm_leads')
        .select('id, first_name, last_name, email, phone')
        .eq('business_line', 'within')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      const rows = data || [];
      if (rows.length === 0) {
        resultsEl.innerHTML = '<div style="padding:0.55rem 0.7rem;color:#9ca3af;font-size:0.84rem;font-style:italic;">No Within clients match.</div>';
      } else {
        resultsEl.innerHTML = rows.map(r => {
          const name = ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || r.email || 'Client';
          return `<button class="ns-client-row" data-id="${esc(r.id)}" style="display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;padding:0.5rem 0.7rem;background:none;border:none;border-bottom:1px solid #f3f4f6;font-family:inherit;cursor:pointer;">
            <span style="font-weight:600;color:#111827;font-size:0.88rem;">${esc(name)}</span>
            ${r.email ? `<span style="font-size:0.74rem;color:#6b7280;">${esc(r.email)}</span>` : ''}
          </button>`;
        }).join('');
      }
      resultsEl.style.display = '';
    }, 200);
  });

  resultsEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.ns-client-row');
    if (!btn) return;
    nsSelectedLeadId = btn.dataset.id;
    const nameEl = btn.querySelector('span');
    const selectedEl = document.getElementById('nsSelectedClient');
    selectedEl.style.display = '';
    selectedEl.innerHTML = `<strong>Selected:</strong> ${nameEl.innerHTML} <button id="nsClearClient" style="background:none;border:none;color:#d4883a;font-size:0.78rem;font-weight:600;cursor:pointer;margin-left:0.5rem;">change</button>`;
    document.getElementById('nsClearClient').addEventListener('click', () => {
      nsSelectedLeadId = null;
      selectedEl.style.display = 'none';
      selectedEl.innerHTML = '';
      searchEl.value = '';
      searchEl.focus();
    });
    searchEl.value = '';
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
  });

  // Esc closes the modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('nsModal').classList.contains('hidden')) {
      closeNewSessionModal();
    }
  });
}

function openNewSessionModal() {
  // Reset state
  nsSelectedLeadId = null;
  document.getElementById('nsClientSearch').value = '';
  document.getElementById('nsSelectedClient').style.display = 'none';
  document.getElementById('nsClientResults').style.display = 'none';
  document.getElementById('nsService').value = '';
  document.getElementById('nsDate').value = ymd(new Date());
  document.getElementById('nsStart').value = '';
  document.getElementById('nsEnd').value = '';
  document.getElementById('nsSpace').value = '';
  document.getElementById('nsOtherWrap').style.display = 'none';
  document.getElementById('nsOtherLocation').value = '';
  document.getElementById('nsNotes').value = '';
  hideNsError();
  hideNsConflict();

  document.getElementById('nsModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('nsClientSearch').focus(), 30);
}
function closeNewSessionModal() {
  document.getElementById('nsModal').classList.add('hidden');
}
function showNsError(msg) {
  const el = document.getElementById('nsError');
  el.textContent = msg; el.style.display = '';
}
function hideNsError() {
  const el = document.getElementById('nsError');
  el.style.display = 'none'; el.textContent = '';
}
function showNsConflict(msg) {
  const el = document.getElementById('nsConflict');
  el.innerHTML = msg; el.style.display = '';
}
function hideNsConflict() {
  const el = document.getElementById('nsConflict');
  el.style.display = 'none'; el.innerHTML = '';
}

// Combine date + HH:MM time into a Date in the local timezone.
function combineDateTimeLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mn] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, mn, 0, 0);
}
function addMinutesToTime(timeStr, minutes) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Look up overlapping bookings on the chosen space + time window. Hits
// scheduling_bookings (other Within sessions) and crm_leads (venue events
// where business_line='awkn_ranch'). Shows a yellow warning banner if
// anything overlaps. Doesn't block the create — just informs.
async function runConflictCheck() {
  hideNsConflict();
  const spaceId = document.getElementById('nsSpace').value;
  const date    = document.getElementById('nsDate').value;
  const start   = document.getElementById('nsStart').value;
  const end     = document.getElementById('nsEnd').value;

  if (!spaceId || spaceId === '__other__' || !date || !start || !end) return;

  const startDt = combineDateTimeLocal(date, start);
  const endDt   = combineDateTimeLocal(date, end);
  if (!startDt || !endDt || endDt <= startDt) return;

  const startISO = startDt.toISOString();
  const endISO   = endDt.toISOString();

  const [sessRes, leadRes] = await Promise.all([
    // Other Within sessions on the same space, overlapping window
    supabase
      .from('scheduling_bookings')
      .select('id, start_datetime, end_datetime, status, lead:crm_leads(first_name, last_name)')
      .eq('space_id', spaceId)
      .neq('status', 'cancelled')
      .lt('start_datetime', endISO)
      .gt('end_datetime',   startISO),
    // Venue events booked on this space — only the confirmed ones
    supabase
      .from('crm_leads')
      .select('id, first_name, last_name, event_date, event_start_time, event_end_time, stage:crm_pipeline_stages(slug)')
      .eq('business_line', 'awkn_ranch')
      .eq('space_id', spaceId)
      .eq('event_date', date),
  ]);

  const sessConflicts = sessRes.data || [];
  const venueConflicts = (leadRes.data || []).filter(lead => {
    const slug = (lead.stage?.slug || '').toLowerCase();
    if (!['invoice_paid', 'event_scheduled', 'event_complete', 'feedback_form_sent'].includes(slug)) return false;
    if (!lead.event_start_time || !lead.event_end_time) return true; // unknown times → assume conflict
    return lead.event_start_time < end && lead.event_end_time > start;
  });

  if (sessConflicts.length === 0 && venueConflicts.length === 0) return;

  const lines = [];
  if (sessConflicts.length > 0) {
    lines.push(`<strong>⚠️ ${sessConflicts.length} Within session${sessConflicts.length === 1 ? '' : 's'}</strong> already booked on this space at this time.`);
  }
  if (venueConflicts.length > 0) {
    const names = venueConflicts.map(v => ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'unnamed');
    lines.push(`<strong>⚠️ Venue event${venueConflicts.length === 1 ? '' : 's'} confirmed</strong> on this space today: ${esc(names.join(', '))}.`);
  }
  showNsConflict(lines.join('<br>'));
}

async function saveNewSession() {
  hideNsError();
  if (!nsSelectedLeadId) { showNsError('Select a Within client.'); return; }
  const serviceId = document.getElementById('nsService').value;
  if (!serviceId) { showNsError('Select a service.'); return; }
  const date  = document.getElementById('nsDate').value;
  const start = document.getElementById('nsStart').value;
  const end   = document.getElementById('nsEnd').value;
  if (!date || !start || !end) { showNsError('Date, start, and end are required.'); return; }
  if (end <= start) { showNsError('End time must be after start time.'); return; }
  const spaceVal = document.getElementById('nsSpace').value;
  if (!spaceVal) { showNsError('Select a space (or Other).'); return; }
  const otherLocation = document.getElementById('nsOtherLocation').value.trim();
  if (spaceVal === '__other__' && !otherLocation) {
    showNsError('Type a location for "Other".');
    return;
  }

  const startDt = combineDateTimeLocal(date, start);
  const endDt   = combineDateTimeLocal(date, end);

  // For Other, leave space_id null and stamp the location into notes so it
  // shows up in the session detail modal.
  const spaceId = spaceVal === '__other__' ? null : spaceVal;
  const baseNotes = document.getElementById('nsNotes').value.trim();
  const finalNotes = spaceId
    ? (baseNotes || null)
    : `Location: ${otherLocation}${baseNotes ? `\n\n${baseNotes}` : ''}`;

  const payload = {
    lead_id: nsSelectedLeadId,
    service_id: serviceId,
    space_id: spaceId,
    start_datetime: startDt.toISOString(),
    end_datetime:   endDt.toISOString(),
    status: 'scheduled',
    notes: finalNotes,
  };

  const btn = document.getElementById('nsSave');
  btn.disabled = true; btn.textContent = 'Creating…';

  const { data, error } = await supabase
    .from('scheduling_bookings')
    .insert([payload])
    .select()
    .single();

  btn.disabled = false; btn.textContent = 'Create Session';

  if (error) {
    showNsError('Could not create: ' + error.message);
    return;
  }

  closeNewSessionModal();
  await loadAndRender();
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
