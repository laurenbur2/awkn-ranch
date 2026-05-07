// Retreat House admin — calendar grid + stay creation/editing.
// Rows = beds (grouped by floor + room). Columns = dates (configurable window,
// default 14 days). Click an empty cell to create a new client_stays row;
// click an existing stay block to edit or cancel it. The booking modal is
// shared with the Lodging tab in clients.js.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';
import { openClientStayModal } from '../../shared/client-stay-modal.js';

const FLOOR_ORDER = ['downstairs', 'upstairs'];
const FLOOR_LABELS = { downstairs: 'Downstairs', upstairs: 'Upstairs' };
const DAYS_VISIBLE = 14;

let rooms = [];          // spaces with space_type='lodging'
let beds = [];           // ordered list of beds with space attached
let stays = [];          // raw client_stays with crm_leads + bed metadata
let viewStart = startOfDay(new Date());

(async function () {
  await initAdminPage({
    activeTab: 'retreat-overview',
    section: 'staff',
    requiredPermission: 'view_rentals',
    onReady: async () => {
      bindToolbar();
      await loadAll();
      render();
    },
  });
})();

// ============================================================================
// Data load
// ============================================================================

async function loadAll() {
  // Date window for stay query: pull anything that overlaps the visible 14 days.
  const winStart = new Date(viewStart);
  const winEnd = addDays(viewStart, DAYS_VISIBLE);

  const [roomsRes, bedsRes, staysRes] = await Promise.all([
    supabase
      .from('spaces')
      .select('id, name, slug, floor, has_private_bath, features')
      .eq('space_type', 'lodging')
      .eq('is_archived', false)
      .order('floor')
      .order('name'),
    supabase
      .from('beds')
      .select('id, space_id, label, bed_type, max_guests, nightly_rate_cents, sort_order')
      .eq('is_archived', false)
      .order('sort_order'),
    supabase
      .from('client_stays')
      .select('id, lead_id, bed_id, package_id, check_in_at, check_out_at, status, notes, lead:crm_leads(first_name, last_name, business_line)')
      .in('status', ['upcoming', 'active'])
      .lt('check_in_at', winEnd.toISOString())
      .gt('check_out_at', winStart.toISOString())
      .order('check_in_at'),
  ]);

  if (roomsRes.error) console.warn('rooms:', roomsRes.error);
  if (bedsRes.error)  console.warn('beds:', bedsRes.error);
  if (staysRes.error) console.warn('stays:', staysRes.error);

  rooms = roomsRes.data || [];

  // Attach the room object to each bed so we can group/sort.
  const roomById = Object.fromEntries(rooms.map(r => [r.id, r]));
  beds = (bedsRes.data || [])
    .map(b => ({ ...b, room: roomById[b.space_id] }))
    .filter(b => !!b.room)
    .sort((a, b) => {
      const fa = FLOOR_ORDER.indexOf(a.room.floor || '') ?? 99;
      const fb = FLOOR_ORDER.indexOf(b.room.floor || '') ?? 99;
      return fa - fb || a.room.name.localeCompare(b.room.name) || (a.sort_order - b.sort_order);
    });

  stays = staysRes.data || [];
}

// ============================================================================
// Rendering
// ============================================================================

function render() {
  renderStats();
  renderRange();
  renderGrid();
}

function renderStats() {
  const totalBeds = beds.length;
  const upcoming = stays.filter(s => s.status === 'upcoming').length;
  const now = Date.now();
  const activeNow = stays.filter(s => {
    const ci = new Date(s.check_in_at).getTime();
    const co = new Date(s.check_out_at).getTime();
    return ci <= now && co > now;
  }).length;

  setText('rhStatRooms', String(rooms.length));
  setText('rhStatBeds', String(totalBeds));
  setText('rhStatUpcoming', String(upcoming + activeNow));
  setText('rhStatActive', String(activeNow));
}

function renderRange() {
  const end = addDays(viewStart, DAYS_VISIBLE - 1);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  setText('rhRange', `${fmt(viewStart)} – ${fmt(end)}`);
}

function renderGrid() {
  const grid = document.getElementById('rhCalGrid');
  if (!grid) return;
  grid.style.setProperty('--rh-days', String(DAYS_VISIBLE));

  if (beds.length === 0) {
    grid.innerHTML = '<div class="rh-empty-state" style="grid-column:1/-1;">No retreat house beds configured.</div>';
    return;
  }

  const days = [];
  for (let i = 0; i < DAYS_VISIBLE; i++) days.push(addDays(viewStart, i));
  const todayKey = ymd(new Date());

  // Group stays by bed for fast lookup.
  const staysByBed = {};
  for (const s of stays) (staysByBed[s.bed_id] = staysByBed[s.bed_id] || []).push(s);

  // Build cells: header row, then floor headers + bed rows.
  const cells = [];

  // Top-left corner label
  cells.push(`<div class="rh-cal-headcell label-corner">Bed</div>`);
  // Date header cells
  for (const d of days) {
    const isToday = ymd(d) === todayKey;
    const dow = d.toLocaleDateString(undefined, { weekday: 'short' });
    const md  = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    cells.push(`<div class="rh-cal-headcell ${isToday ? 'today' : ''}">${dow}<br>${md}</div>`);
  }

  // Walk floors in order, then beds.
  let lastFloor = null;
  for (const bed of beds) {
    const floor = bed.room.floor || 'downstairs';
    if (floor !== lastFloor) {
      cells.push(`<div class="rh-cal-floor-row">${esc(FLOOR_LABELS[floor] || floor)}</div>`);
      lastFloor = floor;
    }

    // Bed label cell
    const rate = (bed.nightly_rate_cents || 0) / 100;
    const rateLabel = rate > 0 ? `$${rate.toFixed(0)}/night` : '';
    cells.push(`
      <div class="rh-cal-bed-label">
        <span class="rh-cal-bed-name">${esc(bed.room.name)} · ${esc(bed.label)}</span>
        <span class="rh-cal-bed-meta">${esc(bed.bed_type.replace('_',' '))} · ${esc(rateLabel)}</span>
      </div>
    `);

    // For each day, decide what goes there: stay block (if it starts here),
    // a continuation we've already painted (skip), or a clickable empty cell.
    const bedStays = (staysByBed[bed.id] || [])
      .map(s => ({ ...s, _ci: ymd(new Date(s.check_in_at)), _co: ymd(new Date(s.check_out_at)) }))
      .sort((a, b) => a._ci.localeCompare(b._ci));

    let i = 0;
    while (i < days.length) {
      const dayKey = ymd(days[i]);
      const dayObj = days[i];

      // Is there a stay starting on this day (or overlapping the start of the window)?
      const stayStartingHere = bedStays.find(s => {
        if (i === 0) return s._ci <= dayKey && s._co > dayKey;
        return s._ci === dayKey;
      });

      if (stayStartingHere) {
        // How many of the visible days does this stay cover from index i forward?
        let span = 0;
        for (let j = i; j < days.length; j++) {
          const k = ymd(days[j]);
          if (k >= stayStartingHere._ci && k < stayStartingHere._co) span++;
          else break;
        }
        if (span === 0) span = 1;

        const guest = ((stayStartingHere.lead?.first_name || '') + ' ' + (stayStartingHere.lead?.last_name || '')).trim() || 'Guest';
        const sourceClass = (stayStartingHere.lead?.business_line === 'within') ? 'source-within'
                          : (stayStartingHere.lead?.business_line === 'awkn_ranch') ? 'source-ranch'
                          : 'source-other';
        const sourceLabel = (stayStartingHere.lead?.business_line === 'within') ? 'Within'
                          : (stayStartingHere.lead?.business_line === 'awkn_ranch') ? 'Venue'
                          : 'Stay';
        cells.push(`
          <div class="rh-cal-stay ${sourceClass}" style="grid-column: span ${span};"
               data-stay-id="${stayStartingHere.id}">
            <span class="rh-cal-stay-source-pill">${sourceLabel}</span>
            <span>${esc(guest)}</span>
          </div>
        `);
        i += span;
      } else {
        const isWeekend = dayObj.getDay() === 0 || dayObj.getDay() === 6;
        const isToday = ymd(dayObj) === todayKey;
        cells.push(`
          <div class="rh-cal-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
               data-bed-id="${bed.id}" data-date="${dayKey}"></div>
        `);
        i++;
      }
    }
  }

  grid.innerHTML = cells.join('');
  bindGridHandlers(grid);
}

function bindGridHandlers(grid) {
  // Single delegated listener: dispatch to either an empty cell (create) or a stay block (edit).
  grid.addEventListener('click', async (e) => {
    const stayBlock = e.target.closest('.rh-cal-stay');
    if (stayBlock) {
      const stayId = stayBlock.dataset.stayId;
      const result = await openClientStayModal({ stayId });
      if (result?.saved) await reloadAndRender();
      return;
    }
    const cell = e.target.closest('.rh-cal-cell');
    if (cell && !cell.classList.contains('rh-stay-cell')) {
      const bedId = cell.dataset.bedId;
      const date  = cell.dataset.date;
      if (!bedId || !date) return;
      const checkIn = new Date(date + 'T00:00:00');
      const result = await openClientStayModal({
        bedId,
        checkIn,
        checkOut: addDays(checkIn, 1),
      });
      if (result?.saved) await reloadAndRender();
    }
  });
}

async function reloadAndRender() {
  await loadAll();
  render();
}

// ============================================================================
// Toolbar
// ============================================================================

function bindToolbar() {
  document.getElementById('rhPrev')?.addEventListener('click', async () => {
    viewStart = addDays(viewStart, -7);
    await reloadAndRender();
  });
  document.getElementById('rhNext')?.addEventListener('click', async () => {
    viewStart = addDays(viewStart, 7);
    await reloadAndRender();
  });
  document.getElementById('rhToday')?.addEventListener('click', async () => {
    viewStart = startOfDay(new Date());
    await reloadAndRender();
  });
  document.getElementById('rhNewStay')?.addEventListener('click', async () => {
    const result = await openClientStayModal({});
    if (result?.saved) await reloadAndRender();
  });
}

// ============================================================================
// Helpers
// ============================================================================

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
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
