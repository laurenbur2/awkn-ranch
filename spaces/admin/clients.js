// Clients Page - Admin view for AWKN Within ketamine clients.
// Sub-tabs: Clients / Schedule / House / Services.
// Phase 2 scope: Services CRUD. Remaining tabs are placeholders for later phases.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';

// =============================================
// STATE
// =============================================

let authState = null;
let currentSubtab = localStorage.getItem('clients-subtab') || 'services';

let services = [];
let showArchivedServices = false;

// =============================================
// UTILITIES
// =============================================

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatPriceCents(cents) {
  if (cents == null || isNaN(cents)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'clients',
    requiredRole: 'staff',
    section: 'staff',
    onReady: async (state) => {
      authState = state;
      await loadAllData();
      renderAll();
      setupEventListeners();
    },
  });
});

// =============================================
// DATA LOADING
// =============================================

async function loadAllData() {
  const [servicesRes] = await Promise.all([
    supabase.from('services').select('*').order('sort_order').order('name'),
  ]);
  if (servicesRes.error) {
    console.error('Failed to load services:', servicesRes.error);
    showToast('Failed to load services', 'error');
    services = [];
  } else {
    services = servicesRes.data || [];
  }
}

// =============================================
// RENDER
// =============================================

function renderAll() {
  renderSubtabs();
  renderCurrentPanel();
}

function renderSubtabs() {
  const container = document.getElementById('clients-subtabs');
  if (!container) return;
  const tabs = [
    { key: 'clients', label: 'Clients' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'house', label: 'House' },
    { key: 'services', label: 'Services' },
  ];
  container.innerHTML = tabs.map(t =>
    `<button class="crm-subtab ${t.key === currentSubtab ? 'active' : ''}" data-tab="${t.key}">${escapeHtml(t.label)}</button>`
  ).join('');
}

function renderCurrentPanel() {
  document.querySelectorAll('#clients-panels .crm-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`clients-panel-${currentSubtab}`);
  if (panel) panel.classList.add('active');

  if (currentSubtab === 'services') renderServicesPanel();
  else if (currentSubtab === 'clients') renderClientsPreview();
  else if (currentSubtab === 'schedule') renderSchedulePreview();
  else if (currentSubtab === 'house') renderHousePreview();
}

function previewBanner(phaseLabel, note) {
  return `
    <div style="padding:10px 14px;background:#fff8ec;border:1px solid #f2d69a;border-radius:8px;margin-bottom:16px;font-size:12px;color:#8a5a1a;display:flex;gap:10px;align-items:center;">
      <span style="font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Preview &middot; ${escapeHtml(phaseLabel)}</span>
      <span style="opacity:.8;">${escapeHtml(note)}</span>
    </div>
  `;
}

// ---------- Clients tab preview (Phase 3) ----------
function renderClientsPreview() {
  const panel = document.getElementById('clients-panel-clients');
  if (!panel) return;

  const mock = [
    { name: 'Sarah Chen',      contact: 'sarah.c@email.com',    last: 'Mar 22',  next: 'Apr 29', pkg: '3 of 6 sessions', stay: 'Amethyst &middot; Apr 28\u201330', status: 'active' },
    { name: 'Marcus Holloway', contact: '(512) 555-0134',       last: 'Apr 02',  next: '—',      pkg: 'Complete',        stay: '—',                            status: 'completed' },
    { name: 'Priya Patel',     contact: 'priya.patel@email.com', last: '—',       next: 'May 14', pkg: 'Day-of intake',   stay: 'Opal &middot; May 13\u201315',  status: 'upcoming' },
    { name: 'Jordan Rivers',   contact: '(737) 555-0199',        last: 'Mar 30',  next: 'Apr 27', pkg: '1 of 3 sessions', stay: 'Emerald Bunk 1 top',           status: 'active' },
  ];

  const statusPill = (s) => {
    const map = {
      active:    { bg: '#dcfce7', fg: '#15803d', label: 'Active' },
      upcoming:  { bg: '#e0e7ff', fg: '#4338ca', label: 'Upcoming' },
      completed: { bg: '#f1f5f9', fg: '#64748b', label: 'Completed' },
    };
    const m = map[s] || map.completed;
    return `<span style="padding:2px 8px;border-radius:999px;background:${m.bg};color:${m.fg};font-size:11px;font-weight:600;">${m.label}</span>`;
  };

  panel.innerHTML = `
    ${previewBanner('Phase 3', 'Final version reads from crm_leads where pipeline stage = active_client. Row click opens a detail drawer with packages, sessions, stays, and notes.')}
    <div class="crm-pipeline-toolbar" style="pointer-events:none;opacity:.7;">
      <input class="crm-search" placeholder="Search clients by name, email, phone\u2026" disabled>
      <select class="crm-select" disabled><option>All statuses</option></select>
      <select class="crm-select" disabled><option>All packages</option></select>
      <button class="crm-btn crm-btn-primary" disabled>+ New Client</button>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Name</th><th>Contact</th><th>Last session</th><th>Next session</th><th>Package</th><th>Stay</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${mock.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.name)}</strong></td>
              <td style="color:var(--text-muted,#888);">${escapeHtml(r.contact)}</td>
              <td>${escapeHtml(r.last)}</td>
              <td>${escapeHtml(r.next)}</td>
              <td>${escapeHtml(r.pkg)}</td>
              <td>${r.stay}</td>
              <td>${statusPill(r.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:20px;padding:14px 16px;background:var(--bg,#faf9f6);border:1px dashed var(--border-color,#e5e5e5);border-radius:8px;font-size:13px;color:var(--text-muted,#666);line-height:1.5;">
      <strong style="color:var(--text,#2a1f23);">Client detail drawer will include:</strong>
      contact info &middot; intake status &middot; active package with remaining sessions &middot; session history + upcoming bookings &middot; retreat stays &middot; integration notes &middot; quick actions (schedule session, add note, send email).
    </div>
  `;
}

// ---------- Schedule tab preview (Phase 4 + 5) ----------
function renderSchedulePreview() {
  const panel = document.getElementById('clients-panel-schedule');
  if (!panel) return;

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = ['9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p'];
  const mockBookings = [
    { day: 0, start: 1, span: 2, label: 'Ketamine &middot; S. Chen', color: '#d4883a' },
    { day: 1, start: 4, span: 1, label: 'Integration &middot; J. Rivers', color: '#16a34a' },
    { day: 3, start: 0, span: 2, label: 'Ketamine &middot; M. Holloway', color: '#d4883a' },
    { day: 3, start: 5, span: 1, label: 'Massage &middot; P. Patel', color: '#8b5cf6' },
    { day: 5, start: 2, span: 2, label: 'Ketamine &middot; P. Patel', color: '#d4883a' },
  ];

  const cellSize = 56;
  let cells = '';
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < hours.length; h++) {
      cells += `<div style="border-right:1px solid var(--border-color,#eee);border-bottom:1px solid var(--border-color,#eee);height:${cellSize}px;"></div>`;
    }
  }
  const bookingPills = mockBookings.map(b => `
    <div style="position:absolute;left:calc(60px + ${b.day} * (100% - 60px) / 7 + 4px);top:${b.start * cellSize + 4}px;width:calc((100% - 60px) / 7 - 8px);height:${b.span * cellSize - 8}px;background:${b.color};color:#fff;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:600;line-height:1.3;box-shadow:0 1px 3px rgba(0,0,0,.12);">
      ${b.label}
    </div>
  `).join('');

  panel.innerHTML = `
    ${previewBanner('Phase 4 + 5', 'Final version: weekly grid of all staff-booked sessions, admin "Schedule Session" button that picks client \u2192 service \u2192 staff \u2192 time slot, double-booking blocked atomically.')}
    <div class="crm-pipeline-toolbar" style="pointer-events:none;opacity:.7;">
      <button class="crm-btn crm-btn-primary" disabled>+ Schedule Session</button>
      <span style="color:var(--text-muted,#888);font-size:13px;margin-left:8px;">Apr 21 \u2013 Apr 27</span>
      <button class="crm-btn crm-btn-sm" disabled>&laquo; Prev</button>
      <button class="crm-btn crm-btn-sm" disabled>Next &raquo;</button>
      <select class="crm-select" style="margin-left:auto;" disabled><option>All staff</option></select>
      <select class="crm-select" disabled><option>All services</option></select>
    </div>

    <div style="border:1px solid var(--border-color,#eee);border-radius:8px;overflow:hidden;background:#fff;">
      <!-- Day header -->
      <div style="display:grid;grid-template-columns:60px repeat(7, 1fr);background:var(--bg,#faf9f6);border-bottom:1px solid var(--border-color,#eee);">
        <div></div>
        ${days.map(d => `<div style="padding:8px 0;text-align:center;font-size:12px;font-weight:600;color:var(--text-muted,#666);">${d}</div>`).join('')}
      </div>
      <!-- Grid body -->
      <div style="position:relative;">
        <!-- Hour labels column -->
        <div style="position:absolute;left:0;top:0;width:60px;">
          ${hours.map(h => `<div style="height:${cellSize}px;display:flex;align-items:flex-start;justify-content:center;padding-top:4px;font-size:11px;color:var(--text-muted,#888);border-right:1px solid var(--border-color,#eee);border-bottom:1px solid var(--border-color,#eee);">${h}</div>`).join('')}
        </div>
        <!-- Cells grid -->
        <div style="display:grid;grid-template-columns:60px repeat(7, 1fr);">
          <div></div>
          <div style="grid-column:2 / span 7;display:grid;grid-template-columns:repeat(7, 1fr);grid-template-rows:repeat(${hours.length}, ${cellSize}px);">
            ${Array.from({length: 7 * hours.length}).map(() => `<div style="border-right:1px solid var(--border-color,#eee);border-bottom:1px solid var(--border-color,#eee);"></div>`).join('')}
          </div>
        </div>
        <!-- Booking pills overlaid -->
        ${bookingPills}
      </div>
    </div>

    <div style="margin-top:20px;padding:14px 16px;background:var(--bg,#faf9f6);border:1px dashed var(--border-color,#e5e5e5);border-radius:8px;font-size:13px;color:var(--text-muted,#666);line-height:1.5;">
      <strong style="color:var(--text,#2a1f23);">Scheduling flow:</strong>
      admin picks a client &rarr; selects service (Ketamine / Massage / Integration) &rarr; sees available staff &#38; rooms &rarr; picks a time slot. On save, writes scheduling_bookings + (if ketamine) links a package session credit. UNIQUE(staff_id, start_time) prevents double-booking.
    </div>
  `;
}

// ---------- House tab preview (Phase 6) ----------
function renderHousePreview() {
  const panel = document.getElementById('clients-panel-house');
  if (!panel) return;

  const rooms = [
    { name: 'Emerald',  floor: 'downstairs', bath: false, beds: [
      { label: 'Bunk 1 Top',    who: 'S. Chen' },
      { label: 'Bunk 1 Bottom', who: 'J. Rivers' },
      { label: 'Bunk 2 Top',    who: null },
      { label: 'Bunk 2 Bottom', who: null },
    ]},
    { name: 'Quartz',   floor: 'downstairs', bath: false, beds: [{ label: 'Queen',   who: 'P. Patel' }] },
    { name: 'Selenite', floor: 'downstairs', bath: false, beds: [{ label: 'Queen',   who: null }] },
    { name: 'Amethyst', floor: 'downstairs', bath: false, beds: [{ label: 'Queen',   who: 'M. Holloway' }] },
    { name: 'Opal',     floor: 'upstairs',   bath: true,  beds: [{ label: 'King',    who: null }] },
    { name: 'Celenite', floor: 'upstairs',   bath: false, beds: [{ label: 'Queen 1', who: null }, { label: 'Queen 2', who: null }] },
    { name: 'Jasper',   floor: 'upstairs',   bath: false, beds: [{ label: 'Queen',   who: null }] },
  ];

  const totalBeds = rooms.reduce((n, r) => n + r.beds.length, 0);
  const occupiedBeds = rooms.reduce((n, r) => n + r.beds.filter(b => b.who).length, 0);

  const roomCard = (r) => {
    const bathBadge = r.bath
      ? '<span style="font-size:10px;color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:999px;font-weight:600;">Private bath</span>'
      : '<span style="font-size:10px;color:var(--text-muted,#888);background:var(--bg,#faf9f6);padding:1px 6px;border-radius:999px;">Shared bath</span>';
    return `
      <div style="border:1px solid var(--border-color,#eee);border-radius:10px;padding:14px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--text,#2a1f23);">${escapeHtml(r.name)}</div>
            <div style="font-size:11px;color:var(--text-muted,#888);text-transform:capitalize;">${escapeHtml(r.floor)}</div>
          </div>
          ${bathBadge}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${r.beds.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${b.who ? '#fff8ec' : 'var(--bg,#faf9f6)'};border-radius:6px;font-size:12px;">
              <span style="color:var(--text-muted,#666);">${escapeHtml(b.label)}</span>
              <span style="font-weight:${b.who ? '600' : '400'};color:${b.who ? 'var(--text,#2a1f23)' : 'var(--text-muted,#aaa)'};">${b.who ? escapeHtml(b.who) : 'available'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  panel.innerHTML = `
    ${previewBanner('Phase 6', 'Final version reads real client_stays for the chosen date, showing which client is in which bed. Click a bed \u2192 assign / un-assign a client stay.')}
    <div class="crm-pipeline-toolbar" style="pointer-events:none;opacity:.7;">
      <label style="font-size:13px;color:var(--text-muted,#666);">Show occupancy on</label>
      <input type="date" class="crm-input" value="2026-04-22" disabled>
      <button class="crm-btn crm-btn-sm" disabled>Today</button>
      <span style="margin-left:auto;font-size:13px;color:var(--text,#2a1f23);font-weight:600;">
        ${occupiedBeds} / ${totalBeds} beds occupied
      </span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
      ${rooms.map(roomCard).join('')}
    </div>

    <div style="margin-top:20px;padding:14px 16px;background:var(--bg,#faf9f6);border:1px dashed var(--border-color,#e5e5e5);border-radius:8px;font-size:13px;color:var(--text-muted,#666);line-height:1.5;">
      <strong style="color:var(--text,#2a1f23);">Weekly email button (Phase 7)</strong> will live here too \u2014 one click sends a summary to staff of who's arriving/departing this week and which beds are occupied.
    </div>
  `;
}

// =============================================
// SERVICES PANEL (Phase 2)
// =============================================

function getVisibleServices() {
  return showArchivedServices ? services : services.filter(s => s.is_active);
}

function renderServicesPanel() {
  const panel = document.getElementById('clients-panel-services');
  if (!panel) return;

  const visible = getVisibleServices();

  let html = `
    <div class="crm-pipeline-toolbar">
      <button class="crm-btn crm-btn-primary" id="btn-new-service">+ New Service</button>
      <label style="display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:13px;color:var(--text-muted,#888);">
        <input type="checkbox" id="toggle-show-archived-services" ${showArchivedServices ? 'checked' : ''}> Show inactive
      </label>
    </div>
  `;

  if (visible.length === 0) {
    html += `
      <div style="padding:36px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">
        No services yet. Click "+ New Service" to add one.
      </div>
    `;
  } else {
    html += `
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Duration</th>
              <th>Default price</th>
              <th>Upfront pay</th>
              <th>Sort</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${visible.map(s => `
              <tr class="clients-service-row" data-service-id="${s.id}" style="cursor:pointer;">
                <td><strong>${escapeHtml(s.name)}</strong>${s.description ? `<div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${escapeHtml(s.description)}</div>` : ''}</td>
                <td><code style="font-size:12px;color:var(--text-muted,#888);">${escapeHtml(s.slug)}</code></td>
                <td>${s.duration_minutes} min</td>
                <td>${formatPriceCents(s.default_price_cents)}</td>
                <td>${s.requires_upfront_payment ? 'Yes' : 'No'}</td>
                <td>${s.sort_order}</td>
                <td>${s.is_active ? '<span style="color:#16a34a;">Active</span>' : '<span style="color:var(--text-muted,#888);">Inactive</span>'}</td>
                <td><button class="crm-btn crm-btn-xs" data-edit-service="${s.id}">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  panel.innerHTML = html;
}

function openServiceModal(service = null) {
  const isEdit = !!service;
  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Service' : 'New Service'}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Name *</label>
              <input type="text" class="crm-input" id="service-name" value="${escapeHtml(service?.name || '')}" required>
            </div>
            <div class="crm-form-field">
              <label>Slug *</label>
              <input type="text" class="crm-input" id="service-slug" value="${escapeHtml(service?.slug || '')}" placeholder="auto-generated from name">
            </div>
            <div class="crm-form-field">
              <label>Duration (minutes) *</label>
              <input type="number" class="crm-input" id="service-duration" value="${service?.duration_minutes ?? 60}" min="1" required>
            </div>
            <div class="crm-form-field">
              <label>Default price ($)</label>
              <input type="number" class="crm-input" id="service-price" value="${service ? (service.default_price_cents / 100).toFixed(2) : '0.00'}" step="0.01" min="0">
            </div>
            <div class="crm-form-field">
              <label>Sort order</label>
              <input type="number" class="crm-input" id="service-sort" value="${service?.sort_order ?? 100}" min="0">
            </div>
            <div class="crm-form-field">
              <label>&nbsp;</label>
              <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;">
                <input type="checkbox" id="service-upfront" ${service?.requires_upfront_payment ? 'checked' : ''}> Requires upfront payment
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;margin-top:4px;">
                <input type="checkbox" id="service-active" ${service ? (service.is_active ? 'checked' : '') : 'checked'}> Active
              </label>
            </div>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Description</label>
            <textarea class="crm-textarea" id="service-description" rows="3">${escapeHtml(service?.description || '')}</textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          ${isEdit ? '<button class="crm-btn crm-btn-danger" id="btn-delete-service">Delete</button>' : '<span></span>'}
          <div>
            <button class="crm-btn" id="btn-cancel-service">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-service">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  // Auto-slug from name on blur if slug is empty
  const nameInput = document.getElementById('service-name');
  const slugInput = document.getElementById('service-slug');
  nameInput.addEventListener('blur', () => {
    if (!slugInput.value.trim() && nameInput.value.trim()) {
      slugInput.value = slugify(nameInput.value);
    }
  });

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-service').addEventListener('click', closeModal);
  document.getElementById('btn-save-service').addEventListener('click', () => saveService(service));
  if (isEdit) {
    document.getElementById('btn-delete-service').addEventListener('click', () => deleteService(service));
  }
}

async function saveService(existing) {
  const name = document.getElementById('service-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  let slug = document.getElementById('service-slug').value.trim();
  if (!slug) slug = slugify(name);
  if (!slug) { showToast('Slug is required', 'error'); return; }

  const duration = parseInt(document.getElementById('service-duration').value, 10);
  if (!duration || duration < 1) { showToast('Duration must be at least 1 minute', 'error'); return; }

  const priceDollars = parseFloat(document.getElementById('service-price').value) || 0;
  const priceCents = Math.round(priceDollars * 100);
  const sortOrder = parseInt(document.getElementById('service-sort').value, 10) || 0;
  const requiresUpfront = document.getElementById('service-upfront').checked;
  const isActive = document.getElementById('service-active').checked;
  const description = document.getElementById('service-description').value.trim() || null;

  const payload = {
    name,
    slug,
    description,
    duration_minutes: duration,
    default_price_cents: priceCents,
    requires_upfront_payment: requiresUpfront,
    is_active: isActive,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  let res;
  if (existing) {
    res = await supabase.from('services').update(payload).eq('id', existing.id).select().single();
  } else {
    res = await supabase.from('services').insert(payload).select().single();
  }

  if (res.error) {
    console.error('Save service error:', res.error);
    const msg = res.error.code === '23505' ? 'Slug already in use — pick a different one' : (res.error.message || 'Failed to save');
    showToast(msg, 'error');
    return;
  }

  showToast(`Service ${existing ? 'updated' : 'created'}`, 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
}

async function deleteService(service) {
  if (!service) return;
  const confirmed = confirm(`Delete "${service.name}"? This cannot be undone.\n\nIf this service has historical bookings or package sessions, use "Inactive" instead.`);
  if (!confirmed) return;

  const { error } = await supabase.from('services').delete().eq('id', service.id);
  if (error) {
    const msg = error.code === '23503'
      ? 'Cannot delete — this service is referenced by existing bookings or package sessions. Mark it inactive instead.'
      : (error.message || 'Failed to delete');
    showToast(msg, 'error');
    return;
  }
  showToast('Service deleted', 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
}

// =============================================
// MODAL HELPERS
// =============================================

function closeModal() {
  const modal = document.getElementById('clients-modal');
  if (modal) {
    modal.innerHTML = '';
    modal.style.display = 'none';
  }
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
  // Sub-tabs
  document.getElementById('clients-subtabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.crm-subtab');
    if (!btn) return;
    currentSubtab = btn.dataset.tab;
    localStorage.setItem('clients-subtab', currentSubtab);
    renderSubtabs();
    renderCurrentPanel();
  });

  // Panels — delegated handlers
  const panelsContainer = document.getElementById('clients-panels');
  if (panelsContainer) {
    panelsContainer.addEventListener('click', handlePanelClicks);
    panelsContainer.addEventListener('change', handlePanelChanges);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function handlePanelClicks(e) {
  const target = e.target;

  if (target.id === 'btn-new-service') {
    openServiceModal();
    return;
  }

  const editBtn = target.closest('[data-edit-service]');
  if (editBtn) {
    e.stopPropagation();
    const svc = services.find(s => s.id === editBtn.dataset.editService);
    if (svc) openServiceModal(svc);
    return;
  }

  const row = target.closest('.clients-service-row');
  if (row) {
    const svc = services.find(s => s.id === row.dataset.serviceId);
    if (svc) openServiceModal(svc);
  }
}

function handlePanelChanges(e) {
  if (e.target.id === 'toggle-show-archived-services') {
    showArchivedServices = e.target.checked;
    renderServicesPanel();
  }
}
