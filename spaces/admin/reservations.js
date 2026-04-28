// Reservations Page - Booking Calendar Dashboard
// Manages house stays, rental spaces, and activity bookings

import { supabase } from '../../shared/supabase.js';
import { bookingService } from '../../shared/booking-service.js';
import {
  getAustinToday,
  getAustinTodayISO,
  formatDateAustin,
  formatDateTimeFull,
  AUSTIN_TIMEZONE,
} from '../../shared/timezone.js';
import {
  showToast,
  initAdminPage,
  setupLightbox,
} from '../../shared/admin-shell.js';

// =============================================
// STATE
// =============================================

let authState = null;

// Reference data (loaded once)
let allHouseSpaces = [];
let allRentalSpaces = [];
let allWellnessSpaces = [];
let allStaffMembers = [];
let allActivityTypes = [];

// Booking data (loaded per date range)
let roomBookings = [];
let spaceBookings = [];
let activityBookings = [];

// Calendar state
let currentDate = getAustinToday();
let currentView = 'day'; // day | week | month
// House Stays is now mirrored from the Retreat House Rooms page (clicking the
// House Stays subtab redirects there). Default active subtab is Rental Spaces
// so the master Schedule page doesn't try to render its own house calendar.
let currentTab = 'rentals';
let selectedStaffId = 'all'; // 'all' or specific staff UUID
let editingBooking = null; // { type, data } when editing

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  authState = await initAdminPage({
    activeTab: 'reservations',
    requiredRole: 'staff',
    section: 'staff',
    onReady: async (state) => {
      authState = state;
      setupLightbox();
      await loadReferenceData();
      await loadBookings();
      renderCalendar();
      updateStats();
      setupEventListeners();
    },
  });
});

// =============================================
// DATA LOADING
// =============================================

async function loadReferenceData() {
  const [house, rental, wellness, staff, activities] = await Promise.all([
    bookingService.getBookableSpaces('house_room'),
    bookingService.getBookableSpaces('rental_space'),
    bookingService.getBookableSpaces('wellness_room'),
    bookingService.getStaffMembers(),
    bookingService.getActivityTypes(),
  ]);
  allHouseSpaces = house;
  allRentalSpaces = rental;
  allWellnessSpaces = wellness;
  allStaffMembers = staff;
  allActivityTypes = activities;
  populateStaffFilter();
}

function populateStaffFilter() {
  const select = document.getElementById('staffFilter');
  if (!select) return;
  // Keep "All Staff" option, add individual staff
  select.innerHTML = `<option value="all">All Staff</option>` +
    allStaffMembers.map(s =>
      `<option value="${s.id}" ${selectedStaffId === s.id ? 'selected' : ''}>
        ${s.display_name}
      </option>`
    ).join('');
}

function getFilteredStaffColumns() {
  if (selectedStaffId === 'all') {
    return allStaffMembers.map(s => ({
      ...s,
      id: `staff-${s.id}`,
      _staffId: s.id,
      booking_name: s.display_name,
      _isStaff: true,
    }));
  }
  const staff = allStaffMembers.find(s => s.id === selectedStaffId);
  if (!staff) return [];
  return [{
    ...staff,
    id: `staff-${staff.id}`,
    _staffId: staff.id,
    booking_name: staff.display_name,
    _isStaff: true,
  }];
}

async function loadBookings() {
  const { start, end } = getDateRange();
  const startISO = start.toISOString().split('T')[0];
  const endISO = end.toISOString().split('T')[0];
  const startDT = start.toISOString();
  const endDT = end.toISOString();

  const [rooms, spaces, activities] = await Promise.all([
    bookingService.getRoomBookings(startISO, endISO),
    bookingService.getSpaceBookings(startDT, endDT),
    bookingService.getActivityBookings(startDT, endDT),
  ]);

  roomBookings = rooms;
  spaceBookings = spaces;
  activityBookings = activities;
}

async function updateStats() {
  try {
    const stats = await bookingService.getTodayStats();
    document.getElementById('statRooms').textContent = `${stats.occupiedRooms}/12`;
    document.getElementById('statSpaces').textContent = stats.activeSpaceRentals;
    document.getElementById('statActivities').textContent = stats.scheduledActivities;
  } catch (e) {
    console.warn('Stats load failed:', e);
  }
}

// =============================================
// DATE HELPERS
// =============================================

function getDateRange() {
  const d = new Date(currentDate);
  let start, end;

  if (currentView === 'day') {
    start = new Date(d);
    end = new Date(d);
    end.setDate(end.getDate() + 1);
  } else if (currentView === 'week') {
    const dow = d.getDay();
    start = new Date(d);
    start.setDate(d.getDate() - dow);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else {
    // month
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    // Extend to full weeks
    start.setDate(start.getDate() - start.getDay());
    end.setDate(end.getDate() + (6 - end.getDay()) + 1);
  }

  return { start, end };
}

function getDaysArray(start, end) {
  const days = [];
  const d = new Date(start);
  while (d < end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isToday(date) {
  const today = getAustinToday();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
}

function formatShortDate(date) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[date.getDay()]} ${date.getMonth()+1}/${date.getDate()}`;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// =============================================
// TOOLBAR & DATE DISPLAY
// =============================================

function updateToolbarDate() {
  const el = document.getElementById('toolbarDate');
  if (currentView === 'day') {
    el.textContent = formatDateAustin(currentDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } else if (currentView === 'week') {
    const { start, end } = getDateRange();
    const e = new Date(end); e.setDate(e.getDate() - 1);
    el.textContent = `${formatDateAustin(start, { month: 'short', day: 'numeric' })} – ${formatDateAustin(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    el.textContent = formatDateAustin(currentDate, { month: 'long', year: 'numeric' });
  }
}

function navigate(direction) {
  const d = new Date(currentDate);
  if (currentView === 'day') d.setDate(d.getDate() + direction);
  else if (currentView === 'week') d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  currentDate = d;
  refresh();
}

async function refresh() {
  updateToolbarDate();
  await loadBookings();
  renderCalendar();
}

// =============================================
// CALENDAR RENDERING DISPATCHER
// =============================================

function renderCalendar() {
  updateToolbarDate();

  if (currentTab === 'house') renderHouseCalendar();
  else if (currentTab === 'rentals') renderRentalsCalendar();
  else if (currentTab === 'activities') renderActivitiesCalendar();
  else if (currentTab === 'combined') renderCombinedCalendar();
}

// =============================================
// HOUSE STAYS - TIMELINE CALENDAR
// =============================================

function renderHouseCalendar() {
  const container = document.getElementById('calHouse');
  const { start, end } = getDateRange();
  const days = getDaysArray(start, end);
  const spaces = allHouseSpaces;

  if (!spaces.length) {
    container.innerHTML = '<div class="res-empty"><div class="res-empty-icon">🏠</div><div class="res-empty-text">No house rooms configured</div></div>';
    return;
  }

  const cols = days.length + 1; // +1 for label column
  let html = `<div class="tl-grid" style="grid-template-columns: minmax(120px, auto) repeat(${days.length}, minmax(32px, 1fr));">`;

  // Header row
  html += `<div class="tl-header-row">`;
  html += `<div class="tl-label-cell" style="border-bottom:1px solid var(--border)">Room</div>`;
  for (const day of days) {
    const todayCls = isToday(day) ? ' tl-today' : '';
    const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
    const dayLabel = day.getDate() === 1
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][day.getMonth()]} ${day.getDate()}`
      : day.getDate();
    const dowLabel = ['S','M','T','W','T','F','S'][day.getDay()];
    html += `<div class="tl-header-cell${todayCls}${weekendCls}"><div>${dowLabel}</div><div>${dayLabel}</div></div>`;
  }
  html += `</div>`;

  // Space rows
  for (const space of spaces) {
    html += `<div class="tl-row">`;
    html += `<div class="tl-label-cell">
      <div>${space.booking_name || space.name}</div>
      <div class="tl-label-rate">$${space.nightly_rate}/night</div>
    </div>`;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const todayCls = isToday(day) ? ' tl-today' : '';
      const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
      const dateStr = toDateStr(day);
      html += `<div class="tl-cell${todayCls}${weekendCls}" data-space="${space.id}" data-date="${dateStr}">`;

      // Find bookings that START on this day for this space
      const bookingsHere = roomBookings.filter(b =>
        b.space_id === space.id && b.check_in === dateStr
      );
      for (const bk of bookingsHere) {
        const nights = Math.ceil((new Date(bk.check_out) - new Date(bk.check_in)) / 86400000);
        const spanDays = Math.min(nights, days.length - i);
        const widthPct = (spanDays * 100);
        const color = bookingService.ROOM_STATUS_COLORS[bk.status] || '#d4883a';
        const holdCls = bk.status === 'hold' ? ' tl-booking--hold' : '';
        const label = bk.guest_name || 'Guest';
        html += `<div class="tl-booking${holdCls}" style="background:${color}; width:calc(${widthPct}% - 4px); left:2px;" data-booking-id="${bk.id}" data-booking-type="room" title="${label}: ${bk.check_in} to ${bk.check_out}">${label}</div>`;
      }

      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.tl-booking').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.bookingId;
      const booking = roomBookings.find(b => b.id === id);
      if (booking) openRoomBookingModal(booking);
    });
  });

  container.querySelectorAll('.tl-cell').forEach(el => {
    el.addEventListener('click', () => {
      const spaceId = el.dataset.space;
      const date = el.dataset.date;
      openRoomBookingModal(null, spaceId, date);
    });
  });
}

// =============================================
// RENTAL SPACES - TIME GRID CALENDAR
// =============================================

function renderRentalsCalendar() {
  const container = document.getElementById('calRentals');
  const spaces = [...allRentalSpaces, ...allWellnessSpaces];

  if (currentView === 'month') {
    renderRentalMonthView(container, spaces);
    return;
  }

  renderTimeGrid(container, spaces, spaceBookings, 'rental');
}

function renderRentalMonthView(container, spaces) {
  const { start, end } = getDateRange();
  const days = getDaysArray(start, end);

  const cols = days.length + 1;
  let html = `<div class="tl-grid" style="grid-template-columns: minmax(130px, auto) repeat(${days.length}, minmax(32px, 1fr));">`;

  // Header
  html += `<div class="tl-header-row"><div class="tl-label-cell">Space</div>`;
  for (const day of days) {
    const todayCls = isToday(day) ? ' tl-today' : '';
    const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
    const dayLabel = day.getDate() === 1
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][day.getMonth()]} ${day.getDate()}`
      : day.getDate();
    const dowLabel = ['S','M','T','W','T','F','S'][day.getDay()];
    html += `<div class="tl-header-cell${todayCls}${weekendCls}"><div>${dowLabel}</div><div>${dayLabel}</div></div>`;
  }
  html += `</div>`;

  for (const space of spaces) {
    const rate = space.hourly_rate ? `$${space.hourly_rate}/hr` : (space.staff_only ? 'Staff' : '');
    html += `<div class="tl-row"><div class="tl-label-cell"><div>${space.booking_name || space.name}</div><div class="tl-label-rate">${rate}</div></div>`;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dateStr = toDateStr(day);
      const todayCls = isToday(day) ? ' tl-today' : '';
      const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
      const hasBooking = spaceBookings.some(b => b.space_id === space.id && b.start_datetime.startsWith(dateStr));
      html += `<div class="tl-cell${todayCls}${weekendCls}" data-space="${space.id}" data-date="${dateStr}">`;
      if (hasBooking) {
        html += `<div style="position:absolute;inset:3px;border-radius:3px;background:rgba(37,99,235,0.2);"></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// =============================================
// ACTIVITIES - TIME GRID CALENDAR
// =============================================

function renderActivitiesCalendar() {
  const container = document.getElementById('calActivities');
  const staffCols = getFilteredStaffColumns();

  if (currentView === 'month') {
    renderActivityMonthView(container);
    return;
  }

  // Filter activity bookings if viewing single staff member
  const filteredActivities = selectedStaffId === 'all'
    ? activityBookings
    : activityBookings.filter(b => b.staff_member_id === selectedStaffId);

  renderTimeGrid(container, staffCols, filteredActivities, 'activity');
}

function renderActivityMonthView(container) {
  const { start, end } = getDateRange();
  const days = getDaysArray(start, end);

  let html = `<div class="tl-grid" style="grid-template-columns: minmax(100px, auto) repeat(${days.length}, minmax(32px, 1fr));">`;

  html += `<div class="tl-header-row"><div class="tl-label-cell">Staff</div>`;
  for (const day of days) {
    const todayCls = isToday(day) ? ' tl-today' : '';
    const dowLabel = ['S','M','T','W','T','F','S'][day.getDay()];
    const dayLabel = day.getDate();
    html += `<div class="tl-header-cell${todayCls}"><div>${dowLabel}</div><div>${dayLabel}</div></div>`;
  }
  html += `</div>`;

  for (const staff of allStaffMembers) {
    html += `<div class="tl-row"><div class="tl-label-cell"><div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${staff.color};display:inline-block"></span>${staff.display_name}</div></div>`;

    for (const day of days) {
      const dateStr = toDateStr(day);
      const todayCls = isToday(day) ? ' tl-today' : '';
      const count = activityBookings.filter(b => b.staff_member_id === staff.id && b.start_datetime.startsWith(dateStr)).length;
      html += `<div class="tl-cell${todayCls}">`;
      if (count > 0) {
        html += `<div style="position:absolute;inset:3px;border-radius:3px;background:${staff.color}22;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:600;color:${staff.color}">${count}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// =============================================
// SHARED TIME GRID RENDERER
// =============================================

function renderTimeGrid(container, columns, bookings, mode) {
  const { start } = getDateRange();
  const dayDate = currentView === 'day' ? [new Date(start)] : getDaysArray(start, new Date(start.getTime() + 7 * 86400000));

  // For day view with spaces: columns = spaces. For week view: columns = days (for each space? no, keep spaces as columns)
  // Simplify: day view = show all columns for that day. Week view for rentals = day columns per space gets complex.
  // Let's do: day view = columns are the spaces/staff. Week view = one day at a time with columns.

  // For simplicity, time grid always shows a single day with columns being the entities
  // Week view shows 7 mini time grids (too complex) — instead, default to day view for time-based calendars
  if (currentView === 'week') {
    // Render a day-per-section view for the week
    let html = '';
    for (const day of dayDate) {
      const dateStr = toDateStr(day);
      const dayBookings = bookings.filter(b => b.start_datetime && b.start_datetime.startsWith(dateStr));
      const isT = isToday(day);
      html += `<div style="margin-bottom:1rem">`;
      html += `<div class="combined-section-title" style="${isT ? 'color:var(--accent);' : ''}">${formatShortDate(day)}${isT ? ' (Today)' : ''}</div>`;
      html += renderSingleDayGrid(columns, dayBookings, mode, day);
      html += `</div>`;
    }
    container.innerHTML = html || '<div class="res-empty"><div class="res-empty-text">No data for this week</div></div>';
    attachTimeGridHandlers(container, mode);
    return;
  }

  // Day view: single time grid
  const dayBookings = bookings.filter(b => {
    if (!b.start_datetime) return false;
    return b.start_datetime.startsWith(toDateStr(currentDate));
  });

  container.innerHTML = renderSingleDayGrid(columns, dayBookings, mode, currentDate);
  attachTimeGridHandlers(container, mode);
}

function renderSingleDayGrid(columns, bookings, mode, date) {
  const startHour = 6;
  const endHour = 22;
  const totalSlots = (endHour - startHour) * 2; // 30-min slots
  const slotHeight = 24; // px

  const gridCols = `minmax(60px, auto) repeat(${columns.length}, minmax(120px, 1fr))`;
  let html = `<div class="tg-grid" style="grid-template-columns: ${gridCols}; grid-template-rows: auto repeat(${totalSlots}, ${slotHeight}px);">`;

  // Header row
  html += `<div class="tg-corner"></div>`;
  for (const col of columns) {
    const name = col.booking_name || col.display_name || col.name;
    const sub = col._isStaff
      ? `<span class="tg-col-header-sub" style="color:${col.color}">●</span>`
      : (col.staff_only ? '<span class="tg-col-header-sub">Staff Only</span>' : '');
    html += `<div class="tg-col-header">${name}${sub}</div>`;
  }

  // Time rows
  for (let slot = 0; slot < totalSlots; slot++) {
    const hour = startHour + Math.floor(slot / 2);
    const isHour = slot % 2 === 0;
    const isHalf = slot % 2 === 1;
    const cls = isHour ? 'tg-hour' : 'tg-half';

    // Time label
    if (isHour) {
      const label = hour <= 12 ? `${hour}${hour < 12 ? 'a' : 'p'}` : `${hour - 12}p`;
      html += `<div class="tg-time-label ${cls}">${label}</div>`;
    } else {
      html += `<div class="tg-time-label ${cls}"></div>`;
    }

    // Column cells
    for (const col of columns) {
      const colId = col._isStaff ? col._staffId : col.id;
      const staffOnly = col.staff_only ? ' tg-staff-only' : '';
      const slotTime = `${String(hour).padStart(2,'0')}:${isHour ? '00' : '30'}`;
      const dateStr = toDateStr(date);
      html += `<div class="tg-cell ${cls}${staffOnly}" data-col="${colId}" data-date="${dateStr}" data-time="${slotTime}" data-mode="${mode}" data-slot="${slot}">`;

      // Render bookings that start in this slot
      if (isHour || isHalf) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, isHour ? 0 : 30, 0, 0);

        const matchBookings = bookings.filter(b => {
          const bStart = new Date(b.start_datetime);
          const matchCol = mode === 'activity'
            ? b.staff_member_id === colId
            : b.space_id === colId;
          return matchCol &&
            bStart.getHours() === slotStart.getHours() &&
            bStart.getMinutes() === slotStart.getMinutes();
        });

        for (const bk of matchBookings) {
          const bStart = new Date(bk.start_datetime);
          const bEnd = new Date(bk.end_datetime);
          const durationMin = (bEnd - bStart) / 60000;
          const blockHeight = (durationMin / 30) * slotHeight;

          let color, title, sub;
          if (mode === 'activity') {
            color = bk.activity_type?.color || '#8B5CF6';
            title = bk.activity_type?.name || 'Activity';
            sub = `${bk.client_name || 'Client'} · ${bk.space?.booking_name || ''}`;
          } else {
            color = bookingService.SPACE_STATUS_COLORS[bk.status] || '#2563EB';
            title = bk.client_name || 'Client';
            sub = `${bk.booking_type} · $${bk.total_amount}`;
          }

          html += `<div class="tg-booking" style="background:${color}; height:${blockHeight}px;" data-booking-id="${bk.id}" data-booking-type="${mode}">
            <span class="tg-booking-title">${title}</span>
            <span class="tg-booking-sub">${sub}</span>
          </div>`;

          // Buffer zone for activities
          if (mode === 'activity' && bk.buffer_end) {
            const bufferMin = (new Date(bk.buffer_end) - bEnd) / 60000;
            if (bufferMin > 0) {
              const bufferHeight = (bufferMin / 30) * slotHeight;
              html += `<div class="tg-buffer" style="top:${blockHeight}px; height:${bufferHeight}px;">clean</div>`;
            }
          }
        }
      }

      html += `</div>`;
    }
  }

  html += `</div>`;
  return html;
}

function attachTimeGridHandlers(container, mode) {
  container.querySelectorAll('.tg-booking').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.bookingId;
      const type = el.dataset.bookingType;
      let booking;
      if (type === 'activity') booking = activityBookings.find(b => b.id === id);
      else booking = spaceBookings.find(b => b.id === id);
      if (booking) {
        if (type === 'activity') openActivityBookingModal(booking);
        else openSpaceBookingModal(booking);
      }
    });
  });

  container.querySelectorAll('.tg-cell').forEach(el => {
    el.addEventListener('click', () => {
      const colId = el.dataset.col;
      const date = el.dataset.date;
      const time = el.dataset.time;
      const m = el.dataset.mode;
      if (m === 'activity') openActivityBookingModal(null, null, date, time);
      else openSpaceBookingModal(null, colId, date, time);
    });
  });
}

// =============================================
// COMBINED VIEW
// =============================================

function renderCombinedCalendar() {
  const container = document.getElementById('calCombined');

  if (currentView === 'day') {
    // DAY VIEW: Full time grid with all columns (rental spaces + staff)
    // Plus a compact house stays bar at the top
    renderCombinedDayView(container);
  } else {
    // WEEK/MONTH VIEW: Unified timeline grid (date columns, entity rows)
    renderCombinedTimelineView(container);
  }
}

function renderCombinedDayView(container) {
  const dateStr = toDateStr(currentDate);

  // Build all columns: rental spaces + wellness rooms + staff members
  const columns = [];
  for (const s of [...allRentalSpaces, ...allWellnessSpaces]) {
    columns.push({
      id: s.id,
      booking_name: s.booking_name || s.name,
      staff_only: s.staff_only,
      _mode: 'rental',
    });
  }
  for (const s of allStaffMembers) {
    columns.push({
      id: `staff-${s.id}`,
      _staffId: s.id,
      booking_name: s.display_name,
      _isStaff: true,
      _mode: 'activity',
      color: s.color,
    });
  }

  // House stays compact bar at top
  const todayRoomBookings = roomBookings.filter(b => b.check_in <= dateStr && b.check_out > dateStr);
  let houseHtml = `<div class="combined-house-bar">`;
  houseHtml += `<div class="combined-house-bar-title">🏠 House Stays Today</div>`;
  houseHtml += `<div class="combined-house-chips">`;
  if (todayRoomBookings.length === 0) {
    houseHtml += `<span class="combined-house-chip combined-house-chip--empty">No house guests today</span>`;
  } else {
    for (const bk of todayRoomBookings) {
      const color = bookingService.ROOM_STATUS_COLORS[bk.status] || '#d4883a';
      const roomName = bk.space?.booking_name || bk.space?.name || 'Room';
      houseHtml += `<span class="combined-house-chip" style="background:${color}" data-booking-id="${bk.id}" data-booking-type="room">${roomName}: ${bk.guest_name || 'Guest'}</span>`;
    }
  }
  // Show vacancy
  const occupiedCount = todayRoomBookings.length;
  const totalBeds = allHouseSpaces.length;
  houseHtml += `<span class="combined-house-chip combined-house-chip--vacancy">${occupiedCount}/${totalBeds} beds occupied</span>`;
  houseHtml += `</div></div>`;

  // Time grid for spaces + activities
  const startHour = 6;
  const endHour = 22;
  const totalSlots = (endHour - startHour) * 2;
  const slotHeight = 28;

  const gridCols = `minmax(55px, auto) repeat(${columns.length}, minmax(100px, 1fr))`;
  let html = houseHtml;
  html += `<div class="tg-grid" style="grid-template-columns: ${gridCols}; grid-template-rows: auto repeat(${totalSlots}, ${slotHeight}px);">`;

  // Header row
  html += `<div class="tg-corner"></div>`;
  for (const col of columns) {
    const dot = col._isStaff ? `<span class="tg-col-header-sub" style="color:${col.color}">●</span>` : '';
    const staffTag = col.staff_only ? '<span class="tg-col-header-sub">Staff</span>' : '';
    html += `<div class="tg-col-header">${col.booking_name}${dot}${staffTag}</div>`;
  }

  // Time rows
  for (let slot = 0; slot < totalSlots; slot++) {
    const hour = startHour + Math.floor(slot / 2);
    const isHour = slot % 2 === 0;
    const cls = isHour ? 'tg-hour' : 'tg-half';

    // Time label
    if (isHour) {
      const label = hour <= 12 ? `${hour}${hour < 12 ? 'a' : 'p'}` : `${hour - 12}p`;
      html += `<div class="tg-time-label ${cls}">${label}</div>`;
    } else {
      html += `<div class="tg-time-label ${cls}"></div>`;
    }

    // Column cells
    for (const col of columns) {
      const colId = col._isStaff ? col._staffId : col.id;
      const mode = col._mode;
      const staffOnly = col.staff_only ? ' tg-staff-only' : '';
      const slotTime = `${String(hour).padStart(2,'0')}:${isHour ? '00' : '30'}`;

      html += `<div class="tg-cell ${cls}${staffOnly}" data-col="${colId}" data-date="${dateStr}" data-time="${slotTime}" data-mode="${mode}" data-slot="${slot}">`;

      // Find bookings starting at this slot
      const slotStart = new Date(currentDate);
      slotStart.setHours(hour, isHour ? 0 : 30, 0, 0);

      const allBookingsForCol = mode === 'activity'
        ? activityBookings.filter(b => b.staff_member_id === colId && b.start_datetime && b.start_datetime.startsWith(dateStr))
        : spaceBookings.filter(b => b.space_id === colId && b.start_datetime && b.start_datetime.startsWith(dateStr));

      const matchBookings = allBookingsForCol.filter(b => {
        const bStart = new Date(b.start_datetime);
        return bStart.getHours() === slotStart.getHours() && bStart.getMinutes() === slotStart.getMinutes();
      });

      for (const bk of matchBookings) {
        const bStart = new Date(bk.start_datetime);
        const bEnd = new Date(bk.end_datetime);
        const durationMin = (bEnd - bStart) / 60000;
        const blockHeight = (durationMin / 30) * slotHeight;

        let color, title, sub;
        if (mode === 'activity') {
          color = bk.activity_type?.color || '#8B5CF6';
          title = bk.activity_type?.name || 'Activity';
          sub = `${bk.client_name || 'Client'} · ${bk.space?.booking_name || ''}`;
        } else {
          color = bookingService.SPACE_STATUS_COLORS[bk.status] || '#2563EB';
          title = bk.client_name || 'Client';
          sub = `${bk.booking_type} · $${bk.total_amount}`;
        }

        html += `<div class="tg-booking" style="background:${color}; height:${blockHeight}px;" data-booking-id="${bk.id}" data-booking-type="${mode === 'activity' ? 'activity' : 'space'}">
          <span class="tg-booking-title">${title}</span>
          <span class="tg-booking-sub">${sub}</span>
        </div>`;

        // Buffer zone for activities
        if (mode === 'activity' && bk.buffer_end) {
          const bufferMin = (new Date(bk.buffer_end) - bEnd) / 60000;
          if (bufferMin > 0) {
            const bufferHeight = (bufferMin / 30) * slotHeight;
            html += `<div class="tg-buffer" style="top:${blockHeight}px; height:${bufferHeight}px;">clean</div>`;
          }
        }
      }

      html += `</div>`;
    }
  }

  html += `</div>`;
  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.combined-house-chip[data-booking-id]').forEach(el => {
    el.addEventListener('click', () => {
      const bk = roomBookings.find(b => b.id === el.dataset.bookingId);
      if (bk) openRoomBookingModal(bk);
    });
  });

  container.querySelectorAll('.tg-booking').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.bookingId;
      const type = el.dataset.bookingType;
      let booking;
      if (type === 'activity') booking = activityBookings.find(b => b.id === id);
      else booking = spaceBookings.find(b => b.id === id);
      if (booking) {
        if (type === 'activity') openActivityBookingModal(booking);
        else openSpaceBookingModal(booking);
      }
    });
  });

  container.querySelectorAll('.tg-cell').forEach(el => {
    el.addEventListener('click', () => {
      const colId = el.dataset.col;
      const date = el.dataset.date;
      const time = el.dataset.time;
      const mode = el.dataset.mode;
      if (mode === 'activity') openActivityBookingModal(null, null, date, time);
      else openSpaceBookingModal(null, colId, date, time);
    });
  });
}

function renderCombinedTimelineView(container) {
  const { start, end } = getDateRange();
  const days = getDaysArray(start, end);
  const rentalSpaces = [...allRentalSpaces, ...allWellnessSpaces];

  // Build unified row list with section headers
  const rows = [];
  rows.push({ _section: true, label: 'House Stays', icon: '🏠' });
  for (const s of allHouseSpaces) {
    rows.push({ ...s, _type: 'house', _label: s.booking_name || s.name, _sub: `$${s.nightly_rate}/night` });
  }
  rows.push({ _section: true, label: 'Rental Spaces', icon: '🏕️' });
  for (const s of rentalSpaces) {
    const rate = s.hourly_rate ? `$${s.hourly_rate}/hr` : (s.staff_only ? 'Staff' : '');
    rows.push({ ...s, _type: 'rental', _label: s.booking_name || s.name, _sub: rate });
  }
  rows.push({ _section: true, label: 'Activities', icon: '🧘' });
  for (const s of allStaffMembers) {
    rows.push({ ...s, _type: 'activity', _staffId: s.id, _label: s.display_name, _sub: '', _color: s.color });
  }

  const gridCols = `minmax(140px, auto) repeat(${days.length}, minmax(36px, 1fr))`;
  let html = `<div class="tl-grid tl-grid--combined" style="grid-template-columns: ${gridCols};">`;

  // Header
  html += `<div class="tl-header-row"><div class="tl-label-cell" style="border-bottom:1px solid var(--border)"></div>`;
  for (const day of days) {
    const todayCls = isToday(day) ? ' tl-today' : '';
    const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
    const dayLabel = day.getDate() === 1
      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][day.getMonth()]} ${day.getDate()}`
      : day.getDate();
    const dowLabel = ['S','M','T','W','T','F','S'][day.getDay()];
    html += `<div class="tl-header-cell${todayCls}${weekendCls}"><div>${dowLabel}</div><div>${dayLabel}</div></div>`;
  }
  html += `</div>`;

  for (const row of rows) {
    if (row._section) {
      html += `<div class="tl-section-header" style="grid-column: 1 / -1;">${row.icon} ${row.label}</div>`;
      continue;
    }

    html += `<div class="tl-row">`;
    const colorDot = row._color ? `<span style="width:8px;height:8px;border-radius:50%;background:${row._color};display:inline-block;flex-shrink:0"></span>` : '';
    html += `<div class="tl-label-cell"><div style="display:flex;align-items:center;gap:5px">${colorDot}${row._label}</div>${row._sub ? `<div class="tl-label-rate">${row._sub}</div>` : ''}</div>`;

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dateStr = toDateStr(day);
      const todayCls = isToday(day) ? ' tl-today' : '';
      const weekendCls = (day.getDay() === 0 || day.getDay() === 6) ? ' tl-weekend' : '';
      html += `<div class="tl-cell${todayCls}${weekendCls}" data-space="${row.id}" data-date="${dateStr}" data-row-type="${row._type}" data-staff-id="${row._staffId || ''}">`;

      if (row._type === 'house') {
        const bookingsHere = roomBookings.filter(b => b.space_id === row.id && b.check_in === dateStr);
        for (const bk of bookingsHere) {
          const nights = Math.ceil((new Date(bk.check_out) - new Date(bk.check_in)) / 86400000);
          const spanDays = Math.min(nights, days.length - i);
          const color = bookingService.ROOM_STATUS_COLORS[bk.status] || '#d4883a';
          const holdCls = bk.status === 'hold' ? ' tl-booking--hold' : '';
          html += `<div class="tl-booking${holdCls}" style="background:${color}; width:calc(${spanDays * 100}% - 4px); left:2px;" data-booking-id="${bk.id}" data-booking-type="room" title="${bk.guest_name || 'Guest'}: ${bk.check_in} to ${bk.check_out}">${bk.guest_name || 'Guest'}</div>`;
        }
      } else if (row._type === 'rental') {
        const dayBk = spaceBookings.filter(b => b.space_id === row.id && b.start_datetime?.startsWith(dateStr));
        for (const bk of dayBk) {
          const color = bookingService.SPACE_STATUS_COLORS[bk.status] || '#2563EB';
          const t = new Date(bk.start_datetime);
          const timeStr = `${t.getHours() % 12 || 12}${t.getHours() < 12 ? 'a' : 'p'}`;
          html += `<div class="tl-booking" style="background:${color}; width:calc(100% - 4px); left:2px;" data-booking-id="${bk.id}" data-booking-type="space" title="${bk.client_name || 'Client'} · ${timeStr}">${timeStr} ${bk.client_name || ''}</div>`;
        }
      } else if (row._type === 'activity') {
        const dayBk = activityBookings.filter(b => b.staff_member_id === row._staffId && b.start_datetime?.startsWith(dateStr));
        for (const bk of dayBk) {
          const color = bk.activity_type?.color || '#8B5CF6';
          const t = new Date(bk.start_datetime);
          const timeStr = `${t.getHours() % 12 || 12}${t.getHours() < 12 ? 'a' : 'p'}`;
          html += `<div class="tl-booking" style="background:${color}; width:calc(100% - 4px); left:2px; font-size:0.55rem;" data-booking-id="${bk.id}" data-booking-type="activity" title="${bk.activity_type?.name || 'Activity'} · ${timeStr}">${timeStr} ${bk.activity_type?.name || ''}</div>`;
        }
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.tl-booking').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.bookingId;
      const type = el.dataset.bookingType;
      let booking;
      if (type === 'room') booking = roomBookings.find(b => b.id === id);
      else if (type === 'space') booking = spaceBookings.find(b => b.id === id);
      else booking = activityBookings.find(b => b.id === id);
      if (booking) {
        if (type === 'room') openRoomBookingModal(booking);
        else if (type === 'space') openSpaceBookingModal(booking);
        else openActivityBookingModal(booking);
      }
    });
  });

  container.querySelectorAll('.tl-cell').forEach(el => {
    el.addEventListener('click', () => {
      const rowType = el.dataset.rowType;
      const spaceId = el.dataset.space;
      const date = el.dataset.date;
      if (rowType === 'house') openRoomBookingModal(null, spaceId, date);
      else if (rowType === 'rental') openSpaceBookingModal(null, spaceId, date, '10:00');
      else openActivityBookingModal(null, null, date, '10:00');
    });
  });
}

// =============================================
// MODAL - ROOM BOOKING
// =============================================

function openRoomBookingModal(booking = null, presetSpaceId = null, presetDate = null) {
  const isEdit = !!booking;
  editingBooking = isEdit ? { type: 'room', data: booking } : null;

  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Room Booking' : 'New Room Booking';
  document.getElementById('modalDelete').classList.toggle('hidden', !isEdit);

  // Default dates
  const today = getAustinTodayISO();
  const checkIn = isEdit ? booking.check_in : (presetDate || today);
  const tomorrow = new Date(checkIn);
  tomorrow.setDate(tomorrow.getDate() + 2);
  const checkOut = isEdit ? booking.check_out : toDateStr(tomorrow);

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="res-form-group">
      <label class="res-form-label">Room</label>
      <select class="res-form-select" id="frmRoomSpace">
        ${allHouseSpaces.map(s => `<option value="${s.id}" data-rate="${s.nightly_rate}" ${(isEdit ? booking.space_id : presetSpaceId) === s.id ? 'selected' : ''}>${s.booking_name || s.name} — $${s.nightly_rate}/night</option>`).join('')}
      </select>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Guest Name</label>
      <input type="text" class="res-form-input" id="frmRoomGuest" value="${isEdit ? (booking.guest_name || '') : ''}" placeholder="Guest name">
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Check In</label>
        <input type="date" class="res-form-input" id="frmRoomCheckIn" value="${checkIn}">
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Check Out</label>
        <input type="date" class="res-form-input" id="frmRoomCheckOut" value="${checkOut}">
      </div>
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Status</label>
        <select class="res-form-select" id="frmRoomStatus">
          <option value="hold" ${isEdit && booking.status === 'hold' ? 'selected' : ''}>Hold</option>
          <option value="confirmed" ${!isEdit || booking.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="checked_in" ${isEdit && booking.status === 'checked_in' ? 'selected' : ''}>Checked In</option>
          <option value="checked_out" ${isEdit && booking.status === 'checked_out' ? 'selected' : ''}>Checked Out</option>
          <option value="no_show" ${isEdit && booking.status === 'no_show' ? 'selected' : ''}>No Show</option>
        </select>
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Source</label>
        <select class="res-form-select" id="frmRoomSource">
          <option value="direct" ${isEdit && booking.source === 'direct' ? 'selected' : ''}>Direct</option>
          <option value="phone" ${isEdit && booking.source === 'phone' ? 'selected' : ''}>Phone</option>
          <option value="online" ${isEdit && booking.source === 'online' ? 'selected' : ''}>Online</option>
          <option value="walk_in" ${isEdit && booking.source === 'walk_in' ? 'selected' : ''}>Walk-in</option>
          <option value="airbnb" ${isEdit && booking.source === 'airbnb' ? 'selected' : ''}>Airbnb</option>
        </select>
      </div>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Notes</label>
      <textarea class="res-form-textarea" id="frmRoomNotes" rows="2">${isEdit ? (booking.notes || '') : ''}</textarea>
    </div>
    <div class="res-form-total">
      <span>Total</span>
      <span class="res-form-total-amount" id="frmRoomTotal">$0</span>
    </div>
    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:0.25rem; text-align:right">
      Arrival 11 AM · Departure 12 PM · 2-night minimum
    </div>
  `;

  // Calculate total on change
  const calcTotal = () => {
    const rate = parseFloat(document.getElementById('frmRoomSpace').selectedOptions[0]?.dataset.rate || 0);
    const ci = document.getElementById('frmRoomCheckIn').value;
    const co = document.getElementById('frmRoomCheckOut').value;
    if (ci && co) {
      const { nights, total } = bookingService.calculateRoomTotal(rate, ci, co);
      document.getElementById('frmRoomTotal').textContent = `$${total.toLocaleString()} (${nights} nights)`;
    }
  };

  document.getElementById('frmRoomSpace').addEventListener('change', calcTotal);
  document.getElementById('frmRoomCheckIn').addEventListener('change', calcTotal);
  document.getElementById('frmRoomCheckOut').addEventListener('change', calcTotal);
  calcTotal();

  showModal();
}

// =============================================
// MODAL - SPACE BOOKING
// =============================================

function openSpaceBookingModal(booking = null, presetSpaceId = null, presetDate = null, presetTime = null) {
  const isEdit = !!booking;
  editingBooking = isEdit ? { type: 'space', data: booking } : null;

  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Space Rental' : 'New Space Rental';
  document.getElementById('modalDelete').classList.toggle('hidden', !isEdit);

  const spaces = [...allRentalSpaces, ...allWellnessSpaces];
  const defaultDate = presetDate || getAustinTodayISO();
  const defaultTime = presetTime || '10:00';

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="res-form-group">
      <label class="res-form-label">Space</label>
      <select class="res-form-select" id="frmSpaceSpace">
        ${spaces.map(s => `<option value="${s.id}" data-hourly="${s.hourly_rate || ''}" data-overnight="${s.overnight_rate || ''}" data-fullday="${s.full_day_rate || ''}" data-cleaning="${s.cleaning_fee || 0}" ${(isEdit ? booking.space_id : presetSpaceId) === s.id ? 'selected' : ''}>${s.booking_name || s.name}${s.staff_only ? ' (Staff)' : ''}</option>`).join('')}
      </select>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Booking Type</label>
      <select class="res-form-select" id="frmSpaceType">
        <option value="hourly" ${isEdit && booking.booking_type === 'hourly' ? 'selected' : ''}>Hourly</option>
        <option value="full_day" ${isEdit && booking.booking_type === 'full_day' ? 'selected' : ''}>Full Day</option>
        <option value="overnight" ${isEdit && booking.booking_type === 'overnight' ? 'selected' : ''}>Overnight</option>
      </select>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Client Name</label>
      <input type="text" class="res-form-input" id="frmSpaceClient" value="${isEdit ? (booking.client_name || '') : ''}" placeholder="Client name">
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Start Date</label>
        <input type="date" class="res-form-input" id="frmSpaceStartDate" value="${isEdit ? booking.start_datetime.split('T')[0] : defaultDate}">
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Start Time</label>
        <input type="time" class="res-form-input" id="frmSpaceStartTime" value="${isEdit ? booking.start_datetime.split('T')[1]?.substring(0,5) : defaultTime}">
      </div>
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">End Date</label>
        <input type="date" class="res-form-input" id="frmSpaceEndDate" value="${isEdit ? booking.end_datetime.split('T')[0] : defaultDate}">
      </div>
      <div class="res-form-group">
        <label class="res-form-label">End Time</label>
        <input type="time" class="res-form-input" id="frmSpaceEndTime" value="${isEdit ? booking.end_datetime.split('T')[1]?.substring(0,5) : '12:00'}">
      </div>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Notes</label>
      <textarea class="res-form-textarea" id="frmSpaceNotes" rows="2">${isEdit ? (booking.notes || '') : ''}</textarea>
    </div>
    <div class="res-form-total">
      <span>Total</span>
      <span class="res-form-total-amount" id="frmSpaceTotal">$0</span>
    </div>
  `;

  showModal();
}

// =============================================
// MODAL - ACTIVITY BOOKING
// =============================================

function openActivityBookingModal(booking = null, presetStaffId = null, presetDate = null, presetTime = null) {
  const isEdit = !!booking;
  editingBooking = isEdit ? { type: 'activity', data: booking } : null;

  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Activity' : 'New Activity';
  document.getElementById('modalDelete').classList.toggle('hidden', !isEdit);

  const defaultDate = presetDate || getAustinTodayISO();
  const defaultTime = presetTime || '10:00';
  const allSpacesForActivity = [...allWellnessSpaces, ...allRentalSpaces];

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="res-form-group">
      <label class="res-form-label">Activity</label>
      <select class="res-form-select" id="frmActivityType">
        ${allActivityTypes.map(a => `<option value="${a.id}" data-duration="${a.default_duration_min}" data-buffer="${a.buffer_min}" data-color="${a.color}" data-price="${a.price || ''}" ${isEdit && booking.activity_type_id === a.id ? 'selected' : ''}>${a.name} (${a.default_duration_min}min + ${a.buffer_min}min clean)</option>`).join('')}
      </select>
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Staff</label>
        <select class="res-form-select" id="frmActivityStaff">
          ${allStaffMembers.map(s => `<option value="${s.id}" ${(isEdit ? booking.staff_member_id : presetStaffId) == s.id ? 'selected' : ''}>${s.display_name}</option>`).join('')}
        </select>
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Space</label>
        <select class="res-form-select" id="frmActivitySpace">
          ${allSpacesForActivity.map(s => `<option value="${s.id}" ${isEdit && booking.space_id === s.id ? 'selected' : ''}>${s.booking_name || s.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Client Name</label>
      <input type="text" class="res-form-input" id="frmActivityClient" value="${isEdit ? (booking.client_name || '') : ''}" placeholder="Client name">
    </div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Date</label>
        <input type="date" class="res-form-input" id="frmActivityDate" value="${isEdit ? booking.start_datetime.split('T')[0] : defaultDate}">
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Start Time</label>
        <input type="time" class="res-form-input" id="frmActivityTime" value="${isEdit ? booking.start_datetime.split('T')[1]?.substring(0,5) : defaultTime}">
      </div>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Price</label>
      <input type="number" class="res-form-input" id="frmActivityPrice" value="${isEdit ? (booking.price || '') : ''}" placeholder="0.00" step="0.01">
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Notes</label>
      <textarea class="res-form-textarea" id="frmActivityNotes" rows="2">${isEdit ? (booking.notes || '') : ''}</textarea>
    </div>
  `;

  showModal();
}

// =============================================
// MODAL HELPERS
// =============================================

function showModal() {
  document.getElementById('bookingModalOverlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('bookingModalOverlay').classList.add('hidden');
  editingBooking = null;
}

// =============================================
// STAFF MANAGER MODAL
// =============================================

function openStaffManagerModal() {
  editingBooking = { type: 'staff_manager', data: null };
  document.getElementById('modalTitle').textContent = 'Manage Staff';
  document.getElementById('modalDelete').classList.add('hidden');
  document.getElementById('modalSave').textContent = 'Done';

  const body = document.getElementById('modalBody');
  let html = `<div class="staff-manager">`;

  // Existing staff list
  html += `<div class="staff-manager-list">`;
  for (const s of allStaffMembers) {
    html += `<div class="staff-manager-item" data-staff-id="${s.id}">
      <span class="staff-manager-color" style="background:${s.color}"></span>
      <span class="staff-manager-name">${s.display_name}</span>
      <span class="staff-manager-email">${s.email || ''}</span>
    </div>`;
  }
  if (allStaffMembers.length === 0) {
    html += `<div class="staff-manager-empty">No staff members yet</div>`;
  }
  html += `</div>`;

  // Add new staff form
  html += `<div class="staff-manager-add">
    <div class="staff-manager-add-title">Add Staff Member</div>
    <div class="res-form-row">
      <div class="res-form-group">
        <label class="res-form-label">Name</label>
        <input type="text" class="res-form-input" id="frmStaffName" placeholder="Display name">
      </div>
      <div class="res-form-group">
        <label class="res-form-label">Color</label>
        <input type="color" class="res-form-input" id="frmStaffColor" value="#8B5CF6" style="height:38px; padding:2px;">
      </div>
    </div>
    <div class="res-form-group">
      <label class="res-form-label">Email (optional)</label>
      <input type="email" class="res-form-input" id="frmStaffEmail" placeholder="email@example.com">
    </div>
    <button class="res-btn res-btn--primary" id="btnAddStaff" style="margin-top:0.5rem; width:100%;">
      + Add Staff Member
    </button>
  </div>`;

  html += `</div>`;
  body.innerHTML = html;

  // Add staff handler
  document.getElementById('btnAddStaff').addEventListener('click', async () => {
    const name = document.getElementById('frmStaffName').value.trim();
    const color = document.getElementById('frmStaffColor').value;
    const email = document.getElementById('frmStaffEmail').value.trim();

    if (!name) {
      showToast('Please enter a staff name', 'error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('staff_members')
        .insert({ display_name: name, color, email: email || null, is_active: true })
        .select()
        .single();

      if (error) throw error;

      allStaffMembers.push(data);
      populateStaffFilter();
      showToast(`${name} added as staff`, 'success');
      openStaffManagerModal(); // Re-render to show updated list
    } catch (e) {
      showToast('Failed to add staff: ' + e.message, 'error');
    }
  });

  showModal();
}

// =============================================
// SAVE HANDLERS
// =============================================

async function handleSave() {
  try {
    // Staff manager — just close
    if (editingBooking?.type === 'staff_manager') {
      hideModal();
      document.getElementById('modalSave').textContent = 'Save Booking';
      renderCalendar();
      return;
    }

    if (editingBooking) {
      // Update existing
      if (editingBooking.type === 'room') await saveRoomBooking(editingBooking.data.id);
      else if (editingBooking.type === 'space') await saveSpaceBooking(editingBooking.data.id);
      else if (editingBooking.type === 'activity') await saveActivityBooking(editingBooking.data.id);
    } else {
      // Determine type from current tab
      if (currentTab === 'house') await saveRoomBooking();
      else if (currentTab === 'rentals') await saveSpaceBooking();
      else if (currentTab === 'activities') await saveActivityBooking();
      else {
        // Combined — need to detect from modal content
        if (document.getElementById('frmRoomSpace')) await saveRoomBooking();
        else if (document.getElementById('frmSpaceSpace')) await saveSpaceBooking();
        else if (document.getElementById('frmActivityType')) await saveActivityBooking();
      }
    }

    hideModal();
    await refresh();
    updateStats();
    showToast('Booking saved', 'success');
  } catch (e) {
    console.error('Save error:', e);
    showToast(e.message || 'Failed to save booking', 'error');
  }
}

async function saveRoomBooking(existingId = null) {
  const data = {
    space_id: document.getElementById('frmRoomSpace').value,
    guest_name: document.getElementById('frmRoomGuest').value.trim(),
    check_in: document.getElementById('frmRoomCheckIn').value,
    check_out: document.getElementById('frmRoomCheckOut').value,
    nightly_rate: parseFloat(document.getElementById('frmRoomSpace').selectedOptions[0]?.dataset.rate || 0),
    status: document.getElementById('frmRoomStatus').value,
    source: document.getElementById('frmRoomSource').value,
    notes: document.getElementById('frmRoomNotes').value.trim() || null,
  };

  if (!data.guest_name) throw new Error('Guest name is required');
  if (!data.check_in || !data.check_out) throw new Error('Check-in and check-out dates are required');

  const nights = Math.ceil((new Date(data.check_out) - new Date(data.check_in)) / 86400000);
  if (nights < 2) throw new Error('Minimum 2-night stay required');

  data.total_amount = nights * data.nightly_rate;

  // Check conflicts
  const conflicts = await bookingService.checkSpaceConflicts(
    data.space_id,
    `${data.check_in}T11:00:00`,
    `${data.check_out}T12:00:00`,
    existingId
  );
  if (conflicts.length) {
    throw new Error(`Conflict: this room is already booked for overlapping dates`);
  }

  if (existingId) {
    await bookingService.updateRoomBooking(existingId, data);
  } else {
    data.created_by = authState?.appUser?.id || null;
    await bookingService.createRoomBooking(data);
  }
}

async function saveSpaceBooking(existingId = null) {
  const startDate = document.getElementById('frmSpaceStartDate').value;
  const startTime = document.getElementById('frmSpaceStartTime').value;
  const endDate = document.getElementById('frmSpaceEndDate').value;
  const endTime = document.getElementById('frmSpaceEndTime').value;

  const data = {
    space_id: document.getElementById('frmSpaceSpace').value,
    client_name: document.getElementById('frmSpaceClient').value.trim(),
    booking_type: document.getElementById('frmSpaceType').value,
    start_datetime: `${startDate}T${startTime}:00`,
    end_datetime: `${endDate}T${endTime}:00`,
    notes: document.getElementById('frmSpaceNotes').value.trim() || null,
    total_amount: 0, // will calculate
  };

  if (!data.client_name) throw new Error('Client name is required');

  // Simple total calc
  const spaceOpt = document.getElementById('frmSpaceSpace').selectedOptions[0];
  const hourlyRate = parseFloat(spaceOpt.dataset.hourly || 0);
  const overnightRate = parseFloat(spaceOpt.dataset.overnight || 0);
  const fullDayRate = parseFloat(spaceOpt.dataset.fullday || 0);
  const cleaningFee = parseFloat(spaceOpt.dataset.cleaning || 0);

  if (data.booking_type === 'hourly') {
    const hours = (new Date(data.end_datetime) - new Date(data.start_datetime)) / 3600000;
    data.hourly_rate = hourlyRate;
    data.total_amount = hours * hourlyRate + cleaningFee;
    // Add 30-min buffer to end time for the calendar block
    const bufferedEnd = new Date(new Date(data.end_datetime).getTime() + 30 * 60000);
    // Note: buffer is visual only, not stored in booking_spaces
  } else if (data.booking_type === 'full_day') {
    data.flat_rate = fullDayRate;
    data.total_amount = fullDayRate + cleaningFee;
  } else {
    data.flat_rate = overnightRate;
    data.total_amount = overnightRate + cleaningFee;
  }
  data.cleaning_fee = cleaningFee;

  if (existingId) {
    await bookingService.updateSpaceBooking(existingId, data);
  } else {
    data.created_by = authState?.appUser?.id || null;
    await bookingService.createSpaceBooking(data);
  }
}

async function saveActivityBooking(existingId = null) {
  const typeEl = document.getElementById('frmActivityType');
  const date = document.getElementById('frmActivityDate').value;
  const time = document.getElementById('frmActivityTime').value;
  const durationMin = parseInt(typeEl.selectedOptions[0]?.dataset.duration || 60);
  const bufferMin = parseInt(typeEl.selectedOptions[0]?.dataset.buffer || 30);

  const startDT = new Date(`${date}T${time}:00`);
  const endDT = new Date(startDT.getTime() + durationMin * 60000);
  const bufferEnd = new Date(endDT.getTime() + bufferMin * 60000);

  const data = {
    activity_type_id: parseInt(typeEl.value),
    staff_member_id: parseInt(document.getElementById('frmActivityStaff').value),
    space_id: document.getElementById('frmActivitySpace').value,
    client_name: document.getElementById('frmActivityClient').value.trim(),
    start_datetime: startDT.toISOString(),
    end_datetime: endDT.toISOString(),
    buffer_end: bufferEnd.toISOString(),
    price: parseFloat(document.getElementById('frmActivityPrice').value) || null,
    notes: document.getElementById('frmActivityNotes').value.trim() || null,
  };

  // Check staff conflicts
  const staffConflicts = await bookingService.checkStaffConflicts(
    data.staff_member_id,
    data.start_datetime,
    data.buffer_end,
    existingId
  );
  if (staffConflicts.length) {
    const conflictName = staffConflicts[0].activity_type?.name || 'another activity';
    throw new Error(`Staff conflict: already assigned to ${conflictName} at this time`);
  }

  // Check space conflicts
  const spaceConflicts = await bookingService.checkSpaceConflicts(
    data.space_id,
    data.start_datetime,
    data.buffer_end,
    existingId
  );
  if (spaceConflicts.length) {
    throw new Error(`Space conflict: this room is already booked at this time`);
  }

  if (existingId) {
    await bookingService.updateActivityBooking(existingId, data);
  } else {
    data.created_by = authState?.appUser?.id || null;
    await bookingService.createActivityBooking(data);
  }
}

async function handleDelete() {
  if (!editingBooking) return;
  if (!confirm('Cancel this booking?')) return;

  try {
    if (editingBooking.type === 'room') await bookingService.cancelRoomBooking(editingBooking.data.id);
    else if (editingBooking.type === 'space') await bookingService.cancelSpaceBooking(editingBooking.data.id);
    else if (editingBooking.type === 'activity') await bookingService.cancelActivityBooking(editingBooking.data.id);

    hideModal();
    await refresh();
    updateStats();
    showToast('Booking cancelled', 'info');
  } catch (e) {
    showToast(e.message || 'Failed to cancel', 'error');
  }
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
  // Sub-tab switching
  document.getElementById('resSubtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.res-subtab');
    if (!btn) return;

    // House Stays mirrors the Retreat House Rooms tab — that view already has
    // per-bed rendering with Within client stays, venue-renter stays, and
    // public stays color-coded by source. Redirecting there keeps a single
    // source of truth for house occupancy instead of a parallel calendar.
    if (btn.dataset.tab === 'house') {
      const pillarParam = new URL(window.location.href).searchParams.get('pillar') || 'master';
      window.location.href = `retreat-house.html?pillar=${encodeURIComponent(pillarParam)}`;
      return;
    }

    document.querySelectorAll('.res-subtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentTab = btn.dataset.tab;

    document.querySelectorAll('.res-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel${currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}`).classList.add('active');

    // Re-render active calendar
    renderCalendar();
  });

  // View toggle (day/week/month)
  document.getElementById('viewToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.res-view-btn');
    if (!btn) return;

    document.querySelectorAll('.res-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentView = btn.dataset.view;
    refresh();
  });

  // Staff filter dropdown (Activities tab)
  document.getElementById('staffFilter')?.addEventListener('change', (e) => {
    selectedStaffId = e.target.value;
    renderCalendar();
  });

  // Manage Staff button
  document.getElementById('btnManageStaff')?.addEventListener('click', () => {
    openStaffManagerModal();
  });

  // Navigation
  document.getElementById('btnPrev').addEventListener('click', () => navigate(-1));
  document.getElementById('btnNext').addEventListener('click', () => navigate(1));
  document.getElementById('btnToday').addEventListener('click', () => {
    currentDate = getAustinToday();
    refresh();
  });

  // New booking
  document.getElementById('btnNewBooking').addEventListener('click', () => {
    if (currentTab === 'house') openRoomBookingModal();
    else if (currentTab === 'rentals') openSpaceBookingModal();
    else if (currentTab === 'activities') openActivityBookingModal();
    else openRoomBookingModal(); // default for combined
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', hideModal);
  document.getElementById('modalCancel').addEventListener('click', hideModal);
  document.getElementById('modalSave').addEventListener('click', handleSave);
  document.getElementById('modalDelete').addEventListener('click', handleDelete);

  document.getElementById('bookingModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideModal();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });
}
