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
// Within client sessions whose space is a rentable venue space — these are
// overlaid on the events calendar in indigo so admins see ALL space usage
// (venue events + Within sessions) at a glance and can spot conflicts.
let withinSessions = [];
let filterState = {
  search: '',
  month:  'all',
  stage:  'all',
  space:  'all',
};
// View mode: 'list' (default — table of events) or 'calendar' (month grid).
// Persisted to localStorage so the user's last preference sticks.
let viewMode = 'list';
// Month being displayed in calendar mode (anchored at the 1st of the month
// in local time). Independent of the filterState.month dropdown.
let calMonthAnchor = startOfMonth(new Date());

(async function () {
  await initAdminPage({
    activeTab: 'venue-events',
    section: 'staff',
    requiredPermission: 'view_crm',
    onReady: async () => {
      // Restore last view-mode preference
      try {
        const saved = localStorage.getItem('awkn.venueEvents.viewMode');
        if (saved === 'calendar' || saved === 'list') viewMode = saved;
      } catch (e) { /* ignore */ }
      applyViewMode();

      await loadAll();
      bindControls();
      bindModals();
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

  // Within sessions need a 30s slack on the start to make sure we don't
  // miss anything that ends inside the window but starts before. We only
  // care about sessions tied to a rentable space (rental_space).
  const winStartISO = start.toISOString();
  const winEndISO = end.toISOString();

  const [leadsRes, stagesRes, spacesRes, withinRes] = await Promise.all([
    supabase
      .from('crm_leads')
      .select(`
        id, first_name, last_name, email, phone,
        event_date, event_end_date, event_start_time, event_end_time, event_type, guest_count,
        space_id, additional_space_ids, stage_id, estimated_value, actual_revenue,
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

    // Within sessions on a rentable venue space, in window. Inner-join the
    // space so non-rental spaces (wellness rooms, etc.) drop out — we only
    // overlay the ones that could actually clash with a venue rental.
    supabase
      .from('scheduling_bookings')
      .select(`
        id, space_id, start_datetime, end_datetime, status, lead_id,
        lead:crm_leads(first_name, last_name),
        space:spaces!inner(id, name, booking_category)
      `)
      .not('space_id', 'is', null)
      .is('cancelled_at', null)
      .neq('status', 'cancelled')
      .eq('space.booking_category', 'rental_space')
      .lt('start_datetime', winEndISO)
      .gt('end_datetime',   winStartISO),
  ]);

  if (leadsRes.error)  console.warn('events load error:', leadsRes.error);
  if (stagesRes.error) console.warn('stages load error:', stagesRes.error);
  if (spacesRes.error) console.warn('spaces load error:', spacesRes.error);
  if (withinRes.error) console.warn('within overlay load error:', withinRes.error);

  allEvents = leadsRes.data || [];
  allStages = stagesRes.data || [];
  allSpaces = spacesRes.data || [];

  // Normalize Within sessions into the same shape the calendar consumer
  // expects (event_date / event_start_time / event_end_time / space) so we
  // can drop them into eventsByDate without special-casing the layout. The
  // _isWithin flag is what the renderer + click handler key off of.
  withinSessions = (withinRes.data || []).map(s => {
    const startD = new Date(s.start_datetime);
    const endD   = new Date(s.end_datetime);
    return {
      id: `within-${s.id}`,
      _isWithin: true,
      _withinId: s.id,
      first_name: s.lead?.first_name || '',
      last_name:  s.lead?.last_name  || '',
      event_date: ymd(startD),
      event_start_time: hhmmss(startD),
      event_end_time:   hhmmss(endD),
      event_type: 'Within session',
      space_id:   s.space_id,
      space:      s.space,
      stage:      { slug: 'within', name: 'Within session' },
    };
  });

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

  // View toggle (List / Calendar)
  document.querySelectorAll('.ve-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === viewMode) return;
      viewMode = mode;
      try { localStorage.setItem('awkn.venueEvents.viewMode', mode); } catch (e) { /* ignore */ }
      applyViewMode();
      render();
    });
  });

  // Calendar month nav
  document.getElementById('calPrev')?.addEventListener('click', () => {
    calMonthAnchor = new Date(calMonthAnchor.getFullYear(), calMonthAnchor.getMonth() - 1, 1);
    if (viewMode === 'calendar') renderCalendar();
  });
  document.getElementById('calNext')?.addEventListener('click', () => {
    calMonthAnchor = new Date(calMonthAnchor.getFullYear(), calMonthAnchor.getMonth() + 1, 1);
    if (viewMode === 'calendar') renderCalendar();
  });
  document.getElementById('calToday')?.addEventListener('click', () => {
    calMonthAnchor = startOfMonth(new Date());
    if (viewMode === 'calendar') renderCalendar();
  });
}

function applyViewMode() {
  document.body.classList.toggle('ve-mode-calendar', viewMode === 'calendar');
  document.querySelectorAll('.ve-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === viewMode);
  });
  // The month-filter dropdown only really makes sense in list mode — it's
  // redundant with the calendar's own prev/next nav. Hide its label group
  // on calendar mode so the controls bar isn't confusing.
  const monthGroup = document.getElementById('monthFilter')?.closest('.ve-control-group');
  if (monthGroup) monthGroup.style.display = viewMode === 'calendar' ? 'none' : '';
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

// A booking is "confirmed" once it reaches the invoice_paid stage or any
// later stage (event_scheduled, event_complete, feedback_form_sent). The
// admin can also drop a lead straight into one of these stages to mark it
// confirmed manually without having gone through the proposal flow.
const CONFIRMED_STAGE_SLUGS = new Set([
  'invoice_paid',
  'event_scheduled',
  'event_complete',
  'feedback_form_sent',
]);
function isConfirmedBooking(lead) {
  return CONFIRMED_STAGE_SLUGS.has((lead?.stage?.slug || '').toLowerCase());
}

function render() {
  const filtered = applyFilters(allEvents);
  renderStats();
  renderTable(filtered);
  if (viewMode === 'calendar') renderCalendar();
}

// ============================================================================
// Calendar (month grid)
// ============================================================================
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function renderCalendar() {
  const month = calMonthAnchor.getMonth();
  const year  = calMonthAnchor.getFullYear();
  const monthLabel = calMonthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  setText('calMonth', monthLabel);

  // 6-week grid starting on Sunday so it's stable across months.
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back up to Sunday

  // Bucket events for the visible window by date for fast lookup.
  // Use the search/stage/space filters here too — calendar respects them —
  // but ignore the month-filter dropdown since calendar nav controls month.
  // Calendar only shows CONFIRMED bookings — stages from invoice_paid forward
  // — so the visualization stays clean and only commits show up. Earlier-
  // stage leads (inquiry, contacted, tour_call, proposal_sent) still show
  // in the list view so you can track the pipeline.
  // Confirmed venue events + every active Within session on a rentable
  // space. Within rows skip the stage gate (they're not in the CRM
  // pipeline) but still respect the stage/space/search filters so admins
  // can narrow the calendar normally.
  const visibleEvents = [...allEvents, ...withinSessions].filter(e => {
    if (!e.event_date) return false;
    if (!e._isWithin && !isConfirmedBooking(e)) return false;
    if (filterState.stage !== 'all' && e.stage?.slug !== filterState.stage) return false;
    if (filterState.space !== 'all' && e.space_id !== filterState.space) return false;
    if (filterState.search) {
      const hay = [
        e.first_name, e.last_name, e.email, e.phone,
        e.space?.name, e.event_type, e.notes, e.internal_staff_notes,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(filterState.search)) return false;
    }
    return true;
  });

  // Multi-day events get a tile on every day in [event_date, event_end_date]
  // (inclusive). Single-day events with no event_end_date just bucket on
  // event_date as before.
  const eventsByDate = new Map();
  for (const ev of visibleEvents) {
    const startStr = ev.event_date;
    const endStr = ev.event_end_date && ev.event_end_date >= startStr ? ev.event_end_date : startStr;
    if (startStr === endStr) {
      const arr = eventsByDate.get(startStr) || [];
      arr.push(ev);
      eventsByDate.set(startStr, arr);
    } else {
      const cur = new Date(startStr + 'T12:00:00');
      const end = new Date(endStr + 'T12:00:00');
      while (cur <= end) {
        const key = ymd(cur);
        const arr = eventsByDate.get(key) || [];
        arr.push(ev);
        eventsByDate.set(key, arr);
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  // Sort each day's events by start time.
  for (const arr of eventsByDate.values()) {
    arr.sort((a, b) => (a.event_start_time || '').localeCompare(b.event_start_time || ''));
  }

  const grid = document.getElementById('calGrid');
  if (!grid) return;
  const todayKey_ = todayKey();

  // Day-of-week headers
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headers = dows.map(d => `<div class="ve-cal-dow">${d}</div>`).join('');

  // 6 rows × 7 cols = 42 cells
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const dateKey = ymd(date);
    const isOther = date.getMonth() !== month;
    const isToday = dateKey === todayKey_;
    const dayNum = date.getDate();
    const dayEvents = eventsByDate.get(dateKey) || [];
    const visible = dayEvents.slice(0, 3);
    const overflow = dayEvents.length - visible.length;
    cells.push(`
      <div class="ve-cal-day ${isOther ? 'other-month' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateKey}">
        <div class="ve-cal-daynum">${dayNum}</div>
        ${visible.map(renderCalendarEvent).join('')}
        ${overflow > 0 ? `<div class="ve-cal-more">+${overflow} more</div>` : ''}
      </div>
    `);
  }
  grid.innerHTML = headers + cells.join('');

  // Click an event block → open the details modal.
  // Click an empty day cell → open the new-event modal pre-filled with that date.
  grid.querySelectorAll('.ve-cal-event').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // Within sessions live on the Within Schedule page — click bounces
      // there. Venue events open the existing details modal.
      if (el.dataset.withinSession) {
        window.location.href = 'within-schedule.html';
        return;
      }
      const id = el.dataset.leadId;
      if (id) openEventDetails(id);
    });
  });
  grid.querySelectorAll('.ve-cal-day').forEach(el => {
    el.addEventListener('click', (e) => {
      // Ignore clicks on the events themselves; those are handled above.
      if (e.target.closest('.ve-cal-event')) return;
      // Don't allow new events on dim "other-month" cells — too easy to misclick.
      if (el.classList.contains('other-month')) return;
      const date = el.dataset.date;
      if (date) openNewEventModal(date);
    });
  });
}

// ============================================================================
// Event details modal — read-only quick look + jump-to-CRM
// ============================================================================
function openEventDetails(leadId) {
  const ev = allEvents.find(x => x.id === leadId);
  if (!ev) {
    // Fallback: jump to CRM if we can't locate the event in the cached list.
    window.location.href = `crm.html?pillar=ranch&lead=${encodeURIComponent(leadId)}`;
    return;
  }

  const guest = ((ev.first_name || '') + ' ' + (ev.last_name || '')).trim() || '(unnamed)';
  // Date string handles single-day vs range automatically.
  const dateStr = ev.event_end_date && ev.event_end_date !== ev.event_date
    ? `${formatEventDate(ev.event_date)} – ${formatEventDate(ev.event_end_date)}`
    : formatEventDate(ev.event_date);
  const timeStr = formatTime(ev.event_start_time, ev.event_end_time);
  // Spaces: primary plus any extras, looked up from allSpaces.
  const extraNames = (ev.additional_space_ids || [])
    .map(id => allSpaces.find(s => s.id === id)?.name)
    .filter(Boolean);
  const allSpaceNames = [ev.space?.name, ...extraNames].filter(Boolean);
  const spaceStr = allSpaceNames.length ? allSpaceNames.join(', ') : '—';
  const stageName = ev.stage?.name || '—';
  const eventType = ev.event_type || '—';
  const guestCount = ev.guest_count != null ? String(ev.guest_count) : '—';
  const amount = ev.actual_revenue || ev.estimated_value
    ? formatMoney(Number(ev.actual_revenue || ev.estimated_value))
    : '—';

  setText('edTitle', guest);

  const body = document.getElementById('edBody');
  const rows = [];
  const row = (label, value) => `
    <div class="ve-modal-row">
      <span class="ve-modal-label">${esc(label)}</span>
      <span class="ve-modal-value">${value}</span>
    </div>
  `;
  rows.push(row('When', `${esc(dateStr)} · ${esc(timeStr)}`));
  rows.push(row(allSpaceNames.length > 1 ? 'Spaces' : 'Space', esc(spaceStr)));
  rows.push(row('Event type', esc(eventType)));
  rows.push(row('Guest count', esc(guestCount)));
  rows.push(row('Stage', esc(stageName)));
  rows.push(row('Estimated value', esc(amount)));
  if (ev.email)  rows.push(row('Email', esc(ev.email)));
  if (ev.phone)  rows.push(row('Phone', esc(ev.phone)));
  if (ev.notes)  rows.push(row('Notes', `<span style="white-space:pre-wrap;">${esc(ev.notes)}</span>`));
  if (ev.internal_staff_notes) rows.push(row('Internal notes', `<span style="white-space:pre-wrap;color:#92400e;">${esc(ev.internal_staff_notes)}</span>`));
  body.innerHTML = rows.join('');

  const foot = document.getElementById('edFoot');
  foot.innerHTML = `
    <button class="ve-btn" id="edCloseBtn">Close</button>
    <a class="ve-btn ve-btn-primary" href="crm.html?pillar=ranch&lead=${encodeURIComponent(leadId)}">Open in CRM</a>
  `;
  foot.querySelector('#edCloseBtn').addEventListener('click', closeEventDetails);

  document.getElementById('edModal').classList.remove('hidden');
}

function closeEventDetails() {
  document.getElementById('edModal').classList.add('hidden');
}

// ============================================================================
// New event modal — creates a crm_leads row tagged business_line='awkn_ranch'
// ============================================================================
function openNewEventModal(dateYmd) {
  // Reset fields
  document.getElementById('neFirstName').value = '';
  document.getElementById('neLastName').value = '';
  document.getElementById('neEmail').value = '';
  document.getElementById('nePhone').value = '';
  document.getElementById('neEventType').value = '';
  document.getElementById('neDate').value = dateYmd || '';
  document.getElementById('neEndDate').value = '';
  document.getElementById('neGuestCount').value = '';
  document.getElementById('neStart').value = '';
  document.getElementById('neEnd').value = '';
  document.getElementById('neEstimatedValue').value = '';
  document.getElementById('neNotes').value = '';
  hideError();

  // Populate space dropdown + extra-space checkboxes from the same list.
  const spaceSel = document.getElementById('neSpace');
  spaceSel.innerHTML = '<option value="">— Select a space —</option>'
    + allSpaces.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  spaceSel.value = '';

  const extras = document.getElementById('neExtraSpaces');
  if (extras) {
    extras.innerHTML = allSpaces.map(s => `
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" data-extra-space-id="${esc(s.id)}">
        ${esc(s.name)}
      </label>
    `).join('');
  }

  document.getElementById('neModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('neFirstName').focus(), 30);
}
function closeNewEventModal() {
  document.getElementById('neModal').classList.add('hidden');
}

function showError(msg) {
  const el = document.getElementById('neError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('neError').classList.add('hidden');
}

async function createNewEvent() {
  hideError();
  const firstName = document.getElementById('neFirstName').value.trim();
  const lastName  = document.getElementById('neLastName').value.trim();
  const email     = document.getElementById('neEmail').value.trim();
  const phone     = document.getElementById('nePhone').value.trim();
  const eventType = document.getElementById('neEventType').value;
  const dateVal   = document.getElementById('neDate').value;
  const endDateVal = document.getElementById('neEndDate').value || null;
  const guestStr  = document.getElementById('neGuestCount').value;
  const startTime = document.getElementById('neStart').value || null;
  const endTime   = document.getElementById('neEnd').value || null;
  const spaceId   = document.getElementById('neSpace').value || null;
  const estVal    = document.getElementById('neEstimatedValue').value;
  const notes     = document.getElementById('neNotes').value.trim() || null;
  const extraIds = Array.from(document.querySelectorAll('#neExtraSpaces input[data-extra-space-id]'))
    .filter(el => el.checked)
    .map(el => el.dataset.extraSpaceId)
    .filter(id => id !== spaceId);

  if (!firstName && !lastName && !email) {
    showError('Add a client name or email.');
    return;
  }
  if (!dateVal) {
    showError('Start date is required.');
    return;
  }
  if (endDateVal && endDateVal < dateVal) {
    showError('End date must be on or after the start date.');
    return;
  }
  if (startTime && endTime && endTime <= startTime) {
    showError('End time must be after the start time.');
    return;
  }

  // Default to the first stage in the AWKN Ranch pipeline.
  const firstStage = allStages.length > 0 ? allStages[0] : null;

  const payload = {
    business_line: 'awkn_ranch',
    first_name: firstName || null,
    last_name:  lastName || null,
    email:      email || null,
    phone:      phone || null,
    event_type: eventType || null,
    event_date: dateVal,
    event_end_date: endDateVal,
    event_start_time: startTime,
    event_end_time:   endTime,
    space_id:   spaceId,
    additional_space_ids: extraIds.length ? extraIds : null,
    guest_count: guestStr ? parseInt(guestStr, 10) : null,
    estimated_value: estVal ? Number(estVal) : null,
    notes,
    stage_id:   firstStage?.id || null,
  };

  const btn = document.getElementById('neCreate');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const { data, error } = await supabase
    .from('crm_leads')
    .insert([payload])
    .select(`
      id, first_name, last_name, email, phone,
      event_date, event_end_date, event_start_time, event_end_time, event_type, guest_count,
      space_id, additional_space_ids, stage_id, estimated_value, actual_revenue,
      deposit_amount, deposit_paid_at, balance_amount, balance_paid_at,
      notes, internal_staff_notes,
      space:spaces(id, name, slug),
      stage:crm_pipeline_stages(id, slug, name)
    `)
    .single();

  btn.disabled = false;
  btn.textContent = 'Create Event';

  if (error) {
    showError('Could not create event: ' + error.message);
    return;
  }

  // Insert the new event into our local cache and re-render so it shows up
  // immediately without a full reload.
  allEvents.push(data);
  closeNewEventModal();
  render();
}

function bindModals() {
  // Event details
  document.getElementById('edClose').addEventListener('click', closeEventDetails);
  document.getElementById('edModal').addEventListener('click', (e) => {
    if (e.target.id === 'edModal') closeEventDetails();
  });

  // New event
  document.getElementById('neClose').addEventListener('click', closeNewEventModal);
  document.getElementById('neCancel').addEventListener('click', closeNewEventModal);
  document.getElementById('neCreate').addEventListener('click', createNewEvent);
  document.getElementById('neModal').addEventListener('click', (e) => {
    if (e.target.id === 'neModal') closeNewEventModal();
  });

  // Esc closes whichever modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('edModal').classList.contains('hidden')) closeEventDetails();
    else if (!document.getElementById('neModal').classList.contains('hidden')) closeNewEventModal();
  });
}

function renderCalendarEvent(ev) {
  let cls = '';
  if (ev._isWithin) {
    cls = 'stage-within';
  } else {
    const slug = (ev.stage?.slug || '').toLowerCase();
    if (/lost/.test(slug)) cls = 'stage-lost';
    else if (/signed/.test(slug)) cls = 'stage-signed';
    else if (/deposit/.test(slug)) cls = 'stage-deposit';
    else if (/book|confirmed|scheduled/.test(slug)) cls = 'stage-confirmed';
  }

  const guest = ((ev.first_name || '') + ' ' + (ev.last_name || '')).trim() || '(unnamed)';
  const space = ev.space?.name ? ` · ${ev.space.name}` : '';
  const time  = ev.event_start_time ? `${formatHourMinShort(ev.event_start_time)} ` : '';
  const label = ev._isWithin ? `Within · ${guest}` : guest;
  const dataAttr = ev._isWithin
    ? `data-within-session="${esc(ev._withinId)}"`
    : `data-lead-id="${esc(ev.id)}"`;
  return `<div class="ve-cal-event ${cls}" ${dataAttr} title="${esc(`${label}${space}${ev.event_type && !ev._isWithin ? ` (${ev.event_type})` : ''}`)}">${esc(time)}${esc(label)}</div>`;
}

function formatHourMinShort(t) {
  if (!t) return '';
  if (!/^\d{1,2}:\d{2}/.test(t)) return t;
  const [h, m] = t.split(':');
  const hh = Number(h);
  const ampm = hh >= 12 ? 'p' : 'a';
  const h12 = ((hh + 11) % 12) + 1;
  return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

// Local 'HH:MM:SS' from a Date — matches the crm_leads.event_start_time
// shape so renderCalendarEvent's existing time formatter Just Works.
function hhmmss(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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
  // Multi-day events show the range; single-day shows just the start.
  const dateStr = e.event_end_date && e.event_end_date !== e.event_date
    ? `${formatEventDate(e.event_date)} – ${formatEventDate(e.event_end_date)}`
    : formatEventDate(e.event_date);
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
