// Scheduling Dashboard — Google Calendar + multi-event-type bookings
import { supabase } from '../../shared/supabase.js';
import { showToast, initAdminPage, setupLightbox } from '../../shared/admin-shell.js';

let authState = null;
let profile = null;
let eventTypes = [];
let bookings = [];
let editingEventTypeId = null; // null = creating new; uuid = editing existing
let isSchedulingAdmin = false; // has manage_scheduling permission → can view any staff's setup
let viewAsUserId = null;       // which app_user we're currently viewing (defaults to self)
let viewAsUserName = '';       // display name of viewed user, for hints
let allStaff = [];             // admin-only: [{ app_user_id, name, email, profile, event_type_count }]

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
      isSchedulingAdmin = !!(state.hasPermission && state.hasPermission('manage_scheduling'));
      viewAsUserId = state.appUser.id;
      checkUrlParams();
      if (isSchedulingAdmin) await loadAllStaff();
      await loadData();
      renderAdminSwitcher();
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
  const targetUserId = viewAsUserId || authState.appUser.id;
  const { data: p } = await supabase
    .from('scheduling_profiles')
    .select('*')
    .eq('app_user_id', targetUserId)
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

async function loadAllStaff() {
  const { data: users } = await supabase
    .from('app_users')
    .select('id, display_name, first_name, last_name, email, role')
    .in('role', ['staff', 'admin', 'oracle'])
    .eq('is_archived', false);

  const { data: profs } = await supabase
    .from('scheduling_profiles')
    .select('id, app_user_id, booking_slug, is_bookable, google_refresh_token');

  const { data: counts } = await supabase
    .from('scheduling_event_types')
    .select('profile_id, is_active');

  const profByUser = new Map((profs || []).map(p => [p.app_user_id, p]));
  const countsByProfile = new Map();
  (counts || []).forEach(c => {
    const cur = countsByProfile.get(c.profile_id) || { total: 0, active: 0 };
    cur.total += 1;
    if (c.is_active) cur.active += 1;
    countsByProfile.set(c.profile_id, cur);
  });

  allStaff = (users || [])
    .map(u => {
      const name = u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
      const p = profByUser.get(u.id) || null;
      const cnt = p ? (countsByProfile.get(p.id) || { total: 0, active: 0 }) : { total: 0, active: 0 };
      return {
        app_user_id: u.id,
        name,
        email: u.email,
        role: u.role,
        profile: p,
        eventCount: cnt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// =============================================
// RENDER
// =============================================

function render() {
  renderCalendarStatus();
  renderProfileForm();
  renderEventTypesList();
  renderBookingsTable();
  renderAllStaffTable();
  updateStats();
}

function renderAdminSwitcher() {
  const box = document.getElementById('adminSwitcher');
  const select = document.getElementById('adminStaffSelect');
  const hint = document.getElementById('adminSwitcherHint');
  const allStaffTab = document.getElementById('subtabAllStaff');
  if (!box || !select) return;

  if (!isSchedulingAdmin) {
    box.classList.add('hidden');
    if (allStaffTab) allStaffTab.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  if (allStaffTab) allStaffTab.classList.remove('hidden');

  const selfId = authState.appUser.id;
  const selfName = authState.appUser.display_name
    || `${authState.appUser.first_name || ''} ${authState.appUser.last_name || ''}`.trim()
    || authState.appUser.email
    || 'Me';

  const others = allStaff.filter(s => s.app_user_id !== selfId);
  select.innerHTML = [
    `<option value="${escapeHtml(selfId)}">My Calendar (${escapeHtml(selfName)})</option>`,
    others.length ? `<optgroup label="Staff">${others.map(s => {
      const badges = [];
      if (s.profile?.google_refresh_token) badges.push('connected');
      if (s.eventCount.active) badges.push(`${s.eventCount.active} active`);
      const suffix = badges.length ? ` — ${badges.join(', ')}` : ' — not set up';
      return `<option value="${escapeHtml(s.app_user_id)}">${escapeHtml(s.name)}${escapeHtml(suffix)}</option>`;
    }).join('')}</optgroup>` : '',
  ].join('');

  select.value = viewAsUserId || selfId;

  const isSelf = (viewAsUserId || selfId) === selfId;
  viewAsUserName = isSelf ? selfName : (allStaff.find(s => s.app_user_id === viewAsUserId)?.name || '');
  hint.textContent = isSelf ? '' : `Admin view — changes affect ${viewAsUserName}.`;
}

function renderAllStaffTable() {
  const tbody = document.getElementById('allStaffTableBody');
  if (!tbody) return;
  if (!isSchedulingAdmin) {
    tbody.innerHTML = '<tr><td colspan="6" class="sch-empty">Admin permission required.</td></tr>';
    return;
  }
  if (!allStaff.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="sch-empty">No staff found.</td></tr>';
    return;
  }
  tbody.innerHTML = allStaff.map(s => {
    const connected = !!s.profile?.google_refresh_token;
    const slug = s.profile?.booking_slug || '';
    const publicLink = slug ? `${SITE_BASE}/schedule/?p=${encodeURIComponent(slug)}` : '';
    const accepting = s.profile?.is_bookable ? 'Yes' : 'No';
    const evLabel = `${s.eventCount.active}/${s.eventCount.total}`;
    return `
      <tr>
        <td>
          <div style="font-weight:600">${escapeHtml(s.name)}</div>
          <div style="font-size:.75rem;color:#6b7280">${escapeHtml(s.email || '')}</div>
        </td>
        <td>${connected
          ? '<span class="sch-badge sch-badge--connected">Connected</span>'
          : '<span class="sch-badge sch-badge--disconnected">Not connected</span>'}</td>
        <td>${escapeHtml(evLabel)}</td>
        <td>${escapeHtml(accepting)}</td>
        <td>${publicLink
          ? `<a href="${escapeHtml(publicLink)}" target="_blank" rel="noopener" style="color:var(--accent,#d4883a)">${escapeHtml(slug)}</a>`
          : '—'}</td>
        <td><button class="sch-btn sch-btn--sm" data-manage-user="${escapeHtml(s.app_user_id)}">Manage</button></td>
      </tr>
    `;
  }).join('');
}

function renderCalendarStatus() {
  const container = document.getElementById('calendarStatus');
  const isConnected = profile && profile.google_refresh_token;
  const viewingSelf = !viewAsUserId || viewAsUserId === authState.appUser.id;

  if (isConnected) {
    container.innerHTML = `
      <div class="sch-connect-box">
        <span class="sch-badge sch-badge--connected">Connected</span>
        ${viewingSelf
          ? '<button class="sch-btn sch-btn--sm" id="btnReconnect">Reconnect</button>'
          : `<span class="sch-hint">Only ${escapeHtml(viewAsUserName)} can reconnect their own Google account.</span>`}
      </div>
    `;
    document.getElementById('profileSection').classList.remove('hidden');
    document.getElementById('eventTypesSection').classList.remove('hidden');
  } else {
    container.innerHTML = `
      <div class="sch-connect-box">
        <span class="sch-badge sch-badge--disconnected">Not Connected</span>
        ${viewingSelf
          ? '<button class="sch-btn sch-btn--primary" id="btnConnect">Connect Google Calendar</button>'
          : `<span class="sch-hint">${escapeHtml(viewAsUserName)} must sign in and connect their own Google account.</span>`}
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

  // Admin: staff switcher (view/edit another user's scheduling setup)
  const adminSelect = document.getElementById('adminStaffSelect');
  if (adminSelect) {
    adminSelect.addEventListener('change', async (e) => {
      viewAsUserId = e.target.value || authState.appUser.id;
      await loadData();
      renderAdminSwitcher();
      render();
      // Jump to the "My Profile" panel so the admin can see the selected user's setup
      document.querySelectorAll('.sch-subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sch-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.sch-subtab[data-panel="profile"]')?.classList.add('active');
      document.getElementById('panelProfile')?.classList.add('active');
    });
  }

  // Admin: "Manage" buttons in All Staff table
  document.getElementById('allStaffTableBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-manage-user]');
    if (!btn) return;
    viewAsUserId = btn.dataset.manageUser;
    await loadData();
    renderAdminSwitcher();
    render();
    document.querySelectorAll('.sch-subtab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sch-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.sch-subtab[data-panel="profile"]')?.classList.add('active');
    document.getElementById('panelProfile')?.classList.add('active');
  });

  // Connect / Reconnect Google Calendar — always uses the current signed-in user
  // (never admin-view target, since Google OAuth runs against the browser's session).
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
