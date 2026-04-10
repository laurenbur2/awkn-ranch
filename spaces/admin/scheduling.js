// Scheduling Dashboard — Google Calendar integration + booking management
import { supabase } from '../../shared/supabase.js';
import { showToast, initAdminPage, setupLightbox } from '../../shared/admin-shell.js';

let authState = null;
let profile = null;
let bookings = [];

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BOOKING_URL_PREFIX = 'https://laurenbur2.github.io/awkn-ranch/schedule/?staff=';
const GOOGLE_AUTH_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/google-calendar-auth';

// =============================================
// HELPERS
// =============================================

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// =============================================
// INIT
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'scheduling',
    requiredRole: 'staff',
    section: 'staff',
    onReady: async (state) => {
      authState = state;
      checkUrlParams();
      await loadData();
      render();
      setupEventListeners();
    },
  });
});

/** Check for ?connected=true in URL after Google OAuth redirect */
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === 'true') {
    showToast('Google Calendar connected successfully!', 'success');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// =============================================
// DATA
// =============================================

async function loadData() {
  // Load current user's scheduling profile
  const { data: p } = await supabase
    .from('scheduling_profiles')
    .select('*')
    .eq('app_user_id', authState.appUser.id)
    .single();

  profile = p;

  // Load bookings for this profile
  if (profile) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: b } = await supabase
      .from('scheduling_bookings')
      .select('*')
      .eq('profile_id', profile.id)
      .gte('start_datetime', sevenDaysAgo.toISOString())
      .order('start_datetime', { ascending: true });

    bookings = b || [];
  } else {
    bookings = [];
  }
}

// =============================================
// RENDER
// =============================================

function render() {
  renderCalendarStatus();
  renderAvailabilityForm();
  renderBookingsTable();
  updateStats();
}

function renderCalendarStatus() {
  const container = document.getElementById('calendarStatus');
  const isConnected = profile && profile.google_refresh_token;

  if (isConnected) {
    container.innerHTML = `
      <div class="sch-connect-box">
        <span class="sch-badge sch-badge--connected">Connected</span>
        <button class="sch-btn sch-btn--sm" id="btnReconnect">Reconnect</button>
      </div>
    `;
    document.getElementById('availabilitySection').classList.remove('hidden');
  } else {
    container.innerHTML = `
      <div class="sch-connect-box">
        <span class="sch-badge sch-badge--disconnected">Not Connected</span>
        <button class="sch-btn sch-btn--primary" id="btnConnect">Connect Google Calendar</button>
      </div>
    `;
    document.getElementById('availabilitySection').classList.add('hidden');
  }
}

function renderAvailabilityForm() {
  if (!profile) return;

  // Fill form fields
  document.getElementById('meetingDuration').value = profile.meeting_duration ?? 30;
  document.getElementById('bufferMinutes').value = profile.buffer_minutes ?? 15;
  document.getElementById('advanceDays').value = profile.advance_days ?? 30;
  document.getElementById('meetingTitle').value = profile.meeting_title ?? '';
  document.getElementById('meetingDescription').value = profile.meeting_description ?? '';
  document.getElementById('isBookable').checked = !!profile.is_bookable;
  document.getElementById('bookingSlug').value = profile.booking_slug ?? '';

  // Public URL
  const slug = profile.booking_slug || '';
  document.getElementById('publicUrl').textContent = slug ? BOOKING_URL_PREFIX + slug : '(set a booking slug first)';

  // Available hours grid
  const hoursGrid = document.getElementById('hoursGrid');
  const availableHours = profile.available_hours || {};

  hoursGrid.innerHTML = DAYS.map((day, i) => {
    const dayData = availableHours[day] || { enabled: false, start: '09:00', end: '17:00' };
    const isEnabled = !!dayData.enabled;
    const checked = isEnabled ? 'checked' : '';
    const disabled = isEnabled ? '' : 'disabled';
    const activeClass = isEnabled ? 'sch-day-circle--active' : '';
    return `
      <div class="sch-day-row ${isEnabled ? '' : 'sch-day-row--off'}">
        <div class="sch-day-toggle">
          <input type="checkbox" id="day_${day}" data-day="${day}" ${checked} class="sch-day-check">
          <span class="sch-day-circle ${activeClass}">${escapeHtml(DAY_LABELS[i])}</span>
        </div>
        <div class="sch-day-times">
          ${isEnabled ? `
            <input type="time" id="start_${day}" value="${escapeHtml(dayData.start || '09:00')}" ${disabled}>
            <span class="sch-day-sep">-</span>
            <input type="time" id="end_${day}" value="${escapeHtml(dayData.end || '17:00')}" ${disabled}>
            <button class="sch-day-remove" data-day="${day}" title="Remove">&times;</button>
          ` : `
            <input type="time" id="start_${day}" value="${escapeHtml(dayData.start || '09:00')}" disabled style="display:none">
            <input type="time" id="end_${day}" value="${escapeHtml(dayData.end || '17:00')}" disabled style="display:none">
            <span class="sch-day-unavailable">Unavailable</span>
            <button class="sch-day-add" data-day="${day}" title="Add hours">+</button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function renderBookingsTable() {
  const tbody = document.getElementById('bookingsTableBody');

  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="sch-empty">No bookings found.</td></tr>';
    return;
  }

  tbody.innerHTML = bookings.map(b => {
    const statusClass = `sch-status--${(b.status || 'confirmed').replace(/\s/g, '_')}`;
    return `
      <tr>
        <td>${escapeHtml(formatDateTime(b.start_datetime))}</td>
        <td>${escapeHtml(b.booker_name)}</td>
        <td>${escapeHtml(b.booker_email)}</td>
        <td>${escapeHtml(b.booker_phone || '—')}</td>
        <td><span class="sch-status ${statusClass}">${escapeHtml(b.status || 'confirmed')}</span></td>
      </tr>
    `;
  }).join('');
}

function updateStats() {
  // Connected calendars: 1 if current user is connected, 0 otherwise
  const isConnected = profile && profile.google_refresh_token;
  document.getElementById('statCalendars').textContent = isConnected ? '1' : '0';

  // Bookings this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBookings = bookings.filter(b => new Date(b.start_datetime) >= monthStart);
  document.getElementById('statMonthBookings').textContent = monthBookings.length;

  // Upcoming bookings
  const upcoming = bookings.filter(b => new Date(b.start_datetime) > now);
  document.getElementById('statUpcoming').textContent = upcoming.length;
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
  // Sub-tab switching
  document.querySelectorAll('.sch-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sch-subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sch-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panelId = 'panel' + btn.dataset.panel.charAt(0).toUpperCase() + btn.dataset.panel.slice(1);
      document.getElementById(panelId).classList.add('active');
    });
  });

  // Connect / Reconnect Google Calendar
  document.getElementById('calendarStatus').addEventListener('click', (e) => {
    if (e.target.id === 'btnConnect' || e.target.id === 'btnReconnect') {
      const url = `${GOOGLE_AUTH_URL}?action=start&user_id=${encodeURIComponent(authState.appUser.id)}`;
      window.location.href = url;
    }
  });

  // Day toggle, add/remove buttons
  document.getElementById('hoursGrid').addEventListener('click', (e) => {
    const addBtn = e.target.closest('.sch-day-add');
    const removeBtn = e.target.closest('.sch-day-remove');
    if (addBtn) {
      const day = addBtn.dataset.day;
      const checkbox = document.getElementById(`day_${day}`);
      if (checkbox) { checkbox.checked = true; renderAvailabilityForm(); }
    }
    if (removeBtn) {
      const day = removeBtn.dataset.day;
      const checkbox = document.getElementById(`day_${day}`);
      if (checkbox) { checkbox.checked = false; renderAvailabilityForm(); }
    }
  });

  document.getElementById('hoursGrid').addEventListener('change', (e) => {
    if (e.target.classList.contains('sch-day-check')) {
      renderAvailabilityForm();
    }
  });

  // Save settings
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  // Copy booking link
  document.getElementById('btnCopyLink').addEventListener('click', () => {
    const slug = profile?.booking_slug;
    if (!slug) {
      showToast('No booking slug set yet.', 'warning');
      return;
    }
    const url = BOOKING_URL_PREFIX + slug;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Booking link copied!', 'success');
    }).catch(() => {
      showToast('Failed to copy link.', 'error');
    });
  });
}

// =============================================
// SAVE
// =============================================

async function saveSettings() {
  if (!profile) {
    showToast('No scheduling profile found.', 'error');
    return;
  }

  // Collect available hours
  const availableHours = {};
  for (const day of DAYS) {
    const checkbox = document.getElementById(`day_${day}`);
    const start = document.getElementById(`start_${day}`);
    const end = document.getElementById(`end_${day}`);
    availableHours[day] = {
      enabled: checkbox.checked,
      start: start.value || '09:00',
      end: end.value || '17:00',
    };
  }

  const updates = {
    meeting_duration: parseInt(document.getElementById('meetingDuration').value, 10) || 30,
    buffer_minutes: parseInt(document.getElementById('bufferMinutes').value, 10) || 15,
    advance_days: parseInt(document.getElementById('advanceDays').value, 10) || 30,
    meeting_title: document.getElementById('meetingTitle').value.trim(),
    meeting_description: document.getElementById('meetingDescription').value.trim(),
    is_bookable: document.getElementById('isBookable').checked,
    available_hours: availableHours,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('scheduling_profiles')
    .update(updates)
    .eq('id', profile.id);

  if (error) {
    showToast('Failed to save settings: ' + error.message, 'error');
    return;
  }

  // Update local profile
  Object.assign(profile, updates);
  showToast('Settings saved!', 'success');
}
