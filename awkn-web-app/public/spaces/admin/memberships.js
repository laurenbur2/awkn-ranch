// Memberships Dashboard — Mindbody-style member & plan management
import { supabase } from '../../shared/supabase.js';
import { getAustinTodayISO } from '../../shared/timezone.js';
import { showToast, initAdminPage, setupLightbox } from '../../shared/admin-shell.js';

let allPlans = [];
let allMembers = [];
let editingMember = null;
let editingPlan = null;
let sortColumn = null;
let sortDirection = 'asc';

// =============================================
// INIT
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'rentals',
    requiredRole: 'staff',
    section: 'staff',
    onReady: async () => {
      setupLightbox();
      await loadData();
      renderPlansGrid();
      renderMembersTable();
      updateStats();
      populatePlanFilter();
      setupEventListeners();
    },
  });
});

// =============================================
// DATA
// =============================================

async function loadData() {
  const [{ data: plans }, { data: members }] = await Promise.all([
    supabase.from('membership_plans').select('*').order('sort_order'),
    supabase.from('member_memberships').select('*, plan:membership_plans(*)').order('created_at', { ascending: false }),
  ]);
  allPlans = plans || [];
  allMembers = members || [];
}

function updateStats() {
  const today = getAustinTodayISO();
  const active = allMembers.filter(m => m.status === 'active');
  const thisMonth = allMembers.filter(m => m.created_at && m.created_at.startsWith(today.slice(0, 7)));
  const mrr = active.reduce((sum, m) => {
    const plan = m.plan || allPlans.find(p => p.id === m.plan_id);
    if (!plan) return sum;
    if (plan.billing_cycle === 'monthly') return sum + parseFloat(plan.price);
    if (plan.billing_cycle === 'annual') return sum + parseFloat(plan.price) / 12;
    return sum;
  }, 0);
  const soon = allMembers.filter(m => {
    if (!m.end_date) return false;
    const diff = (new Date(m.end_date) - new Date(today)) / 86400000;
    return diff >= 0 && diff <= 30;
  });

  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statNew').textContent = thisMonth.length;
  document.getElementById('statMRR').textContent = `$${mrr.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  document.getElementById('statExpiring').textContent = soon.length;
}

function populatePlanFilter() {
  const select = document.getElementById('planFilter');
  select.innerHTML = `<option value="all">All Plans</option>` +
    allPlans.filter(p => p.is_active).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

// =============================================
// MEMBERS TABLE
// =============================================

function getFilteredMembers() {
  const search = (document.getElementById('memberSearch')?.value || '').toLowerCase();
  const status = document.getElementById('statusFilter')?.value || 'all';
  const planId = document.getElementById('planFilter')?.value || 'all';

  return allMembers.filter(m => {
    if (search && !m.member_name.toLowerCase().includes(search) && !(m.member_email || '').toLowerCase().includes(search)) return false;
    if (status !== 'all' && m.status !== status) return false;
    if (planId !== 'all' && m.plan_id !== planId) return false;
    return true;
  });
}

const STATUS_COLORS = {
  active: '#059669',
  trial: '#2563EB',
  paused: '#D97706',
  past_due: '#DC2626',
  expired: '#6B7280',
  cancelled: '#9CA3AF',
};

function getSortValue(member, column) {
  const plan = member.plan || allPlans.find(p => p.id === member.plan_id);
  switch (column) {
    case 'member': return (member.member_name || '').toLowerCase();
    case 'plan': return (plan?.name || '').toLowerCase();
    case 'status': return member.status || '';
    case 'start_date': return member.start_date || '';
    case 'next_billing': return member.next_billing_date || '';
    case 'amount': return plan?.price ? parseFloat(plan.price) : 0;
    case 'visits': return member.total_visits || 0;
    default: return '';
  }
}

function sortMembers(members) {
  if (!sortColumn) return members;
  const sorted = [...members].sort((a, b) => {
    const aVal = getSortValue(a, sortColumn);
    const bVal = getSortValue(b, sortColumn);
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
  return sortDirection === 'desc' ? sorted.reverse() : sorted;
}

function renderSortHeaders() {
  const headerRow = document.querySelector('#membersTable thead tr');
  const columns = [
    { key: 'member', label: 'Member' },
    { key: 'plan', label: 'Plan' },
    { key: 'status', label: 'Status' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'next_billing', label: 'Next Billing' },
    { key: 'amount', label: 'Amount' },
    { key: 'visits', label: 'Visits' },
    { key: null, label: '' },
  ];
  headerRow.innerHTML = columns.map(col => {
    if (!col.key) return `<th></th>`;
    const isActive = sortColumn === col.key;
    const arrow = isActive ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="mb-sortable${isActive ? ' mb-sorted' : ''}" data-sort="${col.key}">${col.label}${arrow}</th>`;
  }).join('');
}

function renderMembersTable() {
  renderSortHeaders();
  const tbody = document.getElementById('membersTableBody');
  const members = sortMembers(getFilteredMembers());

  if (members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="mb-empty">No members found. Click "+ Add Member" to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => {
    const plan = m.plan || allPlans.find(p => p.id === m.plan_id);
    const planName = plan?.name || 'No Plan';
    const planColor = plan?.color || '#6B7280';
    const statusColor = STATUS_COLORS[m.status] || '#6B7280';
    const statusLabel = m.status.replace('_', ' ');
    const startDate = m.start_date ? new Date(m.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const nextBilling = m.next_billing_date ? new Date(m.next_billing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    const amount = plan?.price ? `$${parseFloat(plan.price).toLocaleString()}/${plan.billing_cycle === 'annual' ? 'yr' : 'mo'}` : '—';

    return `<tr class="mb-row" data-member-id="${m.id}">
      <td>
        <div class="mb-member-name">${escapeHtml(m.member_name)}</div>
        <div class="mb-member-email">${escapeHtml(m.member_email || '')}</div>
      </td>
      <td><span class="mb-plan-badge" style="background:${planColor}15; color:${planColor}; border:1px solid ${planColor}30">${escapeHtml(planName)}</span></td>
      <td><span class="mb-status-dot" style="background:${statusColor}"></span>${statusLabel}</td>
      <td>${startDate}</td>
      <td>${nextBilling}</td>
      <td>${amount}</td>
      <td>${m.total_visits || 0}</td>
      <td><button class="mb-btn mb-btn--sm mb-btn--edit" data-member-id="${m.id}">Edit</button></td>
    </tr>`;
  }).join('');
}

// =============================================
// PLANS GRID
// =============================================

function renderPlansGrid() {
  const grid = document.getElementById('plansGrid');
  grid.innerHTML = allPlans.map(p => {
    const benefits = JSON.parse(typeof p.benefits === 'string' ? p.benefits : JSON.stringify(p.benefits || []));
    const priceLabel = p.price > 0
      ? `$${parseFloat(p.price).toLocaleString()}/${p.billing_cycle === 'annual' ? 'year' : p.billing_cycle === 'monthly' ? 'month' : ''}`
      : 'Custom Pricing';
    const cycleLabel = p.billing_cycle === 'one_time' ? 'One-Time' : p.billing_cycle.charAt(0).toUpperCase() + p.billing_cycle.slice(1);
    const memberCount = allMembers.filter(m => m.plan_id === p.id && m.status === 'active').length;

    return `<div class="mb-plan-card" data-plan-id="${p.id}">
      <div class="mb-plan-card-header" style="border-top:3px solid ${p.color}">
        <div class="mb-plan-card-name">${escapeHtml(p.name)}</div>
        <div class="mb-plan-card-price">${priceLabel}</div>
        <div class="mb-plan-card-cycle">${cycleLabel}${!p.is_active ? ' · Inactive' : ''}</div>
      </div>
      <div class="mb-plan-card-body">
        ${p.description ? `<div class="mb-plan-card-desc">${escapeHtml(p.description)}</div>` : ''}
        ${benefits.length > 0 ? `<ul class="mb-plan-card-benefits">${benefits.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        <div class="mb-plan-card-members">${memberCount} active member${memberCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="mb-plan-card-footer">
        <button class="mb-btn mb-btn--sm" data-edit-plan="${p.id}">Edit Plan</button>
      </div>
    </div>`;
  }).join('');

  if (allPlans.length === 0) {
    grid.innerHTML = `<div class="mb-empty" style="grid-column:1/-1;text-align:center;padding:3rem">No membership plans yet. Click "+ New Plan" to create one.</div>`;
  }
}

// =============================================
// MEMBER MODAL
// =============================================

function openMemberModal(member = null) {
  editingMember = member;
  document.getElementById('memberModalTitle').textContent = member ? 'Edit Member' : 'Add Member';
  document.getElementById('memberModalDelete').classList.toggle('hidden', !member);

  const today = getAustinTodayISO();
  const body = document.getElementById('memberModalBody');
  body.innerHTML = `
    <div class="mb-form-group">
      <label class="mb-form-label">Name *</label>
      <input type="text" class="mb-form-input" id="frmMemberName" value="${member?.member_name || ''}" placeholder="Full name">
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Email</label>
        <input type="email" class="mb-form-input" id="frmMemberEmail" value="${member?.member_email || ''}" placeholder="email@example.com">
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">Phone</label>
        <input type="tel" class="mb-form-input" id="frmMemberPhone" value="${member?.member_phone || ''}" placeholder="(555) 555-5555">
      </div>
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Membership Plan</label>
        <select class="mb-form-select" id="frmMemberPlan">
          ${allPlans.filter(p => p.is_active).map(p => `<option value="${p.id}" ${member?.plan_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">Status</label>
        <select class="mb-form-select" id="frmMemberStatus">
          <option value="active" ${(!member || member.status === 'active') ? 'selected' : ''}>Active</option>
          <option value="trial" ${member?.status === 'trial' ? 'selected' : ''}>Trial</option>
          <option value="paused" ${member?.status === 'paused' ? 'selected' : ''}>Paused</option>
          <option value="past_due" ${member?.status === 'past_due' ? 'selected' : ''}>Past Due</option>
          <option value="expired" ${member?.status === 'expired' ? 'selected' : ''}>Expired</option>
          <option value="cancelled" ${member?.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </div>
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Start Date</label>
        <input type="date" class="mb-form-input" id="frmMemberStart" value="${member?.start_date || today}">
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">End Date</label>
        <input type="date" class="mb-form-input" id="frmMemberEnd" value="${member?.end_date || ''}">
      </div>
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Next Billing Date</label>
        <input type="date" class="mb-form-input" id="frmMemberBilling" value="${member?.next_billing_date || ''}">
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">Payment Method</label>
        <input type="text" class="mb-form-input" id="frmMemberPayment" value="${member?.payment_method || ''}" placeholder="e.g. Visa ending 4242">
      </div>
    </div>
    <div class="mb-form-group">
      <label class="mb-form-label">Notes</label>
      <textarea class="mb-form-textarea" id="frmMemberNotes" rows="2">${member?.notes || ''}</textarea>
    </div>
  `;

  document.getElementById('memberModalOverlay').classList.remove('hidden');
}

async function saveMember() {
  const name = document.getElementById('frmMemberName').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const data = {
    member_name: name,
    member_email: document.getElementById('frmMemberEmail').value.trim() || null,
    member_phone: document.getElementById('frmMemberPhone').value.trim() || null,
    plan_id: document.getElementById('frmMemberPlan').value,
    status: document.getElementById('frmMemberStatus').value,
    start_date: document.getElementById('frmMemberStart').value || null,
    end_date: document.getElementById('frmMemberEnd').value || null,
    next_billing_date: document.getElementById('frmMemberBilling').value || null,
    payment_method: document.getElementById('frmMemberPayment').value.trim() || null,
    notes: document.getElementById('frmMemberNotes').value.trim() || null,
  };

  try {
    if (editingMember) {
      const { error } = await supabase.from('member_memberships').update(data).eq('id', editingMember.id);
      if (error) throw error;
      showToast('Member updated', 'success');
    } else {
      const { error } = await supabase.from('member_memberships').insert(data);
      if (error) throw error;
      showToast('Member added', 'success');
    }
    closeMemberModal();
    await loadData();
    renderMembersTable();
    renderPlansGrid();
    updateStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteMember() {
  if (!editingMember || !confirm('Remove this member?')) return;
  try {
    const { error } = await supabase.from('member_memberships').delete().eq('id', editingMember.id);
    if (error) throw error;
    showToast('Member removed', 'success');
    closeMemberModal();
    await loadData();
    renderMembersTable();
    renderPlansGrid();
    updateStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function closeMemberModal() {
  document.getElementById('memberModalOverlay').classList.add('hidden');
  editingMember = null;
}

// =============================================
// PLAN MODAL
// =============================================

function openPlanModal(plan = null) {
  editingPlan = plan;
  document.getElementById('planModalTitle').textContent = plan ? 'Edit Plan' : 'New Membership Plan';

  const benefits = plan ? (typeof plan.benefits === 'string' ? JSON.parse(plan.benefits) : plan.benefits || []) : [];

  const body = document.getElementById('planModalBody');
  body.innerHTML = `
    <div class="mb-form-group">
      <label class="mb-form-label">Plan Name *</label>
      <input type="text" class="mb-form-input" id="frmPlanName" value="${plan?.name || ''}" placeholder="e.g. Wellness Membership">
    </div>
    <div class="mb-form-group">
      <label class="mb-form-label">Description</label>
      <textarea class="mb-form-textarea" id="frmPlanDesc" rows="2">${plan?.description || ''}</textarea>
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Billing Cycle</label>
        <select class="mb-form-select" id="frmPlanCycle">
          <option value="monthly" ${(!plan || plan.billing_cycle === 'monthly') ? 'selected' : ''}>Monthly</option>
          <option value="annual" ${plan?.billing_cycle === 'annual' ? 'selected' : ''}>Annual</option>
          <option value="one_time" ${plan?.billing_cycle === 'one_time' ? 'selected' : ''}>One-Time</option>
        </select>
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">Price</label>
        <input type="number" class="mb-form-input" id="frmPlanPrice" value="${plan?.price || ''}" step="0.01" placeholder="0.00">
      </div>
    </div>
    <div class="mb-form-row">
      <div class="mb-form-group">
        <label class="mb-form-label">Color</label>
        <input type="color" class="mb-form-input" id="frmPlanColor" value="${plan?.color || '#d4883a'}" style="height:38px;padding:2px">
      </div>
      <div class="mb-form-group">
        <label class="mb-form-label">Active</label>
        <select class="mb-form-select" id="frmPlanActive">
          <option value="true" ${(!plan || plan.is_active) ? 'selected' : ''}>Yes</option>
          <option value="false" ${plan && !plan.is_active ? 'selected' : ''}>No</option>
        </select>
      </div>
    </div>
    <div class="mb-form-group">
      <label class="mb-form-label">Benefits (one per line)</label>
      <textarea class="mb-form-textarea" id="frmPlanBenefits" rows="4" placeholder="Access to shared spaces&#10;Group activities&#10;10% off services">${benefits.join('\n')}</textarea>
    </div>
  `;

  document.getElementById('planModalOverlay').classList.remove('hidden');
}

async function savePlan() {
  const name = document.getElementById('frmPlanName').value.trim();
  if (!name) { showToast('Plan name is required', 'error'); return; }

  const benefitsText = document.getElementById('frmPlanBenefits').value.trim();
  const benefits = benefitsText ? benefitsText.split('\n').map(b => b.trim()).filter(Boolean) : [];

  const data = {
    name,
    description: document.getElementById('frmPlanDesc').value.trim() || null,
    billing_cycle: document.getElementById('frmPlanCycle').value,
    price: parseFloat(document.getElementById('frmPlanPrice').value) || 0,
    color: document.getElementById('frmPlanColor').value,
    is_active: document.getElementById('frmPlanActive').value === 'true',
    benefits: JSON.stringify(benefits),
  };

  try {
    if (editingPlan) {
      const { error } = await supabase.from('membership_plans').update(data).eq('id', editingPlan.id);
      if (error) throw error;
      showToast('Plan updated', 'success');
    } else {
      data.sort_order = allPlans.length + 1;
      const { error } = await supabase.from('membership_plans').insert(data);
      if (error) throw error;
      showToast('Plan created', 'success');
    }
    closePlanModal();
    await loadData();
    renderPlansGrid();
    populatePlanFilter();
    updateStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function closePlanModal() {
  document.getElementById('planModalOverlay').classList.add('hidden');
  editingPlan = null;
}

// =============================================
// EVENTS
// =============================================

function setupEventListeners() {
  // Sub-tabs
  document.querySelectorAll('.mb-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mb-subtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.mb-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel${btn.dataset.panel.charAt(0).toUpperCase() + btn.dataset.panel.slice(1)}`).classList.add('active');
    });
  });

  // Filters
  document.getElementById('memberSearch')?.addEventListener('input', renderMembersTable);
  document.getElementById('statusFilter')?.addEventListener('change', renderMembersTable);
  document.getElementById('planFilter')?.addEventListener('change', renderMembersTable);

  // Add buttons
  document.getElementById('btnAddMember')?.addEventListener('click', () => openMemberModal());
  document.getElementById('btnAddPlan')?.addEventListener('click', () => openPlanModal());

  // Sort headers
  document.getElementById('membersTable')?.addEventListener('click', (e) => {
    const th = e.target.closest('.mb-sortable');
    if (th) {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'asc';
      }
      renderMembersTable();
      return;
    }
  });

  // Table row clicks
  document.getElementById('membersTable')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.mb-btn--edit');
    if (editBtn) {
      const member = allMembers.find(m => m.id === editBtn.dataset.memberId);
      if (member) openMemberModal(member);
      return;
    }
    const row = e.target.closest('.mb-row');
    if (row) {
      const member = allMembers.find(m => m.id === row.dataset.memberId);
      if (member) openMemberModal(member);
    }
  });

  // Plan card clicks
  document.getElementById('plansGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit-plan]');
    if (btn) {
      const plan = allPlans.find(p => p.id === btn.dataset.editPlan);
      if (plan) openPlanModal(plan);
    }
  });

  // Member modal
  document.getElementById('memberModalSave')?.addEventListener('click', saveMember);
  document.getElementById('memberModalDelete')?.addEventListener('click', deleteMember);
  document.getElementById('memberModalCancel')?.addEventListener('click', closeMemberModal);
  document.getElementById('memberModalClose')?.addEventListener('click', closeMemberModal);
  document.getElementById('memberModalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeMemberModal();
  });

  // Plan modal
  document.getElementById('planModalSave')?.addEventListener('click', savePlan);
  document.getElementById('planModalCancel')?.addEventListener('click', closePlanModal);
  document.getElementById('planModalClose')?.addEventListener('click', closePlanModal);
  document.getElementById('planModalOverlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePlanModal();
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMemberModal();
      closePlanModal();
    }
  });
}

// =============================================
// UTILS
// =============================================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
