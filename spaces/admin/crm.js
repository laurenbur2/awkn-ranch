// CRM Page - Admin Dashboard
// Manages leads, pipeline, invoices, proposals, and analytics

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast, setupLightbox } from '../../shared/admin-shell.js';

// =============================================
// STATE
// =============================================

let authState = null;
let currentBizLine = localStorage.getItem('crm-biz-line') || 'within';
let currentSubtab = 'pipeline';
let currentPeriod = 'month';

// Data arrays
let leads = [];
let stages = [];
let sources = [];
let activities = [];
let servicePackages = [];
let invoices = [];
let proposals = [];
let venueCatalog = [];
let adSpend = [];
let rentalSpaces = [];

// Search / filter state
let leadSearchText = '';
let leadFilterSource = '';
let leadFilterStage = '';
let leadFilterStatus = '';
let invoiceSearchText = '';
let invoiceFilterStatus = '';
let proposalSearchText = '';
let proposalFilterStatus = '';
let leadFilterOwner = '';

// =============================================
// UTILITIES
// =============================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatCurrency(num) {
  if (num == null || isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function daysAgo(dateStr) {
  if (!dateStr) return 0;
  const now = new Date();
  const then = new Date(dateStr);
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function getDateRangeForPeriod(period) {
  const now = new Date();
  let start, end;
  end = now;
  switch (period) {
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
    default:
      start = new Date(2020, 0, 1);
      break;
  }
  return { start, end };
}

let _searchDebounce = null;
function debounce(fn, delay = 300) {
  return (...args) => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => fn(...args), delay);
  };
}

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'crm',
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
  try {
    const [
      leadsRes,
      stagesRes,
      sourcesRes,
      packagesRes,
      invoicesRes,
      proposalsRes,
      venueRes,
      adSpendRes,
      spacesRes,
    ] = await Promise.all([
      supabase.from('crm_leads').select('*, stage:crm_pipeline_stages(*), source:crm_lead_sources(*), owner:app_users!crm_leads_assigned_to_fkey(id, display_name, email), space:spaces!crm_leads_space_id_fkey(id, name)').order('created_at', { ascending: false }),
      supabase.from('crm_pipeline_stages').select('*').order('sort_order'),
      supabase.from('crm_lead_sources').select('*').order('sort_order'),
      supabase.from('crm_service_packages').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('crm_invoices').select('*, line_items:crm_invoice_line_items(*)').order('created_at', { ascending: false }),
      supabase.from('crm_proposals').select('*, items:crm_proposal_items(*)').order('created_at', { ascending: false }),
      supabase.from('crm_venue_catalog').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('crm_ad_spend').select('*').order('date', { ascending: false }),
      supabase.from('spaces').select('id, name, booking_category, hourly_rate, full_day_rate, overnight_rate, cleaning_fee').eq('is_archived', false).eq('booking_category', 'rental_space').order('booking_display_order'),
    ]);

    leads = leadsRes.data || [];
    stages = stagesRes.data || [];
    sources = sourcesRes.data || [];
    servicePackages = packagesRes.data || [];
    invoices = invoicesRes.data || [];
    proposals = proposalsRes.data || [];
    venueCatalog = venueRes.data || [];
    adSpend = adSpendRes.data || [];
    rentalSpaces = spacesRes.data || [];
  } catch (err) {
    console.error('CRM loadAllData error:', err);
    showToast('Error loading CRM data', 'error');
  }
}

// =============================================
// FILTERING
// =============================================

function getFilteredLeads() {
  return leads.filter(l => {
    if (currentBizLine !== 'all' && l.business_line !== currentBizLine) return false;
    if (leadFilterSource && l.source_id !== leadFilterSource) return false;
    if (leadFilterStage && l.stage_id !== leadFilterStage) return false;
    if (leadFilterStatus && l.status !== leadFilterStatus) return false;
    if (leadFilterOwner && l.assigned_to !== leadFilterOwner) return false;
    if (leadSearchText) {
      const q = leadSearchText.toLowerCase();
      const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
      const email = (l.email || '').toLowerCase();
      const phone = (l.phone || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });
}

function getFilteredInvoices() {
  return invoices.filter(inv => {
    if (currentBizLine !== 'all' && inv.business_line !== currentBizLine) return false;
    if (invoiceFilterStatus && inv.status !== invoiceFilterStatus) return false;
    if (invoiceSearchText) {
      const q = invoiceSearchText.toLowerCase();
      const num = (inv.invoice_number || '').toLowerCase();
      const name = (inv.client_name || '').toLowerCase();
      if (!num.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });
}

function getFilteredProposals() {
  return proposals.filter(p => {
    if (proposalFilterStatus && p.status !== proposalFilterStatus) return false;
    if (proposalSearchText) {
      const q = proposalSearchText.toLowerCase();
      const num = (p.proposal_number || '').toLowerCase();
      const title = (p.title || '').toLowerCase();
      if (!num.includes(q) && !title.includes(q)) return false;
    }
    return true;
  });
}

// =============================================
// RENDER ALL
// =============================================

function renderAll() {
  renderBizLineSwitcher();
  renderSubtabs();
  renderStats();
  renderCurrentPanel();
}

function renderCurrentPanel() {
  switch (currentSubtab) {
    case 'pipeline': renderPipeline(); break;
    case 'leads': renderLeadsTable(); break;
    case 'invoices': renderInvoicesTable(); break;
    case 'proposals': renderProposalsTable(); break;
    case 'dashboard': renderDashboard(); break;
  }
}

// =============================================
// BUSINESS LINE SWITCHER
// =============================================

function renderBizLineSwitcher() {
  const container = document.getElementById('crm-biz-switcher');
  if (!container) return;
  const lines = [
    { key: 'within', label: 'Within' },
    { key: 'awkn_ranch', label: 'AWKN Ranch' },
    { key: 'all', label: 'All' },
  ];
  container.innerHTML = lines.map(bl =>
    `<button class="crm-biz-btn ${bl.key === currentBizLine ? 'active' : ''}" data-biz="${bl.key}">${escapeHtml(bl.label)}</button>`
  ).join('');
}

// =============================================
// SUB-TABS
// =============================================

function renderSubtabs() {
  const container = document.getElementById('crm-subtabs');
  if (!container) return;

  const tabs = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'leads', label: 'Leads' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'proposals', label: 'Proposals' },
    { key: 'dashboard', label: 'Dashboard' },
  ];

  // Hide proposals tab unless business line is awkn_ranch or all
  const visibleTabs = tabs.filter(t => {
    if (t.key === 'proposals' && currentBizLine !== 'awkn_ranch' && currentBizLine !== 'all') return false;
    return true;
  });

  container.innerHTML = visibleTabs.map(t =>
    `<button class="crm-subtab ${t.key === currentSubtab ? 'active' : ''}" data-tab="${t.key}">${escapeHtml(t.label)}</button>`
  ).join('');

  // If current subtab is proposals and it's hidden, switch to pipeline
  if (currentSubtab === 'proposals' && currentBizLine !== 'awkn_ranch' && currentBizLine !== 'all') {
    currentSubtab = 'pipeline';
  }
}

// =============================================
// STATS BAR
// =============================================

function renderStats() {
  const container = document.getElementById('crm-stats');
  if (!container) return;

  const filtered = getFilteredLeads();
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const openLeads = filtered.filter(l => l.status === 'open').length;
  const newThisMonth = filtered.filter(l => new Date(l.created_at) >= firstOfMonth).length;

  const wonThisMonth = filtered.filter(l => l.status === 'won' && l.closed_at && new Date(l.closed_at) >= firstOfMonth).length;
  const lostThisMonth = filtered.filter(l => l.status === 'lost' && l.closed_at && new Date(l.closed_at) >= firstOfMonth).length;
  const convRate = (wonThisMonth + lostThisMonth) > 0
    ? Math.round((wonThisMonth / (wonThisMonth + lostThisMonth)) * 100)
    : 0;

  const filteredInvoices = getFilteredInvoices();
  const revenueThisMonth = filteredInvoices
    .filter(inv => inv.status === 'paid' && inv.paid_at && new Date(inv.paid_at) >= firstOfMonth)
    .reduce((sum, inv) => sum + (inv.total || 0), 0);

  container.innerHTML = `
    <div class="crm-stat-card">
      <div class="crm-stat-value">${openLeads}</div>
      <div class="crm-stat-label">Open Leads</div>
    </div>
    <div class="crm-stat-card">
      <div class="crm-stat-value">${newThisMonth}</div>
      <div class="crm-stat-label">New This Month</div>
    </div>
    <div class="crm-stat-card">
      <div class="crm-stat-value">${convRate}%</div>
      <div class="crm-stat-label">Conversion Rate</div>
    </div>
    <div class="crm-stat-card">
      <div class="crm-stat-value">${formatCurrency(revenueThisMonth)}</div>
      <div class="crm-stat-label">Revenue This Month</div>
    </div>
  `;
}

// =============================================
// PIPELINE KANBAN
// =============================================

function renderPipeline() {
  const panel = document.getElementById('crm-panel-pipeline');
  if (!panel) return;

  const filtered = getFilteredLeads().filter(l => l.status === 'open');

  let html = `
    <div class="crm-pipeline-toolbar">
      <button class="crm-btn crm-btn-primary" id="btn-new-lead">+ New Lead</button>
      <a href="scheduling.html" class="crm-btn crm-btn-sm" style="margin-left:auto;background:#4F46E5;color:#fff;border-color:#4F46E5;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Scheduling Setup
      </a>
    </div>
    <div class="crm-kanban">
  `;

  if (currentBizLine === 'all') {
    // Merged "All" view — combine equivalent stages into shared columns
    const MERGED_COLUMNS = [
      { label: 'New Lead / Inquiry', slugs: ['new_lead', 'inquiry'], color: '#3B82F6' },
      { label: 'Contacted', slugs: ['contacted'], color: '#8B5CF6' },
      { label: 'Intake Forms Sent', slugs: ['intake_forms_sent'], color: '#A855F7', biz: 'within' },
      { label: 'Intake Forms Complete', slugs: ['intake_forms_complete'], color: '#D946EF', biz: 'within' },
      { label: 'Tour / Call', slugs: ['tour_call'], color: '#A855F7', biz: 'ranch' },
      { label: 'Consultation Scheduled', slugs: ['consultation_scheduled'], color: '#EC4899', biz: 'within' },
      { label: 'Consultation Complete', slugs: ['consultation_complete'], color: '#F97316', biz: 'within' },
      { label: 'Proposal Sent', slugs: ['proposal_sent'], color: '#EAB308', biz: 'ranch' },
      { label: 'Invoice Sent', slugs: ['invoice_sent'], color: '#EAB308', biz: 'within' },
      { label: 'Invoice Paid', slugs: ['invoice_paid'], color: '#22C55E' },
      { label: 'Client Scheduled', slugs: ['client_scheduled'], color: '#14B8A6', biz: 'within' },
      { label: 'Event Scheduled', slugs: ['event_scheduled'], color: '#14B8A6', biz: 'ranch' },
      { label: 'Active Client', slugs: ['active_client'], color: '#10B981', biz: 'within' },
      { label: 'Event Complete', slugs: ['event_complete'], color: '#10B981', biz: 'ranch' },
      { label: 'Feedback Form Sent', slugs: ['feedback_form_sent'], color: '#6366F1' },
    ];

    for (const col of MERGED_COLUMNS) {
      // Find matching stage IDs for this merged column
      const matchingStageIds = stages
        .filter(s => col.slugs.includes(s.slug) && (!col.biz || (col.biz === 'within' ? s.business_line === 'within' : s.business_line === 'awkn_ranch')))
        .map(s => s.id);
      const colLeads = filtered.filter(l => matchingStageIds.includes(l.stage_id));

      // Skip empty columns for biz-specific stages
      if (col.biz && colLeads.length === 0) continue;

      // For drag-drop, use the first matching stage id
      const primaryStageId = matchingStageIds[0] || '';

      html += `
        <div class="crm-kanban-col" data-stage-id="${primaryStageId}" data-stage-ids="${matchingStageIds.join(',')}">
          <div class="crm-kanban-header" style="border-bottom: 3px solid ${col.color}">
            <div>
              <span class="crm-kanban-title">${escapeHtml(col.label)}</span>
            </div>
            <span class="crm-kanban-count">${colLeads.length}</span>
          </div>
          <div class="crm-kanban-cards" data-stage-id="${primaryStageId}" data-stage-ids="${matchingStageIds.join(',')}">
            ${colLeads.map(l => renderKanbanCard(l)).join('')}
          </div>
        </div>
      `;
    }
  } else {
    // Single business line view — show stages as-is
    const filteredStages = stages.filter(s => s.business_line === currentBizLine);

    if (filteredStages.length === 0) {
      panel.innerHTML = '<div class="crm-empty">No pipeline stages configured for this business line.</div>';
      return;
    }

    for (const stage of filteredStages) {
      const stageLeads = filtered.filter(l => l.stage_id === stage.id);
      html += `
        <div class="crm-kanban-col" data-stage-id="${stage.id}">
          <div class="crm-kanban-header" style="border-bottom: 3px solid ${escapeHtml(stage.color || '#6b7280')}">
            <span class="crm-kanban-title">${escapeHtml(stage.name)}</span>
            <span class="crm-kanban-count">${stageLeads.length}</span>
          </div>
          <div class="crm-kanban-cards" data-stage-id="${stage.id}">
            ${stageLeads.map(l => renderKanbanCard(l)).join('')}
          </div>
        </div>
      `;
    }
  }

  html += '</div>';
  panel.innerHTML = html;
  setupKanbanDragDrop();
}

function renderKanbanCard(lead) {
  const name = escapeHtml(`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed');
  const sourceName = lead.source?.name || '';
  const spaceName = lead.space?.name || '';
  const ownerName = lead.owner?.display_name || lead.owner?.email || '';
  const days = daysAgo(lead.created_at);
  const value = lead.estimated_value > 0 ? formatCurrency(lead.estimated_value) : '';
  const eventInfo = lead.event_date ? formatDate(lead.event_date) : '';

  const bizTag = lead.business_line === 'within' ? 'within' : 'ranch';
  const bizLabel = lead.business_line === 'within' ? 'Within' : 'Ranch';

  return `
    <div class="crm-kanban-card crm-card-biz-${bizTag}" draggable="true" data-lead-id="${lead.id}">
      <div class="crm-kanban-card-top"><span class="crm-kanban-card-name">${name}</span>${currentBizLine === 'all' ? `<span class="crm-biz-tag crm-biz-tag-${bizTag}">${bizLabel}</span>` : ''}</div>
      ${spaceName ? `<div class="crm-kanban-card-space"><span class="crm-space-tag">${escapeHtml(spaceName)}</span>${eventInfo ? ` · ${eventInfo}` : ''}</div>` : ''}
      <div class="crm-kanban-card-meta">
        ${sourceName ? `<span class="crm-source-badge">${escapeHtml(sourceName)}</span>` : ''}
        ${value ? `<span class="crm-card-value">${value}</span>` : ''}
      </div>
      <div class="crm-kanban-card-age">
        ${ownerName ? `<span class="crm-owner-tag">${escapeHtml(ownerName)}</span> · ` : ''}${days}d ago
      </div>
    </div>
  `;
}

function setupKanbanDragDrop() {
  const cards = document.querySelectorAll('.crm-kanban-card');
  const dropZones = document.querySelectorAll('.crm-kanban-cards');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.leadId);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dropZones.forEach(z => z.classList.remove('drag-over'));
    });
  });

  dropZones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      let newStageId = zone.dataset.stageId;

      // For merged columns in All view, pick the stage matching the lead's business line
      const mergedIds = zone.dataset.stageIds;
      if (mergedIds && leadId) {
        const lead = leads.find(l => l.id === leadId);
        if (lead) {
          const ids = mergedIds.split(',');
          const match = ids.find(sid => {
            const st = stages.find(s => s.id === sid);
            return st && st.business_line === lead.business_line;
          });
          if (match) newStageId = match;
        }
      }

      if (leadId && newStageId) {
        await moveLeadToStage(leadId, newStageId);
      }
    });
  });
}

async function moveLeadToStage(leadId, newStageId) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead || lead.stage_id === newStageId) return;

  const oldStageId = lead.stage_id;
  try {
    const { error } = await supabase
      .from('crm_leads')
      .update({ stage_id: newStageId, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) throw error;

    // Log activity
    await supabase.from('crm_activities').insert({
      lead_id: leadId,
      activity_type: 'stage_change',
      description: `Moved from ${stages.find(s => s.id === oldStageId)?.name || 'unknown'} to ${stages.find(s => s.id === newStageId)?.name || 'unknown'}`,
      old_stage_id: oldStageId,
      new_stage_id: newStageId,
      created_by: authState?.user?.id || null,
    });

    // Auto-create calendar booking when AWKN Ranch lead reaches "Event Scheduled"
    const newStage = stages.find(s => s.id === newStageId);
    if (newStage?.slug === 'event_scheduled' && lead.business_line === 'awkn_ranch' && lead.space_id && lead.event_date && !lead.booking_id) {
      try {
        const startDT = lead.event_start_time
          ? `${lead.event_date}T${lead.event_start_time}:00`
          : `${lead.event_date}T09:00:00`;
        const endDT = lead.event_end_time
          ? `${lead.event_date}T${lead.event_end_time}:00`
          : `${lead.event_date}T17:00:00`;

        const space = rentalSpaces.find(s => s.id === lead.space_id);
        const clientName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();

        const { data: booking, error: bookErr } = await supabase
          .from('booking_spaces')
          .insert({
            space_id: lead.space_id,
            client_name: clientName,
            client_email: lead.email || null,
            client_phone: lead.phone || null,
            booking_type: 'full_day',
            start_datetime: startDT,
            end_datetime: endDT,
            flat_rate: space?.full_day_rate || 0,
            cleaning_fee: space?.cleaning_fee || 0,
            total_amount: parseFloat(space?.full_day_rate || 0) + parseFloat(space?.cleaning_fee || 0),
            status: 'confirmed',
            notes: `Auto-created from CRM lead. Event type: ${lead.event_type || 'N/A'}. Guests: ${lead.guest_count || 'N/A'}.`,
            created_by: authState?.appUser?.id || null,
          })
          .select('id')
          .single();

        if (!bookErr && booking) {
          // Link booking back to lead
          await supabase.from('crm_leads').update({ booking_id: booking.id }).eq('id', leadId);
          await addActivity(leadId, 'system', `Calendar booking created for ${space?.name || 'space'} on ${formatDate(lead.event_date)}`);
          showToast(`Booking added to calendar: ${space?.name || 'Space'} on ${formatDate(lead.event_date)}`, 'success');
        }
      } catch (bookingErr) {
        console.error('Auto-create booking error:', bookingErr);
        showToast('Lead moved but calendar booking failed — create manually', 'warning');
      }
    }

    showToast('Lead moved', 'success');
    await loadAllData();
    renderAll();
  } catch (err) {
    console.error('Move lead error:', err);
    showToast('Error moving lead', 'error');
  }
}

// =============================================
// LEADS TABLE
// =============================================

function renderLeadsTable() {
  const panel = document.getElementById('crm-panel-leads');
  if (!panel) return;

  const filtered = getFilteredLeads();

  // Build source options
  const sourceOptions = sources
    .filter(s => s.is_active)
    .map(s => `<option value="${s.id}" ${leadFilterSource === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  // Build stage options for current biz line
  const stageOptions = stages
    .filter(s => currentBizLine === 'all' || s.business_line === currentBizLine)
    .map(s => `<option value="${s.id}" ${leadFilterStage === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  // Build owner options from unique lead owners
  const ownerMap = new Map();
  leads.forEach(l => {
    if (l.assigned_to && l.owner) {
      ownerMap.set(l.assigned_to, l.owner.display_name || l.owner.email || l.assigned_to);
    }
  });
  const ownerOptions = Array.from(ownerMap.entries())
    .map(([id, name]) => `<option value="${id}" ${leadFilterOwner === id ? 'selected' : ''}>${escapeHtml(name)}</option>`)
    .join('');

  let html = `
    <div class="crm-table-toolbar">
      <div class="crm-filters">
        <input type="text" class="crm-search" id="lead-search" placeholder="Search leads..." value="${escapeHtml(leadSearchText)}">
        <select class="crm-select" id="lead-filter-source">
          <option value="">All Sources</option>
          ${sourceOptions}
        </select>
        <select class="crm-select" id="lead-filter-stage">
          <option value="">All Stages</option>
          ${stageOptions}
        </select>
        <select class="crm-select" id="lead-filter-status">
          <option value="" ${!leadFilterStatus ? 'selected' : ''}>All Status</option>
          <option value="open" ${leadFilterStatus === 'open' ? 'selected' : ''}>Open</option>
          <option value="won" ${leadFilterStatus === 'won' ? 'selected' : ''}>Won</option>
          <option value="lost" ${leadFilterStatus === 'lost' ? 'selected' : ''}>Lost</option>
        </select>
        <select class="crm-select" id="lead-filter-owner">
          <option value="">All Owners</option>
          ${ownerOptions}
        </select>
      </div>
      <button class="crm-btn crm-btn-primary" id="btn-new-lead-table">+ New Lead</button>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            ${currentBizLine === 'all' ? '<th></th>' : ''}
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Source</th>
            <th>Stage</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Value</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
  `;

  const colCount = currentBizLine === 'all' ? 10 : 9;
  if (filtered.length === 0) {
    html += `<tr><td colspan="${colCount}" class="crm-empty-row">No leads found</td></tr>`;
  } else {
    for (const lead of filtered) {
      const name = escapeHtml(`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed');
      const stageColor = lead.stage?.color || '#6b7280';
      const stageName = lead.stage?.name || '';
      const sourceName = lead.source?.name || '';
      const ownerName = lead.owner?.display_name || lead.owner?.email || '';
      const statusClass = lead.status === 'won' ? 'crm-status-won' : lead.status === 'lost' ? 'crm-status-lost' : 'crm-status-open';
      const bizTag = lead.business_line === 'within' ? 'within' : 'ranch';

      html += `
        <tr class="crm-lead-row" data-lead-id="${lead.id}">
          ${currentBizLine === 'all' ? `<td><span class="crm-biz-tag crm-biz-tag-${bizTag}">${bizTag === 'within' ? 'Within' : 'Ranch'}</span></td>` : ''}
          <td class="crm-lead-name">${name}</td>
          <td>${escapeHtml(lead.email || '')}</td>
          <td>${escapeHtml(lead.phone || '')}</td>
          <td>${sourceName ? `<span class="crm-source-badge">${escapeHtml(sourceName)}</span>` : ''}</td>
          <td><span class="crm-stage-badge" style="background:${escapeHtml(stageColor)}20;color:${escapeHtml(stageColor)};border:1px solid ${escapeHtml(stageColor)}40">${escapeHtml(stageName)}</span></td>
          <td>${ownerName ? `<span class="crm-owner-tag">${escapeHtml(ownerName)}</span>` : ''}</td>
          <td><span class="crm-status-badge ${statusClass}">${escapeHtml(lead.status || 'open')}</span></td>
          <td>${lead.estimated_value > 0 ? formatCurrency(lead.estimated_value) : ''}</td>
          <td>${formatDate(lead.created_at)}</td>
        </tr>
      `;
    }
  }

  html += '</tbody></table></div>';
  html += `<div class="crm-table-footer">${filtered.length} lead${filtered.length !== 1 ? 's' : ''}</div>`;
  panel.innerHTML = html;
}

// =============================================
// LEAD DETAIL MODAL
// =============================================

async function openLeadDetail(leadId) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;

  // Load activities for this lead
  let leadActivities = [];
  try {
    const { data } = await supabase
      .from('crm_activities')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });
    leadActivities = data || [];
  } catch (err) {
    console.error('Error loading activities:', err);
  }

  const name = escapeHtml(`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed');
  const stageColor = lead.stage?.color || '#6b7280';

  // Stage dropdown options
  const stageOpts = stages
    .filter(s => s.business_line === lead.business_line)
    .map(s => `<option value="${s.id}" ${s.id === lead.stage_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const modal = document.getElementById('crm-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="crm-modal-overlay">
      <div class="crm-modal-content crm-modal-large">
        <div class="crm-modal-header">
          <div style="display:flex;align-items:center;gap:10px">
            <h2>${name}</h2>
            <button class="crm-btn crm-btn-sm" id="btn-edit-lead" style="font-size:11px">Edit</button>
          </div>
          <button class="crm-modal-close" id="crm-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body crm-detail-layout">
          <div class="crm-detail-left">
            <h3>Contact Info</h3>
            <div class="crm-detail-field">
              <label>Email</label>
              <div>${escapeHtml(lead.email || 'N/A')}</div>
            </div>
            <div class="crm-detail-field">
              <label>Phone</label>
              <div>${escapeHtml(lead.phone || 'N/A')}</div>
            </div>
            <div class="crm-detail-field">
              <label>Location</label>
              <div>${escapeHtml([lead.city, lead.state].filter(Boolean).join(', ') || 'N/A')}</div>
            </div>

            <h3>Pipeline</h3>
            <div class="crm-detail-field">
              <label>Stage</label>
              <select class="crm-select" id="detail-stage-select">${stageOpts}</select>
            </div>
            <div class="crm-detail-field">
              <label>Status</label>
              <span class="crm-status-badge crm-status-${lead.status}">${escapeHtml(lead.status)}</span>
            </div>
            <div class="crm-detail-field">
              <label>Estimated Value</label>
              <div>${formatCurrency(lead.estimated_value)}</div>
            </div>
            <div class="crm-detail-field">
              <label>Source</label>
              <div>${escapeHtml(lead.source?.name || 'N/A')}</div>
            </div>
            <div class="crm-detail-field">
              <label>Owner</label>
              <div>${escapeHtml(lead.owner?.display_name || lead.owner?.email || 'Unassigned')}</div>
            </div>
            ${lead.business_line === 'awkn_ranch' ? `
            <h3>Event Details</h3>
            <div class="crm-detail-field">
              <label>Requested Space</label>
              <div>${lead.space?.name ? `<span class="crm-space-tag">${escapeHtml(lead.space.name)}</span>` : 'Not selected'}</div>
            </div>
            ${lead.event_type ? `<div class="crm-detail-field"><label>Event Type</label><div>${escapeHtml(lead.event_type)}</div></div>` : ''}
            ${lead.event_date ? `<div class="crm-detail-field"><label>Event Date</label><div>${formatDate(lead.event_date)}</div></div>` : ''}
            ${lead.guest_count ? `<div class="crm-detail-field"><label>Guest Count</label><div>${lead.guest_count}</div></div>` : ''}
            ${lead.event_start_time || lead.event_end_time ? `<div class="crm-detail-field"><label>Time</label><div>${escapeHtml(lead.event_start_time || '')}${lead.event_end_time ? ' – ' + escapeHtml(lead.event_end_time) : ''}</div></div>` : ''}
            ` : ''}
            ${lead.utm_source ? `<div class="crm-detail-field"><label>UTM</label><div>${escapeHtml(lead.utm_source)}${lead.utm_medium ? ' / ' + escapeHtml(lead.utm_medium) : ''}${lead.utm_campaign ? ' / ' + escapeHtml(lead.utm_campaign) : ''}</div></div>` : ''}

            <h3>Quick Actions</h3>
            <div class="crm-quick-actions">
              <button class="crm-btn crm-btn-sm" id="btn-add-note">Add Note</button>
              <button class="crm-btn crm-btn-sm" id="btn-log-call">Log Call</button>
              ${lead.business_line === 'within' ? '<button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-create-invoice-from-lead">Create Invoice</button>' : ''}
              ${lead.business_line === 'awkn_ranch' ? '<button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-create-proposal-from-lead">Create Proposal</button>' : ''}
              ${lead.email ? '<button class="crm-btn crm-btn-sm" id="btn-send-feedback" style="background:#6366F1;color:#fff;border-color:#6366F1">Send Feedback Form</button>' : ''}
              ${lead.status === 'open' ? '<button class="crm-btn crm-btn-sm crm-btn-success" id="btn-mark-won">Mark Won</button>' : ''}
              ${lead.status === 'open' ? '<button class="crm-btn crm-btn-sm crm-btn-danger" id="btn-mark-lost">Mark Lost</button>' : ''}
            </div>

            <div id="crm-quick-action-form" class="crm-quick-action-form" style="display:none;"></div>
          </div>

          <div class="crm-detail-right">
            <h3>Activity Timeline</h3>
            <div class="crm-timeline">
              ${leadActivities.length === 0 ? '<div class="crm-empty">No activity yet</div>' : ''}
              ${leadActivities.map(a => renderActivityItem(a)).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
  setupLeadDetailListeners(lead);
}

function renderActivityItem(activity) {
  const iconMap = {
    note: 'N',
    call: 'C',
    email: 'E',
    stage_change: 'S',
    sms: 'T',
    meeting: 'M',
    system: 'SYS',
  };
  const icon = iconMap[activity.activity_type] || '?';
  const typeLabel = (activity.activity_type || '').replace('_', ' ');

  return `
    <div class="crm-timeline-item">
      <div class="crm-timeline-icon crm-timeline-${activity.activity_type}">${icon}</div>
      <div class="crm-timeline-content">
        <div class="crm-timeline-type">${escapeHtml(typeLabel)}</div>
        <div class="crm-timeline-desc">${escapeHtml(activity.description || '')}</div>
        <div class="crm-timeline-date">${formatDateTime(activity.created_at)}</div>
      </div>
    </div>
  `;
}

function setupLeadDetailListeners(lead) {
  // Close modal
  document.getElementById('crm-modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('crm-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'crm-modal-overlay') closeModal();
  });

  // Edit lead — close detail and open edit modal
  document.getElementById('btn-edit-lead')?.addEventListener('click', () => {
    closeModal();
    openLeadModal(lead);
  });

  // Stage change
  document.getElementById('detail-stage-select')?.addEventListener('change', async (e) => {
    const newStageId = e.target.value;
    if (newStageId !== lead.stage_id) {
      await moveLeadToStage(lead.id, newStageId);
      closeModal();
    }
  });

  // Add Note
  document.getElementById('btn-add-note')?.addEventListener('click', () => {
    const form = document.getElementById('crm-quick-action-form');
    form.style.display = 'block';
    form.innerHTML = `
      <textarea id="note-text" class="crm-textarea" placeholder="Enter note..." rows="3"></textarea>
      <div class="crm-form-actions">
        <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-save-note">Save Note</button>
        <button class="crm-btn crm-btn-sm" id="btn-cancel-note">Cancel</button>
      </div>
    `;
    document.getElementById('btn-save-note').addEventListener('click', async () => {
      const text = document.getElementById('note-text').value.trim();
      if (!text) { showToast('Note cannot be empty', 'error'); return; }
      await addActivity(lead.id, 'note', text);
      await openLeadDetail(lead.id);
    });
    document.getElementById('btn-cancel-note').addEventListener('click', () => {
      form.style.display = 'none';
    });
  });

  // Log Call
  document.getElementById('btn-log-call')?.addEventListener('click', () => {
    const form = document.getElementById('crm-quick-action-form');
    form.style.display = 'block';
    form.innerHTML = `
      <textarea id="call-text" class="crm-textarea" placeholder="Call summary..." rows="3"></textarea>
      <div class="crm-form-actions">
        <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-save-call">Save Call</button>
        <button class="crm-btn crm-btn-sm" id="btn-cancel-call">Cancel</button>
      </div>
    `;
    document.getElementById('btn-save-call').addEventListener('click', async () => {
      const text = document.getElementById('call-text').value.trim();
      if (!text) { showToast('Call summary cannot be empty', 'error'); return; }
      await addActivity(lead.id, 'call', text);
      await openLeadDetail(lead.id);
    });
    document.getElementById('btn-cancel-call').addEventListener('click', () => {
      form.style.display = 'none';
    });
  });

  // Mark Won
  document.getElementById('btn-mark-won')?.addEventListener('click', async () => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('crm_leads')
        .update({ status: 'won', closed_at: now, converted_at: now, updated_at: now })
        .eq('id', lead.id);
      if (error) throw error;
      await addActivity(lead.id, 'system', 'Lead marked as WON');
      showToast('Lead marked as won', 'success');
      await loadAllData();
      renderAll();
      closeModal();
    } catch (err) {
      console.error('Mark won error:', err);
      showToast('Error updating lead', 'error');
    }
  });

  // Mark Lost
  document.getElementById('btn-mark-lost')?.addEventListener('click', () => {
    const form = document.getElementById('crm-quick-action-form');
    form.style.display = 'block';
    form.innerHTML = `
      <input type="text" id="lost-reason" class="crm-input" placeholder="Lost reason...">
      <div class="crm-form-actions">
        <button class="crm-btn crm-btn-sm crm-btn-danger" id="btn-save-lost">Confirm Lost</button>
        <button class="crm-btn crm-btn-sm" id="btn-cancel-lost">Cancel</button>
      </div>
    `;
    document.getElementById('btn-save-lost').addEventListener('click', async () => {
      const reason = document.getElementById('lost-reason').value.trim();
      try {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('crm_leads')
          .update({ status: 'lost', lost_reason: reason || null, closed_at: now, updated_at: now })
          .eq('id', lead.id);
        if (error) throw error;
        await addActivity(lead.id, 'system', `Lead marked as LOST${reason ? ': ' + reason : ''}`);
        showToast('Lead marked as lost', 'success');
        await loadAllData();
        renderAll();
        closeModal();
      } catch (err) {
        console.error('Mark lost error:', err);
        showToast('Error updating lead', 'error');
      }
    });
    document.getElementById('btn-cancel-lost').addEventListener('click', () => {
      form.style.display = 'none';
    });
  });

  // Create Invoice from lead
  document.getElementById('btn-create-invoice-from-lead')?.addEventListener('click', () => {
    closeModal();
    openInvoiceModal(null, lead);
  });

  // Create Proposal from lead
  document.getElementById('btn-create-proposal-from-lead')?.addEventListener('click', () => {
    closeModal();
    openProposalModal(null, lead);
  });

  // Send Feedback Form
  document.getElementById('btn-send-feedback')?.addEventListener('click', () => {
    const form = document.getElementById('crm-quick-action-form');
    const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    const bizLabel = lead.business_line === 'within' ? 'Within' : 'AWKN Ranch';

    form.style.display = 'block';
    form.innerHTML = `
      <div class="crm-form-field">
        <label>To</label>
        <input type="email" class="crm-input" id="feedback-to" value="${escapeHtml(lead.email || '')}" readonly style="background:#f3f4f6">
      </div>
      <div class="crm-form-field">
        <label>Subject</label>
        <input type="text" class="crm-input" id="feedback-subject" value="We'd love your feedback — ${escapeHtml(bizLabel)}">
      </div>
      <div class="crm-form-field">
        <label>Message</label>
        <textarea id="feedback-body" class="crm-textarea" rows="8">Hi ${escapeHtml(leadName)},

Thank you for choosing ${bizLabel}! We hope your experience was meaningful and transformative.

We'd love to hear your thoughts so we can continue improving. Please take a moment to share your feedback by replying to this email or filling out our short form:

[Feedback Form Link]

Your insight means the world to us.

With gratitude,
The ${bizLabel} Team</textarea>
      </div>
      <div class="crm-form-actions">
        <button class="crm-btn crm-btn-sm" style="background:#6366F1;color:#fff;border-color:#6366F1" id="btn-confirm-send-feedback">Send Email</button>
        <button class="crm-btn crm-btn-sm" id="btn-cancel-feedback">Cancel</button>
      </div>
    `;

    document.getElementById('btn-confirm-send-feedback').addEventListener('click', async () => {
      const to = document.getElementById('feedback-to').value.trim();
      const subject = document.getElementById('feedback-subject').value.trim();
      const body = document.getElementById('feedback-body').value.trim();
      if (!to || !subject || !body) {
        showToast('All fields are required', 'error');
        return;
      }

      const btn = document.getElementById('btn-confirm-send-feedback');
      btn.disabled = true;
      btn.textContent = 'Sending...';

      try {
        // Convert plain text body to HTML
        const htmlBody = '<p>' + escapeHtml(body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';

        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
        const resp = await fetch(supabaseUrl + '/functions/v1/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo',
          },
          body: JSON.stringify({
            type: 'custom',
            to: to,
            data: {
              subject: subject,
              html: htmlBody,
              text: body,
            },
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to send email');
        }

        // Move lead to "Feedback Form Sent" stage
        const feedbackStage = stages.find(s => s.business_line === lead.business_line && s.slug === 'feedback_form_sent');
        if (feedbackStage && lead.stage_id !== feedbackStage.id) {
          await moveLeadToStage(lead.id, feedbackStage.id);
        }

        await addActivity(lead.id, 'email', 'Feedback form sent to ' + to);
        showToast('Feedback form sent!', 'success');
        await loadAllData();
        renderAll();
        closeModal();
      } catch (err) {
        console.error('Send feedback error:', err);
        showToast('Error sending feedback: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Send Email';
      }
    });

    document.getElementById('btn-cancel-feedback').addEventListener('click', () => {
      form.style.display = 'none';
    });
  });
}

async function addActivity(leadId, type, description) {
  try {
    const { error } = await supabase.from('crm_activities').insert({
      lead_id: leadId,
      activity_type: type,
      description,
      created_by: authState?.user?.id || null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('Add activity error:', err);
    showToast('Error logging activity', 'error');
  }
}

// =============================================
// NEW / EDIT LEAD MODAL
// =============================================

function openLeadModal(lead = null) {
  const isEdit = !!lead;
  const bizLine = lead?.business_line || currentBizLine === 'all' ? 'within' : currentBizLine;

  const sourceOptions = sources
    .filter(s => s.is_active)
    .map(s => `<option value="${s.id}" ${lead && lead.source_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const stageOptions = stages
    .filter(s => s.business_line === (lead?.business_line || bizLine))
    .map(s => `<option value="${s.id}" ${lead && lead.stage_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  const modal = document.getElementById('crm-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="crm-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Lead' : 'New Lead'}</h2>
          <button class="crm-modal-close" id="crm-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Business Line</label>
              <select class="crm-select" id="lead-biz-line">
                <option value="within" ${(lead?.business_line || bizLine) === 'within' ? 'selected' : ''}>Within</option>
                <option value="awkn_ranch" ${(lead?.business_line || bizLine) === 'awkn_ranch' ? 'selected' : ''}>AWKN Ranch</option>
              </select>
            </div>
            <div class="crm-form-field">
              <label>Source</label>
              <select class="crm-select" id="lead-source">${sourceOptions}</select>
            </div>
            <div class="crm-form-field">
              <label>First Name *</label>
              <input type="text" class="crm-input" id="lead-first-name" value="${escapeHtml(lead?.first_name || '')}" required>
            </div>
            <div class="crm-form-field">
              <label>Last Name</label>
              <input type="text" class="crm-input" id="lead-last-name" value="${escapeHtml(lead?.last_name || '')}">
            </div>
            <div class="crm-form-field">
              <label>Email</label>
              <input type="email" class="crm-input" id="lead-email" value="${escapeHtml(lead?.email || '')}">
            </div>
            <div class="crm-form-field">
              <label>Phone</label>
              <input type="tel" class="crm-input" id="lead-phone" value="${escapeHtml(lead?.phone || '')}">
            </div>
            <div class="crm-form-field">
              <label>City</label>
              <input type="text" class="crm-input" id="lead-city" value="${escapeHtml(lead?.city || '')}">
            </div>
            <div class="crm-form-field">
              <label>State</label>
              <input type="text" class="crm-input" id="lead-state" value="${escapeHtml(lead?.state || '')}">
            </div>
            <div class="crm-form-field">
              <label>Stage</label>
              <select class="crm-select" id="lead-stage">${stageOptions}</select>
            </div>
            <div class="crm-form-field">
              <label>Estimated Value</label>
              <input type="number" class="crm-input" id="lead-value" value="${lead?.estimated_value || ''}" step="0.01" min="0">
            </div>
          </div>

          <!-- Venue/Event Fields (AWKN Ranch only) -->
          <div id="lead-venue-fields" style="display:${(lead?.business_line || bizLine) === 'awkn_ranch' ? 'block' : 'none'}; margin-top:12px; padding:12px; background:var(--bg, #faf9f6); border-radius:8px; border:1px solid var(--border-color, #e5e5e5);">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin-bottom:10px;">Event / Venue Details</div>
            <div class="crm-form-grid">
              <div class="crm-form-field">
                <label>Requested Space</label>
                <select class="crm-select" id="lead-space">
                  <option value="">— Select space —</option>
                  ${rentalSpaces.map(s => `<option value="${s.id}" ${lead?.space_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
              </div>
              <div class="crm-form-field">
                <label>Event Type</label>
                <select class="crm-select" id="lead-event-type">
                  <option value="">— Select —</option>
                  <option value="wedding" ${lead?.event_type === 'wedding' ? 'selected' : ''}>Wedding</option>
                  <option value="corporate" ${lead?.event_type === 'corporate' ? 'selected' : ''}>Corporate</option>
                  <option value="retreat" ${lead?.event_type === 'retreat' ? 'selected' : ''}>Retreat</option>
                  <option value="birthday" ${lead?.event_type === 'birthday' ? 'selected' : ''}>Birthday</option>
                  <option value="ceremony" ${lead?.event_type === 'ceremony' ? 'selected' : ''}>Ceremony</option>
                  <option value="workshop" ${lead?.event_type === 'workshop' ? 'selected' : ''}>Workshop</option>
                  <option value="other" ${lead?.event_type === 'other' ? 'selected' : ''}>Other</option>
                </select>
              </div>
              <div class="crm-form-field">
                <label>Event Date</label>
                <input type="date" class="crm-input" id="lead-event-date" value="${lead?.event_date || ''}">
              </div>
              <div class="crm-form-field">
                <label>Guest Count</label>
                <input type="number" class="crm-input" id="lead-guest-count" value="${lead?.guest_count || ''}" min="1">
              </div>
              <div class="crm-form-field">
                <label>Start Time</label>
                <input type="time" class="crm-input" id="lead-event-start" value="${lead?.event_start_time || ''}">
              </div>
              <div class="crm-form-field">
                <label>End Time</label>
                <input type="time" class="crm-input" id="lead-event-end" value="${lead?.event_end_time || ''}">
              </div>
            </div>
          </div>

          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="lead-notes" rows="3" placeholder="Initial notes...">${escapeHtml('')}</textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          ${isEdit ? '<button class="crm-btn crm-btn-danger" id="btn-delete-lead">Delete</button>' : '<span></span>'}
          <div>
            <button class="crm-btn" id="btn-cancel-lead">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-lead">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';

  // Update stage options and venue fields when business line changes
  document.getElementById('lead-biz-line').addEventListener('change', (e) => {
    const bl = e.target.value;
    const stageSelect = document.getElementById('lead-stage');
    const newStageOpts = stages
      .filter(s => s.business_line === bl)
      .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join('');
    stageSelect.innerHTML = newStageOpts;
    // Show/hide venue fields
    const venueFields = document.getElementById('lead-venue-fields');
    if (venueFields) venueFields.style.display = bl === 'awkn_ranch' ? 'block' : 'none';
  });

  document.getElementById('crm-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('crm-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'crm-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-lead').addEventListener('click', closeModal);

  document.getElementById('btn-save-lead').addEventListener('click', async () => {
    const firstName = document.getElementById('lead-first-name').value.trim();
    if (!firstName) { showToast('First name is required', 'error'); return; }

    const bizLine = document.getElementById('lead-biz-line').value;
    const payload = {
      business_line: bizLine,
      first_name: firstName,
      last_name: document.getElementById('lead-last-name').value.trim() || null,
      email: document.getElementById('lead-email').value.trim() || null,
      phone: document.getElementById('lead-phone').value.trim() || null,
      city: document.getElementById('lead-city').value.trim() || null,
      state: document.getElementById('lead-state').value.trim() || null,
      source_id: document.getElementById('lead-source').value || null,
      stage_id: document.getElementById('lead-stage').value || null,
      estimated_value: parseFloat(document.getElementById('lead-value').value) || 0,
      updated_at: new Date().toISOString(),
    };

    // Add venue/event fields for AWKN Ranch leads
    if (bizLine === 'awkn_ranch') {
      payload.space_id = document.getElementById('lead-space').value || null;
      payload.event_type = document.getElementById('lead-event-type').value || null;
      payload.event_date = document.getElementById('lead-event-date').value || null;
      payload.guest_count = parseInt(document.getElementById('lead-guest-count').value) || null;
      payload.event_start_time = document.getElementById('lead-event-start').value || null;
      payload.event_end_time = document.getElementById('lead-event-end').value || null;
    }

    try {
      if (isEdit) {
        const oldStageId = lead.stage_id;
        const { error } = await supabase.from('crm_leads').update(payload).eq('id', lead.id);
        if (error) throw error;
        // Log stage change if changed
        if (payload.stage_id && payload.stage_id !== oldStageId) {
          await addActivity(lead.id, 'stage_change',
            `Stage changed from ${stages.find(s => s.id === oldStageId)?.name || 'unknown'} to ${stages.find(s => s.id === payload.stage_id)?.name || 'unknown'}`
          );
        }
        showToast('Lead updated', 'success');
      } else {
        payload.status = 'open';
        payload.created_at = new Date().toISOString();
        payload.assigned_to = authState?.appUser?.id || null;
        const { data, error } = await supabase.from('crm_leads').insert(payload).select().single();
        if (error) throw error;
        // Add initial note if provided
        const notes = document.getElementById('lead-notes').value.trim();
        if (notes && data) {
          await addActivity(data.id, 'note', notes);
        }
        showToast('Lead created', 'success');
      }
      await loadAllData();
      renderAll();
      closeModal();
    } catch (err) {
      console.error('Save lead error:', err);
      showToast('Error saving lead', 'error');
    }
  });

  // Delete
  document.getElementById('btn-delete-lead')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete this lead? This cannot be undone.')) return;
    try {
      // Delete activities first
      await supabase.from('crm_activities').delete().eq('lead_id', lead.id);
      const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
      if (error) throw error;
      showToast('Lead deleted', 'success');
      await loadAllData();
      renderAll();
      closeModal();
    } catch (err) {
      console.error('Delete lead error:', err);
      showToast('Error deleting lead', 'error');
    }
  });
}

// =============================================
// INVOICES TAB
// =============================================

function renderInvoicesTable() {
  const panel = document.getElementById('crm-panel-invoices');
  if (!panel) return;

  const filtered = getFilteredInvoices();

  let html = `
    <div class="crm-table-toolbar">
      <div class="crm-filters">
        <input type="text" class="crm-search" id="invoice-search" placeholder="Search invoices..." value="${escapeHtml(invoiceSearchText)}">
        <select class="crm-select" id="invoice-filter-status">
          <option value="" ${!invoiceFilterStatus ? 'selected' : ''}>All Status</option>
          <option value="draft" ${invoiceFilterStatus === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="sent" ${invoiceFilterStatus === 'sent' ? 'selected' : ''}>Sent</option>
          <option value="viewed" ${invoiceFilterStatus === 'viewed' ? 'selected' : ''}>Viewed</option>
          <option value="paid" ${invoiceFilterStatus === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="void" ${invoiceFilterStatus === 'void' ? 'selected' : ''}>Void</option>
        </select>
      </div>
      <button class="crm-btn crm-btn-primary" id="btn-new-invoice">+ New Invoice</button>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Client</th>
            <th>Date</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (filtered.length === 0) {
    html += '<tr><td colspan="6" class="crm-empty-row">No invoices found</td></tr>';
  } else {
    for (const inv of filtered) {
      const statusClass = `crm-inv-status-${inv.status}`;
      html += `
        <tr>
          <td>${escapeHtml(inv.invoice_number || '')}</td>
          <td>${escapeHtml(inv.client_name || '')}</td>
          <td>${formatDate(inv.invoice_date)}</td>
          <td>${formatCurrency(inv.total)}</td>
          <td><span class="crm-status-badge ${statusClass}">${escapeHtml(inv.status || 'draft')}</span></td>
          <td class="crm-actions-cell">
            <button class="crm-btn crm-btn-xs" data-view-invoice="${inv.id}">View</button>
            ${inv.status === 'draft' ? `<button class="crm-btn crm-btn-xs crm-btn-primary" data-send-invoice="${inv.id}">Send</button>` : ''}
          </td>
        </tr>
      `;
    }
  }

  html += '</tbody></table></div>';
  html += `<div class="crm-table-footer">${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}</div>`;
  panel.innerHTML = html;
}

// =============================================
// INVOICE MODAL
// =============================================

async function openInvoiceModal(invoice = null, lead = null) {
  const isEdit = !!invoice;
  const bizLine = invoice?.business_line || lead?.business_line || (currentBizLine === 'all' ? 'within' : currentBizLine);

  // Generate invoice number for new invoices
  let invoiceNumber = invoice?.invoice_number || '';
  if (!isEdit) {
    try {
      const { data, error } = await supabase.rpc('generate_crm_number', { p_prefix: 'INV' });
      if (!error && data) invoiceNumber = data;
    } catch (e) {
      invoiceNumber = `INV-${Date.now()}`;
    }
  }

  const existingItems = invoice?.line_items || [];

  const modal = document.getElementById('crm-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="crm-modal-overlay">
      <div class="crm-modal-content crm-modal-large">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button class="crm-modal-close" id="crm-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Invoice Number</label>
              <input type="text" class="crm-input" id="inv-number" value="${escapeHtml(invoiceNumber)}" readonly>
            </div>
            <div class="crm-form-field">
              <label>Business Line</label>
              <select class="crm-select" id="inv-biz-line">
                <option value="within" ${bizLine === 'within' ? 'selected' : ''}>Within</option>
                <option value="awkn_ranch" ${bizLine === 'awkn_ranch' ? 'selected' : ''}>AWKN Ranch</option>
              </select>
            </div>
            <div class="crm-form-field">
              <label>Client Name *</label>
              <input type="text" class="crm-input" id="inv-client-name" value="${escapeHtml(invoice?.client_name || lead ? `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() : '')}">
            </div>
            <div class="crm-form-field">
              <label>Client Email</label>
              <input type="email" class="crm-input" id="inv-client-email" value="${escapeHtml(invoice?.client_email || lead?.email || '')}">
            </div>
            <div class="crm-form-field">
              <label>Client Phone</label>
              <input type="tel" class="crm-input" id="inv-client-phone" value="${escapeHtml(invoice?.client_phone || lead?.phone || '')}">
            </div>
            <div class="crm-form-field">
              <label>Invoice Date</label>
              <input type="date" class="crm-input" id="inv-date" value="${invoice?.invoice_date || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="crm-form-field">
              <label>Due Date</label>
              <input type="date" class="crm-input" id="inv-due-date" value="${invoice?.due_date || ''}">
            </div>
          </div>

          <h3 style="margin-top:16px;">Line Items</h3>
          <div id="inv-line-items">
            ${existingItems.map((item, i) => renderInvoiceLineItem(item, i)).join('')}
          </div>
          <div class="crm-form-actions" style="margin-top:8px;">
            <button class="crm-btn crm-btn-sm" id="btn-add-from-catalog">Add from Catalog</button>
            <button class="crm-btn crm-btn-sm" id="btn-add-custom-item">Add Custom Item</button>
          </div>

          <div class="crm-invoice-totals" style="margin-top:16px;">
            <div class="crm-form-grid">
              <div class="crm-form-field">
                <label>Discount Label</label>
                <input type="text" class="crm-input" id="inv-discount-label" value="${escapeHtml(invoice?.discount_label || '')}" placeholder="e.g. Early bird discount">
              </div>
              <div class="crm-form-field">
                <label>Discount Amount</label>
                <input type="number" class="crm-input" id="inv-discount" value="${invoice?.discount_amount || 0}" step="0.01" min="0">
              </div>
              <div class="crm-form-field">
                <label>Tax Amount</label>
                <input type="number" class="crm-input" id="inv-tax" value="${invoice?.tax_amount || 0}" step="0.01" min="0">
              </div>
            </div>
            <div class="crm-totals-display">
              <div>Subtotal: <strong id="inv-subtotal">${formatCurrency(invoice?.subtotal || 0)}</strong></div>
              <div>Total: <strong id="inv-total">${formatCurrency(invoice?.total || 0)}</strong></div>
            </div>
          </div>

          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="inv-notes" rows="2">${escapeHtml(invoice?.notes || '')}</textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          <button class="crm-btn" id="btn-cancel-invoice">Cancel</button>
          <div>
            <button class="crm-btn crm-btn-primary" id="btn-save-invoice-draft">Save Draft</button>
            <button class="crm-btn crm-btn-success" id="btn-send-invoice">Send Invoice</button>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
  window._invoiceLineItemCounter = existingItems.length;
  window._invoiceLeadId = lead?.id || invoice?.lead_id || null;

  // Close handlers
  document.getElementById('crm-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('crm-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'crm-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-invoice').addEventListener('click', closeModal);

  // Add from catalog
  document.getElementById('btn-add-from-catalog').addEventListener('click', () => {
    const bl = document.getElementById('inv-biz-line').value;
    const catalog = bl === 'awkn_ranch' ? venueCatalog : servicePackages.filter(p => p.business_line === bl);
    showCatalogPicker(catalog, (item) => {
      const baseLabel = item._selectedLabel || item.name || item.description || '';
      const includes = Array.isArray(item.includes) ? item.includes.filter(Boolean) : [];
      const description = includes.length
        ? `${baseLabel}\n${includes.map(i => `• ${i}`).join('\n')}`
        : baseLabel;
      addInvoiceLineItem({
        description,
        quantity: 1,
        unit_price: item._selectedPrice || item.price_regular || item.unit_price || 0,
        service_package_id: item.id || null,
      });
    });
  });

  // Add custom item
  document.getElementById('btn-add-custom-item').addEventListener('click', () => {
    addInvoiceLineItem({ description: '', quantity: 1, unit_price: 0 });
  });

  // Save draft
  document.getElementById('btn-save-invoice-draft').addEventListener('click', () => saveInvoice(invoice, 'draft'));

  // Send invoice
  document.getElementById('btn-send-invoice').addEventListener('click', () => saveInvoice(invoice, 'sent'));

  // Recalculate totals on discount/tax change
  document.getElementById('inv-discount')?.addEventListener('input', recalcInvoiceTotals);
  document.getElementById('inv-tax')?.addEventListener('input', recalcInvoiceTotals);
}

function renderInvoiceLineItem(item, index) {
  return `
    <div class="crm-line-item" data-index="${index}">
      <textarea class="crm-input crm-li-desc" placeholder="Description" rows="1">${escapeHtml(item.description || '')}</textarea>
      <input type="number" class="crm-input crm-li-qty" placeholder="Qty" value="${item.quantity || 1}" min="1" step="1">
      <input type="number" class="crm-input crm-li-price" placeholder="Price" value="${item.unit_price || 0}" min="0" step="0.01">
      <span class="crm-li-total">${formatCurrency((item.quantity || 1) * (item.unit_price || 0))}</span>
      <button class="crm-btn crm-btn-xs crm-btn-danger crm-li-remove">&times;</button>
    </div>
  `;
}

function addInvoiceLineItem(item) {
  const container = document.getElementById('inv-line-items');
  const index = window._invoiceLineItemCounter++;
  const div = document.createElement('div');
  div.innerHTML = renderInvoiceLineItem(item, index);
  const el = div.firstElementChild;
  container.appendChild(el);
  setupLineItemListeners(el);
  recalcInvoiceTotals();
}

function setupLineItemListeners(el) {
  const qtyInput = el.querySelector('.crm-li-qty');
  const priceInput = el.querySelector('.crm-li-price');
  const totalSpan = el.querySelector('.crm-li-total');
  const removeBtn = el.querySelector('.crm-li-remove');

  const update = () => {
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    totalSpan.textContent = formatCurrency(qty * price);
    recalcInvoiceTotals();
  };

  qtyInput.addEventListener('input', update);
  priceInput.addEventListener('input', update);
  removeBtn.addEventListener('click', () => {
    el.remove();
    recalcInvoiceTotals();
  });
}

function recalcInvoiceTotals() {
  const items = document.querySelectorAll('.crm-line-item');
  let subtotal = 0;
  items.forEach(el => {
    const qty = parseFloat(el.querySelector('.crm-li-qty')?.value) || 0;
    const price = parseFloat(el.querySelector('.crm-li-price')?.value) || 0;
    subtotal += qty * price;
  });
  const discount = parseFloat(document.getElementById('inv-discount')?.value) || 0;
  const tax = parseFloat(document.getElementById('inv-tax')?.value) || 0;
  const total = subtotal - discount + tax;

  const subtotalEl = document.getElementById('inv-subtotal');
  const totalEl = document.getElementById('inv-total');
  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

function getInvoiceLineItemsFromForm() {
  const items = [];
  document.querySelectorAll('.crm-line-item').forEach((el, i) => {
    const desc = el.querySelector('.crm-li-desc')?.value?.trim() || '';
    const qty = parseFloat(el.querySelector('.crm-li-qty')?.value) || 1;
    const price = parseFloat(el.querySelector('.crm-li-price')?.value) || 0;
    if (desc) {
      items.push({
        description: desc,
        quantity: qty,
        unit_price: price,
        total: qty * price,
        sort_order: i,
      });
    }
  });
  return items;
}

async function saveInvoice(existingInvoice, status) {
  const clientName = document.getElementById('inv-client-name').value.trim();
  if (!clientName) { showToast('Client name is required', 'error'); return; }

  const lineItems = getInvoiceLineItemsFromForm();
  if (lineItems.length === 0) { showToast('Add at least one line item', 'error'); return; }

  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
  const discount = parseFloat(document.getElementById('inv-discount').value) || 0;
  const tax = parseFloat(document.getElementById('inv-tax').value) || 0;
  const total = subtotal - discount + tax;

  const payload = {
    business_line: document.getElementById('inv-biz-line').value,
    invoice_number: document.getElementById('inv-number').value,
    client_name: clientName,
    client_email: document.getElementById('inv-client-email').value.trim() || null,
    client_phone: document.getElementById('inv-client-phone').value.trim() || null,
    invoice_date: document.getElementById('inv-date').value || null,
    due_date: document.getElementById('inv-due-date').value || null,
    subtotal,
    discount_amount: discount,
    discount_label: document.getElementById('inv-discount-label').value.trim() || null,
    tax_amount: tax,
    total,
    status,
    notes: document.getElementById('inv-notes').value.trim() || null,
    lead_id: window._invoiceLeadId || null,
    created_by: authState?.user?.id || null,
  };

  try {
    let invoiceId;
    if (existingInvoice) {
      const { error } = await supabase.from('crm_invoices').update(payload).eq('id', existingInvoice.id);
      if (error) throw error;
      invoiceId = existingInvoice.id;
      // Delete old line items and re-insert
      await supabase.from('crm_invoice_line_items').delete().eq('invoice_id', invoiceId);
    } else {
      const { data, error } = await supabase.from('crm_invoices').insert(payload).select().single();
      if (error) throw error;
      invoiceId = data.id;
    }

    // Insert line items
    if (lineItems.length > 0) {
      const itemsPayload = lineItems.map(li => ({ ...li, invoice_id: invoiceId }));
      const { error: liError } = await supabase.from('crm_invoice_line_items').insert(itemsPayload);
      if (liError) throw liError;
    }

    showToast(status === 'sent' ? 'Invoice sent' : 'Invoice saved as draft', 'success');
    await loadAllData();
    renderAll();
    closeModal();
  } catch (err) {
    console.error('Save invoice error:', err);
    showToast('Error saving invoice', 'error');
  }
}

function showCatalogPicker(items, onSelect) {
  // Build picker rows — for service packages with a promo price, show both options
  const pickerRows = [];
  for (const item of items) {
    const price = item.price_regular || item.unit_price || 0;
    pickerRows.push({ item, price, label: item.name || item.description, promo: false });
    if (item.price_promo && parseFloat(item.price_promo) > 0 && parseFloat(item.price_promo) !== parseFloat(price)) {
      pickerRows.push({
        item,
        price: parseFloat(item.price_promo),
        label: (item.name || item.description) + ' (Promo)',
        promo: true,
      });
    }
  }

  const pickerOverlay = document.createElement('div');
  pickerOverlay.className = 'crm-picker-overlay';
  pickerOverlay.innerHTML = `
    <div class="crm-picker-content">
      <div class="crm-picker-header">
        <h3>Select from Catalog</h3>
        <button class="crm-modal-close crm-picker-close">&times;</button>
      </div>
      <div class="crm-picker-list">
        ${pickerRows.length === 0 ? '<div class="crm-empty">No catalog items available</div>' : ''}
        ${pickerRows.map((row, idx) => `
          <div class="crm-picker-item ${row.promo ? 'crm-picker-item--promo' : ''}" data-picker-idx="${idx}">
            <div class="crm-picker-item-name">${escapeHtml(row.label)}</div>
            <div class="crm-picker-item-price">
              ${row.promo ? `<span class="crm-picker-item-strike">${formatCurrency(row.item.price_regular)}</span> ` : ''}${formatCurrency(row.price)}
            </div>
            ${row.promo ? '<div class="crm-picker-item-badge">April Special</div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(pickerOverlay);

  pickerOverlay.querySelector('.crm-picker-close').addEventListener('click', () => pickerOverlay.remove());
  pickerOverlay.addEventListener('click', (e) => {
    if (e.target === pickerOverlay) pickerOverlay.remove();
  });

  pickerOverlay.querySelectorAll('.crm-picker-item').forEach(el => {
    el.addEventListener('click', () => {
      const row = pickerRows[parseInt(el.dataset.pickerIdx)];
      if (row) {
        // Override the item price with the selected row price
        const selected = { ...row.item, _selectedPrice: row.price, _selectedLabel: row.label };
        onSelect(selected);
        pickerOverlay.remove();
      }
    });
  });
}

// =============================================
// PROPOSALS TAB
// =============================================

function renderProposalsTable() {
  const panel = document.getElementById('crm-panel-proposals');
  if (!panel) return;

  const filtered = getFilteredProposals();

  let html = `
    <div class="crm-table-toolbar">
      <div class="crm-filters">
        <input type="text" class="crm-search" id="proposal-search" placeholder="Search proposals..." value="${escapeHtml(proposalSearchText)}">
        <select class="crm-select" id="proposal-filter-status">
          <option value="" ${!proposalFilterStatus ? 'selected' : ''}>All Status</option>
          <option value="draft" ${proposalFilterStatus === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="sent" ${proposalFilterStatus === 'sent' ? 'selected' : ''}>Sent</option>
          <option value="accepted" ${proposalFilterStatus === 'accepted' ? 'selected' : ''}>Accepted</option>
          <option value="declined" ${proposalFilterStatus === 'declined' ? 'selected' : ''}>Declined</option>
          <option value="expired" ${proposalFilterStatus === 'expired' ? 'selected' : ''}>Expired</option>
        </select>
      </div>
      <button class="crm-btn crm-btn-primary" id="btn-new-proposal">+ New Proposal</button>
    </div>
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Proposal #</th>
            <th>Title</th>
            <th>Event Date</th>
            <th>Guests</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (filtered.length === 0) {
    html += '<tr><td colspan="7" class="crm-empty-row">No proposals found</td></tr>';
  } else {
    for (const p of filtered) {
      const statusClass = `crm-prop-status-${p.status}`;
      html += `
        <tr>
          <td>${escapeHtml(p.proposal_number || '')}</td>
          <td>${escapeHtml(p.title || '')}</td>
          <td>${formatDate(p.event_date)}</td>
          <td>${p.guest_count || ''}</td>
          <td>${formatCurrency(p.total)}</td>
          <td><span class="crm-status-badge ${statusClass}">${escapeHtml(p.status || 'draft')}</span></td>
          <td class="crm-actions-cell">
            <button class="crm-btn crm-btn-xs" data-view-proposal="${p.id}">View</button>
            ${p.status === 'draft' ? `<button class="crm-btn crm-btn-xs crm-btn-primary" data-send-proposal="${p.id}">Send</button>` : ''}
          </td>
        </tr>
      `;
    }
  }

  html += '</tbody></table></div>';
  html += `<div class="crm-table-footer">${filtered.length} proposal${filtered.length !== 1 ? 's' : ''}</div>`;
  panel.innerHTML = html;
}

// =============================================
// PROPOSAL MODAL
// =============================================

async function openProposalModal(proposal = null, lead = null) {
  const isEdit = !!proposal;

  // Generate proposal number for new
  let proposalNumber = proposal?.proposal_number || '';
  if (!isEdit) {
    try {
      const { data, error } = await supabase.rpc('generate_crm_number', { p_prefix: 'PROP' });
      if (!error && data) proposalNumber = data;
    } catch (e) {
      proposalNumber = `PROP-${Date.now()}`;
    }
  }

  // Get awkn_ranch leads for lead picker
  const ranchLeads = leads.filter(l => l.business_line === 'awkn_ranch' && l.status === 'open');
  const leadOptions = ranchLeads.map(l =>
    `<option value="${l.id}" ${(lead?.id || proposal?.lead_id) === l.id ? 'selected' : ''}>${escapeHtml(`${l.first_name || ''} ${l.last_name || ''}`.trim())}</option>`
  ).join('');

  const existingItems = proposal?.items || [];

  // Group venue catalog by category
  const venueCategories = {};
  venueCatalog.forEach(v => {
    const cat = v.category || 'Other';
    if (!venueCategories[cat]) venueCategories[cat] = [];
    venueCategories[cat].push(v);
  });

  const modal = document.getElementById('crm-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="crm-modal-overlay">
      <div class="crm-modal-content crm-modal-large">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Proposal' : 'New Proposal'}</h2>
          <button class="crm-modal-close" id="crm-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Proposal Number</label>
              <input type="text" class="crm-input" id="prop-number" value="${escapeHtml(proposalNumber)}" readonly>
            </div>
            <div class="crm-form-field">
              <label>Lead</label>
              <select class="crm-select" id="prop-lead">
                <option value="">Select Lead...</option>
                ${leadOptions}
              </select>
            </div>
            <div class="crm-form-field">
              <label>Title *</label>
              <input type="text" class="crm-input" id="prop-title" value="${escapeHtml(proposal?.title || '')}">
            </div>
            <div class="crm-form-field">
              <label>Event Type</label>
              <select class="crm-select" id="prop-event-type">
                <option value="">Select...</option>
                <option value="wedding" ${proposal?.event_type === 'wedding' ? 'selected' : ''}>Wedding</option>
                <option value="corporate" ${proposal?.event_type === 'corporate' ? 'selected' : ''}>Corporate</option>
                <option value="birthday" ${proposal?.event_type === 'birthday' ? 'selected' : ''}>Birthday</option>
                <option value="retreat" ${proposal?.event_type === 'retreat' ? 'selected' : ''}>Retreat</option>
                <option value="other" ${proposal?.event_type === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="crm-form-field">
              <label>Event Date</label>
              <input type="date" class="crm-input" id="prop-event-date" value="${proposal?.event_date || ''}">
            </div>
            <div class="crm-form-field">
              <label>Guest Count</label>
              <input type="number" class="crm-input" id="prop-guest-count" value="${proposal?.guest_count || ''}" min="1">
            </div>
            <div class="crm-form-field">
              <label>Setup Time</label>
              <input type="time" class="crm-input" id="prop-setup-time" value="${proposal?.setup_time || ''}">
            </div>
            <div class="crm-form-field">
              <label>Event Start</label>
              <input type="time" class="crm-input" id="prop-event-start" value="${proposal?.event_start || ''}">
            </div>
            <div class="crm-form-field">
              <label>Event End</label>
              <input type="time" class="crm-input" id="prop-event-end" value="${proposal?.event_end || ''}">
            </div>
            <div class="crm-form-field">
              <label>Teardown Time</label>
              <input type="time" class="crm-input" id="prop-teardown-time" value="${proposal?.teardown_time || ''}">
            </div>
            <div class="crm-form-field">
              <label>Valid Until</label>
              <input type="date" class="crm-input" id="prop-valid-until" value="${proposal?.valid_until || ''}">
            </div>
          </div>

          <h3 style="margin-top:16px;">Line Items</h3>
          <div id="prop-line-items">
            ${existingItems.map((item, i) => renderProposalLineItem(item, i)).join('')}
          </div>
          <div class="crm-form-actions" style="margin-top:8px;">
            <button class="crm-btn crm-btn-sm" id="btn-add-from-venue-catalog">Add from Venue Catalog</button>
            <button class="crm-btn crm-btn-sm" id="btn-add-custom-prop-item">Add Custom Item</button>
          </div>

          <div class="crm-invoice-totals" style="margin-top:16px;">
            <div class="crm-form-grid">
              <div class="crm-form-field">
                <label>Discount Amount</label>
                <input type="number" class="crm-input" id="prop-discount" value="${proposal?.discount_amount || 0}" step="0.01" min="0">
              </div>
              <div class="crm-form-field">
                <label>Tax Amount</label>
                <input type="number" class="crm-input" id="prop-tax" value="${proposal?.tax_amount || 0}" step="0.01" min="0">
              </div>
            </div>
            <div class="crm-totals-display">
              <div>Subtotal: <strong id="prop-subtotal">${formatCurrency(proposal?.subtotal || 0)}</strong></div>
              <div>Total: <strong id="prop-total">${formatCurrency(proposal?.total || 0)}</strong></div>
            </div>
          </div>

          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="prop-notes" rows="2">${escapeHtml(proposal?.notes || '')}</textarea>
          </div>
          <div class="crm-form-field" style="margin-top:8px;">
            <label>Terms</label>
            <textarea class="crm-textarea" id="prop-terms" rows="3">${escapeHtml(proposal?.terms || '')}</textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          <button class="crm-btn" id="btn-cancel-proposal">Cancel</button>
          <div>
            <button class="crm-btn crm-btn-primary" id="btn-save-proposal-draft">Save Draft</button>
            <button class="crm-btn crm-btn-success" id="btn-send-proposal">Send Proposal</button>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
  window._proposalLineItemCounter = existingItems.length;

  // Close handlers
  document.getElementById('crm-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('crm-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'crm-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-proposal').addEventListener('click', closeModal);

  // Add from venue catalog
  document.getElementById('btn-add-from-venue-catalog').addEventListener('click', () => {
    showCatalogPicker(venueCatalog, (item) => {
      addProposalLineItem({
        category: item.category || '',
        description: item.name || item.description,
        quantity: item.minimum_qty || 1,
        unit_price: item.unit_price || 0,
      });
    });
  });

  // Add custom item
  document.getElementById('btn-add-custom-prop-item').addEventListener('click', () => {
    addProposalLineItem({ category: '', description: '', quantity: 1, unit_price: 0 });
  });

  // Save draft
  document.getElementById('btn-save-proposal-draft').addEventListener('click', () => saveProposal(proposal, 'draft'));

  // Send proposal
  document.getElementById('btn-send-proposal').addEventListener('click', () => saveProposal(proposal, 'sent'));

  // Recalculate totals
  document.getElementById('prop-discount')?.addEventListener('input', recalcProposalTotals);
  document.getElementById('prop-tax')?.addEventListener('input', recalcProposalTotals);

  // Set up existing line item listeners
  document.querySelectorAll('#prop-line-items .crm-line-item').forEach(el => setupProposalLineItemListeners(el));
}

function renderProposalLineItem(item, index) {
  return `
    <div class="crm-line-item" data-index="${index}">
      <input type="text" class="crm-input crm-li-cat" placeholder="Category" value="${escapeHtml(item.category || '')}" style="width:100px;">
      <textarea class="crm-input crm-li-desc" placeholder="Description" rows="1">${escapeHtml(item.description || '')}</textarea>
      <input type="number" class="crm-input crm-li-qty" placeholder="Qty" value="${item.quantity || 1}" min="1" step="1">
      <input type="number" class="crm-input crm-li-price" placeholder="Price" value="${item.unit_price || 0}" min="0" step="0.01">
      <span class="crm-li-total">${formatCurrency((item.quantity || 1) * (item.unit_price || 0))}</span>
      <button class="crm-btn crm-btn-xs crm-btn-danger crm-li-remove">&times;</button>
    </div>
  `;
}

function addProposalLineItem(item) {
  const container = document.getElementById('prop-line-items');
  const index = window._proposalLineItemCounter++;
  const div = document.createElement('div');
  div.innerHTML = renderProposalLineItem(item, index);
  const el = div.firstElementChild;
  container.appendChild(el);
  setupProposalLineItemListeners(el);
  recalcProposalTotals();
}

function setupProposalLineItemListeners(el) {
  const qtyInput = el.querySelector('.crm-li-qty');
  const priceInput = el.querySelector('.crm-li-price');
  const totalSpan = el.querySelector('.crm-li-total');
  const removeBtn = el.querySelector('.crm-li-remove');

  const update = () => {
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    totalSpan.textContent = formatCurrency(qty * price);
    recalcProposalTotals();
  };

  qtyInput.addEventListener('input', update);
  priceInput.addEventListener('input', update);
  removeBtn.addEventListener('click', () => {
    el.remove();
    recalcProposalTotals();
  });
}

function recalcProposalTotals() {
  const items = document.querySelectorAll('#prop-line-items .crm-line-item');
  let subtotal = 0;
  items.forEach(el => {
    const qty = parseFloat(el.querySelector('.crm-li-qty')?.value) || 0;
    const price = parseFloat(el.querySelector('.crm-li-price')?.value) || 0;
    subtotal += qty * price;
  });
  const discount = parseFloat(document.getElementById('prop-discount')?.value) || 0;
  const tax = parseFloat(document.getElementById('prop-tax')?.value) || 0;
  const total = subtotal - discount + tax;

  const subtotalEl = document.getElementById('prop-subtotal');
  const totalEl = document.getElementById('prop-total');
  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

function getProposalLineItemsFromForm() {
  const items = [];
  document.querySelectorAll('#prop-line-items .crm-line-item').forEach((el, i) => {
    const desc = el.querySelector('.crm-li-desc')?.value?.trim() || '';
    const cat = el.querySelector('.crm-li-cat')?.value?.trim() || '';
    const qty = parseFloat(el.querySelector('.crm-li-qty')?.value) || 1;
    const price = parseFloat(el.querySelector('.crm-li-price')?.value) || 0;
    if (desc) {
      items.push({
        category: cat,
        description: desc,
        quantity: qty,
        unit_price: price,
        total: qty * price,
        sort_order: i,
      });
    }
  });
  return items;
}

async function saveProposal(existingProposal, status) {
  const title = document.getElementById('prop-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }

  const lineItems = getProposalLineItemsFromForm();
  if (lineItems.length === 0) { showToast('Add at least one line item', 'error'); return; }

  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
  const discount = parseFloat(document.getElementById('prop-discount').value) || 0;
  const tax = parseFloat(document.getElementById('prop-tax').value) || 0;
  const total = subtotal - discount + tax;

  const payload = {
    lead_id: document.getElementById('prop-lead').value || null,
    proposal_number: document.getElementById('prop-number').value,
    title,
    event_type: document.getElementById('prop-event-type').value || null,
    event_date: document.getElementById('prop-event-date').value || null,
    guest_count: parseInt(document.getElementById('prop-guest-count').value) || null,
    setup_time: document.getElementById('prop-setup-time').value || null,
    event_start: document.getElementById('prop-event-start').value || null,
    event_end: document.getElementById('prop-event-end').value || null,
    teardown_time: document.getElementById('prop-teardown-time').value || null,
    subtotal,
    discount_amount: discount,
    tax_amount: tax,
    total,
    status,
    valid_until: document.getElementById('prop-valid-until').value || null,
    notes: document.getElementById('prop-notes').value.trim() || null,
    terms: document.getElementById('prop-terms').value.trim() || null,
    created_by: authState?.user?.id || null,
  };

  try {
    let proposalId;
    if (existingProposal) {
      const { error } = await supabase.from('crm_proposals').update(payload).eq('id', existingProposal.id);
      if (error) throw error;
      proposalId = existingProposal.id;
      await supabase.from('crm_proposal_items').delete().eq('proposal_id', proposalId);
    } else {
      const { data, error } = await supabase.from('crm_proposals').insert(payload).select().single();
      if (error) throw error;
      proposalId = data.id;
    }

    // Insert line items
    if (lineItems.length > 0) {
      const itemsPayload = lineItems.map(li => ({ ...li, proposal_id: proposalId }));
      const { error: liError } = await supabase.from('crm_proposal_items').insert(itemsPayload);
      if (liError) throw liError;
    }

    showToast(status === 'sent' ? 'Proposal sent' : 'Proposal saved as draft', 'success');
    await loadAllData();
    renderAll();
    closeModal();
  } catch (err) {
    console.error('Save proposal error:', err);
    showToast('Error saving proposal', 'error');
  }
}

// =============================================
// DASHBOARD TAB
// =============================================

function renderDashboard() {
  const panel = document.getElementById('crm-panel-dashboard');
  if (!panel) return;

  const { start, end } = getDateRangeForPeriod(currentPeriod);
  const filtered = getFilteredLeads().filter(l => new Date(l.created_at) >= start && new Date(l.created_at) <= end);
  const filteredInv = getFilteredInvoices().filter(inv => new Date(inv.created_at) >= start && new Date(inv.created_at) <= end);

  let html = `
    <div class="crm-dashboard-toolbar">
      <div class="crm-period-btns">
        ${['month', 'quarter', 'year', 'all'].map(p =>
          `<button class="crm-btn crm-btn-sm crm-period-btn ${p === currentPeriod ? 'active' : ''}" data-period="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</button>`
        ).join('')}
      </div>
    </div>
    <div class="crm-dashboard-grid">
  `;

  // ---- Conversion Funnel ----
  html += renderConversionFunnel(filtered);

  // ---- Lead Volume by Source ----
  html += renderLeadsBySource(filtered);

  // ---- Won vs Lost ----
  html += renderWonVsLost(filtered);

  // ---- Revenue by Source ----
  html += renderRevenueBySource(filtered, filteredInv);

  html += '</div>';
  panel.innerHTML = html;
}

function renderConversionFunnel(filtered) {
  const filteredStages = stages.filter(s => currentBizLine === 'all' || s.business_line === currentBizLine);
  if (filteredStages.length === 0) return '';

  const stageCounts = filteredStages.map(s => ({
    name: s.name,
    color: s.color || '#6b7280',
    count: filtered.filter(l => l.stage_id === s.id).length,
  }));

  const maxCount = Math.max(...stageCounts.map(s => s.count), 1);

  let rows = '';
  for (let i = 0; i < stageCounts.length; i++) {
    const s = stageCounts[i];
    const pct = Math.round((s.count / maxCount) * 100);
    const dropOff = i > 0 && stageCounts[i - 1].count > 0
      ? Math.round(((stageCounts[i - 1].count - s.count) / stageCounts[i - 1].count) * 100)
      : 0;
    rows += `
      <div class="crm-funnel-row">
        <div class="crm-funnel-label">${escapeHtml(s.name)}</div>
        <div class="crm-funnel-bar-wrap">
          <div class="crm-funnel-bar" style="width:${pct}%;background:${escapeHtml(s.color)}"></div>
        </div>
        <div class="crm-funnel-count">${s.count}</div>
        ${i > 0 && dropOff > 0 ? `<div class="crm-funnel-drop">-${dropOff}%</div>` : '<div class="crm-funnel-drop"></div>'}
      </div>
    `;
  }

  return `
    <div class="crm-dashboard-card">
      <h3>Conversion Funnel</h3>
      <div class="crm-funnel">${rows}</div>
    </div>
  `;
}

function renderLeadsBySource(filtered) {
  const sourceCounts = {};
  filtered.forEach(l => {
    const name = l.source?.name || 'Unknown';
    sourceCounts[name] = (sourceCounts[name] || 0) + 1;
  });

  const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  const rows = sorted.map(([name, count]) => {
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="crm-source-row">
        <div class="crm-source-label">${escapeHtml(name)}</div>
        <div class="crm-source-bar-wrap">
          <div class="crm-source-bar" style="width:${pct}%"></div>
        </div>
        <div class="crm-source-count">${count}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="crm-dashboard-card">
      <h3>Lead Volume by Source</h3>
      ${sorted.length === 0 ? '<div class="crm-empty">No data</div>' : `<div class="crm-source-chart">${rows}</div>`}
    </div>
  `;
}

function renderWonVsLost(filtered) {
  const won = filtered.filter(l => l.status === 'won').length;
  const lost = filtered.filter(l => l.status === 'lost').length;
  const winRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;

  return `
    <div class="crm-dashboard-card">
      <h3>Won vs Lost</h3>
      <div class="crm-won-lost">
        <div class="crm-won-lost-item crm-won">
          <div class="crm-won-lost-num">${won}</div>
          <div class="crm-won-lost-label">Won</div>
        </div>
        <div class="crm-won-lost-item crm-lost">
          <div class="crm-won-lost-num">${lost}</div>
          <div class="crm-won-lost-label">Lost</div>
        </div>
        <div class="crm-won-lost-item crm-rate">
          <div class="crm-won-lost-num">${winRate}%</div>
          <div class="crm-won-lost-label">Win Rate</div>
        </div>
      </div>
    </div>
  `;
}

function renderRevenueBySource(filtered, filteredInv) {
  // Build a map of lead_id -> source name
  const leadSourceMap = {};
  filtered.forEach(l => {
    leadSourceMap[l.id] = l.source?.name || 'Unknown';
  });

  // Group by source
  const sourceData = {};
  filtered.forEach(l => {
    const src = l.source?.name || 'Unknown';
    if (!sourceData[src]) {
      sourceData[src] = { leads: 0, won: 0, revenue: 0, spend: 0 };
    }
    sourceData[src].leads++;
    if (l.status === 'won') sourceData[src].won++;
  });

  // Attach revenue from invoices
  filteredInv.forEach(inv => {
    if (inv.status === 'paid' && inv.lead_id && leadSourceMap[inv.lead_id]) {
      const src = leadSourceMap[inv.lead_id];
      if (sourceData[src]) {
        sourceData[src].revenue += inv.total || 0;
      }
    }
  });

  // Attach ad spend
  const { start, end } = getDateRangeForPeriod(currentPeriod);
  adSpend.forEach(ad => {
    const adDate = new Date(ad.date);
    if (adDate >= start && adDate <= end) {
      // Try to match platform to source
      const platform = (ad.platform || '').toLowerCase();
      Object.keys(sourceData).forEach(src => {
        const srcLower = src.toLowerCase();
        if (srcLower.includes(platform) || platform.includes(srcLower)) {
          sourceData[src].spend += ad.spend || 0;
        }
      });
    }
  });

  const entries = Object.entries(sourceData).sort((a, b) => b[1].revenue - a[1].revenue);

  if (entries.length === 0) {
    return `
      <div class="crm-dashboard-card crm-dashboard-card-wide">
        <h3>Revenue by Source</h3>
        <div class="crm-empty">No data</div>
      </div>
    `;
  }

  let tableRows = entries.map(([src, d]) => {
    const avgDeal = d.won > 0 ? d.revenue / d.won : 0;
    const cpl = d.leads > 0 && d.spend > 0 ? d.spend / d.leads : 0;
    const roas = d.spend > 0 ? d.revenue / d.spend : 0;
    return `
      <tr>
        <td>${escapeHtml(src)}</td>
        <td>${d.leads}</td>
        <td>${d.won}</td>
        <td>${formatCurrency(d.revenue)}</td>
        <td>${formatCurrency(avgDeal)}</td>
        <td>${d.spend > 0 ? formatCurrency(d.spend) : '-'}</td>
        <td>${cpl > 0 ? formatCurrency(cpl) : '-'}</td>
        <td>${roas > 0 ? roas.toFixed(1) + 'x' : '-'}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="crm-dashboard-card crm-dashboard-card-wide">
      <h3>Revenue by Source</h3>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Leads</th>
              <th>Won</th>
              <th>Revenue</th>
              <th>Avg Deal</th>
              <th>Ad Spend</th>
              <th>CPL</th>
              <th>ROAS</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// =============================================
// MODAL UTILITIES
// =============================================

function closeModal() {
  const modal = document.getElementById('crm-modal');
  if (modal) {
    modal.innerHTML = '';
    modal.style.display = 'none';
  }
}

// =============================================
// EVENT LISTENERS
// =============================================

function setupEventListeners() {
  // Business line switcher
  document.getElementById('crm-biz-switcher')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.crm-biz-btn');
    if (!btn) return;
    currentBizLine = btn.dataset.biz;
    localStorage.setItem('crm-biz-line', currentBizLine);
    renderAll();
  });

  // Sub-tabs
  document.getElementById('crm-subtabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.crm-subtab');
    if (!btn) return;
    currentSubtab = btn.dataset.tab;
    // Update active class
    document.querySelectorAll('.crm-subtab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    // Show correct panel
    document.querySelectorAll('.crm-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`crm-panel-${currentSubtab}`);
    if (panel) panel.classList.add('active');
    renderCurrentPanel();
  });

  // Delegated event listeners on panels container
  const panelsContainer = document.getElementById('crm-panels');
  if (panelsContainer) {
    panelsContainer.addEventListener('click', handlePanelClicks);
    panelsContainer.addEventListener('input', handlePanelInputs);
    panelsContainer.addEventListener('change', handlePanelChanges);
  }

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function handlePanelClicks(e) {
  const target = e.target;

  // New Lead buttons (pipeline and table)
  if (target.id === 'btn-new-lead' || target.id === 'btn-new-lead-table') {
    openLeadModal();
    return;
  }

  // Lead row click
  const leadRow = target.closest('.crm-lead-row');
  if (leadRow) {
    openLeadDetail(leadRow.dataset.leadId);
    return;
  }

  // Kanban card click
  const kanbanCard = target.closest('.crm-kanban-card');
  if (kanbanCard && !kanbanCard.classList.contains('dragging')) {
    openLeadDetail(kanbanCard.dataset.leadId);
    return;
  }

  // New Invoice button
  if (target.id === 'btn-new-invoice') {
    openInvoiceModal();
    return;
  }

  // View invoice
  if (target.dataset.viewInvoice) {
    const inv = invoices.find(i => i.id === target.dataset.viewInvoice);
    if (inv) openInvoiceModal(inv);
    return;
  }

  // Send invoice
  if (target.dataset.sendInvoice) {
    const inv = invoices.find(i => i.id === target.dataset.sendInvoice);
    if (inv) {
      sendInvoice(inv);
    }
    return;
  }

  // New Proposal button
  if (target.id === 'btn-new-proposal') {
    openProposalModal();
    return;
  }

  // View proposal
  if (target.dataset.viewProposal) {
    const p = proposals.find(pr => pr.id === target.dataset.viewProposal);
    if (p) openProposalModal(p);
    return;
  }

  // Send proposal
  if (target.dataset.sendProposal) {
    const p = proposals.find(pr => pr.id === target.dataset.sendProposal);
    if (p) {
      sendProposal(p);
    }
    return;
  }

  // Dashboard period buttons
  const periodBtn = target.closest('.crm-period-btn');
  if (periodBtn) {
    currentPeriod = periodBtn.dataset.period;
    renderDashboard();
    return;
  }
}

function handlePanelInputs(e) {
  const target = e.target;

  // Lead search
  if (target.id === 'lead-search') {
    debounce(() => {
      leadSearchText = target.value;
      renderLeadsTable();
    })();
    return;
  }

  // Invoice search
  if (target.id === 'invoice-search') {
    debounce(() => {
      invoiceSearchText = target.value;
      renderInvoicesTable();
    })();
    return;
  }

  // Proposal search
  if (target.id === 'proposal-search') {
    debounce(() => {
      proposalSearchText = target.value;
      renderProposalsTable();
    })();
    return;
  }
}

function handlePanelChanges(e) {
  const target = e.target;

  // Lead filter source
  if (target.id === 'lead-filter-source') {
    leadFilterSource = target.value;
    renderLeadsTable();
    return;
  }

  // Lead filter stage
  if (target.id === 'lead-filter-stage') {
    leadFilterStage = target.value;
    renderLeadsTable();
    return;
  }

  // Lead filter status
  if (target.id === 'lead-filter-status') {
    leadFilterStatus = target.value;
    renderLeadsTable();
    return;
  }

  // Lead filter owner
  if (target.id === 'lead-filter-owner') {
    leadFilterOwner = target.value;
    renderLeadsTable();
    return;
  }

  // Invoice filter status
  if (target.id === 'invoice-filter-status') {
    invoiceFilterStatus = target.value;
    renderInvoicesTable();
    return;
  }

  // Proposal filter status
  if (target.id === 'proposal-filter-status') {
    proposalFilterStatus = target.value;
    renderProposalsTable();
    return;
  }
}

// =============================================
// SEND HELPERS
// =============================================

async function sendInvoice(invoice) {
  try {
    const { error } = await supabase
      .from('crm_invoices')
      .update({ status: 'sent' })
      .eq('id', invoice.id);
    if (error) throw error;
    showToast('Invoice sent', 'success');
    await loadAllData();
    renderAll();
  } catch (err) {
    console.error('Send invoice error:', err);
    showToast('Error sending invoice', 'error');
  }
}

async function sendProposal(proposal) {
  try {
    const { error } = await supabase
      .from('crm_proposals')
      .update({ status: 'sent' })
      .eq('id', proposal.id);
    if (error) throw error;
    showToast('Proposal sent', 'success');
    await loadAllData();
    renderAll();
  } catch (err) {
    console.error('Send proposal error:', err);
    showToast('Error sending proposal', 'error');
  }
}
