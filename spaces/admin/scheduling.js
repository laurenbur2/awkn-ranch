// Scheduling Dashboard — Google Calendar + multi-event-type bookings
import { supabase } from '../../shared/supabase.js';
import { showToast, initAdminPage, setupLightbox } from '../../shared/admin-shell.js';

let authState = null;
let profile = null;
let eventTypes = [];
let bookings = [];
let editingEventTypeId = null; // null = creating new; uuid = editing existing

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const SITE_BASE = 'https://laurenbur2.github.io/awkn-ranch';
const GOOGLE_AUTH_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/google-calendar-auth';

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function publicUrl(profileSlug, eventSlug) {
  if (!profileSlug || !eventSlug) return '';
  return `${SITE_BASE}/schedule/?p=${encodeURIComponent(profileSlug)}&e=${encodeURIComponent(eventSlug)}`;
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

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === 'true') {
    showToast('Google Calendar connected.', 'success');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// =============================================
// DATA
// =============================================

async function loadData() {
  const { data: p } = await supabase
    .from('scheduling_profiles')
    .select('*')
    .eq('app_user_id', authState.appUser.id)
    .maybeSingle();
  profile = p || null;

  if (profile) {
    const { data: et } = await supabase
      .from('scheduling_event_types')
      .select('*')
      .eq('profile_id', profile.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    eventTypes = et || [];

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
    eventTypes = [];
    bookings = [];
  }
}

// =============================================
// RENDER
// =============================================

function render() {
  renderCalendarStatus();
  renderProfileForm();
  renderEventTypesList();
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
    document.getElementById('profileSection').classList.remove('hidden');
    document.getElementById('eventTypesSection').classList.remove('hidden');
  } else {
    container.innerHTML = `
      <div class="sch-connect-box">
        <span class="sch-badge sch-badge--disconnected">Not Connected</span>
        <button class="sch-btn sch-btn--primary" id="btnConnect">Connect Google Calendar</button>
      </div>
    `;
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('eventTypesSection').classList.add('hidden');
  }
}

function renderProfileForm() {
  if (!profile) return;

  document.getElementById('bookingSlug').value = profile.booking_slug ?? '';
  document.getElementById('timezone').value = profile.timezone ?? 'America/Chicago';
  document.getElementById('isBookable').checked = !!profile.is_bookable;

  const hoursGrid = document.getElementById('hoursGrid');
  const availableHours = profile.available_hours || {};

  hoursGrid.innerHTML = DAYS.map((day, i) => {
    const dayData = availableHours[day] || { enabled: false, start: '09:00', end: '17:00' };
    const isEnabled = !!dayData.enabled;
    const checked = isEnabled ? 'checked' : '';
    const activeClass = isEnabled ? 'sch-day-circle--active' : '';
    return `
      <div class="sch-day-row ${isEnabled ? '' : 'sch-day-row--off'}">
        <div class="sch-day-toggle">
          <input type="checkbox" id="day_${day}" data-day="${day}" ${checked} class="sch-day-check">
          <label for="day_${day}" class="sch-day-circle ${activeClass}">${escapeHtml(DAY_LABELS[i])}</label>
        </div>
        <div class="sch-day-times">
          ${isEnabled ? `
            <input type="time" id="start_${day}" value="${escapeHtml(dayData.start || '09:00')}">
            <span class="sch-day-sep">-</span>
            <input type="time" id="end_${day}" value="${escapeHtml(dayData.end || '17:00')}">
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

function renderEventTypesList() {
  const container = document.getElementById('eventTypesList');
  if (!eventTypes.length) {
    container.innerHTML = `<div class="sch-empty-card">No event types yet. Click "+ Add Event Type" to create one.</div>`;
    return;
  }

  const profileSlug = profile?.booking_slug || '';
  container.innerHTML = eventTypes.map(et => {
    const url = publicUrl(profileSlug, et.slug);
    const locationLabel = {
      video: 'Video', phone: 'Phone', in_person: 'In person', custom: 'Custom',
    }[et.location_type] || et.location_type || '—';
    return `
      <div class="sch-event-card ${et.is_active ? '' : 'sch-event-card--inactive'}" data-id="${escapeHtml(et.id)}">
        <div class="sch-event-card-main">
          <div class="sch-event-card-color" style="background:${escapeHtml(et.color || '#d4883a')}"></div>
          <div class="sch-event-card-body">
            <div class="sch-event-card-title">${escapeHtml(et.name)} <span class="sch-event-card-meta">${et.duration_minutes} min · ${escapeHtml(locationLabel)}${et.is_active ? '' : ' · inactive'}</span></div>
            ${et.description ? `<div class="sch-event-card-desc">${escapeHtml(et.description)}</div>` : ''}
            <div class="sch-event-card-url">
              <span class="sch-event-card-url-text">${escapeHtml(url)}</span>
              <button class="sch-btn sch-btn--sm" data-copy-url="${escapeHtml(url)}">Copy</button>
            </div>
          </div>
        </div>
        <div class="sch-event-card-actions">
          <button class="sch-btn sch-btn--sm" data-edit="${escapeHtml(et.id)}">Edit</button>
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
  const isConnected = profile && profile.google_refresh_token;
  document.getElementById('statCalendars').textContent = isConnected ? '1' : '0';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('statMonthBookings').textContent = bookings.filter(b => new Date(b.start_datetime) >= monthStart).length;
  document.getElementById('statUpcoming').textContent = bookings.filter(b => new Date(b.start_datetime) > now).length;
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
  // Sub-tabs
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
      window.location.href = `${GOOGLE_AUTH_URL}?action=start&user_id=${encodeURIComponent(authState.appUser.id)}`;
    }
  });

  // Hours grid — add/remove day
  document.getElementById('hoursGrid').addEventListener('click', (e) => {
    const addBtn = e.target.closest('.sch-day-add');
    const removeBtn = e.target.closest('.sch-day-remove');
    if (addBtn) {
      const day = addBtn.dataset.day;
      document.getElementById(`day_${day}`).checked = true;
      flushHoursToProfile();
      renderProfileForm();
    }
    if (removeBtn) {
      const day = removeBtn.dataset.day;
      document.getElementById(`day_${day}`).checked = false;
      flushHoursToProfile();
      renderProfileForm();
    }
  });
  document.getElementById('hoursGrid').addEventListener('change', (e) => {
    if (e.target.classList.contains('sch-day-check')) {
      flushHoursToProfile();
      renderProfileForm();
    }
  });

  // Save profile
  document.getElementById('btnSaveProfile').addEventListener('click', saveProfile);

  // Event types
  document.getElementById('btnAddEventType').addEventListener('click', () => openEventTypeModal(null));
  document.getElementById('eventTypesList').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const copyBtn = e.target.closest('[data-copy-url]');
    if (editBtn) openEventTypeModal(editBtn.dataset.edit);
    if (copyBtn) {
      const url = copyBtn.dataset.copyUrl;
      navigator.clipboard.writeText(url).then(
        () => showToast('Booking link copied.', 'success'),
        () => showToast('Copy failed.', 'error'),
      );
    }
  });

  // Modal
  const modal = document.getElementById('eventTypeModal');
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined) closeEventTypeModal();
  });
  document.getElementById('btnEventTypeSave').addEventListener('click', saveEventType);
  document.getElementById('btnEventTypeDelete').addEventListener('click', deleteEventType);

  // Auto-generate slug from name when creating
  document.getElementById('etName').addEventListener('input', (e) => {
    if (editingEventTypeId) return;
    const slugField = document.getElementById('etSlug');
    if (!slugField.dataset.touched) slugField.value = slugify(e.target.value);
  });
  document.getElementById('etSlug').addEventListener('input', (e) => {
    e.target.dataset.touched = '1';
  });
}

function flushHoursToProfile() {
  // Keep profile.available_hours in sync with the DOM so re-render preserves times
  if (!profile) return;
  const hours = {};
  for (const day of DAYS) {
    const cb = document.getElementById(`day_${day}`);
    const start = document.getElementById(`start_${day}`);
    const end = document.getElementById(`end_${day}`);
    hours[day] = {
      enabled: cb?.checked || false,
      start: start?.value || '09:00',
      end: end?.value || '17:00',
    };
  }
  profile.available_hours = hours;
}

// =============================================
// PROFILE SAVE
// =============================================

async function saveProfile() {
  if (!profile) return showToast('No profile loaded.', 'error');
  flushHoursToProfile();

  const updates = {
    timezone: document.getElementById('timezone').value.trim() || 'America/Chicago',
    is_bookable: document.getElementById('isBookable').checked,
    available_hours: profile.available_hours,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('scheduling_profiles')
    .update(updates)
    .eq('id', profile.id);

  if (error) return showToast('Save failed: ' + error.message, 'error');
  Object.assign(profile, updates);
  showToast('Profile saved.', 'success');
}

// =============================================
// EVENT TYPE MODAL
// =============================================

function openEventTypeModal(id) {
  editingEventTypeId = id;
  const modal = document.getElementById('eventTypeModal');
  const title = document.getElementById('eventTypeModalTitle');
  const deleteBtn = document.getElementById('btnEventTypeDelete');
  const slugField = document.getElementById('etSlug');

  const et = id ? eventTypes.find(e => e.id === id) : null;

  title.textContent = et ? 'Edit Event Type' : 'New Event Type';
  deleteBtn.classList.toggle('hidden', !et);
  slugField.readOnly = !!et;
  slugField.dataset.touched = et ? '1' : '';

  document.getElementById('etName').value = et?.name ?? '';
  document.getElementById('etSlug').value = et?.slug ?? '';
  document.getElementById('etDuration').value = et?.duration_minutes ?? 30;
  document.getElementById('etDescription').value = et?.description ?? '';
  document.getElementById('etLocationType').value = et?.location_type ?? 'video';
  document.getElementById('etLocationDetail').value = et?.location_detail ?? '';
  document.getElementById('etBuffer').value = et?.buffer_minutes ?? 0;
  document.getElementById('etAdvanceDays').value = et?.advance_days ?? 30;
  document.getElementById('etMinNoticeHours').value = Math.round((et?.min_notice_minutes ?? 60) / 60);
  document.getElementById('etColor').value = et?.color ?? '#d4883a';
  document.getElementById('etSmsNotify').checked = !!et?.notify_sms_on_booking;
  document.getElementById('etIsActive').checked = et ? !!et.is_active : true;

  modal.classList.remove('hidden');
}

function closeEventTypeModal() {
  document.getElementById('eventTypeModal').classList.add('hidden');
  editingEventTypeId = null;
}

async function saveEventType() {
  const name = document.getElementById('etName').value.trim();
  const slug = slugify(document.getElementById('etSlug').value);
  if (!name) return showToast('Name is required.', 'warning');
  if (!slug) return showToast('Slug is required.', 'warning');

  const row = {
    profile_id: profile.id,
    slug,
    name,
    description: document.getElementById('etDescription').value.trim() || null,
    duration_minutes: parseInt(document.getElementById('etDuration').value, 10) || 30,
    buffer_minutes: parseInt(document.getElementById('etBuffer').value, 10) || 0,
    advance_days: parseInt(document.getElementById('etAdvanceDays').value, 10) || 30,
    min_notice_minutes: Math.max(0, Math.round((parseFloat(document.getElementById('etMinNoticeHours').value) || 1) * 60)),
    location_type: document.getElementById('etLocationType').value,
    location_detail: document.getElementById('etLocationDetail').value.trim() || null,
    color: document.getElementById('etColor').value,
    notify_sms_on_booking: document.getElementById('etSmsNotify').checked,
    is_active: document.getElementById('etIsActive').checked,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (editingEventTypeId) {
    // Don't update slug on existing rows (URL stability)
    delete row.slug;
    delete row.profile_id;
    ({ error } = await supabase
      .from('scheduling_event_types')
      .update(row)
      .eq('id', editingEventTypeId));
  } else {
    ({ error } = await supabase
      .from('scheduling_event_types')
      .insert(row));
  }

  if (error) {
    const msg = error.code === '23505' ? 'A slug with that name already exists.' : error.message;
    return showToast('Save failed: ' + msg, 'error');
  }

  showToast('Event type saved.', 'success');
  closeEventTypeModal();
  await loadData();
  render();
}

async function deleteEventType() {
  if (!editingEventTypeId) return;
  if (!confirm('Delete this event type? Existing bookings will remain but the link will stop working.')) return;

  const { error } = await supabase
    .from('scheduling_event_types')
    .delete()
    .eq('id', editingEventTypeId);

  if (error) {
    const msg = error.code === '23503'
      ? 'Cannot delete — bookings reference this event type. Mark inactive instead.'
      : error.message;
    return showToast('Delete failed: ' + msg, 'error');
  }

  showToast('Event type deleted.', 'success');
  closeEventTypeModal();
  await loadData();
  render();
}
