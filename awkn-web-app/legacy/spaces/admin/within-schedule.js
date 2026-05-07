// Within Schedule — week view (8am–10pm) showing recurring meals plus all
// Within client sessions pulled from `scheduling_bookings` (filtered to
// crm_leads with business_line='within'). Multiple sessions in the same
// time slot render side-by-side; clicking one opens a details modal.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';

// ============================================================================
// Schedule constants
// ============================================================================
const DAY_START_HOUR = 8;   // 8am
const DAY_END_HOUR   = 22;  // 10pm (exclusive — last hour shown is 9pm-10pm)
const HOUR_PX        = 70;  // matches --hour-h in CSS

// Meals come from house_meals (one row per concrete meal entry — date,
// start_time, end_time, name, description). The hardcoded recurring
// pattern was migrated to seeded rows so the team can edit/move/delete
// individual meals from the schedule UI.

const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// State
// ============================================================================
let weekAnchor = startOfWeek(new Date()); // Sunday at 00:00 of the current week
let sessions = [];                         // raw rows for the visible window
let meals = [];                            // house_meals rows for the visible window
let services = [];                         // service catalog for display + classification
let addonServiceIds = new Set();           // service IDs flagged as add-ons (slug starts with addon_)
let allSpaces = [];                        // every space the admin can put a session in
let editingMealId = null;                  // set when the meal modal is in edit mode
let staffList = [];                        // app_users (admin/staff/oracle) — for STAFF row + cancel attribution
let facilitators = [];                     // facilitator directory — for STAFF row when facilitator_id is set
let nsSelectedLeadId = null;               // currently-selected client in the New Session modal
let nsSelectedLeadName = null;             // captured at selection so we can stamp booker_name on insert
let nsSelectedLeadEmail = null;
let nsSearchDebounce  = null;
let nsEditingSessionId = null;             // when set, the New Session modal is in edit mode (UPDATE not INSERT)
// Set true by runConflictCheck when the chosen space is already booked at
// the chosen window (another Within session or a confirmed venue rental).
// saveNewSession refuses to insert while this is true.
let nsHasHardConflict = false;
// Set briefly after a drag-drop completes so the synthesized click that
// follows pointerup doesn't pop the detail modal on top of the move
// confirm dialog.
let suppressNextClick = false;

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
      bindMealModal();
      await loadServices();
      await loadSpaces();
      // Now that services + spaces are loaded, fill the New Session dropdowns.
      // (bindNewSessionModal only attaches event listeners; it can't populate
      // the option lists because the data isn't fetched until here.)
      populateNewSessionDropdowns();
      await loadStaffAndFacilitators();
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
  // Active services only, sorted for stable UI.
  const svcRes = await supabase
    .from('services')
    .select('id, slug, name, duration_minutes, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name');
  services = svcRes.data || [];

  // Resolve which services are wired to an add-on package (slug starts with
  // addon_) so the Service dropdown can group them as "Add-ons" instead of
  // mixing them with the core ketamine/integration list. Two-step query
  // (parent then items) — avoids fragile join-filter syntax. If anything
  // goes wrong here, the dropdown still renders as a flat "Sessions" list.
  try {
    const pkgRes = await supabase
      .from('crm_service_packages')
      .select('id, slug')
      .like('slug', 'addon_%');
    const addonPkgIds = (pkgRes.data || []).map(p => p.id);
    if (addonPkgIds.length) {
      const itemsRes = await supabase
        .from('crm_service_package_items')
        .select('service_id')
        .in('package_id', addonPkgIds);
      addonServiceIds = new Set((itemsRes.data || []).map(r => r.service_id));
    } else {
      addonServiceIds = new Set();
    }
  } catch (err) {
    console.warn('Add-on classification failed; treating all services as core:', err);
    addonServiceIds = new Set();
  }
}

// Pull meals for the visible Sun–Sat window. Inclusive on both ends because
// meal_date is a DATE (no time component).
async function loadMealsForRange(winStart, winEnd) {
  const startStr = ymd(winStart);
  const endDate = new Date(winEnd);
  endDate.setDate(endDate.getDate() - 1); // winEnd is exclusive (next Sunday)
  const endStr = ymd(endDate);
  const { data, error } = await supabase
    .from('house_meals')
    .select('id, meal_date, start_time, end_time, name, description, notes')
    .gte('meal_date', startStr)
    .lte('meal_date', endStr)
    .order('meal_date')
    .order('start_time');
  if (error) {
    console.warn('house_meals load error:', error);
    meals = [];
  } else {
    meals = data || [];
  }
}

// Mirror Clients › Schedule's STAFF row by populating the same two
// directories used there. Done in parallel since both are tiny tables.
async function loadStaffAndFacilitators() {
  const [staffRes, facRes] = await Promise.all([
    supabase.from('app_users')
      .select('id, display_name, first_name, last_name, email')
      .in('role', ['admin', 'staff', 'oracle'])
      .eq('is_archived', false),
    supabase.from('facilitators').select('id, first_name, last_name, email'),
  ]);
  staffList = staffRes.data || [];
  facilitators = facRes.data || [];
}

function getStaffName(userId) {
  const u = staffList.find(x => x.id === userId);
  if (!u) return null;
  return u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || null;
}
function getFacilitatorName(facilitatorId) {
  const f = facilitators.find(x => x.id === facilitatorId);
  if (!f) return null;
  return `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || null;
}
function getAssigneeName(b) {
  const primary = b.facilitator_id ? getFacilitatorName(b.facilitator_id)
                : b.staff_user_id  ? getStaffName(b.staff_user_id)
                : null;
  if (!primary) return null;
  if (b.additional_facilitator_id) {
    const co = getFacilitatorName(b.additional_facilitator_id);
    if (co) return `${primary} + ${co}`;
  }
  return primary;
}

async function loadAndRender() {
  const winStart = new Date(weekAnchor);
  const winEnd = new Date(weekAnchor);
  winEnd.setDate(winEnd.getDate() + 7);

  await loadMealsForRange(winStart, winEnd);

  // Pull the same set the Within › Clients › Schedule subtab pulls — admin-
  // created bookings (profile_id null), uncancelled, restricted to Within
  // clients via the joined business_line. Keeps the two views in sync.
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .select(`
      id, lead_id, service_id, space_id, status, notes,
      start_datetime, end_datetime, staff_user_id, facilitator_id, additional_facilitator_id,
      booker_name, booker_email, booker_phone, cancelled_at, profile_id,
      package_session_id,
      lead:crm_leads!inner(id, first_name, last_name, email, phone, business_line),
      space:spaces(id, name)
    `)
    .eq('lead.business_line', 'within')
    .is('cancelled_at', null)
    .is('profile_id', null)
    .gte('start_datetime', winStart.toISOString())
    .lt('start_datetime', winEnd.toISOString())
    .order('start_datetime');

  if (error) {
    console.warn('within-schedule load error:', error);
    sessions = [];
  } else {
    sessions = data || [];
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
      <div class="ws-day-col ${isToday ? 'is-today' : ''}" data-empty-day-idx="${dayIdx}" style="height:${totalHeight}px;cursor:cell;">
        ${events.map(renderEvent).join('')}
        ${nowLine}
      </div>
    `);
  }

  body.innerHTML = timeCol.join('') + dayCols.join('');

  // Click delegation on the body for session detail open
  if (!body.dataset.bound) {
    body.addEventListener('click', onGridClick);
    enableDragAndDrop(body);
    body.dataset.bound = '1';
  }
}

function onGridClick(e) {
  // A click immediately follows pointerup on a drag — skip it so the
  // detail/edit modal doesn't open on top of the move confirm dialog.
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  // Existing session pill → open the detail modal.
  const evtEl = e.target.closest('.ws-event.session');
  if (evtEl) {
    const id = evtEl.dataset.sessionId;
    const session = sessions.find(s => s.id === id);
    if (session) openModal(session);
    return;
  }
  // Meal pill → open the edit-meal modal (rename, move, change times,
  // edit description, or delete).
  const mealEl = e.target.closest('.ws-event.meal');
  if (mealEl) {
    const id = mealEl.dataset.mealId;
    const meal = meals.find(m => m.id === id);
    if (meal) openMealModal(meal);
    return;
  }
  // Empty area inside a day column → open the New Session modal pre-filled
  // with the clicked day + start time (snapped to 15 minutes).
  const dayCol = e.target.closest('[data-empty-day-idx]');
  if (!dayCol) return;
  const rect = dayCol.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const rawMinutes = (y / HOUR_PX) * 60;
  const snapped = Math.max(0, Math.floor(rawMinutes / 15) * 15);
  const dayIdx = parseInt(dayCol.dataset.emptyDayIdx, 10);
  const start = new Date(weekAnchor);
  start.setDate(start.getDate() + dayIdx);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  start.setMinutes(snapped);
  openNewSessionModal({ prefilledStart: start });
}

// ============================================================================
// Drag-and-drop — move a session or meal to a new time / day
// ----------------------------------------------------------------------------
// Sessions and meals on the grid are absolutely-positioned pills. We listen
// for pointerdown on the pill, pointermove on the document, and pointerup
// to compute the drop target (snapped to 5 minutes) then ask the user to
// confirm before writing the new times back to the DB. A near-zero pointer
// movement (< 5px) is treated as a click and falls through to onGridClick.
// ============================================================================
function enableDragAndDrop(body) {
  let drag = null;

  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // left button only
    const pill = e.target.closest('.ws-event.session, .ws-event.meal');
    if (!pill) return;
    if (pill.classList.contains('cancelled')) return;

    const isSession = pill.classList.contains('session');
    const id = isSession ? pill.dataset.sessionId : pill.dataset.mealId;
    const record = isSession
      ? sessions.find(s => s.id === id)
      : meals.find(m => m.id === id);
    if (!record) return;

    drag = {
      pill,
      isSession,
      record,
      startX: e.clientX,
      startY: e.clientY,
      pillRect: pill.getBoundingClientRect(),
      moved: false,
    };
    // Don't preventDefault here — we want a plain click (no movement) to
    // still propagate as a click event for onGridClick.
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.pill.style.zIndex = '100';
      drag.pill.style.opacity = '0.85';
      drag.pill.style.boxShadow = '0 8px 20px rgba(0,0,0,0.20)';
      drag.pill.style.cursor = 'grabbing';
      drag.pill.style.pointerEvents = 'none'; // so elementFromPoint sees the day col
      document.body.style.userSelect = 'none';
    }
    drag.pill.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  document.addEventListener('pointerup', async (e) => {
    if (!drag) return;
    const local = drag;
    drag = null;
    document.body.style.userSelect = '';

    // Reset pill visuals before any await — pointer-events: none must come off
    // so the user can interact with the page during the confirm.
    local.pill.style.transform = '';
    local.pill.style.opacity = '';
    local.pill.style.boxShadow = '';
    local.pill.style.cursor = '';
    local.pill.style.zIndex = '';
    local.pill.style.pointerEvents = '';

    if (!local.moved) return; // treat as click — onGridClick takes over

    // Suppress the click that always follows pointerup so the detail modal
    // doesn't pop on top of our confirm.
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);

    // Find which day column the pointer is over.
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dayCol = target?.closest('[data-empty-day-idx]');
    if (!dayCol) return; // dropped outside the grid — abandon

    const dayIdx = parseInt(dayCol.dataset.emptyDayIdx, 10);
    const colRect = dayCol.getBoundingClientRect();
    // Where the TOP of the pill should land = cursor y minus how far down
    // the pill the user originally clicked.
    const offsetWithinPill = local.startY - local.pillRect.top;
    const newPillTop = (e.clientY - colRect.top) - offsetWithinPill;
    const minutesFromGridStart = Math.max(0, (newPillTop / HOUR_PX) * 60);
    // Snap to 5-minute increments to match the time-picker step elsewhere.
    const snapped = Math.round(minutesFromGridStart / 5) * 5;

    const newStart = new Date(weekAnchor);
    newStart.setDate(newStart.getDate() + dayIdx);
    newStart.setHours(DAY_START_HOUR, 0, 0, 0);
    newStart.setMinutes(snapped);

    if (local.isSession) {
      await dragMoveSession(local.record, newStart);
    } else {
      await dragMoveMeal(local.record, newStart);
    }
  });
}

async function dragMoveSession(session, newStart) {
  const origStart = new Date(session.start_datetime);
  const origEnd   = new Date(session.end_datetime);
  const durationMs = origEnd - origStart;
  const newEnd = new Date(newStart.getTime() + durationMs);

  // No-op if drop landed at the exact same start (within snap precision).
  if (newStart.getTime() === origStart.getTime()) return;

  const dateLabel = newStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = `${formatTime12(newStart)} – ${formatTime12(newEnd)}`;
  if (!confirm(`Move this session to ${dateLabel} · ${timeLabel}?`)) {
    render(); // snap visual back to where it was
    return;
  }

  const { error } = await supabase
    .from('scheduling_bookings')
    .update({
      start_datetime: newStart.toISOString(),
      end_datetime:   newEnd.toISOString(),
    })
    .eq('id', session.id);

  if (error) {
    alert('Move failed: ' + error.message);
    render();
    return;
  }
  await loadAndRender();
}

async function dragMoveMeal(meal, newStart) {
  // Meals store start/end as TIME columns + a DATE column, so we split the
  // new Date into those three pieces.
  const startTimeStr = `${pad2(newStart.getHours())}:${pad2(newStart.getMinutes())}:00`;
  const startMs = combineDateTimeLocal(meal.meal_date, hhmmFromTime(meal.start_time));
  const endMs   = combineDateTimeLocal(meal.meal_date, hhmmFromTime(meal.end_time));
  const durationMs = endMs - startMs;
  const newEnd = new Date(newStart.getTime() + durationMs);
  const endTimeStr = `${pad2(newEnd.getHours())}:${pad2(newEnd.getMinutes())}:00`;
  const newDateStr = ymd(newStart);

  if (newDateStr === meal.meal_date && startTimeStr === meal.start_time) return;

  const dateLabel = newStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = `${formatTime12(newStart)} – ${formatTime12(newEnd)}`;
  if (!confirm(`Move "${meal.name}" to ${dateLabel} · ${timeLabel}?`)) {
    render();
    return;
  }

  const { error } = await supabase
    .from('house_meals')
    .update({
      meal_date: newDateStr,
      start_time: startTimeStr,
      end_time:   endTimeStr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', meal.id);

  if (error) {
    alert('Move failed: ' + error.message);
    render();
    return;
  }
  await loadAndRender();
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Build the event list for a given day (meals + sessions for that calendar date).
function collectDayEvents(date) {
  const dayKey = ymd(date);
  const out = [];

  for (const m of meals) {
    if (m.meal_date !== dayKey) continue;
    out.push({
      kind: 'meal',
      meal: m,
      name: m.name,
      description: m.description || '',
      start: combineDateTimeLocal(m.meal_date, hhmmFromTime(m.start_time)),
      end:   combineDateTimeLocal(m.meal_date, hhmmFromTime(m.end_time)),
    });
  }

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
      <div class="ws-event meal" data-meal-id="${esc(e.meal?.id || '')}" style="${style};cursor:pointer;">
        <div class="ws-event-time">${formatTimeRange(e.start, e.end)}</div>
        <div class="ws-event-title">${esc(e.name)}</div>
        ${e.description ? `<div class="ws-event-sub">${esc(e.description)}</div>` : ''}
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

// Mirrors the Clients › Schedule booking-detail modal: WHEN / CLIENT (with
// contact) / STAFF / ROOM / STATUS / NOTES rows plus Close · Open client ·
// Cancel session · Reschedule buttons. Reschedule only shows when the
// booking is tied to a package_session_id (so the credit can be freed and
// rebooked from the client's package screen).
function openModal(s) {
  const modal = document.getElementById('wsModal');
  const body = document.getElementById('wsModalBody');
  const foot = document.getElementById('wsModalFoot');
  const start = new Date(s.start_datetime);
  const end   = new Date(s.end_datetime);
  const svc = services.find(x => x.id === s.service_id);
  const svcName = svc?.name || 'Session';
  const durationMin = svc?.duration_minutes || Math.round((end - start) / 60000);
  const dateLabel = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = `${formatTime12(start)} – ${formatTime12(end)}`;

  const lead = s.lead || {};
  const fullName = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim()
    || s.booker_name
    || lead.email
    || 'Client';
  const contact = [lead.email || s.booker_email, lead.phone || s.booker_phone]
    .filter(Boolean).join(' · ');
  const staff = getAssigneeName(s) || 'Unassigned';
  const room = s.space?.name || '—';
  const statusLabel = (s.status || 'scheduled').replace(/_/g, ' ');
  const isActive = !s.cancelled_at && s.status !== 'cancelled';
  const hasPackageSession = !!s.package_session_id;

  setText('wsModalTitle', svcName);

  // Two-column rows like clients.js openBookingDetail (label cell + value).
  const row = (label, value) => `
    <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid #eee;">
      <div style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;">${esc(label)}</div>
      <div style="font-size:14px;color:#111;">${value}</div>
    </div>
  `;
  body.style.gap = '0';
  body.innerHTML = [
    row('When', `${esc(dateLabel)}<div style="font-size:12px;color:#666;margin-top:2px;">${esc(timeLabel)} &middot; ${durationMin} min</div>`),
    row('Client', `<div>${esc(fullName)}</div>${contact ? `<div style="font-size:12px;color:#666;margin-top:2px;">${esc(contact)}</div>` : ''}`),
    row('Staff', esc(staff)),
    row('Room', esc(room)),
    row('Status', `<span style="text-transform:capitalize;">${esc(statusLabel)}</span>`),
    s.notes ? row('Notes', `<span style="white-space:pre-wrap;">${esc(s.notes)}</span>`) : '',
  ].join('');

  // Buttons: Close · Open client · Cancel session · Reschedule.
  // Style mirrors the Clients › Schedule modal — secondary outline + danger
  // outline + primary copper. Reschedule navigates to the client's page so
  // the existing schedule-modal flow there can pick up the freed session.
  const btnBase = 'padding:0.5rem 0.95rem;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#111;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;';
  const btnDanger = 'padding:0.5rem 0.95rem;border-radius:8px;border:1px solid #fca5a5;background:#fff;color:#b91c1c;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;';
  const btnPrimary = 'padding:0.5rem 0.95rem;border-radius:8px;border:1px solid #d4883a;background:#d4883a;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;';

  const buttons = [];
  buttons.push(`<button id="wsBtnClose" style="${btnBase}">Close</button>`);
  if (s.lead_id) {
    buttons.push(`<a id="wsBtnOpenClient" href="clients.html?lead=${encodeURIComponent(s.lead_id)}" style="${btnBase}">Open client</a>`);
  }
  if (isActive) {
    buttons.push(`<button id="wsBtnEdit" data-edit-session-id="${esc(s.id)}" style="${btnBase}">Edit</button>`);
    buttons.push(`<button id="wsBtnCancel" data-cancel-session-id="${esc(s.id)}" style="${btnDanger}">Cancel session</button>`);
    if (hasPackageSession && s.lead_id) {
      // Reschedule mirrors the Clients › Schedule flow: cancel this booking
      // (which frees the session credit back to "unscheduled") and bounce
      // to the client's drawer with ?schedule=<package_session_id>, which
      // pops the schedule modal pre-loaded on that session.
      buttons.push(`<button id="wsBtnReschedule" data-reschedule-session-id="${esc(s.id)}" data-package-session-id="${esc(s.package_session_id)}" data-lead-id="${esc(s.lead_id)}" style="${btnPrimary}">Reschedule</button>`);
    }
  }
  foot.style.justifyContent = 'flex-end';
  foot.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;">${buttons.join('')}</div>`;

  document.getElementById('wsBtnClose')?.addEventListener('click', closeModal);
  foot.querySelector('[data-edit-session-id]')?.addEventListener('click', () => {
    closeModal();
    openNewSessionModal({ editSession: s });
  });
  foot.querySelector('[data-reschedule-session-id]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.rescheduleSessionId;
    const leadId = btn.dataset.leadId;
    const pkgSessionId = btn.dataset.packageSessionId;
    if (!id || !leadId || !pkgSessionId) return;
    if (!confirm('Cancel this session and pick a new time?')) return;
    btn.disabled = true;
    btn.textContent = 'Working…';
    const { error } = await supabase
      .from('scheduling_bookings')
      .update({ cancelled_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id);
    if (error) {
      alert('Cancel failed: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Reschedule';
      return;
    }
    window.location.href = `clients.html?lead=${encodeURIComponent(leadId)}&schedule=${encodeURIComponent(pkgSessionId)}`;
  });
  foot.querySelector('[data-cancel-session-id]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.cancelSessionId;
    if (!id) return;
    if (!confirm('Cancel this session? It will be removed from the schedule.')) return;
    btn.disabled = true;
    btn.textContent = 'Canceling…';
    const { error } = await supabase
      .from('scheduling_bookings')
      .update({ cancelled_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id);
    if (error) {
      alert('Cancel failed: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Cancel session';
      return;
    }
    closeModal();
    await loadAndRender();
  });
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
  document.getElementById('btnNewMeal')?.addEventListener('click', () => openMealModal(null));
}

// ============================================================================
// Meal modal — add / edit / delete a house_meals row
// ============================================================================
function bindMealModal() {
  document.getElementById('mealClose')?.addEventListener('click', closeMealModal);
  document.getElementById('mealCancel')?.addEventListener('click', closeMealModal);
  document.getElementById('mealModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'mealModal') closeMealModal();
  });
  document.getElementById('mealSave')?.addEventListener('click', saveMeal);
  document.getElementById('mealDelete')?.addEventListener('click', deleteMeal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('mealModal').classList.contains('hidden')) {
      closeMealModal();
    }
  });
}

function openMealModal(meal) {
  editingMealId = meal?.id || null;
  setText('mealModalTitle', editingMealId ? 'Edit Meal' : 'New Meal');
  document.getElementById('mealError').style.display = 'none';
  document.getElementById('mealError').textContent = '';
  document.getElementById('mealName').value = meal?.name || '';
  document.getElementById('mealDescription').value = meal?.description || '';
  document.getElementById('mealNotes').value = meal?.notes || '';
  document.getElementById('mealDate').value = meal?.meal_date || ymd(new Date());
  document.getElementById('mealStart').value = meal ? hhmmFromTime(meal.start_time) : '';
  document.getElementById('mealEnd').value   = meal ? hhmmFromTime(meal.end_time)   : '';
  document.getElementById('mealDelete').style.display = editingMealId ? '' : 'none';
  document.getElementById('mealModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('mealName').focus(), 30);
}

function closeMealModal() {
  document.getElementById('mealModal').classList.add('hidden');
  editingMealId = null;
}

function showMealError(msg) {
  const el = document.getElementById('mealError');
  el.textContent = msg;
  el.style.display = '';
}

async function saveMeal() {
  const name        = document.getElementById('mealName').value.trim();
  const description = document.getElementById('mealDescription').value.trim();
  const notes       = document.getElementById('mealNotes').value.trim();
  const date        = document.getElementById('mealDate').value;
  const start       = document.getElementById('mealStart').value;
  const end         = document.getElementById('mealEnd').value;

  if (!name)  { showMealError('Name is required.'); return; }
  if (!date)  { showMealError('Date is required.'); return; }
  if (!start) { showMealError('Start time is required.'); return; }
  if (!end)   { showMealError('End time is required.'); return; }
  if (end <= start) { showMealError('End must be after start.'); return; }

  const payload = {
    name,
    description: description || null,
    notes: notes || null,
    meal_date: date,
    start_time: start,
    end_time: end,
  };

  const btn = document.getElementById('mealSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  let error;
  if (editingMealId) {
    payload.updated_at = new Date().toISOString();
    ({ error } = await supabase.from('house_meals').update(payload).eq('id', editingMealId));
  } else {
    ({ error } = await supabase.from('house_meals').insert([payload]));
  }

  btn.disabled = false;
  btn.textContent = 'Save Meal';

  if (error) {
    showMealError('Could not save: ' + error.message);
    return;
  }

  closeMealModal();
  await loadAndRender();
}

async function deleteMeal() {
  if (!editingMealId) return;
  if (!confirm('Delete this meal? It will be removed from the schedule.')) return;
  const btn = document.getElementById('mealDelete');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  const { error } = await supabase.from('house_meals').delete().eq('id', editingMealId);
  btn.disabled = false;
  btn.textContent = 'Delete';
  if (error) {
    showMealError('Delete failed: ' + error.message);
    return;
  }
  closeMealModal();
  await loadAndRender();
}

// 'HH:MM:SS' (PostgreSQL TIME) → 'HH:MM' (HTML <input type="time" step="300">)
function hhmmFromTime(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  return `${parts[0] || '00'}:${parts[1] || '00'}`;
}

// ============================================================================
// New Session modal — create a scheduling_bookings row + check conflicts
// ============================================================================
// Fill the Service + Space <select>s using the data fetched after boot.
// Called from onReady AFTER loadServices/loadSpaces resolve, since the bind
// step (event listeners) has to run synchronously and runs before the data
// is available.
function populateNewSessionDropdowns() {
  // Service dropdown — split into Sessions vs Add-ons. Membership is driven
  // by which services are attached to an addon_* package in the catalog
  // (loadServices populates addonServiceIds).
  const svcSel = document.getElementById('nsService');
  if (svcSel) {
    const sessionSvcs = services.filter(s => !addonServiceIds.has(s.id));
    const addonSvcs   = services.filter(s =>  addonServiceIds.has(s.id));
    const renderSvcOption = s => `<option value="${esc(s.id)}">${esc(s.name)} (${s.duration_minutes} min)</option>`;
    svcSel.innerHTML = '<option value="">— Select service —</option>'
      + (sessionSvcs.length
          ? `<optgroup label="Sessions">${sessionSvcs.map(renderSvcOption).join('')}</optgroup>`
          : '')
      + (addonSvcs.length
          ? `<optgroup label="Add-ons">${addonSvcs.map(renderSvcOption).join('')}</optgroup>`
          : '');
  }

  // Space dropdown — group Ceremonial (Temple / Dome), Yurts, Wellness
  // Rooms. Plus an "Other" escape hatch for unusual locations that aren't
  // real spaces.
  const spcSel = document.getElementById('nsSpace');
  if (spcSel) {
    const wellnessSpaces = allSpaces.filter(s => s.booking_category === 'wellness_room');
    const yurtSpaces     = allSpaces.filter(s => /yurt/i.test(s.name));
    const ceremonialSpaces = allSpaces.filter(s =>
      s.booking_category === 'rental_space' && !yurtSpaces.includes(s)
    );
    const otherSpaces = allSpaces.filter(s =>
      !wellnessSpaces.includes(s) && !yurtSpaces.includes(s) && !ceremonialSpaces.includes(s)
    );
    const renderSpcOption = s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`;
    const groups = [
      { label: 'Ceremonial',     items: ceremonialSpaces },
      { label: 'Yurts',          items: yurtSpaces },
      { label: 'Wellness Rooms', items: wellnessSpaces },
      { label: 'Other',          items: otherSpaces },
    ].filter(g => g.items.length);
    spcSel.innerHTML = '<option value="">— Select a space —</option>'
      + groups.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(renderSpcOption).join('')}</optgroup>`).join('')
      + '<option value="__other__">Other (specify location)</option>';
  }
}

function bindNewSessionModal() {
  document.getElementById('nsClose')?.addEventListener('click', closeNewSessionModal);
  document.getElementById('nsCancel')?.addEventListener('click', closeNewSessionModal);
  document.getElementById('nsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'nsModal') closeNewSessionModal();
  });
  document.getElementById('nsSave')?.addEventListener('click', saveNewSession);

  const svcSel = document.getElementById('nsService');
  const spcSel = document.getElementById('nsSpace');

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
          return `<button class="ns-client-row" data-id="${esc(r.id)}" data-name="${esc(name)}" data-email="${esc(r.email || '')}" style="display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;padding:0.5rem 0.7rem;background:none;border:none;border-bottom:1px solid #f3f4f6;font-family:inherit;cursor:pointer;">
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
    nsSelectedLeadName = btn.dataset.name || null;
    nsSelectedLeadEmail = btn.dataset.email || null;
    const nameEl = btn.querySelector('span');
    const selectedEl = document.getElementById('nsSelectedClient');
    selectedEl.style.display = '';
    selectedEl.innerHTML = `<strong>Selected:</strong> ${nameEl.innerHTML} <button id="nsClearClient" style="background:none;border:none;color:#d4883a;font-size:0.78rem;font-weight:600;cursor:pointer;margin-left:0.5rem;">change</button>`;
    document.getElementById('nsClearClient').addEventListener('click', () => {
      nsSelectedLeadId = null;
      nsSelectedLeadName = null;
      nsSelectedLeadEmail = null;
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

function openNewSessionModal({ prefilledStart = null, editSession = null } = {}) {
  nsEditingSessionId = editSession?.id || null;
  // Reset state
  nsSelectedLeadId = null;
  nsSelectedLeadName = null;
  nsSelectedLeadEmail = null;
  document.getElementById('nsClientSearch').value = '';
  document.getElementById('nsSelectedClient').style.display = 'none';
  document.getElementById('nsClientResults').style.display = 'none';
  document.getElementById('nsService').value = '';
  populateAssigneeOptions();
  const addFac = document.getElementById('nsAdditionalFacilitator');
  if (addFac) addFac.value = '';
  document.getElementById('nsEnd').value = '';
  document.getElementById('nsSpace').value = '';
  document.getElementById('nsOtherWrap').style.display = 'none';
  document.getElementById('nsOtherLocation').value = '';
  document.getElementById('nsNotes').value = '';
  hideNsError();
  hideNsConflict();
  nsHasHardConflict = false;
  refreshNsSaveButtonState();

  if (editSession) {
    // Pre-fill from the existing booking. Title + save-button labels switch
    // to edit phrasing so it's clear we're updating, not creating.
    setText('nsModalTitle', 'Edit Session');
    document.getElementById('nsSave').textContent = 'Save Changes';

    nsSelectedLeadId = editSession.lead_id;
    const lead = editSession.lead || {};
    const fullName = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim()
      || editSession.booker_name || lead.email || 'Client';
    nsSelectedLeadName = fullName;
    nsSelectedLeadEmail = lead.email || editSession.booker_email || null;
    const selectedEl = document.getElementById('nsSelectedClient');
    selectedEl.style.display = '';
    selectedEl.innerHTML = `<strong>Selected:</strong> ${esc(fullName)} <button id="nsClearClient" style="background:none;border:none;color:#d4883a;font-size:0.78rem;font-weight:600;cursor:pointer;margin-left:0.5rem;">change</button>`;
    document.getElementById('nsClearClient').addEventListener('click', () => {
      nsSelectedLeadId = null;
      nsSelectedLeadName = null;
      nsSelectedLeadEmail = null;
      selectedEl.style.display = 'none';
      selectedEl.innerHTML = '';
      document.getElementById('nsClientSearch').focus();
    });

    document.getElementById('nsService').value = editSession.service_id || '';

    // Map facilitator_id / staff_user_id back to the prefixed assignee value
    const assigneeSel = document.getElementById('nsAssignee');
    if (editSession.facilitator_id) assigneeSel.value = `fac:${editSession.facilitator_id}`;
    else if (editSession.staff_user_id) assigneeSel.value = `staff:${editSession.staff_user_id}`;
    else assigneeSel.value = '';

    if (addFac) addFac.value = editSession.additional_facilitator_id || '';

    const startD = new Date(editSession.start_datetime);
    const endD   = new Date(editSession.end_datetime);
    document.getElementById('nsDate').value = ymd(startD);
    document.getElementById('nsStart').value = `${String(startD.getHours()).padStart(2,'0')}:${String(startD.getMinutes()).padStart(2,'0')}`;
    document.getElementById('nsEnd').value   = `${String(endD.getHours()).padStart(2,'0')}:${String(endD.getMinutes()).padStart(2,'0')}`;

    document.getElementById('nsSpace').value = editSession.space_id || '';
    document.getElementById('nsNotes').value = editSession.notes || '';
  } else {
    setText('nsModalTitle', 'New Session');
    document.getElementById('nsSave').textContent = 'Create Session';
    // Pre-fill date + start time when launched by a grid click; default to
    // today + empty otherwise.
    if (prefilledStart) {
      document.getElementById('nsDate').value = ymd(prefilledStart);
      const hh = String(prefilledStart.getHours()).padStart(2, '0');
      const mm = String(prefilledStart.getMinutes()).padStart(2, '0');
      document.getElementById('nsStart').value = `${hh}:${mm}`;
    } else {
      document.getElementById('nsDate').value = ymd(new Date());
      document.getElementById('nsStart').value = '';
    }
  }

  document.getElementById('nsModal').classList.remove('hidden');
  setTimeout(() => {
    if (editSession) document.getElementById('nsService').focus();
    else document.getElementById('nsClientSearch').focus();
  }, 30);
}
function closeNewSessionModal() {
  document.getElementById('nsModal').classList.add('hidden');
}

// Populate the New Session modal's assignee dropdown with two optgroups:
// Facilitators (mapped to facilitator_id) and Staff (mapped to staff_user_id).
// The selected value is prefixed so the save handler can route it to the
// right column on scheduling_bookings.
function populateAssigneeOptions() {
  const sel = document.getElementById('nsAssignee');
  if (!sel) return;
  const facOptions = facilitators
    .map(f => {
      const name = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || 'Facilitator';
      return `<option value="fac:${esc(f.id)}">${esc(name)}</option>`;
    })
    .join('');
  const staffOptions = staffList
    .map(u => {
      const name = u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Staff';
      return `<option value="staff:${esc(u.id)}">${esc(name)}</option>`;
    })
    .join('');
  sel.innerHTML = '<option value="">— Select who\'s running this session —</option>'
    + (facOptions   ? `<optgroup label="Facilitators">${facOptions}</optgroup>`   : '')
    + (staffOptions ? `<optgroup label="Staff">${staffOptions}</optgroup>` : '');
  sel.value = '';

  // Additional facilitator (optional) — facilitators only since the concept
  // is a co-guide for ceremonies/ketamine sessions, not generic staff.
  const addSel = document.getElementById('nsAdditionalFacilitator');
  if (addSel) {
    addSel.innerHTML = '<option value="">— None —</option>'
      + facilitators.map(f => {
          const name = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || 'Facilitator';
          return `<option value="${esc(f.id)}">${esc(name)}</option>`;
        }).join('');
    addSel.value = '';
  }
}
function showNsError(msg) {
  const el = document.getElementById('nsError');
  el.textContent = msg; el.style.display = '';
}
function hideNsError() {
  const el = document.getElementById('nsError');
  el.style.display = 'none'; el.textContent = '';
}
function showNsConflict(msg, hard = false) {
  const el = document.getElementById('nsConflict');
  el.innerHTML = msg;
  el.style.display = '';
  // Hard conflicts get a red border to match the blocking semantics; soft
  // warnings stay yellow per the existing CSS.
  if (hard) {
    el.style.background = '#fee2e2';
    el.style.borderColor = '#dc2626';
    el.style.color = '#991b1b';
  } else {
    el.style.background = '';
    el.style.borderColor = '';
    el.style.color = '';
  }
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
// Parse "HH:MM" or "HH:MM:SS" (and forgiving variants) into minutes-of-day,
// or return null if it doesn't look like a time string. Used by the conflict
// checker so we can compare CRM event times to the buffered window without
// running into "14:00" vs "14:00:00" string-comparison bugs.
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mn)) return null;
  return h * 60 + mn;
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
// scheduling_bookings (other Within sessions), booking_spaces (venue
// rentals), and crm_leads (CRM-stage venue events). Shows a red banner and
// sets nsHasHardConflict=true if a real overlap exists, which blocks the
// save. Soft-only signals (CRM events without confirmed times) keep their
// yellow warning style without blocking.
//
// A 30-minute buffer is applied around every booking — back-to-back is
// only allowed if at least 30 minutes separate the two windows. This is
// implemented by expanding the user's [start, end] by 30 min on each side
// before checking for any overlap with existing bookings.
const BOOKING_BUFFER_MIN = 30;

async function runConflictCheck() {
  hideNsConflict();
  nsHasHardConflict = false;
  refreshNsSaveButtonState();

  const spaceId = document.getElementById('nsSpace').value;
  const date    = document.getElementById('nsDate').value;
  const start   = document.getElementById('nsStart').value;
  const end     = document.getElementById('nsEnd').value;

  if (!spaceId || spaceId === '__other__' || !date || !start || !end) return;

  const startDt = combineDateTimeLocal(date, start);
  const endDt   = combineDateTimeLocal(date, end);
  if (!startDt || !endDt || endDt <= startDt) return;

  // Expanded window includes the 30-minute buffer on each side
  const bufferedStart = new Date(startDt.getTime() - BOOKING_BUFFER_MIN * 60_000);
  const bufferedEnd   = new Date(endDt.getTime()   + BOOKING_BUFFER_MIN * 60_000);
  const startISO = bufferedStart.toISOString();
  const endISO   = bufferedEnd.toISOString();

  const [sessRes, venueRes, leadRes] = await Promise.all([
    // Other Within sessions on the same space, overlapping the buffered window
    supabase
      .from('scheduling_bookings')
      .select('id, start_datetime, end_datetime, status, lead:crm_leads(first_name, last_name)')
      .eq('space_id', spaceId)
      .is('cancelled_at', null)
      .neq('status', 'cancelled')
      .lt('start_datetime', endISO)
      .gt('end_datetime',   startISO),
    // Venue rentals (booking_spaces) — anything not cancelled is binding
    supabase
      .from('booking_spaces')
      .select('id, client_name, start_datetime, end_datetime, status, booking_type')
      .eq('space_id', spaceId)
      .neq('status', 'cancelled')
      .lt('start_datetime', endISO)
      .gt('end_datetime',   startISO),
    // CRM-stage venue events on this space — confirmed stages block too.
    // We pull all rows for this date and filter time client-side because
    // the CRM stores HH:MM(:SS) text, not timestamptz, and we need the
    // 2-hour fallback for events with no end_time recorded.
    supabase
      .from('crm_leads')
      .select('id, first_name, last_name, event_date, event_start_time, event_end_time, stage:crm_pipeline_stages(slug)')
      .eq('business_line', 'awkn_ranch')
      .eq('space_id', spaceId)
      .eq('event_date', date),
  ]);

  // Convert the buffered window to local minutes-of-day so we can compare
  // against the CRM lead's HH:MM(:SS) start/end strings consistently.
  const winStartMin = bufferedStart.getHours() * 60 + bufferedStart.getMinutes();
  const winEndMin   = bufferedEnd.getHours()   * 60 + bufferedEnd.getMinutes();

  const sessConflicts = sessRes.data || [];
  const venueRentalConflicts = venueRes.data || [];
  const venueConflicts = (leadRes.data || []).filter(lead => {
    const slug = (lead.stage?.slug || '').toLowerCase();
    if (!['invoice_paid', 'event_scheduled', 'event_complete', 'feedback_form_sent'].includes(slug)) return false;
    if (!lead.event_start_time) return true; // unknown start → can't reason about it, treat as conflict
    const eventStartMin = parseTimeToMinutes(lead.event_start_time);
    // If end time isn't set, assume a 2-hour block. Most ranch events are
    // multi-hour and a missing end_time used to be treated as an automatic
    // conflict, which made unrelated daytime sessions impossible to book.
    const eventEndMin = lead.event_end_time
      ? parseTimeToMinutes(lead.event_end_time)
      : eventStartMin + 120;
    if (eventStartMin == null || eventEndMin == null) return true;
    // Standard half-open overlap: two windows overlap iff a.start < b.end
    // AND a.end > b.start. The user's window is already buffered, so this
    // enforces the 30-minute gap rule without per-event work.
    return eventStartMin < winEndMin && eventEndMin > winStartMin;
  });

  const total = sessConflicts.length + venueRentalConflicts.length + venueConflicts.length;
  if (total === 0) return;

  // Any of these is a hard conflict — same space, same window, confirmed.
  nsHasHardConflict = true;
  refreshNsSaveButtonState();

  const lines = ['<strong>This space is already booked too close to this time (30-minute buffer required between bookings). Pick a different space or time.</strong>'];
  if (sessConflicts.length > 0) {
    const names = sessConflicts.map(s => ((s.lead?.first_name || '') + ' ' + (s.lead?.last_name || '')).trim() || 'Within client');
    lines.push(`• Within session${sessConflicts.length === 1 ? '' : 's'}: ${esc(names.join(', '))}`);
  }
  if (venueRentalConflicts.length > 0) {
    const names = venueRentalConflicts.map(v => v.client_name || 'venue rental');
    lines.push(`• Venue rental${venueRentalConflicts.length === 1 ? '' : 's'}: ${esc(names.join(', '))}`);
  }
  if (venueConflicts.length > 0) {
    const names = venueConflicts.map(v => ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || 'unnamed');
    lines.push(`• Venue event${venueConflicts.length === 1 ? '' : 's'}: ${esc(names.join(', '))}`);
  }
  showNsConflict(lines.join('<br>'), /* hard */ true);
}

// Disable Save while a hard conflict is on the form. Re-enabled when the
// user picks a different space/time and conflict check comes back clean.
function refreshNsSaveButtonState() {
  const btn = document.getElementById('nsSave');
  if (!btn) return;
  if (nsHasHardConflict) {
    btn.disabled = true;
    btn.title = 'This space is already booked at this time.';
  } else {
    btn.disabled = false;
    btn.title = '';
  }
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
  const assigneeVal = document.getElementById('nsAssignee').value;
  if (!assigneeVal) {
    showNsError('Select a facilitator or staff member running this session.');
    return;
  }
  const additionalFacilitatorId = document.getElementById('nsAdditionalFacilitator').value || null;
  // Don't let the same person be picked as both primary and additional —
  // confusing on the schedule and would double-book them under the unique
  // (facilitator_id, start_datetime) index if extended.
  const [primaryKind, primaryId] = assigneeVal.split(':');
  if (additionalFacilitatorId && primaryKind === 'fac' && primaryId === additionalFacilitatorId) {
    showNsError('Additional facilitator must be different from the primary.');
    return;
  }
  // Re-run the conflict check so we never insert against a stale flag, then
  // refuse if there's a real overlap.
  await runConflictCheck();
  if (nsHasHardConflict) {
    showNsError('That space is already booked at this time. Pick a different space or time.');
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

  // booker_name / booker_email are NOT NULL on scheduling_bookings (they
  // were originally for the public booking flow). For admin-created sessions
  // we stamp them from the selected Within client so the not-null constraint
  // passes; they'll match the lead row anyway.
  // assignee_chk requires one of profile_id / staff_user_id / facilitator_id
  // to be set; the assignee dropdown produces a "fac:..." or "staff:..."
  // value that we route to the matching column.
  const payload = {
    lead_id: nsSelectedLeadId,
    booker_name:  nsSelectedLeadName  || 'Within client',
    booker_email: nsSelectedLeadEmail || 'unknown@within.center',
    service_id: serviceId,
    space_id: spaceId,
    facilitator_id: primaryKind === 'fac'   ? primaryId : null,
    staff_user_id:  primaryKind === 'staff' ? primaryId : null,
    additional_facilitator_id: additionalFacilitatorId,
    start_datetime: startDt.toISOString(),
    end_datetime:   endDt.toISOString(),
    status: 'confirmed',
    notes: finalNotes,
  };

  const btn = document.getElementById('nsSave');
  const isEdit = !!nsEditingSessionId;
  btn.disabled = true; btn.textContent = isEdit ? 'Saving…' : 'Creating…';

  const { error } = isEdit
    ? await supabase.from('scheduling_bookings').update(payload).eq('id', nsEditingSessionId)
    : await supabase.from('scheduling_bookings').insert([payload]);

  btn.disabled = false; btn.textContent = isEdit ? 'Save Changes' : 'Create Session';

  if (error) {
    showNsError(`Could not ${isEdit ? 'save' : 'create'}: ` + error.message);
    return;
  }

  closeNewSessionModal();
  // After an edit, prompt about resending invites. The actual notification
  // delivery (email + Google Calendar update) for admin-driven session
  // changes isn't wired yet, so we capture intent and surface a clear
  // toast — the operator should still notify the client/facilitators
  // manually for now.
  if (isEdit) {
    const send = confirm('Send the updated session details to the client and facilitator(s)?');
    if (send) {
      showToast(
        'Notifications for admin-edited sessions aren\'t wired yet. Please notify the client and facilitator(s) manually for now.',
        'warning'
      );
    }
  }
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
