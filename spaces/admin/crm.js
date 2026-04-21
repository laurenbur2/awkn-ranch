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
        Scheduling Tool
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

  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unnamed Lead';
  const initials = (((lead.first_name || '')[0] || '') + ((lead.last_name || '')[0] || '')).toUpperCase()
    || (lead.email || '?')[0].toUpperCase();
  const bizLabel = lead.business_line === 'within' ? 'Within' : 'AWKN Ranch';
  const bizClass = lead.business_line === 'within' ? 'within' : 'awkn_ranch';
  const stageColor = lead.stage?.color || '#6b7280';

  // Stage options
  const stageOpts = stages
    .filter(s => s.business_line === lead.business_line)
    .map(s => `<option value="${s.id}" ${s.id === lead.stage_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');

  // Stats
  const daysAsLead = lead.created_at ? Math.max(0, Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)) : 0;
  const stageEnteredAt = leadActivities.find(a => a.activity_type === 'stage_change')?.created_at || lead.created_at;
  const daysInStage = stageEnteredAt ? Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000)) : 0;
  const lastActivity = leadActivities[0]?.created_at || lead.created_at;
  const lastActivityRel = lastActivity ? formatRelativeTime(lastActivity) : '—';

  // Related records
  const relatedInvoices = invoices.filter(i => i.lead_id === lead.id);
  const relatedProposals = proposals.filter(p => p.lead_id === lead.id);
  const totalInvoiced = relatedInvoices.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const totalPaid = relatedInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);

  // Group activities by day
  const groupedActivities = groupActivitiesByDay(leadActivities);

  const modal = document.getElementById('crm-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="crm-modal-overlay">
      <div class="crm-modal-content crm-modal-xlarge crm-lead-detail">
        <!-- HEADER BAR -->
        <div class="crm-lead-header">
          <div class="crm-lead-header-main">
            <div class="crm-avatar crm-avatar-lg crm-avatar-${bizClass}">${escapeHtml(initials)}</div>
            <div class="crm-lead-header-info">
              <div class="crm-lead-header-row">
                <h2 class="crm-lead-name">${escapeHtml(fullName)}</h2>
                <span class="crm-biz-tag crm-biz-tag-${bizClass}">${escapeHtml(bizLabel)}</span>
                <span class="crm-status-badge crm-status-${lead.status}">${escapeHtml(lead.status)}</span>
              </div>
              <div class="crm-lead-subline">
                ${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>` : '<span class="crm-muted">No email</span>'}
                <span class="crm-dot">·</span>
                ${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a>` : '<span class="crm-muted">No phone</span>'}
                <span class="crm-dot">·</span>
                <span class="crm-muted">Created ${formatDate(lead.created_at)} · Last activity ${lastActivityRel}</span>
              </div>
            </div>
          </div>
          <div class="crm-lead-header-actions">
            <button class="crm-btn crm-btn-sm" id="btn-edit-lead" title="Edit lead">Edit</button>
            <div class="crm-menu-wrap">
              <button class="crm-btn crm-btn-sm" id="btn-more-menu" title="More actions">More ▾</button>
              <div class="crm-menu" id="crm-more-menu" style="display:none">
                ${lead.business_line === 'within' ? '<button class="crm-menu-item" id="btn-create-invoice-from-lead">Create Invoice</button>' : ''}
                ${lead.business_line === 'awkn_ranch' ? '<button class="crm-menu-item" id="btn-create-proposal-from-lead">Create Proposal</button>' : ''}
                ${lead.business_line === 'within' && lead.email ? '<button class="crm-menu-item" id="btn-send-welcome-letter">Send Welcome Letter</button>' : ''}
                ${lead.email ? '<button class="crm-menu-item" id="btn-send-feedback">Send Feedback Form</button>' : ''}
                ${lead.status === 'open' ? '<button class="crm-menu-item crm-menu-item-success" id="btn-mark-won">Mark Won</button>' : ''}
                ${lead.status === 'open' ? '<button class="crm-menu-item crm-menu-item-danger" id="btn-mark-lost">Mark Lost</button>' : ''}
              </div>
            </div>
            <button class="crm-modal-close" id="crm-modal-close-btn" title="Close">&times;</button>
          </div>
        </div>

        <!-- BODY: 3 columns -->
        <div class="crm-lead-body">
          <!-- LEFT: PROPERTIES -->
          <aside class="crm-lead-rail crm-lead-rail-left">
            <div class="crm-prop-card">
              <div class="crm-prop-card-head">About</div>
              <div class="crm-prop-row"><span class="crm-prop-key">Email</span><span class="crm-prop-val">${lead.email ? `<a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>` : '—'}</span></div>
              <div class="crm-prop-row"><span class="crm-prop-key">Phone</span><span class="crm-prop-val">${lead.phone ? `<a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a>` : '—'}</span></div>
              <div class="crm-prop-row"><span class="crm-prop-key">Location</span><span class="crm-prop-val">${escapeHtml([lead.city, lead.state].filter(Boolean).join(', ') || '—')}</span></div>
              <div class="crm-prop-row"><span class="crm-prop-key">Source</span><span class="crm-prop-val">${escapeHtml(lead.source?.name || '—')}</span></div>
              <div class="crm-prop-row"><span class="crm-prop-key">Owner</span><span class="crm-prop-val">${escapeHtml(lead.owner?.display_name || lead.owner?.email || 'Unassigned')}</span></div>
            </div>

            <div class="crm-prop-card">
              <div class="crm-prop-card-head">Pipeline</div>
              <div class="crm-prop-row crm-prop-row-stack">
                <span class="crm-prop-key">Stage</span>
                <select class="crm-select crm-select-sm" id="detail-stage-select" style="border-left:3px solid ${stageColor}">${stageOpts}</select>
              </div>
              <div class="crm-prop-row"><span class="crm-prop-key">Value</span><span class="crm-prop-val crm-prop-val-strong">${formatCurrency(lead.estimated_value)}</span></div>
              <div class="crm-prop-row"><span class="crm-prop-key">Days in stage</span><span class="crm-prop-val">${daysInStage}</span></div>
            </div>

            ${lead.business_line === 'awkn_ranch' && (lead.space?.name || lead.event_type || lead.event_date || lead.guest_count) ? `
            <div class="crm-prop-card">
              <div class="crm-prop-card-head">Event</div>
              ${lead.space?.name ? `<div class="crm-prop-row"><span class="crm-prop-key">Space</span><span class="crm-prop-val"><span class="crm-space-tag">${escapeHtml(lead.space.name)}</span></span></div>` : ''}
              ${lead.event_type ? `<div class="crm-prop-row"><span class="crm-prop-key">Type</span><span class="crm-prop-val">${escapeHtml(lead.event_type)}</span></div>` : ''}
              ${lead.event_date ? `<div class="crm-prop-row"><span class="crm-prop-key">Date</span><span class="crm-prop-val">${formatDate(lead.event_date)}</span></div>` : ''}
              ${lead.guest_count ? `<div class="crm-prop-row"><span class="crm-prop-key">Guests</span><span class="crm-prop-val">${lead.guest_count}</span></div>` : ''}
              ${(lead.event_start_time || lead.event_end_time) ? `<div class="crm-prop-row"><span class="crm-prop-key">Time</span><span class="crm-prop-val">${escapeHtml(lead.event_start_time || '')}${lead.event_end_time ? ' – ' + escapeHtml(lead.event_end_time) : ''}</span></div>` : ''}
            </div>
            ` : ''}

            ${lead.utm_source ? `
            <div class="crm-prop-card">
              <div class="crm-prop-card-head">Marketing</div>
              <div class="crm-prop-row"><span class="crm-prop-key">Source</span><span class="crm-prop-val">${escapeHtml(lead.utm_source)}</span></div>
              ${lead.utm_medium ? `<div class="crm-prop-row"><span class="crm-prop-key">Medium</span><span class="crm-prop-val">${escapeHtml(lead.utm_medium)}</span></div>` : ''}
              ${lead.utm_campaign ? `<div class="crm-prop-row"><span class="crm-prop-key">Campaign</span><span class="crm-prop-val">${escapeHtml(lead.utm_campaign)}</span></div>` : ''}
            </div>
            ` : ''}
          </aside>

          <!-- CENTER: COMPOSER + ACTIVITY -->
          <main class="crm-lead-main">
            <div class="crm-composer">
              <div class="crm-composer-tabs">
                <button class="crm-composer-tab active" data-composer-type="note">📝 Note</button>
                <button class="crm-composer-tab" data-composer-type="call">📞 Call</button>
                ${lead.email ? '<button class="crm-composer-tab" data-composer-type="email">✉️ Email</button>' : ''}
              </div>
              <div class="crm-composer-body">
                <textarea id="composer-text" class="crm-textarea" rows="3" placeholder="Add a note about this lead..."></textarea>
                <div class="crm-composer-actions">
                  <span class="crm-composer-hint" id="composer-hint">Saved to activity timeline</span>
                  <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-composer-save">Save Note</button>
                </div>
              </div>
            </div>

            <div class="crm-activity-feed">
              <div class="crm-activity-filters">
                <button class="crm-chip active" data-filter="all">All <span class="crm-chip-count">${leadActivities.length}</span></button>
                <button class="crm-chip" data-filter="note">Notes</button>
                <button class="crm-chip" data-filter="call">Calls</button>
                <button class="crm-chip" data-filter="email">Emails</button>
                <button class="crm-chip" data-filter="stage_change">Stage</button>
                <button class="crm-chip" data-filter="system">System</button>
              </div>

              <div class="crm-activity-list" id="crm-activity-list">
                ${leadActivities.length === 0
                  ? '<div class="crm-empty">No activity yet — add a note above to get started.</div>'
                  : groupedActivities.map(group => `
                      <div class="crm-activity-day-group">
                        <div class="crm-activity-day-label">${escapeHtml(group.label)}</div>
                        ${group.items.map(a => renderActivityItem(a)).join('')}
                      </div>
                    `).join('')}
              </div>
            </div>
          </main>

          <!-- RIGHT: RELATED / STATS -->
          <aside class="crm-lead-rail crm-lead-rail-right">
            <div class="crm-prop-card crm-stats-card">
              <div class="crm-stats-grid">
                <div class="crm-stat"><div class="crm-stat-num">${daysAsLead}</div><div class="crm-stat-label">Days as lead</div></div>
                <div class="crm-stat"><div class="crm-stat-num">${daysInStage}</div><div class="crm-stat-label">Days in stage</div></div>
                <div class="crm-stat"><div class="crm-stat-num">${formatCurrency(totalInvoiced).replace('.00', '')}</div><div class="crm-stat-label">Invoiced</div></div>
                <div class="crm-stat"><div class="crm-stat-num">${formatCurrency(totalPaid).replace('.00', '')}</div><div class="crm-stat-label">Paid</div></div>
              </div>
            </div>

            <div class="crm-prop-card">
              <div class="crm-prop-card-head">
                Invoices <span class="crm-prop-count">${relatedInvoices.length}</span>
              </div>
              ${relatedInvoices.length === 0
                ? '<div class="crm-rail-empty">No invoices yet</div>'
                : relatedInvoices.map(inv => `
                    <button class="crm-related-row" data-view-invoice="${inv.id}">
                      <div class="crm-related-row-main">
                        <div class="crm-related-row-title">${escapeHtml(inv.invoice_number || 'Draft')}</div>
                        <div class="crm-related-row-sub">${escapeHtml(inv.status || '')}</div>
                      </div>
                      <div class="crm-related-row-amt">${formatCurrency(inv.total || 0)}</div>
                    </button>
                  `).join('')}
            </div>

            ${lead.business_line === 'awkn_ranch' ? `
            <div class="crm-prop-card">
              <div class="crm-prop-card-head">
                Proposals <span class="crm-prop-count">${relatedProposals.length}</span>
              </div>
              ${relatedProposals.length === 0
                ? '<div class="crm-rail-empty">No proposals yet</div>'
                : relatedProposals.map(p => `
                    <button class="crm-related-row" data-view-proposal="${p.id}">
                      <div class="crm-related-row-main">
                        <div class="crm-related-row-title">${escapeHtml(p.proposal_number || p.title || 'Draft')}</div>
                        <div class="crm-related-row-sub">${escapeHtml(p.status || '')}</div>
                      </div>
                      <div class="crm-related-row-amt">${formatCurrency(p.total || 0)}</div>
                    </button>
                  `).join('')}
            </div>
            ` : ''}
          </aside>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'block';
  setupLeadDetailListeners(lead);
}

function groupActivitiesByDay(activities) {
  const groups = new Map();
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  activities.forEach(a => {
    if (!a.created_at) return;
    const d = new Date(a.created_at); d.setHours(0,0,0,0);
    const key = d.getTime();
    let label;
    if (key === today.getTime()) label = 'Today';
    else if (key === yesterday.getTime()) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(a);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const ad = new Date(a.items[0].created_at).getTime();
    const bd = new Date(b.items[0].created_at).getTime();
    return bd - ad;
  });
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function renderActivityItem(activity) {
  const iconMap = {
    note: '📝',
    call: '📞',
    email: '✉️',
    sms: '💬',
    meeting: '📅',
    stage_change: '↗',
    system: '⚙',
  };
  const labelMap = {
    note: 'Note',
    call: 'Call logged',
    email: 'Email',
    sms: 'SMS',
    meeting: 'Meeting',
    stage_change: 'Stage changed',
    system: 'System',
  };
  const type = activity.activity_type || 'system';
  const icon = iconMap[type] || '•';
  const label = labelMap[type] || type;
  const time = activity.created_at
    ? new Date(activity.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return `
    <div class="crm-activity-item" data-activity-type="${escapeHtml(type)}">
      <div class="crm-activity-icon crm-activity-icon-${escapeHtml(type)}">${icon}</div>
      <div class="crm-activity-content">
        <div class="crm-activity-head">
          <span class="crm-activity-label">${escapeHtml(label)}</span>
          <span class="crm-activity-time">${escapeHtml(time)}</span>
        </div>
        ${activity.description ? `<div class="crm-activity-desc">${escapeHtml(activity.description)}</div>` : ''}
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

  // Composer (Note / Call / Email tabs)
  let composerType = 'note';
  const composerText = document.getElementById('composer-text');
  const composerSaveBtn = document.getElementById('btn-composer-save');
  const composerHint = document.getElementById('composer-hint');
  const composerPlaceholders = {
    note: 'Add a note about this lead...',
    call: 'Summarize the call (purpose, outcome, next steps)...',
    email: 'Email body — sent and logged to timeline...',
  };
  const composerHints = {
    note: 'Saved to activity timeline',
    call: 'Logged to activity timeline',
    email: 'Sent via Resend and logged',
  };
  const composerLabels = { note: 'Save Note', call: 'Log Call', email: 'Send Email' };

  document.querySelectorAll('.crm-composer-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.crm-composer-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      composerType = tab.dataset.composerType;
      if (composerText) composerText.placeholder = composerPlaceholders[composerType];
      if (composerHint) composerHint.textContent = composerHints[composerType];
      if (composerSaveBtn) composerSaveBtn.textContent = composerLabels[composerType];
    });
  });

  composerSaveBtn?.addEventListener('click', async () => {
    const text = composerText?.value.trim();
    if (!text) { showToast(`${composerType === 'note' ? 'Note' : composerType === 'call' ? 'Call summary' : 'Email body'} cannot be empty`, 'error'); return; }
    composerSaveBtn.disabled = true;
    composerSaveBtn.textContent = 'Saving...';
    try {
      if (composerType === 'email') {
        await sendLeadEmail(lead, text);
      } else {
        await addActivity(lead.id, composerType, text);
      }
      await openLeadDetail(lead.id);
    } catch (err) {
      console.error('Composer save error:', err);
      showToast('Error saving — please try again', 'error');
      composerSaveBtn.disabled = false;
      composerSaveBtn.textContent = composerLabels[composerType];
    }
  });

  // More menu toggle
  const moreBtn = document.getElementById('btn-more-menu');
  const moreMenu = document.getElementById('crm-more-menu');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu.style.display = moreMenu.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (moreMenu && !e.target.closest('.crm-menu-wrap')) moreMenu.style.display = 'none';
  }, { once: true });

  // Related invoice/proposal click — open the relevant modal
  document.querySelectorAll('[data-view-invoice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = invoices.find(i => i.id === btn.dataset.viewInvoice);
      if (inv) { closeModal(); openInvoiceModal(inv); }
    });
  });
  document.querySelectorAll('[data-view-proposal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = proposals.find(x => x.id === btn.dataset.viewProposal);
      if (p) { closeModal(); openProposalModal(p); }
    });
  });

  // Activity filter chips
  document.querySelectorAll('.crm-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.crm-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      document.querySelectorAll('.crm-activity-item').forEach(el => {
        el.style.display = (filter === 'all' || el.dataset.activityType === filter) ? '' : 'none';
      });
      // Hide empty day groups
      document.querySelectorAll('.crm-activity-day-group').forEach(group => {
        const visible = Array.from(group.querySelectorAll('.crm-activity-item')).some(el => el.style.display !== 'none');
        group.style.display = visible ? '' : 'none';
      });
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
    const form = openInlineActionForm();
    form.innerHTML = `
      <h4 class="crm-inline-form-title">Mark lead as lost</h4>
      <input type="text" id="lost-reason" class="crm-input" placeholder="Lost reason (optional)...">
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
    const form = openInlineActionForm();
    const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    const bizLabel = lead.business_line === 'within' ? 'Within' : 'AWKN Ranch';

    form.innerHTML = `
      <h4 class="crm-inline-form-title">Send Feedback Form</h4>
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

  // Send Welcome Letter — Within Center welcome with prep instructions.
  // Package is selected from a preset list, with a custom option for ad-hoc items.
  document.getElementById('btn-send-welcome-letter')?.addEventListener('click', () => {
    const form = openInlineActionForm();

    // Package presets — each maps to a title + line items that render in the
    // "Your Outpatient Program Includes" section. Edit here to change what
    // gets listed per package.
    const WELCOME_PACKAGES = {
      heal: {
        title: 'HEAL Package',
        items: [
          { description: 'Personalized guided ketamine sessions', quantity: 3 },
          { description: 'Integration coaching sessions', quantity: 3 },
          { description: '1-month AWKN membership — saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
          { description: 'Access to on-site wellness amenities and events as available', quantity: 1 },
        ],
      },
      discover: {
        title: 'DISCOVER Package',
        items: [
          { description: 'Private guided ketamine ceremony (fully held — prep, ceremony, integration)', quantity: 1 },
          { description: 'Integration coaching session', quantity: 1 },
          { description: '1-month AWKN membership — saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
        ],
      },
      awkn: {
        title: 'AWKN Package',
        items: [
          { description: 'Personalized guided ketamine ceremonies over 3–6 months', quantity: 6 },
          { description: 'Integration coaching sessions', quantity: 6 },
          { description: '3-month AWKN membership — saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
          { description: 'Access to on-site wellness amenities and events as available', quantity: 1 },
        ],
      },
      'twin-flame': {
        title: 'Couples Reset',
        items: [
          { description: 'Shared guided ketamine ceremony for both partners', quantity: 1 },
          { description: 'Joint integration coaching session', quantity: 1 },
          { description: 'Private reflection session for each partner', quantity: 2 },
          { description: '1-month AWKN membership', quantity: 1 },
        ],
      },
      'immersive-6day': {
        title: 'Six-Day Immersive Retreat',
        items: [
          { description: 'Private guided ketamine ceremonies during the retreat', quantity: 2 },
          { description: 'Nights of residential stay at AWKN Ranch', quantity: 5 },
          { description: 'Group integration circles and daily practices', quantity: 1 },
          { description: 'Full access to AWKN amenities — saunas, cold plunges, hot tub, temple space', quantity: 1 },
          { description: 'All meals and on-site care', quantity: 1 },
        ],
      },
      'immersive-3day': {
        title: 'Three-Day Immersive Retreat',
        items: [
          { description: 'Private guided ketamine ceremony during the retreat', quantity: 1 },
          { description: 'Nights of residential stay at AWKN Ranch', quantity: 2 },
          { description: 'Integration circle and daily practices', quantity: 1 },
          { description: 'Full access to AWKN amenities — saunas, cold plunges, hot tub, temple space', quantity: 1 },
          { description: 'All meals and on-site care', quantity: 1 },
        ],
      },
    };

    const packageOptions = [
      '<option value="heal" selected>HEAL — 3 ceremonies + integration</option>',
      '<option value="discover">DISCOVER — 1 ceremony + integration</option>',
      '<option value="awkn">AWKN — 6 ceremonies (deepest offering)</option>',
      '<option value="twin-flame">Couples Reset — shared journey for partners</option>',
      '<option value="immersive-6day">Six-Day Immersive Retreat</option>',
      '<option value="immersive-3day">Three-Day Immersive Retreat</option>',
      '<option value="custom">Custom — build your own list</option>',
    ].join('');

    form.innerHTML = `
      <h4 class="crm-inline-form-title">Send Welcome Letter</h4>
      <div class="crm-form-field">
        <label>To</label>
        <input type="email" class="crm-input" id="welcome-to" value="${escapeHtml(lead.email || '')}" readonly style="background:#f3f4f6">
      </div>
      <div class="crm-form-field">
        <label>Package</label>
        <select class="crm-select" id="welcome-package">${packageOptions}</select>
      </div>
      <div class="crm-form-field">
        <label>Package title (appears in the welcome header)</label>
        <input type="text" class="crm-input" id="welcome-package-title" placeholder="e.g. HEAL Package">
      </div>
      <div class="crm-form-field">
        <label>Your Outpatient Program Includes</label>
        <div id="welcome-items-wrap" style="display:flex;flex-direction:column;gap:6px;"></div>
        <button type="button" class="crm-btn crm-btn-sm" id="btn-welcome-add-item" style="margin-top:8px;">+ Add item</button>
        <div class="crm-muted" style="font-size:12px;margin-top:4px;">Quantity × description. Quantity of 1 hides the "1 ×" prefix in the email.</div>
      </div>
      <div class="crm-form-row" style="display:flex;gap:12px;">
        <div class="crm-form-field" style="flex:1;">
          <label>First session date (optional)</label>
          <input type="date" class="crm-input" id="welcome-session-date">
        </div>
        <div class="crm-form-field" style="flex:1;">
          <label>Arrive by (optional)</label>
          <input type="text" class="crm-input" id="welcome-arrival-time" placeholder="e.g. 9:30 AM">
        </div>
      </div>
      <div class="crm-form-field" style="margin-top:6px;padding-top:12px;border-top:1px dashed rgba(0,0,0,0.1);">
        <label>Send test copy to (any email)</label>
        <div style="display:flex;gap:8px;">
          <input type="email" class="crm-input" id="welcome-test-to" placeholder="you@within.center" style="flex:1;">
          <button class="crm-btn crm-btn-sm" id="btn-send-welcome-test">Send Test</button>
        </div>
        <div class="crm-muted" style="font-size:12px;margin-top:4px;">Sends the actual email to the address above — useful for previewing in your own inbox before sending to the client.</div>
      </div>
      <div class="crm-form-actions">
        <button class="crm-btn crm-btn-sm" id="btn-preview-welcome">Preview Email</button>
        <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-confirm-send-welcome">Send to ${escapeHtml(lead.email)}</button>
        <button class="crm-btn crm-btn-sm" id="btn-cancel-welcome">Cancel</button>
      </div>
    `;

    const itemsWrap = document.getElementById('welcome-items-wrap');
    const renderItemRow = (item) => {
      const row = document.createElement('div');
      row.className = 'crm-welcome-item';
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      row.innerHTML = `
        <input type="number" class="crm-input crm-welcome-qty" value="${Number(item.quantity || 1)}" min="1" step="1" style="width:70px;">
        <input type="text" class="crm-input crm-welcome-desc" value="${escapeHtml(item.description || '')}" placeholder="Description" style="flex:1;">
        <button type="button" class="crm-btn crm-btn-xs crm-btn-danger crm-welcome-remove" title="Remove">&times;</button>
      `;
      row.querySelector('.crm-welcome-remove').addEventListener('click', () => row.remove());
      return row;
    };

    const loadPackageItems = (packageKey) => {
      itemsWrap.innerHTML = '';
      const pkg = WELCOME_PACKAGES[packageKey];
      if (pkg) {
        document.getElementById('welcome-package-title').value = pkg.title;
        pkg.items.forEach(item => itemsWrap.appendChild(renderItemRow(item)));
      } else {
        // Custom — start empty, prompt user to add items
        document.getElementById('welcome-package-title').value = '';
        itemsWrap.appendChild(renderItemRow({ quantity: 1, description: '' }));
      }
    };

    loadPackageItems('heal');

    document.getElementById('welcome-package').addEventListener('change', (e) => {
      loadPackageItems(e.target.value);
    });

    document.getElementById('btn-welcome-add-item').addEventListener('click', () => {
      itemsWrap.appendChild(renderItemRow({ quantity: 1, description: '' }));
    });

    const collectItems = () => {
      return Array.from(itemsWrap.querySelectorAll('.crm-welcome-item'))
        .map(row => ({
          description: row.querySelector('.crm-welcome-desc').value.trim(),
          quantity: Math.max(1, parseInt(row.querySelector('.crm-welcome-qty').value, 10) || 1),
        }))
        .filter(item => item.description);
    };

    const buildPayload = ({ preview, toOverride } = {}) => {
      return {
        type: 'welcome_letter',
        to: toOverride || lead.email,
        preview: preview || undefined,
        data: {
          recipient_first_name: lead.first_name || 'there',
          business_line: lead.business_line || 'within',
          proposal_title: document.getElementById('welcome-package-title').value.trim() || 'Your Program',
          session_date: document.getElementById('welcome-session-date')?.value || null,
          arrival_time: document.getElementById('welcome-arrival-time')?.value.trim() || null,
          line_items: collectItems(),
        },
      };
    };

    document.getElementById('btn-preview-welcome').addEventListener('click', async () => {
      const btn = document.getElementById('btn-preview-welcome');
      const prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Loading preview…';
      try {
        const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';
        const resp = await fetch(supabaseUrl + '/functions/v1/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + anonKey, 'apikey': anonKey },
          body: JSON.stringify(buildPayload({ preview: true })),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || !result.html) throw new Error(result.error || 'Preview failed (HTTP ' + resp.status + ')');
        showProposalPreviewModal({
          subject: result.subject || 'Welcome Letter preview',
          html: result.html,
          from: result.from || '',
          to: (result.to && result.to[0]) || lead.email || 'preview@example.com',
        });
      } catch (err) {
        console.error('Welcome preview error:', err);
        showToast('Preview failed: ' + (err.message || err), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });

    // Send test copy to an arbitrary address (no activity log, no lead touch)
    document.getElementById('btn-send-welcome-test').addEventListener('click', async () => {
      const testTo = document.getElementById('welcome-test-to').value.trim();
      if (!testTo) { showToast('Enter an email address to send the test to', 'error'); return; }
      const btn = document.getElementById('btn-send-welcome-test');
      const prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';
        const resp = await fetch(supabaseUrl + '/functions/v1/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + anonKey, 'apikey': anonKey },
          body: JSON.stringify(buildPayload({ toOverride: testTo })),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || 'Send failed (HTTP ' + resp.status + ')');
        }
        showToast(`Test copy sent to ${testTo}`, 'success');
      } catch (err) {
        console.error('Welcome test send error:', err);
        showToast('Test send failed: ' + (err.message || err), 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });

    document.getElementById('btn-confirm-send-welcome').addEventListener('click', async () => {
      const btn = document.getElementById('btn-confirm-send-welcome');
      const prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
        const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';
        const resp = await fetch(supabaseUrl + '/functions/v1/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + anonKey, 'apikey': anonKey },
          body: JSON.stringify(buildPayload({})),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || 'Send failed (HTTP ' + resp.status + ')');
        }
        await addActivity(lead.id, 'email', `Welcome letter sent to ${lead.email}`);
        showToast('Welcome letter sent', 'success');
        form.style.display = 'none';
        await openLeadDetail(lead.id);
      } catch (err) {
        console.error('Welcome send error:', err);
        showToast('Send failed: ' + (err.message || err), 'error');
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });

    document.getElementById('btn-cancel-welcome').addEventListener('click', () => {
      form.style.display = 'none';
    });
  });
}

function openInlineActionForm() {
  let form = document.getElementById('crm-quick-action-form');
  if (!form) {
    form = document.createElement('div');
    form.id = 'crm-quick-action-form';
    form.className = 'crm-inline-action-form';
    const main = document.querySelector('.crm-lead-main');
    main?.insertBefore(form, main.firstChild);
  }
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return form;
}

async function sendLeadEmail(lead, body) {
  if (!lead?.email) throw new Error('Lead has no email address');
  const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there';
  const bizLabel = lead.business_line === 'within' ? 'Within' : 'AWKN Ranch';
  const subject = `A note from ${bizLabel}`;
  const htmlBody = '<p>' + escapeHtml(body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';

  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const resp = await fetch('https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo',
    },
    body: JSON.stringify({ type: 'custom', to: lead.email, data: { subject, html: htmlBody, text: body } }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send email');
  }
  await addActivity(lead.id, 'email', `Email to ${lead.email}: ${body.substring(0, 200)}${body.length > 200 ? '…' : ''}`);
  showToast('Email sent', 'success');
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
          <h2>${isEdit ? `Edit Invoice${invoiceNumber ? ` · ${escapeHtml(invoiceNumber)}` : ''}` : 'New Invoice'}</h2>
          <button class="crm-modal-close" id="crm-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <input type="hidden" id="inv-number" value="${escapeHtml(invoiceNumber)}">
          <div class="crm-form-grid">
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
          <div style="display:flex;gap:8px;">
            <button class="crm-btn" id="btn-preview-invoice" style="border-color:#6366f1;color:#6366f1;">Preview</button>
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

  // Preview invoice
  document.getElementById('btn-preview-invoice').addEventListener('click', () => openInvoicePreview());

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

function openInvoicePreview() {
  const lineItems = [];
  document.querySelectorAll('.crm-line-item').forEach(el => {
    const desc = el.querySelector('.crm-li-desc')?.value?.trim() || '';
    const qty = parseFloat(el.querySelector('.crm-li-qty')?.value) || 1;
    const price = parseFloat(el.querySelector('.crm-li-price')?.value) || 0;
    if (desc) lineItems.push({ description: desc, quantity: qty, unit_price: price, total: qty * price });
  });

  const bizLine = document.getElementById('inv-biz-line')?.value || 'within';
  const bizLabel = bizLine === 'within' ? 'Within' : 'AWKN Ranch';
  const invoiceNumber = document.getElementById('inv-number')?.value || '';
  const clientName = document.getElementById('inv-client-name')?.value || '';
  const clientEmail = document.getElementById('inv-client-email')?.value || '';
  const clientPhone = document.getElementById('inv-client-phone')?.value || '';
  const invoiceDate = document.getElementById('inv-date')?.value || '';
  const dueDate = document.getElementById('inv-due-date')?.value || '';
  const discountLabel = document.getElementById('inv-discount-label')?.value || '';
  const discount = parseFloat(document.getElementById('inv-discount')?.value) || 0;
  const tax = parseFloat(document.getElementById('inv-tax')?.value) || 0;
  const notes = document.getElementById('inv-notes')?.value || '';
  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
  const total = subtotal - discount + tax;

  const logoUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co/storage/v1/object/public/housephotos/logos/logo-black-transparent.png';
  const accentColor = bizLine === 'within' ? '#2a1f23' : '#d4883a';

  const lineItemRows = lineItems.map(li => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;white-space:pre-line;">${escapeHtml(li.description)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${li.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">${formatCurrency(li.unit_price)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600;">${formatCurrency(li.total)}</td>
    </tr>
  `).join('');

  const previewHtml = `
    <div id="invoice-preview-overlay" style="position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #eee;">
          <span style="font-weight:700;font-size:15px;">Invoice Preview</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="btn-print-invoice" style="padding:6px 14px;font-size:12px;font-weight:600;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">Print / PDF</button>
            <button id="btn-close-preview" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1;">&times;</button>
          </div>
        </div>
        <div id="invoice-preview-content" style="padding:32px;font-family:'DM Sans',system-ui,sans-serif;">
          <!-- Header -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;">
            <div>
              <img src="${logoUrl}" alt="${escapeHtml(bizLabel)}" style="height:48px;margin-bottom:8px;" onerror="this.style.display='none'">
              <div style="font-size:12px;color:#888;margin-top:4px;">${escapeHtml(bizLabel)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:28px;font-weight:800;color:${accentColor};letter-spacing:-0.5px;">INVOICE</div>
              ${invoiceNumber ? `<div style="font-size:13px;color:#666;margin-top:4px;">${escapeHtml(invoiceNumber)}</div>` : ''}
            </div>
          </div>

          <!-- Client & Date Info -->
          <div style="display:flex;justify-content:space-between;margin-bottom:28px;gap:24px;">
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;margin-bottom:6px;">Bill To</div>
              <div style="font-size:14px;font-weight:600;color:#222;">${escapeHtml(clientName)}</div>
              ${clientEmail ? `<div style="font-size:12px;color:#666;margin-top:2px;">${escapeHtml(clientEmail)}</div>` : ''}
              ${clientPhone ? `<div style="font-size:12px;color:#666;margin-top:2px;">${escapeHtml(clientPhone)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              ${invoiceDate ? `<div style="margin-bottom:6px;"><span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Date</span><br><span style="font-size:13px;color:#333;">${formatDate(invoiceDate)}</span></div>` : ''}
              ${dueDate ? `<div><span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Due Date</span><br><span style="font-size:13px;color:#333;">${formatDate(dueDate)}</span></div>` : ''}
            </div>
          </div>

          <!-- Line Items Table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="border-bottom:2px solid ${accentColor};">
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Description</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Qty</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Rate</th>
                <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#999;font-size:13px;">No line items added</td></tr>'}
            </tbody>
          </table>

          <!-- Totals -->
          <div style="display:flex;justify-content:flex-end;">
            <div style="width:240px;">
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666;">
                <span>Subtotal</span><span>${formatCurrency(subtotal)}</span>
              </div>
              ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666;">
                <span>${escapeHtml(discountLabel || 'Discount')}</span><span>-${formatCurrency(discount)}</span>
              </div>` : ''}
              ${tax > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666;">
                <span>Tax</span><span>${formatCurrency(tax)}</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:18px;font-weight:800;color:${accentColor};border-top:2px solid ${accentColor};margin-top:6px;">
                <span>Total</span><span>${formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <!-- Notes -->
          ${notes ? `
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #eee;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;font-weight:700;margin-bottom:6px;">Notes</div>
            <div style="font-size:12px;color:#666;white-space:pre-line;">${escapeHtml(notes)}</div>
          </div>` : ''}

          <!-- Footer -->
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
            <div style="font-size:11px;color:#bbb;">Thank you for your business</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', previewHtml);

  document.getElementById('btn-close-preview').addEventListener('click', () => {
    document.getElementById('invoice-preview-overlay')?.remove();
  });
  document.getElementById('invoice-preview-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'invoice-preview-overlay') e.target.remove();
  });
  document.getElementById('btn-print-invoice').addEventListener('click', () => {
    const content = document.getElementById('invoice-preview-content').innerHTML;
    const win = window.open('', '_blank', 'width=700,height=900');
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${escapeHtml(invoiceNumber)}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>body{margin:0;padding:32px;font-family:'DM Sans',system-ui,sans-serif;}@media print{body{padding:20px;}}</style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.onload = () => { win.print(); };
  });
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

  // Row actions
  panel.querySelectorAll('[data-view-proposal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = proposals.find(x => x.id === btn.dataset.viewProposal);
      if (p) openProposalModal(p);
    });
  });
  panel.querySelectorAll('[data-send-proposal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const proposalId = btn.dataset.sendProposal;
      const p = proposals.find(x => x.id === proposalId);
      if (!p) return;
      if (!confirm(`Send proposal ${p.proposal_number} to the lead? This will generate a Stripe payment link and email them.`)) return;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await sendProposalNow(proposalId);
        await loadAllData();
        renderAll();
      } catch (err) {
        console.error('Send proposal error:', err);
        showToast('Error sending proposal: ' + (err.message || err), 'error');
        btn.disabled = false;
        btn.textContent = 'Send';
      }
    });
  });
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
            <button class="crm-btn" id="btn-preview-proposal">Preview Email</button>
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

  // Preview email — renders via send-email edge function with preview flag
  document.getElementById('btn-preview-proposal').addEventListener('click', () => previewProposalEmail());

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

  // When sending, require a lead so we know who to email.
  const leadId = document.getElementById('prop-lead').value || null;
  if (status === 'sent' && !leadId) {
    showToast('Select a lead before sending', 'error');
    return;
  }
  if (status === 'sent' && total <= 0) {
    showToast('Total must be greater than $0 to send', 'error');
    return;
  }

  // Save as draft first; promote to "sent" only after payment link + email succeed.
  const payload = {
    lead_id: leadId,
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
    status: 'draft',
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

    if (status === 'sent') {
      await sendProposalNow(proposalId);
    } else {
      showToast('Proposal saved as draft', 'success');
    }

    await loadAllData();
    renderAll();
    closeModal();
  } catch (err) {
    console.error('Save proposal error:', err);
    showToast('Error saving proposal: ' + (err.message || err), 'error');
  }
}

// Generate Stripe payment link, email the recipient, and flip proposal to status='sent'.
// Called both from the modal "Send Proposal" button and the table row "Send" shortcut.
async function sendProposalNow(proposalId) {
  const { data: proposal, error: pErr } = await supabase
    .from('crm_proposals')
    .select('*, items:crm_proposal_items(*)')
    .eq('id', proposalId)
    .single();
  if (pErr || !proposal) throw new Error('Proposal not found');

  if (!proposal.lead_id) throw new Error('Proposal has no lead — cannot send');

  const { data: lead, error: lErr } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, business_line')
    .eq('id', proposal.lead_id)
    .single();
  if (lErr || !lead?.email) throw new Error('Lead is missing an email address');

  // Refresh the session so we don't hit a stale/expired JWT mid-flow.
  // The Supabase gateway rejects expired tokens with { code, message } — NOT
  // { error, detail } — so a bare 401 here was very uninformative.
  let token = null;
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed?.session?.access_token || null;
  } catch (_) { /* fall through to getSession */ }
  if (!token) {
    const { data: sessionWrap } = await supabase.auth.getSession();
    token = sessionWrap?.session?.access_token || null;
  }
  if (!token) throw new Error('Not signed in — reload and sign in again.');

  const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

  // 1. Stripe payment link
  const linkResp = await fetch(supabaseUrl + '/functions/v1/create-payment-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      amount: Number(proposal.total),
      description: `${proposal.proposal_number} — ${proposal.title}`,
      person_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      person_email: lead.email,
      category: 'crm_proposal',
      metadata: {
        source: 'crm-proposal',
        proposal_id: proposal.id,
        proposal_number: proposal.proposal_number,
        lead_id: lead.id,
      },
    }),
  });
  const linkData = await linkResp.json().catch(() => ({}));
  if (!linkResp.ok || !linkData.url) {
    // Gateway rejections surface as { code, message }; function errors as { error, detail }.
    const msg = [linkData.error, linkData.detail, linkData.message, linkData.code]
      .filter(Boolean).join(' — ') || linkResp.status;
    if (linkResp.status === 401) {
      throw new Error('Payment link failed: session expired — please sign out and sign back in (' + msg + ')');
    }
    throw new Error('Payment link failed: ' + msg);
  }

  // 2. Stamp proposal with payment link + sent state before email (so the row is accurate
  //    even if the email send has a transient failure).
  await supabase.from('crm_proposals').update({
    payment_link_id: linkData.payment_link_id,
    payment_link_url: linkData.url,
    sent_at: new Date().toISOString(),
    sent_to_email: lead.email,
    status: 'sent',
  }).eq('id', proposal.id);

  // 3. Send the branded email
  const items = (proposal.items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const emailResp = await fetch(supabaseUrl + '/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      type: 'proposal_sent',
      to: lead.email,
      data: {
        recipient_first_name: lead.first_name || '',
        business_line: lead.business_line || null,
        proposal_number: proposal.proposal_number,
        title: proposal.title,
        event_type: proposal.event_type,
        event_date: proposal.event_date,
        guest_count: proposal.guest_count,
        subtotal: proposal.subtotal,
        discount_amount: proposal.discount_amount,
        tax_amount: proposal.tax_amount,
        total: proposal.total,
        valid_until: proposal.valid_until,
        notes: proposal.notes,
        terms: proposal.terms,
        payment_link_url: linkData.url,
        line_items: items.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          total: li.total,
        })),
      },
    }),
  });
  if (!emailResp.ok) {
    const err = await emailResp.json().catch(() => ({}));
    throw new Error('Email send failed: ' + (err.error || emailResp.status));
  }

  // 4. Log activity + advance lead stage to proposal_sent if it exists for this business line.
  await addActivity(lead.id, 'email', `Proposal ${proposal.proposal_number} sent to ${lead.email}`);
  const proposalSentStage = stages.find(s => s.slug === 'proposal_sent');
  if (proposalSentStage) {
    await moveLeadToStage(lead.id, proposalSentStage.id);
  }

  showToast('Proposal sent — payment link delivered', 'success');
}

// Render the proposal email in a modal iframe using the live send-email template,
// without persisting a draft or sending anything. Reads directly from the form so the
// preview reflects unsaved edits.
async function previewProposalEmail() {
  const title = document.getElementById('prop-title').value.trim() || 'Your Event at AWKN Ranch';
  const leadId = document.getElementById('prop-lead').value || null;
  const lead = leadId ? leads.find(l => l.id === leadId) : null;

  const lineItems = getProposalLineItemsFromForm();
  const subtotal = lineItems.reduce((s, li) => s + li.total, 0);
  const discount = parseFloat(document.getElementById('prop-discount').value) || 0;
  const tax = parseFloat(document.getElementById('prop-tax').value) || 0;
  const total = subtotal - discount + tax;

  const { data: sessionWrap } = await supabase.auth.getSession();
  const token = sessionWrap?.session?.access_token;
  if (!token) { showToast('Not authenticated', 'error'); return; }

  const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

  const btn = document.getElementById('btn-preview-proposal');
  const prevLabel = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading preview…'; }

  try {
    const resp = await fetch(supabaseUrl + '/functions/v1/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        type: 'proposal_sent',
        to: lead?.email || 'preview@example.com',
        preview: true,
        data: {
          recipient_first_name: lead?.first_name || 'there',
          business_line: lead?.business_line || 'awkn_ranch',
          proposal_number: document.getElementById('prop-number').value || 'PROP-PREVIEW',
          title,
          event_type: document.getElementById('prop-event-type').value || null,
          event_date: document.getElementById('prop-event-date').value || null,
          guest_count: parseInt(document.getElementById('prop-guest-count').value) || null,
          subtotal,
          discount_amount: discount,
          tax_amount: tax,
          total,
          valid_until: document.getElementById('prop-valid-until').value || null,
          notes: document.getElementById('prop-notes').value.trim() || null,
          terms: document.getElementById('prop-terms').value.trim() || null,
          payment_link_url: '#preview-no-payment-link',
          line_items: lineItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            total: li.total,
          })),
        },
      }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.html) {
      throw new Error(result.error || 'Preview failed (HTTP ' + resp.status + ')');
    }
    showProposalPreviewModal({
      subject: result.subject || 'Proposal preview',
      html: result.html,
      from: result.from || '',
      to: (result.to && result.to[0]) || lead?.email || 'preview@example.com',
    });
  } catch (err) {
    console.error('Preview error:', err);
    showToast('Preview failed: ' + (err.message || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
}

function showProposalPreviewModal({ subject, html, from, to }) {
  const existing = document.getElementById('crm-preview-modal');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'crm-preview-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;';
  wrap.innerHTML = `
    <div style="background:#fff;width:100%;max-width:760px;max-height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;background:#f8fafc;">
        <div style="flex:1;min-width:0;font-size:12px;color:#475569;line-height:1.5;">
          <div><strong style="color:#1e293b;">Preview</strong> — exactly what the recipient will see. No email sent.</div>
        </div>
        <button type="button" id="crm-preview-close" class="crm-btn">Close</button>
      </div>
      <div style="padding:14px 20px;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#334155;">
        <div style="font-size:17px;font-weight:600;color:#0f172a;margin-bottom:6px;line-height:1.3;">${escapeHtml(subject)}</div>
        <div style="display:grid;grid-template-columns:60px 1fr;gap:2px 10px;">
          <div style="color:#94a3b8;">From:</div><div>${escapeHtml(from)}</div>
          <div style="color:#94a3b8;">To:</div><div>${escapeHtml(to)}</div>
        </div>
      </div>
      <iframe id="crm-preview-iframe" style="flex:1;width:100%;border:0;min-height:520px;background:#ffffff;"></iframe>
    </div>
  `;
  document.body.appendChild(wrap);

  const iframe = wrap.querySelector('#crm-preview-iframe');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  // Render the body HTML verbatim — no wrapping styles. This matches what Resend
  // delivers to the recipient; their email client provides its own chrome.
  doc.write(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  doc.close();

  const close = () => wrap.remove();
  wrap.querySelector('#crm-preview-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
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
