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
  else renderPlaceholderPanel(currentSubtab);
}

function renderPlaceholderPanel(key) {
  const panel = document.getElementById(`clients-panel-${key}`);
  if (!panel) return;
  const labels = {
    clients: 'Client directory and profiles',
    schedule: 'Admin-initiated session scheduling',
    house: 'Lodging census and bed assignments',
  };
  panel.innerHTML = `
    <div style="padding:48px 24px;text-align:center;color:var(--text-muted,#888);">
      <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Coming soon</div>
      <div style="font-size:13px;">${escapeHtml(labels[key] || '')}</div>
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
