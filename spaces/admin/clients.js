// Clients Page - Admin view for AWKN Within ketamine clients.
// Sub-tabs: Clients / Schedule / House / Services.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';
import { sendProposalEmail } from './crm-actions.js';
import { openClientStayModal } from '../../shared/client-stay-modal.js';

// =============================================
// STATE
// =============================================

let authState = null;
let currentSubtab = localStorage.getItem('clients-subtab') || 'clients';

// Services catalog
let services = [];
let showArchivedServices = false;

// Service package templates (retreat / treatment packages from crm_service_packages)
// servicePackageTemplates = active + 'within' business line only (used by client package modal)
// allServicePackages = full catalog including inactive (used by admin Packages panel)
let servicePackageTemplates = [];
let allServicePackages = [];
let packageItemsByPkgId = new Map(); // package_id -> [{service_id, quantity, sort_order}]
let showInactivePackages = false;

// Facilitators directory + their service assignments (facilitator_id -> Set of service_id)
let facilitators = [];
let facilitatorServicesByFacId = new Map();
let showInactiveFacilitators = false;

// Clients / packages / stays
let clients = [];           // crm_leads in `active_client` stage (business_line=within)
let packages = [];          // client_packages + nested sessions
let stays = [];             // client_stays + nested bed+space
let retreatAgreements = []; // within_retreat_agreements rows for all loaded clients
let activeClientStageId = null;

// Lodging inventory (used by House tab + Stay modal bed picker)
let lodgingSpaces = [];     // spaces where space_type='lodging'
let beds = [];              // all non-archived beds

// Schedule modal state
let sessionSpaces = [];     // spaces where space_type='session' (treatment rooms)
let staffList = [];         // app_users with role admin/staff/oracle, not archived

// Integration notes cache: lead_id -> array of notes (newest first).
// Loaded on demand when a client drawer opens.
let integrationNotesByLead = new Map();

// Client drawer state: which tab is showing, which lead is open, and the
// bookings / proposals caches populated lazily when the drawer opens.
let activeClientTab = 'overview';
let currentDrawerLeadId = null;
let bookingsByLead = new Map();     // lead_id -> array of scheduling_bookings
let proposalsByLead = new Map();    // lead_id -> array of crm_proposals (incl. items)
let moreMenuOpen = false;

// Schedule tab state
let scheduleWeekStart = mondayOf(new Date()); // local Date @ 00:00 on Mon of viewed week
let scheduleBookings = [];
let scheduleStaffFilter = 'all';  // 'all' | facilitator_id | 'unassigned'

// House tab state
let houseSelectedDate = new Date().toISOString().slice(0, 10);
let houseViewMode = 'night'; // 'night' | 'week' | 'month'

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

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
      handleLeadDeepLink();
    },
  });
});

// =============================================
// DATA LOADING
// =============================================

async function loadAllData() {
  // Step 1: services catalog + pipeline stage lookup + lodging inventory run in parallel
  const [servicesRes, stagesRes, spacesRes, bedsRes, staffRes, svcPkgRes, pkgItemsRes, facRes, facSvcRes] = await Promise.all([
    supabase.from('services').select('*').order('name'),
    supabase.from('crm_pipeline_stages').select('id, slug, business_line').eq('slug', 'active_client'),
    supabase.from('spaces').select('id, name, slug, floor, has_private_bath, space_type, is_archived').eq('is_archived', false).in('space_type', ['lodging', 'session']),
    supabase.from('beds').select('*').eq('is_archived', false).order('sort_order'),
    supabase.from('app_users').select('id, display_name, first_name, last_name, email, role, can_schedule, is_archived').in('role', ['admin', 'staff', 'oracle']).eq('is_archived', false).order('display_name'),
    supabase.from('crm_service_packages').select('id, name, slug, price_regular, price_promo, description, includes, business_line, is_active, sort_order, category').eq('business_line', 'within').order('sort_order').order('name'),
    supabase.from('crm_service_package_items').select('package_id, service_id, quantity, sort_order'),
    supabase.from('facilitators').select('*').order('last_name', { nullsFirst: false }).order('first_name'),
    supabase.from('facilitator_services').select('facilitator_id, service_id'),
  ]);

  if (servicesRes.error) console.error('services load error:', servicesRes.error);
  services = servicesRes.data || [];
  allServicePackages = svcPkgRes.data || [];
  servicePackageTemplates = allServicePackages.filter(p => p.is_active);
  packageItemsByPkgId = new Map();
  (pkgItemsRes.data || []).forEach(row => {
    if (!packageItemsByPkgId.has(row.package_id)) packageItemsByPkgId.set(row.package_id, []);
    packageItemsByPkgId.get(row.package_id).push(row);
  });
  packageItemsByPkgId.forEach(arr => arr.sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)));
  facilitators = facRes.data || [];
  facilitatorServicesByFacId = new Map();
  (facSvcRes.data || []).forEach(row => {
    if (!facilitatorServicesByFacId.has(row.facilitator_id)) {
      facilitatorServicesByFacId.set(row.facilitator_id, new Set());
    }
    facilitatorServicesByFacId.get(row.facilitator_id).add(row.service_id);
  });

  const withinStage = (stagesRes.data || []).find(s => s.business_line === 'within');
  activeClientStageId = withinStage?.id || null;

  const allSpaces = spacesRes.data || [];
  lodgingSpaces = allSpaces.filter(s => s.space_type === 'lodging');
  sessionSpaces = allSpaces.filter(s => s.space_type === 'session');
  beds = bedsRes.data || [];
  staffList = staffRes.data || [];

  // Step 2: load clients + their packages + stays (needs activeClientStageId)
  await loadClientsData();
}

async function loadClientsData() {
  if (!activeClientStageId) {
    clients = []; packages = []; stays = [];
    return;
  }

  const [clientsRes, pkgsRes, sessRes, staysRes, agreementsRes] = await Promise.all([
    supabase.from('crm_leads')
      .select(`
        id, first_name, last_name, email, phone, city, state, created_at, notes, business_line, stage_id,
        preferred_name, pronouns,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        dietary_preferences, dietary_dislikes,
        room_preferences,
        arrival_method, arrival_details, arrival_pickup_needed,
        departure_details, departure_pickup_needed,
        waiver_signed, intake_completed
      `)
      .eq('stage_id', activeClientStageId)
      .order('created_at', { ascending: false }),
    supabase.from('client_packages').select('*').order('created_at', { ascending: false }),
    supabase.from('client_package_sessions').select('*').order('created_at'),
    supabase.from('client_stays').select('*').order('check_in_at', { ascending: false }),
    supabase.from('within_retreat_agreements').select('*').order('created_at', { ascending: false }),
  ]);

  if (clientsRes.error) { console.error('clients load error:', clientsRes.error); showToast('Failed to load clients', 'error'); }
  clients = clientsRes.data || [];

  const allSessions = sessRes.data || [];
  packages = (pkgsRes.data || []).map(p => ({
    ...p,
    sessions: allSessions.filter(s => s.package_id === p.id),
  }));

  stays = staysRes.data || [];
  retreatAgreements = agreementsRes?.data || [];
}

function getClientPackages(leadId) {
  return packages.filter(p => p.lead_id === leadId);
}

// Most recent within retreat agreement for a lead — null when none on file.
// Sorted desc on load so the first match is the most recent.
function getLatestRetreatAgreement(leadId) {
  return retreatAgreements.find(a => a.lead_id === leadId) || null;
}
function getClientStays(leadId) {
  return stays.filter(s => s.lead_id === leadId);
}
function getBedLabel(bedId) {
  const b = beds.find(x => x.id === bedId);
  if (!b) return 'Unknown bed';
  const sp = lodgingSpaces.find(s => s.id === b.space_id);
  return `${sp ? sp.name : 'Room'} \u00b7 ${b.label}`;
}
function getServiceName(serviceId) {
  const s = services.find(x => x.id === serviceId);
  return s ? s.name : 'Service';
}
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  else if (currentSubtab === 'clients') renderClientsPanel();
  else if (currentSubtab === 'schedule') { renderSchedulePanel(); loadScheduleWeek(); }
  else if (currentSubtab === 'house') renderHousePanel();
}

function previewBanner(phaseLabel, note) {
  return `
    <div style="padding:10px 14px;background:#fff8ec;border:1px solid #f2d69a;border-radius:8px;margin-bottom:16px;font-size:12px;color:#8a5a1a;display:flex;gap:10px;align-items:center;">
      <span style="font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Preview &middot; ${escapeHtml(phaseLabel)}</span>
      <span style="opacity:.8;">${escapeHtml(note)}</span>
    </div>
  `;
}

// ---------- Clients tab (Phase 3, live) ----------
let clientSearch = '';

// Classify a client package as retreat (immersive, overnight) or day (outpatient).
// Retreat packages have "residential", "immersion", or "retreat" in the stored name.
function isRetreatPackage(p) {
  return /residential|immersion|retreat/i.test(p?.name || '');
}

// Build a per-client context used by every section: active packages, stays,
// and sessions remaining per service. Centralizing this keeps the section
// filters and row renderers consistent.
function buildClientContext(c, now) {
  const pkgs = getClientPackages(c.id);
  const activePkgs = pkgs.filter(p => p.status === 'active');
  const retreatPkgs = activePkgs.filter(isRetreatPackage);
  const dayPkgs = activePkgs.filter(p => !isRetreatPackage(p));

  const clientStays = getClientStays(c.id).filter(s => s.status !== 'cancelled');
  const currentStay = clientStays.find(s =>
    new Date(s.check_in_at) <= now && new Date(s.check_out_at) > now
  );
  const futureStay = clientStays
    .filter(s => new Date(s.check_in_at) > now)
    .sort((a, b) => new Date(a.check_in_at) - new Date(b.check_in_at))[0];

  // Sessions remaining = unscheduled only, across *all* active packages
  // (keyed by service_id so the drawer can show per-service counts).
  // Once a session is booked (status='scheduled') it no longer counts as
  // remaining to schedule.
  const remainingByService = new Map();
  for (const p of activePkgs) {
    for (const s of (p.sessions || [])) {
      if (s.status !== 'unscheduled') continue;
      remainingByService.set(s.service_id, (remainingByService.get(s.service_id) || 0) + 1);
    }
  }

  const hasRemainingDaySession = dayPkgs.some(p =>
    (p.sessions || []).some(s => s.status === 'unscheduled')
  );

  return {
    client: c, pkgs, activePkgs, retreatPkgs, dayPkgs,
    clientStays, currentStay, futureStay,
    remainingByService, hasRemainingDaySession,
  };
}

function renderClientsPanel() {
  const panel = document.getElementById('clients-panel-clients');
  if (!panel) return;

  const q = clientSearch.trim().toLowerCase();
  const matchesSearch = c => {
    if (!q) return true;
    return `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.phone || ''}`
      .toLowerCase().includes(q);
  };

  const now = new Date();
  const inHouse = [];
  const dayActive = [];
  const scheduledArrivals = [];
  const pastClients = [];

  for (const c of clients) {
    if (!matchesSearch(c)) continue;
    const ctx = buildClientContext(c, now);

    // Priority order matches the user-facing section order:
    // In the house > Day package w/ remaining sessions > Scheduled retreat arrival > Past.
    if (ctx.currentStay && ctx.retreatPkgs.length) {
      inHouse.push(ctx);
    } else if (ctx.hasRemainingDaySession) {
      dayActive.push(ctx);
    } else if (ctx.retreatPkgs.length) {
      scheduledArrivals.push(ctx);
    } else {
      pastClients.push(ctx);
    }
  }

  const totalFiltered = inHouse.length + dayActive.length + scheduledArrivals.length + pastClients.length;

  let html = `
    <div class="crm-pipeline-toolbar">
      <button class="crm-btn crm-btn-primary" id="btn-new-client">+ New Client</button>
      <input class="crm-search" id="clients-search" placeholder="Search clients by name, email, phone\u2026" value="${escapeHtml(clientSearch)}">
      <span style="margin-left:auto;font-size:12px;color:var(--text-muted,#888);">
        ${totalFiltered} of ${clients.length} active client${clients.length === 1 ? '' : 's'}
      </span>
    </div>
  `;

  if (clients.length === 0) {
    html += `
      <div style="padding:36px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">
        No active clients yet. In CRM, move a "within" lead into the <strong>Active Client</strong> stage to make them show up here.
      </div>
    `;
  } else {
    html += renderClientSection({
      title: 'In the House',
      accent: '#16a34a',
      subtitle: 'Actively at AWKN Ranch right now.',
      ctxs: inHouse,
      headers: ['Name', 'Contact', 'Room', 'Checked in', 'Checks out', 'Sessions left'],
      rowFn: renderInHouseRow,
    });
    html += renderClientSection({
      title: 'Day Package Clients \u2014 Sessions Remaining',
      accent: '#d4883a',
      subtitle: 'Outpatient clients with unused or upcoming sessions.',
      ctxs: dayActive,
      headers: ['Name', 'Contact', 'Packages', 'Sessions left', 'Next session'],
      rowFn: renderDayActiveRow,
    });
    html += renderClientSection({
      title: 'Scheduled Retreat Arrivals',
      accent: '#4338ca',
      subtitle: 'Retreat packages upcoming or awaiting a date.',
      ctxs: scheduledArrivals,
      headers: ['Name', 'Contact', 'Package', 'Arrival', 'Room'],
      rowFn: renderScheduledArrivalRow,
    });
    html += renderClientSection({
      title: 'Past Clients',
      accent: '#94a3b8',
      subtitle: 'No active packages.',
      ctxs: pastClients,
      headers: ['Name', 'Contact', 'History', 'Last activity'],
      rowFn: renderPastClientRow,
    });
  }

  panel.innerHTML = html;
}

function renderClientSection({ title, subtitle, accent, ctxs, headers, rowFn }) {
  if (!ctxs.length) {
    return `
      <div style="margin-top:24px;">
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
          <div style="width:4px;height:18px;background:${accent};border-radius:2px;"></div>
          <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--text,#2a1f23);">${escapeHtml(title)}</h3>
          <span style="font-size:11px;color:var(--text-muted,#aaa);">0</span>
        </div>
        <div style="padding:14px 16px;background:var(--bg,#faf9f6);border:1px dashed var(--border-color,#e5e5e5);border-radius:8px;font-size:12px;color:var(--text-muted,#888);">
          ${escapeHtml(subtitle)} No clients in this group.
        </div>
      </div>
    `;
  }
  return `
    <div style="margin-top:24px;">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;">
        <div style="width:4px;height:18px;background:${accent};border-radius:2px;"></div>
        <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--text,#2a1f23);">${escapeHtml(title)}</h3>
        <span style="font-size:11px;color:var(--text-muted,#888);font-weight:600;">${ctxs.length}</span>
        <span style="font-size:12px;color:var(--text-muted,#999);">${escapeHtml(subtitle)}</span>
      </div>
      <div class="crm-table-wrap">
        <table class="crm-table">
          <thead>
            <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${ctxs.map(rowFn).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRowShell(ctx, cells) {
  const c = ctx.client;
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';
  const contact = c.email || c.phone || '';
  return `
    <tr class="clients-client-row" data-client-id="${c.id}" style="cursor:pointer;">
      <td><strong>${escapeHtml(name)}</strong></td>
      <td style="color:var(--text-muted,#666);font-size:12px;">${escapeHtml(contact)}</td>
      ${cells.join('')}
    </tr>
  `;
}

function formatRemainingByService(remainingByService) {
  if (!remainingByService.size) return '<span style="color:var(--text-muted,#bbb);">\u2014</span>';
  const parts = [];
  for (const [serviceId, count] of remainingByService) {
    parts.push(`<span style="display:inline-block;font-size:12px;margin-right:6px;"><strong>${count}</strong> <span style="color:var(--text-muted,#888);">${escapeHtml(getServiceName(serviceId))}</span></span>`);
  }
  return parts.join('');
}

function renderInHouseRow(ctx) {
  const stay = ctx.currentStay;
  const bedLabel = stay ? getBedLabel(stay.bed_id) : '\u2014';
  const checkIn = stay ? formatDateShort(stay.check_in_at) : '\u2014';
  const checkOut = stay ? formatDateShort(stay.check_out_at) : '\u2014';
  return renderRowShell(ctx, [
    `<td>${escapeHtml(bedLabel)}</td>`,
    `<td style="font-size:12px;color:var(--text-muted,#666);">${checkIn}</td>`,
    `<td style="font-size:12px;color:var(--text-muted,#666);">${checkOut}</td>`,
    `<td>${formatRemainingByService(ctx.remainingByService)}</td>`,
  ]);
}

function renderDayActiveRow(ctx) {
  const pkgNames = ctx.dayPkgs.map(p => escapeHtml(p.name)).join(', ') || '\u2014';

  // Next upcoming scheduled session across day packages
  const now = new Date();
  const nextScheduled = ctx.dayPkgs
    .flatMap(p => (p.sessions || []).filter(s => s.status === 'scheduled' && s.scheduled_at && new Date(s.scheduled_at) >= now))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
  const nextCell = nextScheduled
    ? `${escapeHtml(getServiceName(nextScheduled.service_id))}<div style="font-size:11px;color:var(--text-muted,#888);">${formatDateShort(nextScheduled.scheduled_at)}</div>`
    : '<span style="color:var(--text-muted,#bbb);">None scheduled</span>';

  return renderRowShell(ctx, [
    `<td style="font-size:12px;">${pkgNames}</td>`,
    `<td>${formatRemainingByService(ctx.remainingByService)}</td>`,
    `<td>${nextCell}</td>`,
  ]);
}

function renderScheduledArrivalRow(ctx) {
  const pkgNames = ctx.retreatPkgs.map(p => escapeHtml(p.name)).join(', ') || '\u2014';
  const stay = ctx.futureStay;
  const arrival = stay
    ? `${formatDateShort(stay.check_in_at)}<div style="font-size:11px;color:var(--text-muted,#888);">\u2192 ${formatDateShort(stay.check_out_at)}</div>`
    : '<span style="color:#b4691f;font-weight:600;">Date TBD</span>';
  const room = stay
    ? escapeHtml(getBedLabel(stay.bed_id))
    : '<span style="color:var(--text-muted,#bbb);">\u2014</span>';
  return renderRowShell(ctx, [
    `<td style="font-size:12px;">${pkgNames}</td>`,
    `<td style="font-size:12px;">${arrival}</td>`,
    `<td style="font-size:12px;">${room}</td>`,
  ]);
}

function renderPastClientRow(ctx) {
  const c = ctx.client;
  const completedCount = ctx.pkgs.filter(p => p.status === 'completed').length;
  const cancelledCount = ctx.pkgs.filter(p => p.status === 'cancelled').length;
  const historyParts = [];
  if (completedCount) historyParts.push(`${completedCount} completed`);
  if (cancelledCount) historyParts.push(`${cancelledCount} cancelled`);
  if (!ctx.pkgs.length) historyParts.push('No packages');
  const history = historyParts.join(' \u00b7 ');

  const completedStays = ctx.clientStays.filter(s => s.status === 'completed')
    .sort((a, b) => new Date(b.check_out_at) - new Date(a.check_out_at));
  const lastActivity = completedStays[0]
    ? formatDateShort(completedStays[0].check_out_at)
    : formatDateShort(c.created_at);

  return renderRowShell(ctx, [
    `<td style="font-size:12px;color:var(--text-muted,#666);">${escapeHtml(history)}</td>`,
    `<td style="font-size:12px;color:var(--text-muted,#888);">${lastActivity}</td>`,
  ]);
}

// ---------- Add Client modal (new lead OR promote existing CRM lead) ----------

let pipelineStagesCache = [];    // stages for all 'within' leads — name lookup for match cards
let addClientMatches = [];       // results from last CRM search
let addClientSearchInFlight = 0; // monotonic token so stale responses don't clobber fresh ones
let _addClientSearchDebounce = null;

async function ensurePipelineStagesCache() {
  if (pipelineStagesCache.length) return;
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id, slug, name, business_line')
    .eq('business_line', 'within');
  pipelineStagesCache = data || [];
}

function openAddClientModal() {
  ensurePipelineStagesCache();
  addClientMatches = [];
  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content" style="max-width:640px;">
        <div class="crm-modal-header">
          <h2>Add Client</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div style="margin-bottom:14px;">
            <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Find existing CRM lead</label>
            <input type="text" class="crm-input" id="add-client-crm-search" placeholder="Type a name, email, or phone\u2026" style="margin-top:6px;" autofocus>
            <div id="add-client-matches" style="margin-top:10px;"></div>
          </div>

          <div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px;">
            <div style="flex:1;height:1px;background:var(--border-color,#eee);"></div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Or create new</div>
            <div style="flex:1;height:1px;background:var(--border-color,#eee);"></div>
          </div>

          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>First name *</label>
              <input type="text" class="crm-input" id="new-client-first" required>
            </div>
            <div class="crm-form-field">
              <label>Last name</label>
              <input type="text" class="crm-input" id="new-client-last">
            </div>
            <div class="crm-form-field">
              <label>Email</label>
              <input type="email" class="crm-input" id="new-client-email">
            </div>
            <div class="crm-form-field">
              <label>Phone</label>
              <input type="text" class="crm-input" id="new-client-phone">
            </div>
            <div class="crm-form-field">
              <label>City</label>
              <input type="text" class="crm-input" id="new-client-city">
            </div>
            <div class="crm-form-field">
              <label>State</label>
              <input type="text" class="crm-input" id="new-client-state" maxlength="2" style="text-transform:uppercase;">
            </div>
          </div>
        </div>
        <div class="crm-modal-footer">
          <span></span>
          <div>
            <button class="crm-btn" id="btn-cancel-add-client">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-new-client">Create client</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  const closeModalBack = () => {
    modal.style.display = 'none';
    modal.innerHTML = '';
  };

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModalBack);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModalBack();
  });
  document.getElementById('btn-cancel-add-client').addEventListener('click', closeModalBack);
  document.getElementById('btn-save-new-client').addEventListener('click', saveNewClient);
}

async function searchCrmLeads(query) {
  const q = query.trim();
  const myToken = ++addClientSearchInFlight;
  if (!q) {
    addClientMatches = [];
    renderAddClientMatches('');
    return;
  }

  // Tokenize on spaces so "john smith" matches "Smith, John" too.
  const terms = q.split(/\s+/).filter(Boolean);
  let req = supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, phone, city, state, stage_id, business_line, created_at')
    .eq('business_line', 'within')
    .order('created_at', { ascending: false })
    .limit(8);

  // Build an OR filter across name/email/phone for each term, AND-ed across terms.
  for (const t of terms) {
    const esc = t.replace(/%/g, '\\%').replace(/,/g, '');
    req = req.or(`first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%`);
  }

  const { data, error } = await req;
  if (myToken !== addClientSearchInFlight) return; // stale response
  if (error) {
    console.error('CRM lead search error:', error);
    addClientMatches = [];
  } else {
    addClientMatches = data || [];
  }
  renderAddClientMatches(q);
}

function renderAddClientMatches(query) {
  const el = document.getElementById('add-client-matches');
  if (!el) return;
  if (!query.trim()) { el.innerHTML = ''; return; }
  if (!addClientMatches.length) {
    el.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--text-muted,#888);background:var(--bg,#faf9f6);border-radius:6px;">No matching CRM leads. Fill out the form below to create a new one.</div>`;
    return;
  }
  el.innerHTML = addClientMatches.map(lead => {
    const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '(no name)';
    const contactBits = [lead.email, lead.phone].filter(Boolean).join(' \u00b7 ');
    const stage = pipelineStagesCache.find(s => s.id === lead.stage_id);
    const isAlreadyActive = stage?.slug === 'active_client';
    const stageLabel = stage ? stage.name : 'No stage';
    const stageColor = isAlreadyActive ? '#16a34a' : '#6b7280';
    const cta = isAlreadyActive
      ? `<button class="crm-btn crm-btn-sm" data-add-client-open="${lead.id}">Open</button>`
      : `<button class="crm-btn crm-btn-sm crm-btn-primary" data-add-client-promote="${lead.id}">Use this lead</button>`;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-color,#eee);border-radius:6px;margin-bottom:6px;background:#fff;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:14px;">${escapeHtml(name)}</div>
          ${contactBits ? `<div style="font-size:12px;color:var(--text-muted,#666);">${escapeHtml(contactBits)}</div>` : ''}
          <div style="font-size:11px;color:${stageColor};margin-top:2px;">Stage: ${escapeHtml(stageLabel)}</div>
        </div>
        ${cta}
      </div>
    `;
  }).join('');
}

async function promoteLeadToActiveClient(leadId) {
  if (!activeClientStageId) {
    showToast('Active Client stage not found', 'error');
    return;
  }
  const { error } = await supabase
    .from('crm_leads')
    .update({ stage_id: activeClientStageId, updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) {
    showToast('Failed to promote lead: ' + error.message, 'error');
    return;
  }
  showToast('Client added', 'success');
  await loadClientsData();
  openClientDetail(leadId);
}

async function saveNewClient() {
  const first = document.getElementById('new-client-first').value.trim();
  const last = document.getElementById('new-client-last').value.trim();
  if (!first) { showToast('First name is required', 'error'); return; }
  if (!activeClientStageId) { showToast('Active Client stage not found', 'error'); return; }

  const email = document.getElementById('new-client-email').value.trim() || null;
  const phone = document.getElementById('new-client-phone').value.trim() || null;
  const city = document.getElementById('new-client-city').value.trim() || null;
  const stateInput = document.getElementById('new-client-state').value.trim().toUpperCase() || null;

  const saveBtn = document.getElementById('btn-save-new-client');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Creating\u2026';

  const { data, error } = await supabase
    .from('crm_leads')
    .insert({
      business_line: 'within',
      stage_id: activeClientStageId,
      first_name: first,
      last_name: last,
      email,
      phone,
      city,
      state: stateInput,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) {
    console.error('create client error:', error);
    showToast('Failed to create client: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Create client';
    return;
  }

  showToast('Client created', 'success');
  await loadClientsData();
  openClientDetail(data.id);
}

// ---------- Client detail drawer ----------

// Aggregate unscheduled sessions per service across active packages.
// Scheduled or completed sessions no longer count as "remaining."
function computeRemainingByService(pkgs) {
  const remaining = new Map();
  for (const p of pkgs) {
    if (p.status !== 'active') continue;
    for (const s of (p.sessions || [])) {
      if (s.status !== 'unscheduled') continue;
      remaining.set(s.service_id, (remaining.get(s.service_id) || 0) + 1);
    }
  }
  return remaining;
}

// Open the client drawer for a `?lead=<id>` URL param (used by the
// Within Schedule's "Open client" button and any other deep-link). We
// also force the Clients subtab so the drawer renders over the right
// panel, since the user's last-visited subtab (House, Schedule, etc.)
// would otherwise stick. If `?schedule=<package_session_id>` is also
// present (Reschedule flow from within-schedule.js), pop the schedule
// modal directly after the drawer mounts.
function handleLeadDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get('lead');
  const scheduleSessionId = params.get('schedule');
  if (!leadId) return;
  if (currentSubtab !== 'clients') {
    currentSubtab = 'clients';
    try { localStorage.setItem('clients-subtab', 'clients'); } catch (e) { /* ignore */ }
    renderAll();
  }
  // Defer one tick so the Clients panel is in the DOM before the drawer mounts.
  setTimeout(() => {
    openClientDetail(leadId);
    if (scheduleSessionId) {
      // Wait for the drawer to render before stacking the schedule modal.
      setTimeout(() => openScheduleSessionModal(scheduleSessionId), 50);
    }
  }, 0);
}

function openClientDetail(leadId) {
  const c = clients.find(x => x.id === leadId);
  if (!c) return;

  currentDrawerLeadId = leadId;
  activeClientTab = 'overview';
  moreMenuOpen = false;

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content crm-modal-xlarge" style="display:flex;flex-direction:column;max-height:92vh;">
        ${renderClientDrawerHeader(c)}
        ${renderClientTabNav(activeClientTab)}
        <div class="crm-modal-body" id="client-tab-panel" style="padding:20px;overflow-y:auto;flex:1;">
          ${renderClientTabContent(c, 'overview')}
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModal();
  });

  // Background loads — when each finishes, re-render the active tab if it
  // needs that data (Overview cares about bookings + notes; Sessions needs
  // bookings; Billing/Documents need proposals).
  loadClientBookings(leadId);
  loadClientProposals(leadId);
  loadClientIntegrationNotes(leadId);
}

function renderClientDrawerHeader(c) {
  const pkgs = getClientPackages(c.id);
  const remainingByService = computeRemainingByService(pkgs);
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';
  const contactBits = [
    c.email ? escapeHtml(c.email) : '',
    c.phone ? escapeHtml(c.phone) : '',
    (c.city || c.state) ? escapeHtml([c.city, c.state].filter(Boolean).join(', ')) : '',
  ].filter(Boolean).join(' \u00b7 ');

  const chips = [];
  chips.push(renderOnboardingChip('Waiver', c.waiver_signed));
  chips.push(renderOnboardingChip('Intake', c.intake_completed));

  const pills = [];
  for (const [serviceId, count] of remainingByService) {
    pills.push(`
      <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#fff8ec;border:1px solid #f0d9ae;border-radius:999px;font-size:12px;">
        <strong style="color:#b4691f;">${count}\u00d7</strong>
        <span style="color:var(--text,#2a1f23);">${escapeHtml(getServiceName(serviceId))}</span>
      </span>
    `);
  }

  return `
    <div class="crm-modal-header" style="flex-direction:column;align-items:stretch;padding:16px 20px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div style="flex:1;min-width:0;">
          <h2 style="margin:0;">${escapeHtml(name)}</h2>
          ${contactBits ? `<div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${contactBits}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;position:relative;">
          <button class="crm-btn crm-btn-sm" id="client-more-btn" data-action="client-more-toggle">More \u25be</button>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
          ${renderClientMoreMenu(c.id)}
        </div>
      </div>
      ${(chips.length || pills.length) ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center;">
          ${chips.join('')}
          ${pills.length ? `<span style="width:1px;height:18px;background:var(--border-color,#e5e5e5);margin:0 4px;"></span>` : ''}
          ${pills.join('')}
        </div>` : ''}
    </div>
  `;
}

function renderOnboardingChip(label, ok) {
  const bg = ok ? '#dcfce7' : '#fee2e2';
  const fg = ok ? '#15803d' : '#b91c1c';
  const mark = ok ? '\u2713' : '\u2717';
  return `
    <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;background:${bg};color:${fg};border-radius:999px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">
      <span>${mark}</span>${escapeHtml(label)}
    </span>
  `;
}

function renderClientMoreMenu(leadId) {
  const items = [
    { action: 'add-package',         label: 'Add package' },
    { action: 'add-stay',             label: 'Add retreat stay' },
    { sep: true },
    { action: 'send-invoice',         label: 'Send invoice\u2026' },
    { action: 'send-welcome-letter',  label: 'Send welcome letter\u2026' },
    { action: 'send-retreat-agreement', label: 'Send retreat agreement / waiver\u2026' },
    { sep: true },
    { action: 'open-in-crm',          label: 'Open in CRM \u2197' },
  ];
  const rendered = items.map(it => {
    if (it.sep) return `<div style="height:1px;background:var(--border-color,#eee);margin:4px 0;"></div>`;
    return `
      <button data-action="client-more-item" data-item="${it.action}" data-lead-id="${leadId}" style="
        display:block;width:100%;padding:8px 14px;background:none;border:none;text-align:left;font-size:13px;color:var(--text,#2a1f23);cursor:pointer;white-space:nowrap;
      " onmouseover="this.style.background='#faf8f5'" onmouseout="this.style.background='none'">${escapeHtml(it.label)}</button>
    `;
  }).join('');
  return `
    <div id="client-more-menu" style="display:none;position:absolute;top:36px;right:40px;background:#fff;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:4px 0;min-width:220px;z-index:10;">
      ${rendered}
    </div>
  `;
}

function renderClientTabNav(active) {
  const tabs = [
    { key: 'overview',    label: 'Overview' },
    { key: 'sessions',    label: 'Sessions' },
    { key: 'notes',       label: 'Notes' },
    { key: 'hospitality', label: 'Hospitality' },
    { key: 'lodging',     label: 'Lodging' },
    { key: 'billing',     label: 'Billing' },
    { key: 'documents',   label: 'Documents' },
  ];
  return `
    <div id="client-tab-nav" style="display:flex;gap:0;border-bottom:1px solid var(--border-color,#eee);padding:0 12px;overflow-x:auto;">
      ${tabs.map(t => {
        const isActive = t.key === active;
        return `
          <button class="client-tab-btn" data-action="client-select-tab" data-tab="${t.key}" style="
            padding:10px 14px;background:none;border:none;
            border-bottom:2px solid ${isActive ? '#c9943e' : 'transparent'};
            color:${isActive ? 'var(--text,#2a1f23)' : 'var(--text-muted,#888)'};
            font-weight:${isActive ? '600' : '500'};font-size:13px;cursor:pointer;white-space:nowrap;
          ">${escapeHtml(t.label)}</button>
        `;
      }).join('')}
    </div>
  `;
}

function selectClientTab(tab) {
  if (!currentDrawerLeadId) return;
  activeClientTab = tab;
  const c = clients.find(x => x.id === currentDrawerLeadId);
  if (!c) return;

  document.querySelectorAll('.client-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.style.borderBottom = `2px solid ${isActive ? '#c9943e' : 'transparent'}`;
    btn.style.color = isActive ? 'var(--text,#2a1f23)' : 'var(--text-muted,#888)';
    btn.style.fontWeight = isActive ? '600' : '500';
  });

  const panel = document.getElementById('client-tab-panel');
  if (!panel) return;
  panel.innerHTML = renderClientTabContent(c, tab);
  panel.scrollTop = 0;
  bindTabPanelHandlers(c.id, tab);
}

function renderClientTabContent(c, tab) {
  switch (tab) {
    case 'overview':    return renderOverviewTab(c);
    case 'sessions':    return renderSessionsTab(c);
    case 'notes':       return renderNotesTab(c);
    case 'hospitality': return renderHospitalityBlock(c);
    case 'lodging':     return renderLodgingTab(c);
    case 'billing':     return renderBillingTab(c);
    case 'documents':   return renderDocumentsTab(c);
  }
  return '';
}

function bindTabPanelHandlers(leadId, tab) {
  if (tab === 'notes') {
    // Notes tab renders an empty section that gets filled by the async loader
    // or by an immediate render if notes are already cached.
    renderIntegrationNotesSection(leadId);
    return;
  }
  if (tab === 'hospitality') {
    const hospSaveBtn = document.getElementById('btn-save-hospitality');
    if (hospSaveBtn) hospSaveBtn.addEventListener('click', () => saveHospitalityFields(leadId));
    const bindCollapsible = (toggleId, panelId, chevronId) => {
      const toggle = document.getElementById(toggleId);
      const panel = document.getElementById(panelId);
      const chevron = document.getElementById(chevronId);
      if (!toggle || !panel) return;
      toggle.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'grid';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
      });
    };
    bindCollapsible('hosp-diet-toggle', 'hosp-diet-panel', 'hosp-diet-chevron');
    bindCollapsible('hosp-arr-toggle',  'hosp-arr-panel',  'hosp-arr-chevron');
    return;
  }
  if (tab === 'lodging') {
    loadAndRenderLodgingStays(leadId);
    document.getElementById('btn-add-lodging-stay')?.addEventListener('click', async () => {
      const result = await openClientStayModal({ leadId });
      if (result?.saved) loadAndRenderLodgingStays(leadId);
    });
    return;
  }
}

// =============================================
// Lodging tab — current/upcoming/past Retreat House stays for this client
// =============================================
function renderLodgingTab(c) {
  return `
    <div style="padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">
          Retreat House Stays
        </div>
        <button id="btn-add-lodging-stay" class="crm-btn" style="padding:6px 12px;background:#d4883a;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
          + Assign to Bed
        </button>
      </div>
      <div id="lodging-stays-list" style="font-size:13px;color:var(--text-muted,#666);">
        Loading…
      </div>
      <div style="margin-top:14px;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#4b5563;line-height:1.45;">
        Tip: linking a stay to an active immersive package keeps the package and the lodging assignment in sync. The stay also shows up automatically on the Retreat House calendar.
      </div>
    </div>
  `;
}

async function loadAndRenderLodgingStays(leadId) {
  const list = document.getElementById('lodging-stays-list');
  if (!list) return;

  const { data, error } = await supabase
    .from('client_stays')
    .select('id, bed_id, package_id, check_in_at, check_out_at, status, notes, bed:beds(label, bed_type, space:spaces(name, floor)), package:client_packages(name)')
    .eq('lead_id', leadId)
    .order('check_in_at', { ascending: false });

  if (error) {
    list.innerHTML = `<div style="color:#991b1b;">Failed to load stays: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const stays = data || [];
  if (stays.length === 0) {
    list.innerHTML = `<div style="font-style:italic;color:#9ca3af;">No retreat house stays on file. Click + Assign to Bed to add one.</div>`;
    return;
  }

  const now = Date.now();
  const upcoming = [];
  const active = [];
  const past = [];
  for (const s of stays) {
    if (s.status === 'cancelled') { past.push({ ...s, _cancelled: true }); continue; }
    const ci = new Date(s.check_in_at).getTime();
    const co = new Date(s.check_out_at).getTime();
    if (co < now) past.push(s);
    else if (ci > now) upcoming.push(s);
    else active.push(s);
  }

  const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const renderRow = (s) => {
    const bed = s.bed?.label || '?';
    const room = s.bed?.space?.name || '?';
    const floor = s.bed?.space?.floor || '';
    const pkg = s.package?.name ? ` · pkg: ${escapeHtml(s.package.name)}` : '';
    const cancelled = s._cancelled || s.status === 'cancelled';
    return `
      <button class="lodging-stay-row" data-stay-id="${s.id}"
              style="display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-family:inherit;${cancelled ? 'opacity:0.5;' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
          <span style="font-weight:600;color:#111827;">${escapeHtml(room)} · ${escapeHtml(bed)}</span>
          <span style="font-size:11px;color:#6b7280;">${fmtDate(s.check_in_at)} → ${fmtDate(s.check_out_at)}</span>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${escapeHtml(floor)}${pkg}${cancelled ? ' · cancelled' : ''}</div>
      </button>
    `;
  };

  const section = (label, items) => items.length === 0 ? '' : `
    <div style="margin-bottom:10px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#9ca3af;margin-bottom:4px;">${escapeHtml(label)}</div>
      ${items.map(renderRow).join('')}
    </div>
  `;

  list.innerHTML = section('Currently in-house', active) + section('Upcoming', upcoming) + section('Past', past);

  list.querySelectorAll('.lodging-stay-row').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stayId = btn.dataset.stayId;
      const result = await openClientStayModal({ stayId });
      if (result?.saved) loadAndRenderLodgingStays(leadId);
    });
  });
}

// Editable hospitality / logistics block for the client drawer.
// Non-PHI only: preferences, emergency contact, arrival logistics, admin flags.
// Clinical data must live in a separate HIPAA-compliant system, never here.
function renderHospitalityBlock(c) {
  const val = v => escapeHtml(v || '');
  const checked = v => v ? 'checked' : '';

  const field = (id, label, value, { type = 'text', placeholder = '', span = 1 } = {}) => `
    <div class="crm-form-field" style="grid-column: span ${span};">
      <label>${escapeHtml(label)}</label>
      <input type="${type}" class="crm-input" id="${id}" value="${val(value)}" placeholder="${escapeHtml(placeholder)}">
    </div>
  `;

  const textArea = (id, label, value, { placeholder = '', rows = 2, span = 2 } = {}) => `
    <div class="crm-form-field" style="grid-column: span ${span};">
      <label>${escapeHtml(label)}</label>
      <textarea class="crm-textarea" id="${id}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${val(value)}</textarea>
    </div>
  `;

  const subhead = (text) => `
    <div style="grid-column:1 / -1;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#b4691f;margin-top:6px;">
      ${escapeHtml(text)}
    </div>
  `;

  const toggle = (id, label, value) => `
    <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text,#2a1f23);cursor:pointer;margin-right:18px;">
      <input type="checkbox" id="${id}" ${checked(value)}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;

  const leadName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';

  const readOnlyField = (label, value, { span = 1 } = {}) => `
    <div class="crm-form-field" style="grid-column: span ${span};">
      <label>${escapeHtml(label)}</label>
      <div class="crm-input" style="background:#f7f4ef;color:var(--text,#2a1f23);cursor:default;">${escapeHtml(value)}</div>
    </div>
  `;

  return `
    <section style="margin-bottom:20px;padding:16px 18px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;">
      <h3 style="margin:0 0 4px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Hospitality &amp; Logistics</h3>
      <div style="font-size:11px;color:var(--text-muted,#aaa);margin-bottom:14px;">Non-clinical only. Medical / diagnosis / medication info belongs in the intake system.</div>

      <div class="crm-form-grid" style="grid-template-columns:repeat(2, 1fr);gap:10px 14px;">

        ${subhead('Identity & Contact')}
        ${readOnlyField('Name', leadName)}
        ${field('hosp-pronouns', 'Pronouns', c.pronouns, { placeholder: 'e.g. she/her' })}

        ${subhead('Emergency Contact')}
        ${field('hosp-ec-name',         'Name',         c.emergency_contact_name)}
        ${field('hosp-ec-phone',        'Phone',        c.emergency_contact_phone, { type: 'tel' })}
        ${field('hosp-ec-relationship', 'Relationship', c.emergency_contact_relationship, { placeholder: 'spouse, parent, friend\u2026', span: 2 })}

        <div style="grid-column:1 / -1;margin-top:6px;">
          <button type="button" id="hosp-diet-toggle" class="crm-btn crm-btn-sm" aria-expanded="false" style="display:inline-flex;align-items:center;gap:8px;">
            <span id="hosp-diet-chevron" style="display:inline-block;transition:transform .15s;">▸</span>
            <span>Dietary preferences</span>
          </button>
          <div id="hosp-diet-panel" style="display:none;grid-template-columns:repeat(2, 1fr);gap:10px 14px;margin-top:10px;">
            ${textArea('hosp-diet-prefs',    'Preferences',    c.dietary_preferences, { placeholder: 'vegan, vegetarian, gluten-free, pescatarian\u2026' })}
            ${textArea('hosp-diet-dislikes', 'Things to avoid',c.dietary_dislikes,    { placeholder: 'e.g. mushrooms, cilantro, spicy food' })}
          </div>
        </div>

        <div style="grid-column:1 / -1;margin-top:6px;">
          <button type="button" id="hosp-arr-toggle" class="crm-btn crm-btn-sm" aria-expanded="false" style="display:inline-flex;align-items:center;gap:8px;">
            <span id="hosp-arr-chevron" style="display:inline-block;transition:transform .15s;">▸</span>
            <span>Arrival &amp; departure</span>
          </button>
          <div id="hosp-arr-panel" style="display:none;grid-template-columns:repeat(2, 1fr);gap:10px 14px;margin-top:10px;">
            ${textArea('hosp-arr-details', 'Arrival details',   c.arrival_details,   { placeholder: 'flight #, ETA, airline\u2026', rows: 2 })}
            ${textArea('hosp-dep-details', 'Departure details', c.departure_details, { placeholder: 'flight #, departure time\u2026', rows: 2 })}
            <div style="grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px 24px;padding:4px 0 2px;">
              ${toggle('hosp-arr-pickup', 'Airport pickup needed', c.arrival_pickup_needed)}
              ${toggle('hosp-dep-pickup', 'Airport dropoff needed', c.departure_pickup_needed)}
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:12px;text-align:right;">
        <span id="hosp-save-status" style="font-size:12px;color:var(--text-muted,#888);margin-right:10px;"></span>
        <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-save-hospitality">Save hospitality details</button>
      </div>
    </section>
  `;
}

async function saveHospitalityFields(leadId) {
  const btn = document.getElementById('btn-save-hospitality');
  const status = document.getElementById('hosp-save-status');
  const val = id => (document.getElementById(id)?.value ?? '').trim() || null;
  const checked = id => !!document.getElementById(id)?.checked;

  const payload = {
    pronouns:                       val('hosp-pronouns'),
    emergency_contact_name:         val('hosp-ec-name'),
    emergency_contact_phone:        val('hosp-ec-phone'),
    emergency_contact_relationship: val('hosp-ec-relationship'),
    dietary_preferences:            val('hosp-diet-prefs'),
    dietary_dislikes:               val('hosp-diet-dislikes'),
    arrival_details:                val('hosp-arr-details'),
    arrival_pickup_needed:          checked('hosp-arr-pickup'),
    departure_details:              val('hosp-dep-details'),
    departure_pickup_needed:        checked('hosp-dep-pickup'),
  };

  btn.disabled = true;
  if (status) status.textContent = 'Saving\u2026';

  const { error } = await supabase.from('crm_leads').update(payload).eq('id', leadId);
  if (error) {
    console.error('save hospitality error:', error);
    showToast('Failed to save: ' + error.message, 'error');
    btn.disabled = false;
    if (status) status.textContent = '';
    return;
  }

  // Update local cache so re-opening the drawer shows the fresh values without a full reload.
  const c = clients.find(x => x.id === leadId);
  if (c) Object.assign(c, payload);

  showToast('Hospitality details saved', 'success');
  btn.disabled = false;
  if (status) {
    status.textContent = 'Saved';
    setTimeout(() => { if (status) status.textContent = ''; }, 1800);
  }
}

function renderPackageList(pkgs) {
  if (!pkgs.length) {
    return `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No packages yet.</div>`;
  }
  return pkgs.map(p => {
    const sessions = p.sessions || [];
    const done = sessions.filter(s => s.status === 'completed').length;
    const scheduled = sessions.filter(s => s.status === 'scheduled').length;
    const unscheduled = sessions.filter(s => s.status === 'unscheduled').length;
    const statusColor = p.status === 'active' ? '#16a34a' : (p.status === 'completed' ? '#64748b' : '#dc2626');
    return `
      <div style="position:relative;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;padding:12px;margin-bottom:8px;background:#fff;">
        <button data-action="remove-package" data-package-id="${p.id}" title="Remove package" style="position:absolute;top:6px;right:6px;width:22px;height:22px;border:none;background:transparent;color:var(--text-muted,#bbb);font-size:16px;line-height:1;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;padding:0;" onmouseover="this.style.background='#fee2e2';this.style.color='#b91c1c';" onmouseout="this.style.background='transparent';this.style.color='var(--text-muted,#bbb)';">&times;</button>
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:6px;padding-right:28px;">
          <div>
            <div style="font-weight:600;font-size:14px;">${escapeHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted,#888);text-transform:capitalize;">${escapeHtml(p.occupancy_rate)} &middot; ${formatPriceCents(p.price_cents)}${p.paid_at ? ' &middot; paid' : ' &middot; unpaid'}</div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${p.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted,#666);">
          ${sessions.length} session${sessions.length === 1 ? '' : 's'} \u00b7 ${done} done${scheduled ? ` \u00b7 ${scheduled} scheduled` : ''}${unscheduled ? ` \u00b7 ${unscheduled} unscheduled` : ''}
        </div>
        ${sessions.length ? `
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">
            ${sessions.map(s => renderSessionPill(s)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function removeClientPackage(packageId) {
  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) { showToast('Package not found', 'error'); return; }
  const sessions = pkg.sessions || [];
  const done = sessions.filter(s => s.status === 'completed').length;
  const scheduled = sessions.filter(s => s.status === 'scheduled').length;

  let warning = `Remove "${pkg.name}"? This cannot be undone.`;
  if (sessions.length) warning += `\n\nAll ${sessions.length} session${sessions.length === 1 ? '' : 's'} on this package will be deleted.`;
  if (done) warning += `\n⚠ ${done} completed session${done === 1 ? '' : 's'} on record will be removed.`;
  if (scheduled) warning += `\n⚠ ${scheduled} scheduled session${scheduled === 1 ? ' will lose its' : 's will lose their'} package link (the booking itself stays).`;
  warning += `\n\nLinked retreat stays and agreements stay intact — they just lose the link to this package.`;

  if (!confirm(warning)) return;

  const leadId = pkg.lead_id;
  const { error } = await supabase.from('client_packages').delete().eq('id', packageId);
  if (error) {
    console.error('Remove package error:', error);
    showToast(error.message || 'Failed to remove package', 'error');
    return;
  }
  showToast('Package removed', 'success');
  await loadClientsData();
  openClientDetail(leadId);
}

function sessionPillBg(status) {
  return { completed: '#dcfce7', scheduled: '#e0e7ff', unscheduled: '#f1f5f9', cancelled: '#fee2e2' }[status] || '#f1f5f9';
}
function sessionPillFg(status) {
  return { completed: '#15803d', scheduled: '#4338ca', unscheduled: '#64748b', cancelled: '#b91c1c' }[status] || '#64748b';
}
function renderSessionPill(s) {
  const svc = escapeHtml(getServiceName(s.service_id));
  const when = s.scheduled_at ? ` \u00b7 ${formatDateShort(s.scheduled_at)}` : '';
  const tip = `${svc} \u00b7 ${s.status}`;
  const clickable = s.status === 'unscheduled';
  const cursor = clickable ? 'cursor:pointer;' : '';
  const label = clickable ? `${svc} \u00b7 schedule` : `${svc}${when}`;
  const attrs = clickable
    ? `data-action="schedule-session" data-session-id="${s.id}"`
    : '';
  return `<span ${attrs} title="${tip}" style="font-size:11px;padding:2px 8px;border-radius:999px;background:${sessionPillBg(s.status)};color:${sessionPillFg(s.status)};${cursor}">${label}</span>`;
}

function renderStayList(clientStays) {
  if (!clientStays.length) {
    return `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No stays yet.</div>`;
  }
  return clientStays.map(s => {
    const statusColor = s.status === 'active' ? '#16a34a' : (s.status === 'upcoming' ? '#4338ca' : (s.status === 'completed' ? '#64748b' : '#dc2626'));
    return `
      <div style="border:1px solid var(--border-color,#e5e5e5);border-radius:8px;padding:12px;margin-bottom:8px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;">
          <div>
            <div style="font-weight:600;font-size:14px;">${escapeHtml(getBedLabel(s.bed_id))}</div>
            <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">
              ${formatDate(s.check_in_at)} \u2192 ${formatDate(s.check_out_at)}
            </div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${s.status}</span>
        </div>
        ${s.notes ? `<div style="margin-top:6px;font-size:12px;color:var(--text-muted,#666);">${escapeHtml(s.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ---------- Integration Notes (EMR-style chart notes) ----------
// Loaded lazily when a client drawer opens. Notes are authored + timestamped;
// admins/staff can amend, never delete. Strictly internal -- never rendered in
// the client portal.

function getStaffDisplayName(appUserId) {
  if (!appUserId) return 'Unknown';
  const s = staffList.find(x => x.id === appUserId);
  if (!s) return 'Unknown';
  return s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email || 'Unknown';
}

function formatDateTimeShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} \u00b7 ${time}`;
}

// Legacy single-field note from crm_leads.notes. Shown read-only above the
// integration-notes history so content saved before this feature shipped
// isn't lost. Once every client's legacy note is migrated, this block can go.
function renderLegacyNoteBlock(c) {
  if (!c.notes || !c.notes.trim()) return '';
  return `
    <section style="margin-bottom:12px;padding:10px 12px;border:1px dashed var(--border-color,#d6d6d6);border-radius:8px;background:#fbf9f4;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin-bottom:4px;">Legacy note</div>
      <div style="font-size:13px;white-space:pre-wrap;color:var(--text,#2a1f23);">${escapeHtml(c.notes)}</div>
    </section>
  `;
}

async function loadClientIntegrationNotes(leadId) {
  try {
    const { data, error } = await supabase
      .from('client_integration_notes')
      .select('id, lead_id, author_app_user_id, content, created_at, updated_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    integrationNotesByLead.set(leadId, data || []);
  } catch (e) {
    console.error('load integration notes error:', e);
    integrationNotesByLead.set(leadId, []);
    showToast('Failed to load integration notes', 'error');
  }
  // Re-render the active tab if it cares about this data.
  if (currentDrawerLeadId === leadId && (activeClientTab === 'notes' || activeClientTab === 'overview')) {
    if (activeClientTab === 'notes') renderIntegrationNotesSection(leadId);
    else rerenderActiveTabPanel();
  }
}

function rerenderActiveTabPanel() {
  if (!currentDrawerLeadId) return;
  const c = clients.find(x => x.id === currentDrawerLeadId);
  if (!c) return;
  const panel = document.getElementById('client-tab-panel');
  if (!panel) return;
  panel.innerHTML = renderClientTabContent(c, activeClientTab);
  bindTabPanelHandlers(c.id, activeClientTab);
}

function renderIntegrationNotesSection(leadId) {
  const el = document.getElementById('integration-notes-section');
  if (!el || el.dataset.leadId !== leadId) return; // drawer closed or switched
  const notes = integrationNotesByLead.get(leadId) || [];
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Integration Notes</h3>
      <span style="font-size:11px;color:var(--text-muted,#aaa);">${notes.length} ${notes.length === 1 ? 'entry' : 'entries'}</span>
    </div>
    <div style="border:1px solid var(--border-color,#eee);border-radius:10px;padding:12px;background:#fff;margin-bottom:12px;">
      <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin-bottom:6px;">New entry</label>
      <textarea class="crm-textarea" id="integration-note-new" rows="3" style="width:100%;" placeholder="Observations, plan, follow-up\u2026"></textarea>
      <div style="margin-top:8px;text-align:right;">
        <button class="crm-btn crm-btn-sm crm-btn-primary" data-action="add-integration-note">Add note</button>
      </div>
    </div>
    ${notes.length
      ? `<div style="display:flex;flex-direction:column;gap:8px;">${notes.map(renderIntegrationNoteCard).join('')}</div>`
      : `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No integration notes yet.</div>`}
  `;

  el.querySelector('[data-action="add-integration-note"]')?.addEventListener('click', () => addIntegrationNote(leadId));
  el.querySelectorAll('[data-action="edit-integration-note"]').forEach(btn => {
    btn.addEventListener('click', () => startEditIntegrationNote(leadId, btn.dataset.noteId));
  });
}

function renderIntegrationNoteCard(n) {
  const author = escapeHtml(getStaffDisplayName(n.author_app_user_id));
  const created = formatDateTimeShort(n.created_at);
  const edited = n.updated_at && n.updated_at !== n.created_at
    ? ` \u00b7 edited ${formatDateTimeShort(n.updated_at)}`
    : '';
  return `
    <div class="integration-note-card" data-note-id="${n.id}" style="border:1px solid var(--border-color,#e5e5e5);border-radius:8px;padding:12px 14px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px;">
        <div style="font-size:12px;color:var(--text-muted,#666);">
          <strong style="color:var(--text,#2a1f23);">${author}</strong> \u00b7 ${created}${edited}
        </div>
        <button class="crm-btn crm-btn-sm" data-action="edit-integration-note" data-note-id="${n.id}" style="font-size:11px;">Edit</button>
      </div>
      <div class="integration-note-body" style="font-size:13px;white-space:pre-wrap;color:var(--text,#2a1f23);">${escapeHtml(n.content)}</div>
    </div>
  `;
}

async function addIntegrationNote(leadId) {
  const ta = document.getElementById('integration-note-new');
  const btn = document.querySelector('[data-action="add-integration-note"]');
  if (!ta) return;
  const content = ta.value.trim();
  if (!content) { showToast('Write something first', 'error'); return; }
  const authorId = authState?.appUser?.id || null;
  if (btn) btn.disabled = true;

  const { data, error } = await supabase
    .from('client_integration_notes')
    .insert({ lead_id: leadId, author_app_user_id: authorId, content })
    .select('id, lead_id, author_app_user_id, content, created_at, updated_at')
    .single();

  if (btn) btn.disabled = false;
  if (error) {
    console.error('add integration note error:', error);
    showToast('Failed to add note: ' + error.message, 'error');
    return;
  }

  const list = integrationNotesByLead.get(leadId) || [];
  list.unshift(data);
  integrationNotesByLead.set(leadId, list);
  renderIntegrationNotesSection(leadId);
  showToast('Note added', 'success');
}

function startEditIntegrationNote(leadId, noteId) {
  const list = integrationNotesByLead.get(leadId) || [];
  const n = list.find(x => x.id === noteId);
  if (!n) return;
  const card = document.querySelector(`.integration-note-card[data-note-id="${noteId}"]`);
  if (!card) return;
  const body = card.querySelector('.integration-note-body');
  const header = card.querySelector('[data-action="edit-integration-note"]');
  if (!body || !header) return;

  body.innerHTML = `<textarea class="crm-textarea" rows="3" style="width:100%;">${escapeHtml(n.content)}</textarea>`;
  header.outerHTML = `
    <div style="display:flex;gap:6px;">
      <button class="crm-btn crm-btn-sm" data-action="cancel-edit-note" data-note-id="${noteId}" style="font-size:11px;">Cancel</button>
      <button class="crm-btn crm-btn-sm crm-btn-primary" data-action="save-edit-note" data-note-id="${noteId}" style="font-size:11px;">Save</button>
    </div>
  `;
  card.querySelector('[data-action="cancel-edit-note"]').addEventListener('click', () => renderIntegrationNotesSection(leadId));
  card.querySelector('[data-action="save-edit-note"]').addEventListener('click', () => saveIntegrationNoteEdit(leadId, noteId));
  card.querySelector('textarea')?.focus();
}

async function saveIntegrationNoteEdit(leadId, noteId) {
  const card = document.querySelector(`.integration-note-card[data-note-id="${noteId}"]`);
  const ta = card?.querySelector('textarea');
  if (!ta) return;
  const content = ta.value.trim();
  if (!content) { showToast('Note cannot be empty', 'error'); return; }
  const saveBtn = card.querySelector('[data-action="save-edit-note"]');
  if (saveBtn) saveBtn.disabled = true;

  const { data, error } = await supabase
    .from('client_integration_notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id, lead_id, author_app_user_id, content, created_at, updated_at')
    .single();

  if (error) {
    console.error('edit integration note error:', error);
    showToast('Failed to save: ' + error.message, 'error');
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  const list = integrationNotesByLead.get(leadId) || [];
  const idx = list.findIndex(x => x.id === noteId);
  if (idx !== -1) list[idx] = data;
  renderIntegrationNotesSection(leadId);
  showToast('Note updated', 'success');
}

// ========== Client drawer tabs ==========

async function loadClientBookings(leadId) {
  try {
    const { data, error } = await supabase
      .from('scheduling_bookings')
      .select('id, start_datetime, end_datetime, staff_user_id, facilitator_id, service_id, space_id, status, notes, package_session_id')
      .eq('lead_id', leadId)
      .order('start_datetime', { ascending: false });
    if (error) throw error;
    bookingsByLead.set(leadId, data || []);
  } catch (e) {
    console.error('load client bookings error:', e);
    bookingsByLead.set(leadId, []);
  }
  if (currentDrawerLeadId === leadId && (activeClientTab === 'overview' || activeClientTab === 'sessions')) {
    rerenderActiveTabPanel();
  }
}

async function loadClientProposals(leadId) {
  try {
    const { data, error } = await supabase
      .from('crm_proposals')
      .select('id, proposal_number, title, status, total, paid_at, created_at, signwell_document_id, contract_signed_at, event_date')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    proposalsByLead.set(leadId, data || []);
  } catch (e) {
    console.error('load client proposals error:', e);
    proposalsByLead.set(leadId, []);
  }
  if (currentDrawerLeadId === leadId && (activeClientTab === 'billing' || activeClientTab === 'documents')) {
    rerenderActiveTabPanel();
  }
}

function getSpaceName(id) {
  if (!id) return '';
  const s = [...lodgingSpaces, ...sessionSpaces].find(x => x.id === id);
  return s?.name || '';
}

function getUpcomingBookings(leadId) {
  const all = bookingsByLead.get(leadId) || [];
  const now = new Date();
  return all
    .filter(b => new Date(b.start_datetime) >= now && b.status !== 'cancelled')
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
}

function getPastBookings(leadId) {
  const all = bookingsByLead.get(leadId) || [];
  const now = new Date();
  return all
    .filter(b => new Date(b.start_datetime) < now)
    .sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
}

function renderBookingRow(b) {
  const service = escapeHtml(getServiceName(b.service_id));
  const when = formatDateTimeShort(b.start_datetime);
  const assignee = b.staff_user_id
    ? escapeHtml(getStaffDisplayName(b.staff_user_id))
    : (b.facilitator_id ? escapeHtml(getFacilitatorName(b.facilitator_id) || 'Unknown') : 'Unassigned');
  const space = getSpaceName(b.space_id);
  const statusColor = {
    confirmed: '#15803d', pending: '#4338ca', cancelled: '#b91c1c', completed: '#64748b',
  }[b.status] || '#64748b';
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:10px 12px;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;background:#fff;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">${service}</div>
        <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">
          ${when} \u00b7 ${assignee}${space ? ` \u00b7 ${escapeHtml(space)}` : ''}
        </div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(b.status || '')}</span>
    </div>
  `;
}

// ---------- Overview tab ----------

function renderOverviewTab(c) {
  const upcoming = getUpcomingBookings(c.id);
  const nextBooking = upcoming[0] || null;
  const notes = integrationNotesByLead.get(c.id);
  const latestNote = (notes && notes[0]) || null;
  const bookingsLoaded = bookingsByLead.has(c.id);
  const notesLoaded = !!notes;

  const gaps = [];
  if (!c.waiver_signed) gaps.push('Waiver not signed');
  if (!c.intake_completed) gaps.push('Intake not completed');

  const emergencyHas = c.emergency_contact_name || c.emergency_contact_phone;

  return `
    ${gaps.length ? `
      <div style="margin-bottom:16px;padding:10px 14px;background:#fff4e6;border:1px solid #f0c98a;border-radius:8px;color:#7c4f12;font-size:13px;">
        <strong>Onboarding gaps:</strong> ${gaps.map(escapeHtml).join(' \u00b7 ')}
      </div>
    ` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <section style="padding:14px 16px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;">
        <h3 style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Identity</h3>
        <div style="font-size:13px;line-height:1.7;">
          <div><span style="color:var(--text-muted,#888);">Preferred name:</span> ${c.preferred_name ? escapeHtml(c.preferred_name) : '<span style="color:#bbb;">\u2014</span>'}</div>
          <div><span style="color:var(--text-muted,#888);">Pronouns:</span> ${c.pronouns ? escapeHtml(c.pronouns) : '<span style="color:#bbb;">\u2014</span>'}</div>
          <div><span style="color:var(--text-muted,#888);">Phone:</span> ${c.phone ? escapeHtml(c.phone) : '<span style="color:#bbb;">\u2014</span>'}</div>
          <div><span style="color:var(--text-muted,#888);">Location:</span> ${(c.city || c.state) ? escapeHtml([c.city, c.state].filter(Boolean).join(', ')) : '<span style="color:#bbb;">\u2014</span>'}</div>
        </div>
      </section>

      <section style="padding:14px 16px;border:1px solid ${emergencyHas ? 'var(--border-color,#eee)' : '#f0c98a'};border-radius:10px;background:${emergencyHas ? '#fff' : '#fffaf0'};">
        <h3 style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${emergencyHas ? 'var(--text-muted,#888)' : '#b4691f'};">Emergency Contact</h3>
        ${emergencyHas ? `
          <div style="font-size:13px;line-height:1.7;">
            <div style="font-weight:600;">${escapeHtml(c.emergency_contact_name || '')}</div>
            ${c.emergency_contact_relationship ? `<div style="color:var(--text-muted,#666);font-size:12px;">${escapeHtml(c.emergency_contact_relationship)}</div>` : ''}
            ${c.emergency_contact_phone ? `<div style="margin-top:4px;"><a href="tel:${escapeHtml(c.emergency_contact_phone)}" style="color:#4338ca;text-decoration:none;">${escapeHtml(c.emergency_contact_phone)}</a></div>` : ''}
          </div>
        ` : `
          <div style="font-size:13px;color:#b4691f;">Not on file. Add via Hospitality tab.</div>
        `}
      </section>
    </div>

    <section style="padding:14px 16px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Next session</h3>
        ${upcoming.length > 1 ? `<button class="crm-btn crm-btn-sm" data-action="client-select-tab" data-tab="sessions" style="font-size:11px;">+${upcoming.length - 1} more \u2192</button>` : ''}
      </div>
      ${!bookingsLoaded
        ? `<div style="font-size:13px;color:var(--text-muted,#888);">Loading\u2026</div>`
        : nextBooking
          ? renderBookingRow(nextBooking)
          : `<div style="font-size:13px;color:var(--text-muted,#888);">No upcoming sessions scheduled.</div>`}
    </section>

    <section style="padding:14px 16px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Latest integration note</h3>
        <button class="crm-btn crm-btn-sm" data-action="client-select-tab" data-tab="notes" style="font-size:11px;">All notes \u2192</button>
      </div>
      ${!notesLoaded
        ? `<div style="font-size:13px;color:var(--text-muted,#888);">Loading\u2026</div>`
        : latestNote
          ? `
            <div style="font-size:12px;color:var(--text-muted,#666);margin-bottom:6px;">
              <strong style="color:var(--text,#2a1f23);">${escapeHtml(getStaffDisplayName(latestNote.author_app_user_id))}</strong> \u00b7 ${formatDateTimeShort(latestNote.created_at)}
            </div>
            <div style="font-size:13px;white-space:pre-wrap;color:var(--text,#2a1f23);">${escapeHtml(latestNote.content)}</div>
          `
          : `<div style="font-size:13px;color:var(--text-muted,#888);">No integration notes yet. Add one from the Notes tab.</div>`}
    </section>
  `;
}

// ---------- Sessions tab ----------

function renderSessionsTab(c) {
  const pkgs = getClientPackages(c.id);
  const clientStays = getClientStays(c.id);
  const bookingsLoaded = bookingsByLead.has(c.id);
  const upcoming = getUpcomingBookings(c.id);
  const past = getPastBookings(c.id).slice(0, 20);

  return `
    <section style="margin-bottom:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Upcoming</h3>
      ${!bookingsLoaded
        ? `<div style="padding:12px;color:var(--text-muted,#888);font-size:13px;">Loading\u2026</div>`
        : upcoming.length
          ? upcoming.map(renderBookingRow).join('')
          : `<div style="padding:12px;color:var(--text-muted,#888);font-size:13px;background:var(--bg,#faf9f6);border-radius:8px;">No upcoming sessions. Click an unscheduled session pill below to book.</div>`}
    </section>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <section>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Packages</h3>
          <button class="crm-btn crm-btn-sm crm-btn-primary" data-action="new-package" data-client-id="${c.id}">+ New</button>
        </div>
        ${renderPackageList(pkgs)}
      </section>
      <section>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Retreat Stays</h3>
          <button class="crm-btn crm-btn-sm crm-btn-primary" data-action="new-stay" data-client-id="${c.id}">+ New</button>
        </div>
        ${renderStayList(clientStays)}
      </section>
    </div>

    <section>
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Past sessions</h3>
      ${!bookingsLoaded
        ? `<div style="padding:12px;color:var(--text-muted,#888);font-size:13px;">Loading\u2026</div>`
        : past.length
          ? past.map(renderBookingRow).join('')
          : `<div style="padding:12px;color:var(--text-muted,#888);font-size:13px;background:var(--bg,#faf9f6);border-radius:8px;">No past sessions yet.</div>`}
    </section>
  `;
}

// ---------- Notes tab ----------

function renderNotesTab(c) {
  return `
    ${renderLegacyNoteBlock(c)}
    <section id="integration-notes-section" data-lead-id="${c.id}">
      <div style="color:var(--text-muted,#888);font-size:13px;padding:8px 0;">Loading integration notes\u2026</div>
    </section>
  `;
}

// ---------- Billing tab ----------

function renderBillingTab(c) {
  const proposals = proposalsByLead.get(c.id);
  if (proposals === undefined) {
    return `<div style="padding:20px;color:var(--text-muted,#888);font-size:13px;">Loading proposals\u2026</div>`;
  }
  const totalBilled = proposals.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  const totalPaid = proposals.filter(p => p.paid_at).reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  const outstanding = totalBilled - totalPaid;

  return `
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;margin-bottom:20px;">
      ${billingStatTile('Total billed', totalBilled)}
      ${billingStatTile('Paid', totalPaid, '#15803d')}
      ${billingStatTile('Outstanding', outstanding, outstanding > 0 ? '#b4691f' : '#64748b')}
    </div>

    <section>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Proposals &amp; Invoices</h3>
        <a href="crm.html" target="_blank" style="font-size:12px;color:#4338ca;text-decoration:none;">Open CRM \u2197</a>
      </div>
      ${proposals.length
        ? proposals.map(renderProposalRow).join('')
        : `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No proposals yet. Create one in the CRM.</div>`}
    </section>
  `;
}

function billingStatTile(label, amount, color = 'var(--text,#2a1f23)') {
  const amt = isFinite(amount) ? `$${(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014';
  return `
    <div style="padding:12px 14px;border:1px solid var(--border-color,#eee);border-radius:8px;background:#fff;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">${escapeHtml(label)}</div>
      <div style="font-size:18px;font-weight:600;color:${color};margin-top:4px;">${amt}</div>
    </div>
  `;
}

function renderProposalRow(p) {
  const statusColor = {
    draft: '#64748b', sent: '#4338ca', accepted: '#15803d', paid: '#15803d', declined: '#b91c1c',
  }[p.status] || '#64748b';
  const amt = `$${Number(p.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;background:#fff;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(p.proposal_number || '')} \u00b7 ${escapeHtml(p.title || '(untitled)')}</div>
        <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">
          ${formatDate(p.created_at)}${p.paid_at ? ` \u00b7 paid ${formatDate(p.paid_at)}` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:600;font-size:14px;">${amt}</div>
        <span style="font-size:10px;font-weight:600;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(p.status || '')}</span>
      </div>
    </div>
  `;
}

// ---------- Documents tab ----------

function renderDocumentsTab(c) {
  const proposals = proposalsByLead.get(c.id);
  const loading = proposals === undefined;
  const contracts = (proposals || []).filter(p => p.signwell_document_id);
  const clientAgreements = retreatAgreements.filter(a => a.lead_id === c.id);

  return `
    <section style="margin-bottom:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Waiver &amp; Intake</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${documentStatusTile('Waiver', c.waiver_signed)}
        ${documentStatusTile('Intake', c.intake_completed)}
      </div>
    </section>

    <section style="margin-bottom:20px;">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Retreat Agreement</h3>
      ${clientAgreements.length
        ? clientAgreements.map(renderRetreatAgreementRow).join('')
        : `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No retreat agreement on file. Use "Send retreat agreement\u2026" in the More menu to send one.</div>`}
    </section>

    <section>
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);">Signed Contracts</h3>
      ${loading
        ? `<div style="padding:16px;color:var(--text-muted,#888);font-size:13px;">Loading\u2026</div>`
        : contracts.length
          ? contracts.map(renderContractRow).join('')
          : `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">No signed contracts on file.</div>`}
    </section>
  `;
}

function renderRetreatAgreementRow(a) {
  const signed = a.status === 'signed';
  const sentLine = a.sent_at ? `Sent ${formatDate(a.sent_at)}` : 'Not yet sent';
  const signedLine = signed
    ? `Signed ${formatDate(a.signed_at)}${a.signed_by_name ? ' by ' + escapeHtml(a.signed_by_name) : ''}`
    : sentLine + ', awaiting signature';
  const dates = (a.merge_data?.arrival_date && a.merge_data?.departure_date)
    ? `${a.merge_data.arrival_date} \u2192 ${a.merge_data.departure_date}`
    : '';
  const accom = a.merge_data?.accommodation_type || '';
  const subtitle = [dates, accom].filter(Boolean).join(' \u00b7 ');
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;background:#fff;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">Within Retreat Agreement${subtitle ? ' \u00b7 ' + escapeHtml(subtitle) : ''}</div>
        <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">${signedLine}</div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${signed ? '#15803d' : '#b4691f'};text-transform:uppercase;letter-spacing:.5px;">${signed ? 'Signed' : (a.status || 'pending')}</span>
    </div>
  `;
}

function documentStatusTile(label, ok) {
  const bg = ok ? '#f0fdf4' : '#fff4e6';
  const border = ok ? '#bbf7d0' : '#f0c98a';
  const fg = ok ? '#15803d' : '#b4691f';
  const mark = ok ? '\u2713 Signed / complete' : '\u2717 Not yet';
  return `
    <div style="padding:14px;border:1px solid ${border};border-radius:8px;background:${bg};">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">${escapeHtml(label)}</div>
      <div style="font-size:14px;font-weight:600;color:${fg};margin-top:4px;">${mark}</div>
    </div>
  `;
}

function renderContractRow(p) {
  const signed = !!p.contract_signed_at;
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;background:#fff;margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(p.proposal_number || '')} \u00b7 ${escapeHtml(p.title || '(untitled)')}</div>
        <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">
          ${signed ? `Signed ${formatDate(p.contract_signed_at)}` : 'Sent, awaiting signature'}
        </div>
      </div>
      <span style="font-size:11px;font-weight:600;color:${signed ? '#15803d' : '#b4691f'};text-transform:uppercase;letter-spacing:.5px;">${signed ? 'Signed' : 'Pending'}</span>
    </div>
  `;
}

// ---------- More menu ----------

function toggleClientMoreMenu() {
  const menu = document.getElementById('client-more-menu');
  if (!menu) return;
  moreMenuOpen = !moreMenuOpen;
  menu.style.display = moreMenuOpen ? 'block' : 'none';
}

function closeClientMoreMenu() {
  const menu = document.getElementById('client-more-menu');
  if (!menu) return;
  moreMenuOpen = false;
  menu.style.display = 'none';
}

function handleClientMoreItem(leadId, item) {
  closeClientMoreMenu();
  switch (item) {
    case 'add-package':
      openPackageModal(leadId);
      return;
    case 'add-stay':
      openStayModal(leadId);
      return;
    case 'open-in-crm':
      window.open('crm.html', '_blank');
      return;
    case 'send-invoice':
      openSendInvoiceModal(leadId);
      return;
    case 'send-welcome-letter':
      openSendWelcomeLetterModal(leadId);
      return;
    case 'send-retreat-agreement':
      openSendRetreatAgreementModal(leadId);
      return;
  }
}

// ---------- Send Retreat Agreement modal ----------

// Opens a modal that collects retreat-specific fields (accommodation, dates,
// fees) and calls the create-retreat-agreement edge function. The function
// builds the SignWell-ready PDF, uploads it, and SignWell emails the signing
// link. The `within_retreat_agreements` row is updated to status='sent'.
function openSendRetreatAgreementModal(leadId) {
  const c = clients.find(cl => cl.id === leadId);
  if (!c) { showToast('Client not found', 'error'); return; }
  if (!c.email) { showToast('This client has no email address on file.', 'error'); return; }

  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';

  // Auto-fill defaults from latest retreat package on file (if any).
  const clientPkgs = getClientPackages(leadId);
  const newestPkg = clientPkgs[0];
  const defaultAccommodation = newestPkg?.occupancy === 'shared' ? 'Shared' : 'Private';
  const defaultArrival = newestPkg?.check_in_at ? String(newestPkg.check_in_at).slice(0, 10) : '';
  const defaultDeparture = newestPkg?.check_out_at ? String(newestPkg.check_out_at).slice(0, 10) : '';
  const defaultTotal = newestPkg?.price_cents ? (newestPkg.price_cents / 100) : 0;
  const defaultDeposit = Math.round(defaultTotal * 0.1 * 100) / 100;
  const defaultBalance = Math.max(0, Math.round((defaultTotal - defaultDeposit) * 100) / 100);

  // Default emergency contact from lead's hospitality fields, when present.
  const ec = [c.emergency_contact_name, c.emergency_contact_relationship, c.emergency_contact_phone]
    .filter(Boolean).join(' — ');

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content" style="max-width:680px;">
        <div class="crm-modal-header">
          <h2>Send retreat agreement to ${escapeHtml(fullName)}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body" style="padding:20px;">
          <div class="crm-form-field">
            <label>To</label>
            <input type="email" class="crm-input" id="ra-to" value="${escapeHtml(c.email)}" readonly style="background:#f3f4f6">
          </div>
          <div class="crm-form-row" style="display:flex;gap:12px;">
            <div class="crm-form-field" style="flex:1;">
              <label>Accommodation</label>
              <select class="crm-select" id="ra-accommodation">
                <option value="Private" ${defaultAccommodation === 'Private' ? 'selected' : ''}>Private</option>
                <option value="Shared" ${defaultAccommodation === 'Shared' ? 'selected' : ''}>Shared</option>
              </select>
            </div>
            <div class="crm-form-field" style="flex:1;">
              <label>Arrival date</label>
              <input type="date" class="crm-input" id="ra-arrival" value="${defaultArrival}">
            </div>
            <div class="crm-form-field" style="flex:1;">
              <label>Departure date</label>
              <input type="date" class="crm-input" id="ra-departure" value="${defaultDeparture}">
            </div>
          </div>
          <div class="crm-form-row" style="display:flex;gap:12px;">
            <div class="crm-form-field" style="flex:1;">
              <label>Total fee ($)</label>
              <input type="number" class="crm-input" id="ra-total" min="0" step="0.01" value="${defaultTotal.toFixed(2)}">
            </div>
            <div class="crm-form-field" style="flex:1;">
              <label>Deposit paid ($)</label>
              <input type="number" class="crm-input" id="ra-deposit" min="0" step="0.01" value="${defaultDeposit.toFixed(2)}">
            </div>
            <div class="crm-form-field" style="flex:1;">
              <label>Remaining balance ($)</label>
              <input type="number" class="crm-input" id="ra-balance" min="0" step="0.01" value="${defaultBalance.toFixed(2)}" readonly style="background:#f3f4f6">
            </div>
          </div>
          <div class="crm-form-field">
            <label>Emergency contact (free text)</label>
            <input type="text" class="crm-input" id="ra-emergency" value="${escapeHtml(ec)}" placeholder="e.g. Jamie Doe (sister) — 512-555-0100">
          </div>
        </div>
        <div class="crm-modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-color,#eee);display:flex;gap:8px;justify-content:flex-end;">
          <button class="crm-btn crm-btn-sm" id="btn-cancel-retreat-agreement">Cancel</button>
          <button class="crm-btn crm-btn-sm" id="btn-preview-retreat-agreement">Preview PDF</button>
          <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-confirm-send-retreat-agreement">Send for signature</button>
        </div>
      </div>
    </div>
  `;

  const recalcBalance = () => {
    const total = Number(document.getElementById('ra-total').value || 0);
    const deposit = Number(document.getElementById('ra-deposit').value || 0);
    const bal = Math.max(0, Math.round((total - deposit) * 100) / 100);
    document.getElementById('ra-balance').value = bal.toFixed(2);
  };
  document.getElementById('ra-total').addEventListener('input', recalcBalance);
  document.getElementById('ra-deposit').addEventListener('input', recalcBalance);

  const collectPayload = (preview = false) => ({
    lead_id: leadId,
    package_id: newestPkg?.id || null,
    accommodation_type: document.getElementById('ra-accommodation').value,
    arrival_date: document.getElementById('ra-arrival').value || null,
    departure_date: document.getElementById('ra-departure').value || null,
    total_fee: Number(document.getElementById('ra-total').value || 0),
    deposit_amount: Number(document.getElementById('ra-deposit').value || 0),
    remaining_balance: Number(document.getElementById('ra-balance').value || 0),
    emergency_contact: document.getElementById('ra-emergency').value.trim() || null,
    preview,
  });

  const callCreate = async (payload) => {
    const session = await supabase.auth.getSession();
    const token = session?.data?.session?.access_token;
    const resp = await fetch(SUPABASE_URL + '/functions/v1/create-retreat-agreement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(payload),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(result.error || result.detail || ('Request failed (HTTP ' + resp.status + ')'));
    return result;
  };

  document.getElementById('btn-preview-retreat-agreement').addEventListener('click', async () => {
    const btn = document.getElementById('btn-preview-retreat-agreement');
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Building preview…';
    try {
      const result = await callCreate(collectPayload(true));
      if (!result.pdf_base64) throw new Error('Preview returned no PDF');
      showRetreatPdfPreview({ pdfBase64: result.pdf_base64, filename: result.filename || 'retreat-agreement.pdf' });
    } catch (err) {
      console.error('Retreat agreement preview error:', err);
      showToast('Preview failed: ' + (err.message || err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  document.getElementById('btn-confirm-send-retreat-agreement').addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirm-send-retreat-agreement');
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const result = await callCreate(collectPayload(false));
      showToast(
        result?.email_sent
          ? `Retreat agreement emailed to ${c.email}`
          : 'Agreement created in SignWell, but the signing-link email failed to send — check function logs',
        result?.email_sent ? 'success' : 'error'
      );
      // Reload agreements + close modal + reopen drawer so the badge appears.
      const { data } = await supabase.from('within_retreat_agreements').select('*').order('created_at', { ascending: false });
      retreatAgreements = data || [];
      openClientDetail(leadId);
    } catch (err) {
      console.error('Retreat agreement send error:', err);
      showToast('Send failed: ' + (err.message || err), 'error');
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  const backToDrawer = () => openClientDetail(leadId);
  document.getElementById('clients-modal-close-btn').addEventListener('click', backToDrawer);
  document.getElementById('btn-cancel-retreat-agreement').addEventListener('click', backToDrawer);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') backToDrawer();
  });
}

// PDF preview modal — mirrors the rental PDF preview from crm.js. Shown over
// the retreat-agreement modal so the admin can verify the rendered document
// before sending it for signature.
function showRetreatPdfPreview({ pdfBase64, filename }) {
  const existing = document.getElementById('clients-pdf-preview-modal');
  if (existing) existing.remove();

  const byteChars = atob(pdfBase64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  const wrap = document.createElement('div');
  wrap.id = 'clients-pdf-preview-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;';
  wrap.innerHTML = `
    <div style="background:#fff;width:100%;max-width:900px;height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;background:#f8fafc;">
        <div style="flex:1;min-width:0;font-size:12px;color:#475569;line-height:1.5;">
          <div><strong style="color:#1e293b;">Retreat Agreement Preview</strong> — exactly what the guest will see when they open the SignWell link. Not yet sent.</div>
        </div>
        <a href="${blobUrl}" download="${escapeHtml(filename)}" class="crm-btn" style="text-decoration:none;">Download</a>
        <button type="button" id="clients-pdf-preview-close" class="crm-btn">Close</button>
      </div>
      <iframe id="clients-pdf-preview-iframe" src="${blobUrl}" style="flex:1;width:100%;border:0;background:#525659;"></iframe>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => {
    URL.revokeObjectURL(blobUrl);
    wrap.remove();
  };
  wrap.querySelector('#clients-pdf-preview-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
}

// ---------- Send Welcome Letter modal ----------

// Mirrors the structure used in crm.js: same package presets, same Resend
// `send-email` endpoint with type=welcome_letter, same crm_activities log on
// success. Built as a modal here (instead of an inline form on the lead
// detail) to match the rest of the clients-page action UX.
const WELCOME_PACKAGES = {
  heal: {
    title: 'HEAL Package',
    items: [
      { description: 'Personalized guided ketamine sessions', quantity: 3 },
      { description: 'Integration coaching sessions', quantity: 3 },
      { description: '1-month AWKN membership \u2014 saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
      { description: 'Access to on-site wellness amenities and events as available', quantity: 1 },
    ],
  },
  discover: {
    title: 'DISCOVER Package',
    items: [
      { description: 'Private guided ketamine ceremony (fully held \u2014 prep, ceremony, integration)', quantity: 1 },
      { description: 'Integration coaching session', quantity: 1 },
      { description: '1-month AWKN membership \u2014 saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
    ],
  },
  awkn: {
    title: 'AWKN Package',
    items: [
      { description: 'Personalized guided ketamine ceremonies over 3\u20136 months', quantity: 6 },
      { description: 'Integration coaching sessions', quantity: 6 },
      { description: '3-month AWKN membership \u2014 saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community', quantity: 1 },
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
      { description: 'Guided ketamine ceremonies during the retreat', quantity: 2 },
      { description: 'Nights of residential stay at AWKN Ranch', quantity: 5 },
      { description: 'Integration coaching sessions', quantity: 2 },
      { description: 'Full access to AWKN amenities \u2014 saunas, cold plunges, hot tub, temple space', quantity: 1 },
      { description: 'All meals and on-site care', quantity: 1 },
    ],
  },
  'immersive-3day': {
    title: 'Three-Day Immersive Retreat',
    items: [
      { description: 'Guided ketamine ceremony during the retreat', quantity: 1 },
      { description: 'Nights of residential stay at AWKN Ranch', quantity: 2 },
      { description: 'Integration circle and daily practices', quantity: 1 },
      { description: 'Full access to AWKN amenities \u2014 saunas, cold plunges, hot tub, temple space', quantity: 1 },
      { description: 'All meals and on-site care', quantity: 1 },
    ],
  },
};

const SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

// Map a client_packages.name to one of the welcome-letter preset keys, so the
// modal can auto-select the right preset for clients who already have a
// package on file. Returns null when nothing matches (admin picks manually).
function matchPackageNameToPresetKey(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  if (/(six[\s-]?day|6[\s-]?day|6d\s*\/\s*5n)/.test(n)) return 'immersive-6day';
  if (/(three[\s-]?day|3[\s-]?day|3d\s*\/\s*2n)/.test(n)) return 'immersive-3day';
  if (/\bheal\b/.test(n)) return 'heal';
  if (/\bdiscover\b/.test(n)) return 'discover';
  if (/(couples|twin[\s-]?flame)/.test(n)) return 'twin-flame';
  if (/\bawkn\b/.test(n)) return 'awkn';
  return null;
}

function openSendWelcomeLetterModal(leadId) {
  const c = clients.find(cl => cl.id === leadId);
  if (!c) { showToast('Client not found', 'error'); return; }
  if (!c.email) { showToast('This client has no email address on file.', 'error'); return; }

  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';

  // Auto-detect the right preset from the client's most recent package. Falls
  // back to 'heal' (the default outpatient program) when no package is on file
  // or the name doesn't match any known preset.
  const clientPkgs = getClientPackages(leadId);
  const newestPkg = clientPkgs[0]; // already sorted desc by created_at
  const detectedKey = newestPkg ? matchPackageNameToPresetKey(newestPkg.name) : null;
  const initialKey = detectedKey || 'heal';

  const packageOptionDefs = [
    { key: 'heal',           label: 'HEAL \u2014 3 ceremonies + integration' },
    { key: 'discover',       label: 'DISCOVER \u2014 1 ceremony + integration' },
    { key: 'awkn',           label: 'AWKN \u2014 6 ceremonies (deepest offering)' },
    { key: 'twin-flame',     label: 'Couples Reset \u2014 shared journey for partners' },
    { key: 'immersive-6day', label: 'Six-Day Immersive Retreat' },
    { key: 'immersive-3day', label: 'Three-Day Immersive Retreat' },
    { key: 'custom',         label: 'Custom \u2014 build your own list' },
  ];
  const packageOptions = packageOptionDefs
    .map(o => `<option value="${o.key}"${o.key === initialKey ? ' selected' : ''}>${o.label}</option>`)
    .join('');

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content" style="max-width:640px;">
        <div class="crm-modal-header">
          <h2>Send welcome letter to ${escapeHtml(fullName)}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body" style="padding:20px;">
          <div class="crm-form-field">
            <label>To</label>
            <input type="email" class="crm-input" id="welcome-to" value="${escapeHtml(c.email)}" readonly style="background:#f3f4f6">
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
            <label>Your Package Includes</label>
            <div id="welcome-items-wrap" style="display:flex;flex-direction:column;gap:6px;"></div>
            <button type="button" class="crm-btn crm-btn-sm" id="btn-welcome-add-item" style="margin-top:8px;">+ Add item</button>
            <div class="crm-muted" style="font-size:12px;margin-top:4px;">Quantity \u00d7 description. Quantity of 1 hides the "1 \u00d7" prefix in the email.</div>
          </div>
          <div class="crm-form-row" style="display:flex;gap:12px;">
            <div class="crm-form-field" style="flex:1;">
              <label id="welcome-date-label">First session date (optional)</label>
              <input type="date" class="crm-input" id="welcome-session-date">
            </div>
            <div class="crm-form-field" style="flex:1;">
              <label id="welcome-arrival-label">Arrive by (optional)</label>
              <input type="text" class="crm-input" id="welcome-arrival-time" placeholder="e.g. 9:30 AM">
            </div>
          </div>
          <div class="crm-form-field" style="margin-top:6px;padding-top:12px;border-top:1px dashed rgba(0,0,0,0.1);">
            <label>Send test copy to (any email)</label>
            <div style="display:flex;gap:8px;">
              <input type="email" class="crm-input" id="welcome-test-to" placeholder="you@within.center" style="flex:1;">
              <button class="crm-btn crm-btn-sm" id="btn-send-welcome-test">Send Test</button>
            </div>
            <div class="crm-muted" style="font-size:12px;margin-top:4px;">Sends the actual email to the address above \u2014 useful for previewing in your own inbox before sending to the client.</div>
          </div>
        </div>
        <div class="crm-modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-color,#eee);display:flex;gap:8px;justify-content:flex-end;">
          <button class="crm-btn crm-btn-sm" id="btn-cancel-welcome">Cancel</button>
          <button class="crm-btn crm-btn-sm" id="btn-preview-welcome">Preview Email</button>
          <button class="crm-btn crm-btn-sm crm-btn-primary" id="btn-confirm-send-welcome">Send to ${escapeHtml(c.email)}</button>
        </div>
      </div>
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
      document.getElementById('welcome-package-title').value = '';
      itemsWrap.appendChild(renderItemRow({ quantity: 1, description: '' }));
    }
  };

  // Switch the date/arrival field labels + arrival default based on whether
  // the selected package is an immersive retreat (multi-night house stay) or
  // a standard outpatient session program. Mirrored in crm.js.
  const applyVariantLabels = (packageKey) => {
    const isImmersive = packageKey === 'immersive-3day' || packageKey === 'immersive-6day';
    const dateLabel = document.getElementById('welcome-date-label');
    const arrivalLabel = document.getElementById('welcome-arrival-label');
    const arrivalInput = document.getElementById('welcome-arrival-time');
    if (isImmersive) {
      if (dateLabel) dateLabel.textContent = 'Check-in date';
      if (arrivalLabel) arrivalLabel.textContent = 'Check-in window';
      if (arrivalInput) {
        arrivalInput.placeholder = 'e.g. 4pm – 6pm';
        if (!arrivalInput.value) arrivalInput.value = '4pm – 6pm';
      }
    } else {
      if (dateLabel) dateLabel.textContent = 'First session date (optional)';
      if (arrivalLabel) arrivalLabel.textContent = 'Arrive by (optional)';
      if (arrivalInput) {
        arrivalInput.placeholder = 'e.g. 9:30 AM';
        if (arrivalInput.value === '4pm – 6pm') arrivalInput.value = '';
      }
    }
  };

  loadPackageItems(initialKey);
  applyVariantLabels(initialKey);

  if (detectedKey && newestPkg) {
    showToast(`Pre-filled from package on file: ${newestPkg.name}`, 'info');
  }

  document.getElementById('welcome-package').addEventListener('change', (e) => {
    loadPackageItems(e.target.value);
    applyVariantLabels(e.target.value);
  });

  document.getElementById('btn-welcome-add-item').addEventListener('click', () => {
    itemsWrap.appendChild(renderItemRow({ quantity: 1, description: '' }));
  });

  const collectItems = () =>
    Array.from(itemsWrap.querySelectorAll('.crm-welcome-item'))
      .map(row => ({
        description: row.querySelector('.crm-welcome-desc').value.trim(),
        quantity: Math.max(1, parseInt(row.querySelector('.crm-welcome-qty').value, 10) || 1),
      }))
      .filter(item => item.description);

  const buildPayload = ({ preview, toOverride } = {}) => {
    const packageKey = document.getElementById('welcome-package').value;
    const isImmersive = packageKey === 'immersive-3day' || packageKey === 'immersive-6day';
    return {
      type: 'welcome_letter',
      to: toOverride || c.email,
      preview: preview || undefined,
      data: {
        recipient_first_name: c.first_name || 'there',
        business_line: c.business_line || 'within',
        proposal_title: document.getElementById('welcome-package-title').value.trim() || 'Your Program',
        session_date: document.getElementById('welcome-session-date')?.value || null,
        arrival_time: document.getElementById('welcome-arrival-time')?.value.trim() || null,
        line_items: collectItems(),
        variant: isImmersive ? 'immersive' : undefined,
        nights: packageKey === 'immersive-6day' ? 5 : packageKey === 'immersive-3day' ? 2 : undefined,
      },
    };
  };

  const callSendEmail = async (payload) => {
    const resp = await fetch(SUPABASE_URL + '/functions/v1/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(result.error || 'Request failed (HTTP ' + resp.status + ')');
    return result;
  };

  document.getElementById('btn-preview-welcome').addEventListener('click', async () => {
    const btn = document.getElementById('btn-preview-welcome');
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading preview\u2026';
    try {
      const result = await callSendEmail(buildPayload({ preview: true }));
      if (!result.html) throw new Error('Preview returned no HTML');
      showWelcomePreviewModal({
        subject: result.subject || 'Welcome Letter preview',
        html: result.html,
        from: result.from || '',
        to: (result.to && result.to[0]) || c.email,
      });
    } catch (err) {
      console.error('Welcome preview error:', err);
      showToast('Preview failed: ' + (err.message || err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });

  document.getElementById('btn-send-welcome-test').addEventListener('click', async () => {
    const testTo = document.getElementById('welcome-test-to').value.trim();
    if (!testTo) { showToast('Enter an email address to send the test to', 'error'); return; }
    const btn = document.getElementById('btn-send-welcome-test');
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    try {
      await callSendEmail(buildPayload({ toOverride: testTo }));
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
    btn.textContent = 'Sending\u2026';
    try {
      await callSendEmail(buildPayload({}));
      await logClientActivity(c.id, 'email', `Welcome letter sent to ${c.email}`);
      showToast('Welcome letter sent', 'success');
      openClientDetail(c.id);
    } catch (err) {
      console.error('Welcome send error:', err);
      showToast('Send failed: ' + (err.message || err), 'error');
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });

  const backToDrawer = () => openClientDetail(leadId);
  document.getElementById('clients-modal-close-btn').addEventListener('click', backToDrawer);
  document.getElementById('btn-cancel-welcome').addEventListener('click', backToDrawer);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') backToDrawer();
  });
}

// Lightweight email-preview modal (mirrors crm.js's showProposalPreviewModal).
// Renders the welcome-letter HTML inside an iframe so its inline styles can't
// leak into the admin shell.
function showWelcomePreviewModal({ subject, html, from, to }) {
  const existing = document.getElementById('clients-preview-modal');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'clients-preview-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;';
  wrap.innerHTML = `
    <div style="background:#fff;width:100%;max-width:760px;max-height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;background:#f8fafc;">
        <div style="flex:1;min-width:0;font-size:12px;color:#475569;line-height:1.5;">
          <div><strong style="color:#1e293b;">Preview</strong> \u2014 exactly what the recipient will see. No email sent.</div>
        </div>
        <button type="button" id="clients-preview-close" class="crm-btn">Close</button>
      </div>
      <div style="padding:14px 20px;border-bottom:1px solid #e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#334155;">
        <div style="font-size:17px;font-weight:600;color:#0f172a;margin-bottom:6px;line-height:1.3;">${escapeHtml(subject)}</div>
        <div style="display:grid;grid-template-columns:60px 1fr;gap:2px 10px;">
          <div style="color:#94a3b8;">From:</div><div>${escapeHtml(from)}</div>
          <div style="color:#94a3b8;">To:</div><div>${escapeHtml(to)}</div>
        </div>
      </div>
      <iframe id="clients-preview-iframe" style="flex:1;width:100%;border:0;min-height:520px;background:#ffffff;"></iframe>
    </div>
  `;
  document.body.appendChild(wrap);

  const iframe = wrap.querySelector('#clients-preview-iframe');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  doc.close();

  const close = () => wrap.remove();
  wrap.querySelector('#clients-preview-close').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
}

async function logClientActivity(leadId, type, description) {
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
  }
}

// ---------- Send Invoice modal ----------

// Pick one of the client's proposals to send. Opens over the drawer; closing
// (X, backdrop, or Cancel) reopens the drawer so the admin keeps their place.
function openSendInvoiceModal(leadId) {
  const c = clients.find(cl => cl.id === leadId);
  if (!c) { showToast('Client not found', 'error'); return; }

  const modal = document.getElementById('clients-modal');
  const proposals = proposalsByLead.get(leadId);
  const loading = proposals === undefined;
  const sendable = (proposals || []).filter(p => p.status !== 'paid' && p.status !== 'declined');

  const rows = sendable.map(p => {
    const amt = `$${Number(p.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const sentBadge = p.status === 'sent'
      ? `<span style="font-size:10px;font-weight:600;color:#4338ca;text-transform:uppercase;letter-spacing:.5px;margin-left:6px;">sent</span>`
      : p.status === 'accepted'
        ? `<span style="font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-left:6px;">accepted</span>`
        : `<span style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-left:6px;">${escapeHtml(p.status || 'draft')}</span>`;
    const resendHint = p.sent_at ? ` \u00b7 last sent ${formatDate(p.sent_at)}` : '';
    return `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;background:#fff;margin-bottom:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;">${escapeHtml(p.proposal_number || '')} \u00b7 ${escapeHtml(p.title || '(untitled)')}${sentBadge}</div>
          <div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">${amt} \u00b7 ${formatDate(p.created_at)}${resendHint}</div>
        </div>
        <button class="crm-btn crm-btn-primary crm-btn-sm" data-action="send-invoice-confirm" data-proposal-id="${p.id}">
          ${p.sent_at ? 'Resend' : 'Send'}
        </button>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content" style="max-width:600px;">
        <div class="crm-modal-header">
          <h2>Send invoice to ${escapeHtml(`${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)')}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body" style="padding:20px;">
          ${loading
            ? `<div style="color:var(--text-muted,#888);font-size:13px;">Loading proposals\u2026</div>`
            : sendable.length
              ? `<div style="color:var(--text-muted,#666);font-size:12px;margin-bottom:12px;">Pick a proposal to email. This generates fresh Stripe payment links and logs the send in the CRM activity feed.</div>${rows}`
              : `<div style="padding:16px;background:var(--bg,#faf9f6);border-radius:8px;color:var(--text-muted,#888);font-size:13px;text-align:center;">
                   No sendable proposals for this client.
                   <div style="margin-top:8px;"><a href="crm.html" target="_blank" style="color:#4338ca;text-decoration:none;">Create one in the CRM \u2197</a></div>
                 </div>`}
        </div>
        <div class="crm-modal-footer" style="padding:12px 20px;border-top:1px solid var(--border-color,#eee);display:flex;justify-content:flex-end;">
          <button class="crm-btn" id="send-invoice-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;

  const backToDrawer = () => openClientDetail(leadId);
  document.getElementById('clients-modal-close-btn').addEventListener('click', backToDrawer);
  document.getElementById('send-invoice-cancel-btn').addEventListener('click', backToDrawer);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') backToDrawer();
  });
}

async function handleSendInvoiceConfirm(proposalId, leadId, btn) {
  if (!btn || btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  const originalLabel = btn.textContent;
  btn.textContent = 'Sending\u2026';
  btn.disabled = true;
  try {
    await sendProposalEmail(proposalId, { authState });
    showToast('Invoice sent', 'success');
    await loadClientProposals(leadId);
    openClientDetail(leadId);
    activeClientTab = 'billing';
    rerenderActiveTabPanel();
  } catch (err) {
    console.error('send invoice error:', err);
    showToast(`Send failed: ${err.message || err}`, 'error');
    btn.textContent = originalLabel;
    btn.disabled = false;
    delete btn.dataset.busy;
  }
}

// ---------- New Package modal ----------

// Parse "6D/5N" or "3D / 2N" from a retreat template name. Returns
// { days, nights } or null if not a multi-day retreat template.
function parseRetreatDuration(name) {
  const m = String(name || '').match(/(\d+)\s*D\s*\/\s*(\d+)\s*N/i);
  if (!m) return null;
  return { days: parseInt(m[1], 10), nights: parseInt(m[2], 10) };
}

// Detect "Private" / "Shared" room in template name.
function parseRetreatOccupancy(name) {
  const s = String(name || '').toLowerCase();
  if (s.includes('private')) return 'private';
  if (s.includes('shared')) return 'shared';
  return null;
}

// Add N days to a YYYY-MM-DD date string, return YYYY-MM-DD.
function addDaysIso(ymd, days) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function openPackageModal(leadId) {
  const activeServices = services.filter(s => s.is_active);
  if (!activeServices.length) {
    showToast('Add a service in the Services tab first.', 'error');
    return;
  }

  const retreatTemplates = servicePackageTemplates.filter(t => parseRetreatDuration(t.name));
  const integrationTemplates = servicePackageTemplates.filter(t => t.category === 'integration');
  const overnightTemplates = servicePackageTemplates.filter(t => t.category === 'overnight');
  const otherTemplates = servicePackageTemplates.filter(t => !parseRetreatDuration(t.name) && t.category !== 'integration' && t.category !== 'overnight');

  const today = new Date().toISOString().slice(0, 10);

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>New Package</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-field">
            <label>Start from</label>
            <select class="crm-select" id="pkg-template">
              <option value="custom">Custom (build from scratch)</option>
              ${retreatTemplates.length ? `<optgroup label="Retreats / Immersives">
                ${retreatTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} &mdash; $${Number(t.price_regular).toLocaleString()}</option>`).join('')}
              </optgroup>` : ''}
              ${integrationTemplates.length ? `<optgroup label="Integration Packages">
                ${integrationTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} &mdash; $${Number(t.price_regular).toLocaleString()}</option>`).join('')}
              </optgroup>` : ''}
              ${overnightTemplates.length ? `<optgroup label="Overnight Stays">
                ${overnightTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} &mdash; $${Number(t.price_regular).toLocaleString()}</option>`).join('')}
              </optgroup>` : ''}
              ${otherTemplates.length ? `<optgroup label="Packages">
                ${otherTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} &mdash; $${Number(t.price_regular).toLocaleString()}</option>`).join('')}
              </optgroup>` : ''}
            </select>
            <div id="pkg-template-hint" style="margin-top:6px;font-size:11px;color:var(--text-muted,#888);display:none;"></div>
          </div>

          <div class="crm-form-grid" style="margin-top:12px;">
            <div class="crm-form-field">
              <label>Package name *</label>
              <input type="text" class="crm-input" id="pkg-name" placeholder="e.g. 3-Session Ketamine Package" required>
            </div>
            <div class="crm-form-field">
              <label>Occupancy</label>
              <select class="crm-select" id="pkg-occupancy">
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>
            </div>
            <div class="crm-form-field">
              <label>Price ($)</label>
              <input type="number" class="crm-input" id="pkg-price" value="0" step="0.01" min="0">
            </div>
            <div class="crm-form-field">
              <label>&nbsp;</label>
              <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;">
                <input type="checkbox" id="pkg-paid"> Mark as paid now
              </label>
            </div>
          </div>

          <div id="pkg-retreat-section" style="display:none;margin-top:14px;padding:12px;background:#fff8ec;border:1px solid #f2d69a;border-radius:8px;">
            <div id="pkg-stay-title" style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a5a1a;margin-bottom:8px;">Retreat stay</div>
            <div class="crm-form-grid">
              <div class="crm-form-field">
                <label>Check-in *</label>
                <input type="date" class="crm-input" id="pkg-checkin" value="${today}">
              </div>
              <div class="crm-form-field">
                <label id="pkg-checkout-label">Check-out (auto)</label>
                <input type="date" class="crm-input" id="pkg-checkout" readonly style="background:#f5f0e3;">
              </div>
              <div class="crm-form-field" style="grid-column:1 / -1;">
                <label>Room &middot; Bed <span style="font-weight:400;color:var(--text-muted,#888);">(optional — assign later)</span></label>
                <select class="crm-select" id="pkg-bed">
                  <option value="">&mdash; unassigned &mdash;</option>
                  ${lodgingSpaces.map(sp => {
                    const roomBeds = beds.filter(b => b.space_id === sp.id);
                    if (!roomBeds.length) return '';
                    return `<optgroup label="${escapeHtml(sp.name)} (${escapeHtml(sp.floor || '')}${sp.has_private_bath ? ', private bath' : ''})">
                      ${roomBeds.map(b => `<option value="${b.id}">${escapeHtml(b.label)} (${escapeHtml(b.bed_type)})</option>`).join('')}
                    </optgroup>`;
                  }).join('')}
                </select>
              </div>
            </div>
            <div id="pkg-overnight-summary" style="display:none;margin-top:10px;padding:8px 10px;background:#fff;border:1px dashed #f2d69a;border-radius:6px;font-size:12px;color:#8a5a1a;"></div>
          </div>

          <div style="margin-top:14px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin-bottom:8px;">Session credits</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${activeServices.map(s => `
                <div style="display:flex;align-items:center;gap:10px;">
                  <label style="flex:1;font-size:13px;">${escapeHtml(s.name)} <span style="color:var(--text-muted,#888);font-size:11px;">(${s.duration_minutes} min)</span></label>
                  <input type="number" class="crm-input pkg-session-count" data-service-id="${s.id}" value="0" min="0" max="50" style="width:80px;">
                </div>
              `).join('')}
            </div>
            <div style="margin-top:6px;font-size:11px;color:var(--text-muted,#888);">Each credit creates an unscheduled session row. Schedule them later via the Schedule tab.</div>
          </div>

          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="pkg-notes" rows="2"></textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          <span></span>
          <div>
            <button class="crm-btn" id="btn-cancel-pkg">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-pkg">Create package</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', () => openClientDetail(leadId));
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') openClientDetail(leadId);
  });
  document.getElementById('btn-cancel-pkg').addEventListener('click', () => openClientDetail(leadId));
  document.getElementById('btn-save-pkg').addEventListener('click', () => savePackage(leadId));

  document.getElementById('pkg-template').addEventListener('change', onTemplateChange);
  document.getElementById('pkg-checkin').addEventListener('change', () => {
    recomputeCheckout();
    recomputeOvernightTotal();
  });
  document.getElementById('pkg-checkout').addEventListener('change', recomputeOvernightTotal);
}

function onTemplateChange(e) {
  const templateId = e.target.value;
  const nameEl = document.getElementById('pkg-name');
  const priceEl = document.getElementById('pkg-price');
  const occEl = document.getElementById('pkg-occupancy');
  const hintEl = document.getElementById('pkg-template-hint');
  const retreatSection = document.getElementById('pkg-retreat-section');

  // Always reset session-credit inputs to 0 before applying template items
  document.querySelectorAll('.pkg-session-count').forEach(inp => { inp.value = 0; });

  if (templateId === 'custom') {
    hintEl.style.display = 'none';
    retreatSection.style.display = 'none';
    return;
  }

  const tpl = servicePackageTemplates.find(t => t.id === templateId);
  if (!tpl) return;

  nameEl.value = tpl.name;
  priceEl.value = Number(tpl.price_regular || 0).toFixed(2);

  const occ = parseRetreatOccupancy(tpl.name);
  if (occ) occEl.value = occ;

  // Auto-populate session credits from the structured package items catalog
  const items = packageItemsByPkgId.get(tpl.id) || [];
  items.forEach(it => {
    const inp = document.querySelector(`.pkg-session-count[data-service-id="${it.service_id}"]`);
    if (inp) inp.value = it.quantity;
  });

  const hintParts = [];
  if (tpl.description) hintParts.push(escapeHtml(tpl.description));
  if (items.length) {
    const svcById = new Map(services.map(s => [s.id, s]));
    const included = items.map(it => {
      const svc = svcById.get(it.service_id);
      if (!svc) return null;
      return `${it.quantity}\u00d7 ${escapeHtml(svc.name)}`;
    }).filter(Boolean);
    if (included.length) hintParts.push('Includes: ' + included.join(' &middot; '));
  } else {
    // Fall back to the old free-text includes list when no structured items
    const includesList = Array.isArray(tpl.includes) ? tpl.includes : [];
    if (includesList.length) hintParts.push('Includes: ' + includesList.map(escapeHtml).join(' &middot; '));
  }
  hintEl.innerHTML = hintParts.join('<br>');
  hintEl.style.display = hintParts.length ? 'block' : 'none';

  const dur = parseRetreatDuration(tpl.name);
  const isOvernight = tpl.category === 'overnight';
  const stayTitle = document.getElementById('pkg-stay-title');
  const checkoutLabel = document.getElementById('pkg-checkout-label');
  const checkoutInput = document.getElementById('pkg-checkout');
  const overnightSummary = document.getElementById('pkg-overnight-summary');

  if (dur) {
    // Retreat: check-out auto-derived from the duration baked in the name.
    retreatSection.style.display = 'block';
    if (stayTitle) stayTitle.textContent = 'Retreat stay';
    if (checkoutLabel) checkoutLabel.textContent = 'Check-out (auto)';
    if (checkoutInput) {
      checkoutInput.readOnly = true;
      checkoutInput.style.background = '#f5f0e3';
    }
    if (overnightSummary) overnightSummary.style.display = 'none';
    recomputeCheckout();
  } else if (isOvernight) {
    // Overnight: variable-length stay, price = nights × per-night rate.
    retreatSection.style.display = 'block';
    if (stayTitle) stayTitle.textContent = 'Overnight stay';
    if (checkoutLabel) checkoutLabel.textContent = 'Check-out *';
    if (checkoutInput) {
      checkoutInput.readOnly = false;
      checkoutInput.style.background = '';
      // Default to one night out so the price preview shows immediately.
      const checkin = document.getElementById('pkg-checkin')?.value;
      if (checkin && !checkoutInput.value) checkoutInput.value = addDaysIso(checkin, 1);
    }
    recomputeOvernightTotal();
  } else {
    retreatSection.style.display = 'none';
    if (overnightSummary) overnightSummary.style.display = 'none';
  }
}

function recomputeCheckout() {
  const templateId = document.getElementById('pkg-template')?.value;
  const tpl = servicePackageTemplates.find(t => t.id === templateId);
  const dur = tpl ? parseRetreatDuration(tpl.name) : null;
  if (!dur) return;
  const checkin = document.getElementById('pkg-checkin')?.value;
  document.getElementById('pkg-checkout').value = checkin ? addDaysIso(checkin, dur.nights) : '';
}

// Overnight presets sell at a per-night rate — recompute nights × rate
// whenever check-in or check-out moves, and reflect both the line preview
// and the bound Price ($) input so the saved package row carries the total.
function recomputeOvernightTotal() {
  const templateId = document.getElementById('pkg-template')?.value;
  const tpl = servicePackageTemplates.find(t => t.id === templateId);
  if (!tpl || tpl.category !== 'overnight') return;

  const checkin = document.getElementById('pkg-checkin')?.value;
  const checkout = document.getElementById('pkg-checkout')?.value;
  const summary = document.getElementById('pkg-overnight-summary');
  const priceInput = document.getElementById('pkg-price');
  const perNightRate = Number(tpl.price_regular || 0);

  if (!summary || !priceInput) return;

  if (!checkin || !checkout) {
    summary.style.display = 'none';
    return;
  }

  // Inclusive of check-in night, exclusive of check-out night.
  const inDate = new Date(checkin + 'T00:00:00');
  const outDate = new Date(checkout + 'T00:00:00');
  const nights = Math.round((outDate - inDate) / (1000 * 60 * 60 * 24));

  if (nights <= 0) {
    summary.style.display = 'block';
    summary.textContent = 'Check-out must be after check-in.';
    summary.style.color = '#b91c1c';
    return;
  }

  const total = nights * perNightRate;
  priceInput.value = total.toFixed(2);
  summary.style.display = 'block';
  summary.style.color = '#8a5a1a';
  summary.innerHTML = `<strong>${nights}</strong> night${nights === 1 ? '' : 's'} &times; $${perNightRate.toLocaleString()} = <strong>$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
}

async function savePackage(leadId) {
  const name = document.getElementById('pkg-name').value.trim();
  if (!name) { showToast('Package name required', 'error'); return; }
  const occupancy = document.getElementById('pkg-occupancy').value;
  const priceDollars = parseFloat(document.getElementById('pkg-price').value) || 0;
  const priceCents = Math.round(priceDollars * 100);
  const markPaid = document.getElementById('pkg-paid').checked;
  const notes = document.getElementById('pkg-notes').value.trim() || null;

  const templateId = document.getElementById('pkg-template').value;
  const tpl = templateId !== 'custom' ? servicePackageTemplates.find(t => t.id === templateId) : null;
  const retreatDur = tpl ? parseRetreatDuration(tpl.name) : null;
  const isOvernight = tpl?.category === 'overnight';

  let stayPayload = null;
  if (retreatDur || isOvernight) {
    const checkinYmd = document.getElementById('pkg-checkin').value;
    const checkoutYmd = document.getElementById('pkg-checkout').value;
    const bedId = document.getElementById('pkg-bed').value || null;
    if (!checkinYmd || !checkoutYmd) { showToast('Pick check-in and check-out dates', 'error'); return; }
    if (new Date(checkoutYmd) <= new Date(checkinYmd)) { showToast('Check-out must be after check-in', 'error'); return; }
    // Bed is optional — stay can be booked unassigned and a bed picked later.
    stayPayload = {
      lead_id: leadId,
      bed_id: bedId,
      check_in_at: new Date(`${checkinYmd}T15:00:00`).toISOString(),
      check_out_at: new Date(`${checkoutYmd}T11:00:00`).toISOString(),
      status: 'upcoming',
    };
  }

  const sessionRows = [];
  document.querySelectorAll('.pkg-session-count').forEach(input => {
    const count = parseInt(input.value, 10) || 0;
    const serviceId = input.dataset.serviceId;
    for (let i = 0; i < count; i++) {
      sessionRows.push({ service_id: serviceId, status: 'unscheduled' });
    }
  });
  if (sessionRows.length === 0 && !stayPayload) {
    showToast('Add at least one session credit', 'error');
    return;
  }

  const pkgPayload = {
    lead_id: leadId,
    name,
    occupancy_rate: occupancy,
    status: 'active',
    price_cents: priceCents,
    paid_at: markPaid ? new Date().toISOString() : null,
    notes,
  };

  const pkgRes = await supabase.from('client_packages').insert(pkgPayload).select().single();
  if (pkgRes.error) { showToast(pkgRes.error.message || 'Failed to create package', 'error'); return; }

  const packageId = pkgRes.data.id;

  if (sessionRows.length) {
    const sessPayload = sessionRows.map(s => ({ ...s, package_id: packageId }));
    const sessRes = await supabase.from('client_package_sessions').insert(sessPayload);
    if (sessRes.error) {
      console.error('Session insert error:', sessRes.error);
      showToast('Package created but sessions failed: ' + (sessRes.error.message || 'unknown'), 'error');
      await loadClientsData();
      openClientDetail(leadId);
      return;
    }
  }

  if (stayPayload) {
    const stayRes = await supabase.from('client_stays').insert({ ...stayPayload, package_id: packageId });
    if (stayRes.error) {
      console.error('Stay insert error:', stayRes.error);
      showToast('Package created but stay failed: ' + (stayRes.error.message || 'unknown'), 'error');
      await loadClientsData();
      openClientDetail(leadId);
      return;
    }
    showToast('Package + stay created', 'success');
  } else {
    showToast('Package created', 'success');
  }

  await loadClientsData();
  openClientDetail(leadId);
}

// ---------- New Stay modal ----------

function openStayModal(leadId) {
  if (!beds.length) {
    showToast('No beds configured yet.', 'error');
    return;
  }
  const client = clients.find(c => c.id === leadId);
  const pkgs = getClientPackages(leadId).filter(p => p.status === 'active');

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>New Stay \u2014 ${escapeHtml(`${client?.first_name || ''} ${client?.last_name || ''}`.trim() || 'Client')}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Room \u00b7 Bed <span style="font-weight:400;color:var(--text-muted,#888);">(optional \u2014 assign later)</span></label>
              <select class="crm-select" id="stay-bed">
                <option value="">\u2014 unassigned \u2014</option>
                ${lodgingSpaces.map(sp => {
                  const roomBeds = beds.filter(b => b.space_id === sp.id);
                  if (!roomBeds.length) return '';
                  return `<optgroup label="${escapeHtml(sp.name)} (${escapeHtml(sp.floor || '')}${sp.has_private_bath ? ', private bath' : ''})">
                    ${roomBeds.map(b => `<option value="${b.id}">${escapeHtml(b.label)} (${escapeHtml(b.bed_type)})</option>`).join('')}
                  </optgroup>`;
                }).join('')}
              </select>
            </div>
            <div class="crm-form-field">
              <label>Link to package</label>
              <select class="crm-select" id="stay-package">
                <option value="">\u2014 none \u2014</option>
                ${pkgs.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="crm-form-field">
              <label>Check-in *</label>
              <input type="date" class="crm-input" id="stay-checkin" value="${today}" required>
            </div>
            <div class="crm-form-field">
              <label>Check-out *</label>
              <input type="date" class="crm-input" id="stay-checkout" value="${tomorrow}" required>
            </div>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="stay-notes" rows="2"></textarea>
          </div>
        </div>
        <div class="crm-modal-footer">
          <span></span>
          <div>
            <button class="crm-btn" id="btn-cancel-stay">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-stay">Create stay</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', () => openClientDetail(leadId));
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') openClientDetail(leadId);
  });
  document.getElementById('btn-cancel-stay').addEventListener('click', () => openClientDetail(leadId));
  document.getElementById('btn-save-stay').addEventListener('click', () => saveStay(leadId));
}

async function saveStay(leadId) {
  const bedId = document.getElementById('stay-bed').value || null;
  const packageId = document.getElementById('stay-package').value || null;
  const checkinDate = document.getElementById('stay-checkin').value;
  const checkoutDate = document.getElementById('stay-checkout').value;
  if (!checkinDate || !checkoutDate) { showToast('Check-in and check-out required', 'error'); return; }
  if (new Date(checkoutDate) <= new Date(checkinDate)) { showToast('Check-out must be after check-in', 'error'); return; }
  const notes = document.getElementById('stay-notes').value.trim() || null;

  const checkinISO = new Date(checkinDate + 'T15:00:00').toISOString();
  const checkoutISO = new Date(checkoutDate + 'T11:00:00').toISOString();

  // Conflict check only runs when a bed is assigned \u2014 unassigned stays
  // don't compete for a specific bed yet, so there's nothing to overlap.
  if (bedId) {
    const conflict = stays.find(s =>
      s.bed_id === bedId && s.status !== 'cancelled' &&
      new Date(s.check_in_at) < new Date(checkoutISO) &&
      new Date(s.check_out_at) > new Date(checkinISO)
    );
    if (conflict) {
      const conflictClient = clients.find(c => c.id === conflict.lead_id);
      const who = conflictClient ? `${conflictClient.first_name || ''} ${conflictClient.last_name || ''}`.trim() : 'another client';
      if (!confirm(`This bed overlaps with ${who}'s stay (${formatDateShort(conflict.check_in_at)}\u2013${formatDateShort(conflict.check_out_at)}). Create anyway?`)) return;
    }
  }

  const now = new Date();
  const status = new Date(checkinISO) <= now && new Date(checkoutISO) > now
    ? 'active'
    : (new Date(checkinISO) > now ? 'upcoming' : 'completed');

  const payload = {
    lead_id: leadId,
    bed_id: bedId,
    package_id: packageId,
    check_in_at: checkinISO,
    check_out_at: checkoutISO,
    status,
    notes,
  };
  const { error } = await supabase.from('client_stays').insert(payload);
  if (error) { showToast(error.message || 'Failed to create stay', 'error'); return; }

  showToast('Stay created', 'success');
  await loadClientsData();
  openClientDetail(leadId);
}

// ---------- Schedule session modal (Phase 4) ----------

function findSessionContext(sessionId) {
  for (const p of packages) {
    const sess = (p.sessions || []).find(x => x.id === sessionId);
    if (sess) return { session: sess, pkg: p };
  }
  return null;
}

// Find all other clients with an unscheduled session for the same service.
// Used to populate the attendee multi-select when booking a class.
function getEligibleClassAttendees(serviceId, excludeLeadId) {
  const out = [];
  for (const p of packages) {
    if (p.lead_id === excludeLeadId) continue;
    const sess = (p.sessions || []).find(s => s.service_id === serviceId && s.status === 'unscheduled');
    if (!sess) continue;
    const c = clients.find(x => x.id === p.lead_id);
    if (!c) continue;
    out.push({
      lead_id: p.lead_id,
      session_id: sess.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Client',
      package_name: p.name,
    });
  }
  // Sort by name for stable rendering.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function openScheduleSessionModal(sessionId, options = {}) {
  const { prefilledStart = null, returnTo = 'drawer' } = options;
  const ctx = findSessionContext(sessionId);
  if (!ctx) { showToast('Session not found', 'error'); return; }
  const { session, pkg } = ctx;

  const client = clients.find(c => c.id === pkg.lead_id);
  const service = services.find(s => s.id === session.service_id);
  const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : 'Client';
  const isClass = !!service?.is_group_class;
  const eligibleAttendees = isClass ? getEligibleClassAttendees(session.service_id, pkg.lead_id) : [];

  // Default start: prefilled (calendar-click) if provided, else tomorrow at 10:00 local.
  const def = prefilledStart ? new Date(prefilledStart) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  })();
  const pad = n => String(n).padStart(2, '0');
  const defaultStart = `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`;

  // When invoked from the calendar, dismissing/saving returns to the schedule grid
  // instead of re-opening the client drawer.
  const dismiss = () => {
    if (returnTo === 'schedule') {
      const modal = document.getElementById('clients-modal');
      if (modal) { modal.innerHTML = ''; modal.style.display = 'none'; }
    } else {
      openClientDetail(pkg.lead_id);
    }
  };

  const activeFacilitators = facilitators.filter(f => f.is_active);
  if (!activeFacilitators.length) {
    showToast('No active facilitators. Add one in the Facilitators tab first.', 'error');
    return;
  }

  const capacityLabel = isClass && service?.max_capacity
    ? ` &middot; capacity ${service.max_capacity}`
    : '';

  const attendeeSection = isClass ? `
            <div class="crm-form-field" style="grid-column:1 / -1;">
              <label>Additional attendees${service?.max_capacity ? ` (max ${service.max_capacity - 1} more)` : ''}</label>
              ${eligibleAttendees.length === 0 ? `
                <div style="padding:10px 12px;background:var(--bg,#faf9f6);border-radius:8px;font-size:12px;color:var(--text-muted,#666);">
                  No other clients have an unscheduled ${escapeHtml(service?.name || 'class')} credit right now.
                </div>
              ` : `
                <div id="sched-attendees" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color,#e5e5e5);border-radius:8px;padding:6px 10px;">
                  ${eligibleAttendees.map(a => `
                    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-weight:400;font-size:13px;cursor:pointer;">
                      <input type="checkbox" class="sched-attendee-cb" data-lead-id="${a.lead_id}" data-session-id="${a.session_id}">
                      <span>${escapeHtml(a.name)}</span>
                      <span style="color:var(--text-muted,#888);font-size:11px;">&middot; ${escapeHtml(a.package_name)}</span>
                    </label>
                  `).join('')}
                </div>
                <div style="margin-top:4px;font-size:11px;color:var(--text-muted,#888);">
                  <span id="sched-attendee-count">1</span> attending (including ${escapeHtml(clientName)})
                </div>
              `}
            </div>
  ` : '';

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>${isClass ? 'Schedule Class' : 'Schedule Session'} \u2014 ${escapeHtml(clientName)}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div style="padding:10px 12px;background:var(--bg,#faf9f6);border-radius:8px;margin-bottom:14px;font-size:12px;color:var(--text-muted,#666);">
            ${escapeHtml(service?.name || 'Service')} &middot; ${service?.duration_minutes || 60} min &middot; package &ldquo;${escapeHtml(pkg.name)}&rdquo;${capacityLabel}
          </div>
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Staff/Facilitator *</label>
              <select class="crm-select" id="sched-staff" required>
                <option value="">\u2014 pick facilitator \u2014</option>
                ${activeFacilitators.map(f => {
                  const n = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || '\u2014';
                  return `<option value="${f.id}">${escapeHtml(n)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="crm-form-field">
              <label>Start *</label>
              <input class="crm-input" type="datetime-local" id="sched-start" value="${defaultStart}" required>
            </div>
            <div class="crm-form-field">
              <label>Duration (min)</label>
              <input class="crm-input" type="number" id="sched-duration" min="15" step="15" value="${service?.duration_minutes || 60}">
            </div>
            <div class="crm-form-field">
              <label>Room (optional)</label>
              <select class="crm-select" id="sched-space">
                <option value="">\u2014 no room \u2014</option>
                ${sessionSpaces.map(sp => `<option value="${sp.id}">${escapeHtml(sp.name)}</option>`).join('')}
              </select>
            </div>
            ${attendeeSection}
            <div class="crm-form-field" style="grid-column:1 / -1;">
              <label>Notes</label>
              <textarea class="crm-textarea" id="sched-notes" rows="3" placeholder="Optional context"></textarea>
            </div>
          </div>
        </div>
        <div class="crm-modal-footer">
          <button class="crm-btn" id="sched-cancel">Cancel</button>
          <button class="crm-btn crm-btn-primary" id="sched-save" data-session-id="${session.id}">${isClass ? 'Book class' : 'Book session'}</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', dismiss);
  document.getElementById('sched-cancel').addEventListener('click', dismiss);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') dismiss();
  });
  document.getElementById('sched-save').addEventListener('click', () => saveScheduledSession(session.id, { returnTo }));

  if (isClass && eligibleAttendees.length) {
    const countEl = document.getElementById('sched-attendee-count');
    const cap = service?.max_capacity || null;
    document.querySelectorAll('.sched-attendee-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = document.querySelectorAll('.sched-attendee-cb:checked').length;
        const total = checked + 1; // host
        if (countEl) countEl.textContent = String(total);
        if (cap && total > cap) {
          cb.checked = false;
          showToast(`Capacity is ${cap}`, 'error');
          const after = document.querySelectorAll('.sched-attendee-cb:checked').length;
          if (countEl) countEl.textContent = String(after + 1);
        }
      });
    });
  }
}

async function saveScheduledSession(sessionId, options = {}) {
  const { returnTo = 'drawer' } = options;
  const ctx = findSessionContext(sessionId);
  if (!ctx) { showToast('Session not found', 'error'); return; }
  const { session, pkg } = ctx;
  const service = services.find(s => s.id === session.service_id);
  const isClass = !!service?.is_group_class;

  const facilitatorId = document.getElementById('sched-staff').value;
  const startLocal = document.getElementById('sched-start').value;
  const duration = parseInt(document.getElementById('sched-duration').value, 10) || 0;
  const spaceId = document.getElementById('sched-space').value || null;
  const notes = document.getElementById('sched-notes').value.trim() || null;

  if (!facilitatorId) { showToast('Pick a facilitator', 'error'); return; }
  if (!startLocal) { showToast('Pick a start time', 'error'); return; }

  // datetime-local is local time — convert to ISO in the user's timezone
  const startDate = new Date(startLocal);
  if (isNaN(startDate.getTime())) { showToast('Invalid start time', 'error'); return; }

  // Build the attendees array for classes. Host is always the first entry.
  let classAttendees = null;
  if (isClass) {
    classAttendees = [{ lead_id: pkg.lead_id, package_session_id: session.id }];
    document.querySelectorAll('.sched-attendee-cb:checked').forEach(cb => {
      classAttendees.push({
        lead_id: cb.dataset.leadId,
        package_session_id: cb.dataset.sessionId,
      });
    });
    if (service?.max_capacity && classAttendees.length > service.max_capacity) {
      showToast(`Capacity is ${service.max_capacity}`, 'error');
      return;
    }
  }

  const saveBtn = document.getElementById('sched-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Booking\u2026';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const supabaseUrl = 'https://lnqxarwqckpmirpmixcw.supabase.co';
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

    const payload = isClass
      ? {
          service_id: session.service_id,
          facilitator_id: facilitatorId,
          start_datetime: startDate.toISOString(),
          duration_minutes: duration || undefined,
          space_id: spaceId,
          attendees: classAttendees,
          notes,
        }
      : {
          lead_id: pkg.lead_id,
          service_id: session.service_id,
          facilitator_id: facilitatorId,
          start_datetime: startDate.toISOString(),
          duration_minutes: duration || undefined,
          space_id: spaceId,
          package_session_id: session.id,
          notes,
        };

    const resp = await fetch(supabaseUrl + '/functions/v1/admin-book-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': anonKey,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      if (json.error === 'slot_taken') {
        showToast('That time slot is already booked for this facilitator.', 'error');
      } else {
        showToast('Booking failed: ' + (json.error || resp.status), 'error');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = isClass ? 'Book class' : 'Book session';
      return;
    }

    showToast(isClass ? `Class booked (${(json.attendee_count || classAttendees?.length || 1)} attending)` : 'Session scheduled', 'success');
    await loadClientsData();
    // Jump the weekly grid to the week of the new booking so it's visible when
    // the user switches to the Schedule tab.
    scheduleWeekStart = mondayOf(startDate);
    loadScheduleWeek();
    if (returnTo === 'schedule') {
      const modal = document.getElementById('clients-modal');
      if (modal) { modal.innerHTML = ''; modal.style.display = 'none'; }
    } else {
      openClientDetail(pkg.lead_id);
    }
  } catch (e) {
    console.error('admin-book-session call failed:', e);
    showToast('Booking failed: ' + e.message, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Book session';
  }
}

// ---------- Calendar-click booking picker ----------
// Entry point when staff clicks an empty slot on the Schedule tab.
// Step 1: pick a client. Step 2: pick one of that client's unscheduled sessions.
// Once a session is picked, hand off to openScheduleSessionModal with the clicked
// time pre-filled and returnTo='schedule' so we land back on the grid on save.

let pickerPrefilledStart = null;
let pickerSelectedClientId = null;
let pickerClientSearch = '';

function openBookingPickerModal(options = {}) {
  pickerPrefilledStart = options.prefilledStart || null;
  pickerSelectedClientId = null;
  pickerClientSearch = '';
  renderBookingPickerClientStep();
}

function closeBookingPicker() {
  const modal = document.getElementById('clients-modal');
  if (modal) { modal.innerHTML = ''; modal.style.display = 'none'; }
  pickerPrefilledStart = null;
  pickerSelectedClientId = null;
  pickerClientSearch = '';
}

function clientHasUnscheduled(clientId) {
  return packages.some(p => p.lead_id === clientId && (p.sessions || []).some(s => s.status === 'unscheduled'));
}

function formatPrefilledStartLabel(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) +
    ' \u00b7 ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderBookingPickerClientStep() {
  const modal = document.getElementById('clients-modal');
  if (!modal) return;

  const needle = pickerClientSearch.trim().toLowerCase();
  const filtered = clients
    .filter(c => clientHasUnscheduled(c.id))
    .filter(c => {
      if (!needle) return true;
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const hay = [name, c.email || '', c.phone || ''].join(' ').toLowerCase();
      return hay.includes(needle);
    })
    .sort((a, b) => `${a.first_name || ''} ${a.last_name || ''}`.localeCompare(`${b.first_name || ''} ${b.last_name || ''}`));

  const rows = filtered.length
    ? filtered.map(c => {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(unnamed)';
        const unscheduled = packages
          .filter(p => p.lead_id === c.id)
          .reduce((n, p) => n + (p.sessions || []).filter(s => s.status === 'unscheduled').length, 0);
        return `
          <button type="button" class="crm-btn" data-picker-client="${c.id}" style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#fff;">
            <span>
              <span style="font-weight:600;">${escapeHtml(name)}</span>
              <span style="color:var(--text-muted,#888);font-size:12px;margin-left:8px;">${escapeHtml(c.email || c.phone || '')}</span>
            </span>
            <span style="font-size:12px;color:var(--text-muted,#666);">${unscheduled} unscheduled</span>
          </button>
        `;
      }).join('')
    : `<div style="padding:20px;text-align:center;color:var(--text-muted,#888);font-size:13px;">No clients with unscheduled sessions match.</div>`;

  const timeLabel = pickerPrefilledStart ? formatPrefilledStartLabel(pickerPrefilledStart) : 'No time selected';

  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <div>
            <h2>Book a session</h2>
            <div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${escapeHtml(timeLabel)} \u00b7 Step 1 of 2: pick a client</div>
          </div>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <input type="text" class="crm-input" id="picker-client-search" placeholder="Search by name, email, or phone\u2026" value="${escapeHtml(pickerClientSearch)}" style="margin-bottom:10px;">
          <div style="max-height:420px;overflow-y:auto;">${rows}</div>
        </div>
        <div class="crm-modal-footer">
          <button class="crm-btn" id="picker-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeBookingPicker);
  document.getElementById('picker-cancel').addEventListener('click', closeBookingPicker);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeBookingPicker();
  });
  const searchInput = document.getElementById('picker-client-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      pickerClientSearch = e.target.value;
      renderBookingPickerClientStep();
      const fresh = document.getElementById('picker-client-search');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
    });
  }
  modal.querySelectorAll('[data-picker-client]').forEach(btn => {
    btn.addEventListener('click', () => {
      pickerSelectedClientId = btn.dataset.pickerClient;
      renderBookingPickerSessionStep();
    });
  });
}

function renderBookingPickerSessionStep() {
  const modal = document.getElementById('clients-modal');
  if (!modal) return;
  const client = clients.find(c => c.id === pickerSelectedClientId);
  if (!client) { renderBookingPickerClientStep(); return; }

  const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || '(unnamed)';

  const unscheduled = [];
  for (const p of packages) {
    if (p.lead_id !== client.id) continue;
    for (const s of (p.sessions || [])) {
      if (s.status === 'unscheduled') unscheduled.push({ session: s, pkg: p });
    }
  }

  // Add-on services pulled from the package catalog (slug starts with addon_).
  // These let staff book one-off sessions (massage, sound journey, etc.) that
  // aren't pre-paid on the client's package \u2014 picking one creates a fresh
  // unscheduled session credit on their newest active package, then routes
  // straight into the schedule modal.
  const activeClientPkgs = getClientPackages(client.id).filter(p => p.status === 'active');
  const targetPkg = activeClientPkgs[0] || null;
  const addonOptions = (allServicePackages || [])
    .filter(p => p.is_active && p.slug && p.slug.startsWith('addon_'))
    .map(p => {
      const items = packageItemsByPkgId.get(p.id) || [];
      const svcId = items[0]?.service_id;
      const svc = svcId ? services.find(x => x.id === svcId) : null;
      return svc ? { pkgName: p.name, service: svc } : null;
    })
    .filter(Boolean)
    // Hide add-ons whose service already has an unscheduled credit on the
    // package \u2014 staff would just pick the existing credit row above.
    .filter(opt => !unscheduled.some(u => u.session.service_id === opt.service.id));

  const sessionRows = unscheduled.length
    ? unscheduled.map(({ session, pkg }) => {
        const svc = services.find(x => x.id === session.service_id);
        return `
          <button type="button" class="crm-btn" data-picker-session="${session.id}" style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#fff;">
            <span>
              <span style="font-weight:600;">${escapeHtml(svc?.name || 'Session')}</span>
              <span style="color:var(--text-muted,#888);font-size:12px;margin-left:8px;">${svc?.duration_minutes || 60} min</span>
            </span>
            <span style="font-size:12px;color:var(--text-muted,#666);">${escapeHtml(pkg.name || '')}</span>
          </button>
        `;
      }).join('')
    : `<div style="padding:14px 12px;text-align:center;color:var(--text-muted,#888);font-size:13px;background:var(--bg,#faf9f6);border-radius:8px;">No unscheduled session credits on this client\u2019s packages.</div>`;

  const addonRows = addonOptions.length
    ? addonOptions.map(({ pkgName, service }) => {
        const disabled = !targetPkg;
        return `
          <button type="button" class="crm-btn" ${disabled ? 'disabled' : `data-picker-addon-service="${service.id}"`} style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;background:#fff;${disabled ? 'opacity:.55;cursor:not-allowed;' : ''}">
            <span>
              <span style="font-weight:600;">${escapeHtml(service.name)}</span>
              <span style="color:var(--text-muted,#888);font-size:12px;margin-left:8px;">${service.duration_minutes || 60} min</span>
            </span>
            <span style="font-size:12px;color:var(--text-muted,#666);">${escapeHtml(pkgName)}</span>
          </button>
        `;
      }).join('')
    : '';

  const addonNote = addonOptions.length && !targetPkg
    ? `<div style="margin-top:6px;font-size:11px;color:#b4691f;">Add an active package to this client first to book an add-on.</div>`
    : '';

  const rows = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin:0 0 8px;">Unscheduled credits</div>
    ${sessionRows}
    ${addonRows ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);margin:14px 0 8px;">Add-ons (one-off)</div>
      ${addonRows}
      ${addonNote}
    ` : ''}
  `;

  const timeLabel = pickerPrefilledStart ? formatPrefilledStartLabel(pickerPrefilledStart) : 'No time selected';

  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <div>
            <h2>Book a session \u2014 ${escapeHtml(clientName)}</h2>
            <div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${escapeHtml(timeLabel)} \u00b7 Step 2 of 2: pick a session</div>
          </div>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div style="max-height:420px;overflow-y:auto;">${rows}</div>
        </div>
        <div class="crm-modal-footer">
          <button class="crm-btn" id="picker-back">\u2190 Back</button>
          <button class="crm-btn" id="picker-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeBookingPicker);
  document.getElementById('picker-cancel').addEventListener('click', closeBookingPicker);
  document.getElementById('picker-back').addEventListener('click', renderBookingPickerClientStep);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeBookingPicker();
  });
  modal.querySelectorAll('[data-picker-session]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.pickerSession;
      const prefilledStart = pickerPrefilledStart;
      // Reset picker state before handing off so we don't hold stale refs.
      pickerPrefilledStart = null;
      pickerSelectedClientId = null;
      pickerClientSearch = '';
      openScheduleSessionModal(sessionId, { prefilledStart, returnTo: 'schedule' });
    });
  });
  modal.querySelectorAll('[data-picker-addon-service]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const serviceId = btn.dataset.pickerAddonService;
      const clientId = pickerSelectedClientId;
      const prefilledStart = pickerPrefilledStart;
      const activePkgs = getClientPackages(clientId).filter(p => p.status === 'active');
      const pkg = activePkgs[0];
      if (!pkg) { showToast('Add an active package to this client first.', 'error'); return; }
      btn.disabled = true;
      const insertRes = await supabase
        .from('client_package_sessions')
        .insert({ package_id: pkg.id, service_id: serviceId, status: 'unscheduled' })
        .select()
        .single();
      if (insertRes.error) {
        console.error('Add-on credit insert error:', insertRes.error);
        showToast(insertRes.error.message || 'Failed to add session credit', 'error');
        btn.disabled = false;
        return;
      }
      pickerPrefilledStart = null;
      pickerSelectedClientId = null;
      pickerClientSearch = '';
      await loadClientsData();
      openScheduleSessionModal(insertRes.data.id, { prefilledStart, returnTo: 'schedule' });
    });
  });
}

// ---------- Schedule tab (Phase 5, live weekly grid) ----------

const SCHEDULE_START_HOUR = 8;  // 8am
const SCHEDULE_END_HOUR = 21;   // 9pm (exclusive)
const SCHEDULE_CELL_PX = 40;    // pixels per 30-min slot

function serviceColor(serviceId) {
  const name = (services.find(s => s.id === serviceId)?.name || '').toLowerCase();
  if (name.includes('ketamine')) return '#d4883a';
  if (name.includes('integration')) return '#16a34a';
  if (name.includes('massage')) return '#8b5cf6';
  if (name.includes('consult')) return '#0ea5e9';
  const palette = ['#dc2626', '#ea580c', '#ca8a04', '#059669', '#2563eb', '#7c3aed', '#db2777'];
  let h = 0;
  for (const ch of String(serviceId || 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function formatHourLabel(h) {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function formatWeekRange(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = sameMonth
    ? end.toLocaleDateString('en-US', { day: 'numeric' })
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr} \u2013 ${endStr}`;
}

function getStaffName(userId) {
  const u = staffList.find(x => x.id === userId);
  if (!u) return null;
  return u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || null;
}

function getFacilitatorName(facilitatorId) {
  const f = facilitators.find(x => x.id === facilitatorId);
  if (!f) return null;
  return `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || null;
}

function getAssigneeName(booking) {
  if (booking.facilitator_id) return getFacilitatorName(booking.facilitator_id);
  if (booking.staff_user_id) return getStaffName(booking.staff_user_id);
  return null;
}

async function loadScheduleWeek() {
  const start = new Date(scheduleWeekStart);
  const end = new Date(scheduleWeekStart);
  end.setDate(end.getDate() + 7);

  // Admin-created bookings (1:1 or class) have profile_id null. Public-booking-page
  // events and Google-synced calendar holds have profile_id set and don't belong here.
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .select('id, start_datetime, end_datetime, staff_user_id, facilitator_id, service_id, lead_id, booker_name, booker_email, booker_phone, space_id, status, cancelled_at, package_session_id, notes')
    .gte('start_datetime', start.toISOString())
    .lt('start_datetime', end.toISOString())
    .is('cancelled_at', null)
    .is('profile_id', null)
    .order('start_datetime');

  if (error) {
    console.error('schedule load error:', error);
    showToast('Failed to load schedule', 'error');
    scheduleBookings = [];
    renderSchedulePanel();
    return;
  }
  const bookings = data || [];

  // Fetch attendee rosters for any class bookings in this window.
  const bookingIds = bookings.map(b => b.id);
  let attendeesByBooking = new Map();
  if (bookingIds.length) {
    const { data: attData, error: attErr } = await supabase
      .from('scheduling_booking_attendees')
      .select('booking_id, lead_id, package_session_id, status')
      .in('booking_id', bookingIds)
      .neq('status', 'cancelled');
    if (attErr) {
      console.warn('attendee load error:', attErr);
    } else {
      for (const a of attData || []) {
        if (!attendeesByBooking.has(a.booking_id)) attendeesByBooking.set(a.booking_id, []);
        attendeesByBooking.get(a.booking_id).push(a);
      }
    }
  }
  scheduleBookings = bookings.map(b => ({ ...b, attendees: attendeesByBooking.get(b.id) || [] }));
  renderSchedulePanel();
}

function renderSchedulePanel() {
  const panel = document.getElementById('clients-panel-schedule');
  if (!panel) return;

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(scheduleWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayIdx = days.findIndex(d => d.getTime() === today.getTime());

  const hours = [];
  for (let h = SCHEDULE_START_HOUR; h < SCHEDULE_END_HOUR; h++) hours.push(h);
  const totalSlots = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2; // 30-min slots
  const gridHeight = totalSlots * SCHEDULE_CELL_PX;

  const filtered = scheduleBookings.filter(b => {
    if (scheduleStaffFilter === 'all') return true;
    if (scheduleStaffFilter === 'unassigned') return !b.facilitator_id && !b.staff_user_id;
    return b.facilitator_id === scheduleStaffFilter || b.staff_user_id === scheduleStaffFilter;
  });

  const pillsByDay = Array.from({ length: 7 }, () => []);
  for (const b of filtered) {
    const start = new Date(b.start_datetime);
    const end = new Date(b.end_datetime);
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const dayIdx = Math.round((startDay - scheduleWeekStart) / 86400000);
    if (dayIdx < 0 || dayIdx > 6) continue;

    const minutesFromGridStart = (start.getHours() - SCHEDULE_START_HOUR) * 60 + start.getMinutes();
    const durationMin = Math.max(15, Math.round((end - start) / 60000));
    const topPx = Math.max(0, (minutesFromGridStart / 30) * SCHEDULE_CELL_PX);
    const heightPx = Math.max(SCHEDULE_CELL_PX - 4, (durationMin / 30) * SCHEDULE_CELL_PX - 2);
    const isShort = heightPx < 54; // 30-min pill

    const svcObj = services.find(s => s.id === b.service_id);
    const isClassBooking = !!svcObj?.is_group_class;
    const svc = escapeHtml(svcObj?.name || 'Session');
    const attendeeCount = (b.attendees || []).length;
    const client = isClassBooking
      ? escapeHtml(`${attendeeCount} attending`)
      : escapeHtml(b.booker_name || 'Client');
    const staff = getAssigneeName(b) || 'Unassigned';
    const timeLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
    const color = serviceColor(b.service_id);
    const tooltip = `${svc} \u00b7 ${client} \u00b7 ${escapeHtml(staff)} \u00b7 ${timeLabel}`;

    const body = isShort
      ? `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;">
           <span style="font-weight:700;">${timeLabel}</span>
           <span style="opacity:.9;text-overflow:ellipsis;overflow:hidden;">${svc}</span>
           <span style="opacity:.75;text-overflow:ellipsis;overflow:hidden;">\u00b7 ${client}</span>
         </div>`
      : `<div style="font-size:10px;font-weight:700;letter-spacing:.3px;opacity:.9;margin-bottom:1px;">${timeLabel}</div>
         <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${svc}</div>
         <div style="opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${client}</div>
         ${heightPx >= 70 ? `<div style="opacity:.82;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${escapeHtml(staff)}</div>` : ''}`;

    pillsByDay[dayIdx].push(`
      <div data-sched-booking="${b.id}" title="${tooltip}"
        style="position:absolute;left:4px;right:4px;top:${topPx}px;height:${heightPx}px;background:${color};color:#fff;border-radius:6px;padding:4px 7px;font-size:11px;line-height:1.25;box-shadow:0 1px 2px rgba(0,0,0,.18), inset 3px 0 0 rgba(255,255,255,.22);overflow:hidden;cursor:pointer;transition:transform .08s ease, box-shadow .08s ease;"
        onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 3px 8px rgba(0,0,0,.25), inset 3px 0 0 rgba(255,255,255,.3)';"
        onmouseout="this.style.transform='';this.style.boxShadow='0 1px 2px rgba(0,0,0,.18), inset 3px 0 0 rgba(255,255,255,.22)';">
        ${body}
      </div>
    `);
  }

  const activeFacilitators = facilitators.filter(f => f.is_active);
  const staffOptions = [
    `<option value="all">All staff/facilitators</option>`,
    `<option value="unassigned">Unassigned</option>`,
    ...activeFacilitators.map(f => {
      const n = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || '\u2014';
      const sel = scheduleStaffFilter === f.id ? 'selected' : '';
      return `<option value="${f.id}" ${sel}>${escapeHtml(n)}</option>`;
    }),
  ].join('');

  const dayHeader = days.map((d, i) => {
    const isToday = d.getTime() === today.getTime();
    const isWeekend = i === 5 || i === 6;
    return `<div style="padding:10px 0 12px;text-align:center;background:${isToday ? 'linear-gradient(180deg,#fff5e0 0%, #fff8ec 100%)' : 'transparent'};border-bottom:${isToday ? '2px solid #d4883a' : '1px solid var(--border-color,#eee)'};">
      <div style="font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:${isToday ? '#b4691f' : isWeekend ? 'var(--text-muted,#999)' : 'var(--text-muted,#666)'};">${dayLabels[i]}</div>
      <div style="display:inline-flex;align-items:center;justify-content:center;margin-top:4px;width:28px;height:28px;border-radius:50%;font-size:15px;font-weight:${isToday ? '700' : '500'};color:${isToday ? '#fff' : 'var(--text,#222)'};background:${isToday ? '#d4883a' : 'transparent'};">
        ${d.getDate()}
      </div>
    </div>`;
  }).join('');

  // "Now" indicator line when today is visible and within grid hours
  let nowLineHtml = '';
  if (todayIdx >= 0) {
    const nowMin = (now.getHours() - SCHEDULE_START_HOUR) * 60 + now.getMinutes();
    if (nowMin >= 0 && nowMin <= (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60) {
      const nowTop = (nowMin / 30) * SCHEDULE_CELL_PX;
      nowLineHtml = `
        <div style="position:absolute;top:${nowTop}px;left:0;right:0;z-index:5;pointer-events:none;">
          <div style="position:absolute;left:0;top:-5px;width:10px;height:10px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 2px #fff;"></div>
          <div style="height:2px;background:#dc2626;opacity:.85;"></div>
        </div>`;
    }
  }

  const hourLabel = (h) => `
    <div style="height:${SCHEDULE_CELL_PX * 2}px;display:flex;align-items:flex-start;justify-content:flex-end;padding:2px 8px 0 0;font-size:11px;font-weight:600;color:var(--text-muted,#888);letter-spacing:.3px;">
      ${formatHourLabel(h)}
    </div>`;

  const dayColumn = (dayIdx) => {
    const isToday = dayIdx === todayIdx;
    const isWeekend = dayIdx === 5 || dayIdx === 6;
    const bg = isToday ? '#fffbf2' : (isWeekend ? '#fafafa' : '#fff');
    return `
      <div data-empty-slot-day="${dayIdx}" style="position:relative;height:${gridHeight}px;border-left:1px solid var(--border-color,#eee);background:${bg};cursor:cell;">
        ${hours.map(() => `
          <div style="height:${SCHEDULE_CELL_PX}px;border-bottom:1px dashed var(--border-color,#f0f0f0);"></div>
          <div style="height:${SCHEDULE_CELL_PX}px;border-bottom:1px solid var(--border-color,#eee);"></div>
        `).join('')}
        ${isToday ? nowLineHtml : ''}
        ${pillsByDay[dayIdx].join('')}
      </div>`;
  };

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        <h2 style="margin:0;font-size:20px;font-weight:700;color:var(--text,#222);">${formatWeekRange(scheduleWeekStart)}</h2>
        <div style="display:inline-flex;border:1px solid var(--border-color,#e5e5e5);border-radius:6px;overflow:hidden;background:#fff;">
          <button class="crm-btn crm-btn-sm" id="sched-prev" style="border:none;border-radius:0;padding:4px 10px;" title="Previous week">&laquo;</button>
          <button class="crm-btn crm-btn-sm" id="sched-today" style="border:none;border-left:1px solid var(--border-color,#e5e5e5);border-right:1px solid var(--border-color,#e5e5e5);border-radius:0;padding:4px 12px;font-weight:600;">Today</button>
          <button class="crm-btn crm-btn-sm" id="sched-next" style="border:none;border-radius:0;padding:4px 10px;" title="Next week">&raquo;</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:12px;color:var(--text-muted,#888);font-weight:500;">
          ${filtered.length} booking${filtered.length === 1 ? '' : 's'}
        </span>
        <select class="crm-select" id="sched-staff-filter">${staffOptions}</select>
        <button class="crm-btn crm-btn-sm crm-btn-primary" id="sched-new-booking">+ Book session</button>
      </div>
    </div>

    <div style="border:1px solid var(--border-color,#e5e5e5);border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04);">
      <div style="display:grid;grid-template-columns:60px repeat(7, 1fr);background:var(--bg,#faf9f6);">
        <div style="border-bottom:1px solid var(--border-color,#eee);"></div>
        ${dayHeader}
      </div>
      <div style="display:grid;grid-template-columns:60px repeat(7, 1fr);">
        <div style="border-right:1px solid var(--border-color,#eee);background:#fafafa;">
          ${hours.map(h => hourLabel(h)).join('')}
        </div>
        ${[0,1,2,3,4,5,6].map(i => dayColumn(i)).join('')}
      </div>
    </div>

    ${filtered.length === 0 ? `
      <div style="margin-top:16px;padding:18px 20px;background:var(--bg,#faf9f6);border:1px dashed var(--border-color,#e5e5e5);border-radius:10px;font-size:13px;color:var(--text-muted,#666);text-align:center;">
        <div style="font-size:14px;font-weight:600;color:var(--text,#444);margin-bottom:2px;">No bookings this week${scheduleStaffFilter !== 'all' ? ' for the selected filter' : ''}.</div>
        Open a client and click an unscheduled session pill to book.
      </div>
    ` : ''}
  `;

  // Auto-scroll so the current hour (or 8am) is visible near the top
  if (todayIdx >= 0) {
    const scrollTarget = panel.querySelector('[data-sched-booking]') || panel;
    // no-op; pill hover handles focus. Kept as a hook for future scroll-into-view.
  }
}

function openBookingDetail(bookingId) {
  const b = scheduleBookings.find(x => x.id === bookingId);
  if (!b) { showToast('Booking not found', 'error'); return; }

  const svc = services.find(s => s.id === b.service_id);
  const svcName = svc?.name || 'Session';
  const durationMin = svc?.duration_minutes || Math.round((new Date(b.end_datetime) - new Date(b.start_datetime)) / 60000);
  const isClassBooking = !!svc?.is_group_class;

  const start = new Date(b.start_datetime);
  const end = new Date(b.end_datetime);
  const dateLabel = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} \u2013 ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  const staff = getAssigneeName(b) || 'Unassigned';
  const client = b.lead_id ? clients.find(c => c.id === b.lead_id) : null;
  const clientName = client
    ? `${client.first_name || ''} ${client.last_name || ''}`.trim() || b.booker_name || 'Client'
    : (b.booker_name || 'Client');
  const clientContact = client
    ? [client.email, client.phone].filter(Boolean).join(' \u00b7 ')
    : [b.booker_email, b.booker_phone].filter(Boolean).join(' \u00b7 ');

  const attendeeRows = (b.attendees || []).map(a => {
    const c = clients.find(x => x.id === a.lead_id);
    const n = c ? (`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Client') : 'Client';
    return { id: a.lead_id, name: n };
  });

  const space = b.space_id ? sessionSpaces.find(s => s.id === b.space_id) : null;
  const spaceLabel = space?.name || (b.space_id ? 'Assigned room' : '\u2014');

  const statusLabel = b.status || 'scheduled';
  const color = serviceColor(b.service_id);

  const row = (label, value) => `
    <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color,#eee);">
      <div style="font-size:12px;font-weight:600;color:var(--text-muted,#888);text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(label)}</div>
      <div style="font-size:14px;">${value}</div>
    </div>
  `;

  const openClientBtn = !isClassBooking && b.lead_id
    ? `<button class="crm-btn" id="btn-booking-open-client">Open client</button>`
    : '';

  // Only offer cancel/reschedule if the booking is still active (not already cancelled).
  const isActive = !b.cancelled_at && b.status !== 'cancelled';
  const hasPackageSession = !!b.package_session_id;
  const cancelLabel = isClassBooking ? 'Cancel class' : 'Cancel session';
  const actionBtns = isActive
    ? `
      <button class="crm-btn" id="btn-booking-cancel" style="color:#b91c1c;border-color:#fca5a5;">${cancelLabel}</button>
      ${hasPackageSession && !isClassBooking ? `<button class="crm-btn crm-btn-primary" id="btn-booking-reschedule">Reschedule</button>` : ''}
    `
    : '';

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header" style="border-left:4px solid ${color};">
          <h2>${escapeHtml(svcName)}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          ${row('When', `${escapeHtml(dateLabel)}<div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">${escapeHtml(timeLabel)} &middot; ${durationMin} min</div>`)}
          ${isClassBooking
            ? row('Attendees', attendeeRows.length
                ? attendeeRows.map(a => `<div data-attendee-open="${a.id}" style="font-size:13px;padding:2px 0;cursor:pointer;color:var(--accent,#2563eb);">${escapeHtml(a.name)}</div>`).join('')
                : '<span style="color:var(--text-muted,#888);">No attendees</span>')
            : row('Client', `<div>${escapeHtml(clientName)}</div>${clientContact ? `<div style="font-size:12px;color:var(--text-muted,#666);margin-top:2px;">${escapeHtml(clientContact)}</div>` : ''}`)}
          ${row('Staff', escapeHtml(staff))}
          ${row('Room', escapeHtml(spaceLabel))}
          ${row('Status', `<span style="text-transform:capitalize;">${escapeHtml(statusLabel)}</span>`)}
          ${b.notes ? row('Notes', escapeHtml(b.notes)) : ''}
        </div>
        <div class="crm-modal-footer">
          <span></span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="crm-btn" id="btn-booking-close">Close</button>
            ${openClientBtn}
            ${actionBtns}
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  const close = () => { modal.style.display = 'none'; modal.innerHTML = ''; };
  document.getElementById('clients-modal-close-btn').addEventListener('click', close);
  document.getElementById('btn-booking-close').addEventListener('click', close);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') close();
  });
  if (!isClassBooking && b.lead_id) {
    document.getElementById('btn-booking-open-client').addEventListener('click', () => {
      close();
      openClientDetail(b.lead_id);
    });
  }
  if (isClassBooking) {
    modal.querySelectorAll('[data-attendee-open]').forEach(el => {
      el.addEventListener('click', () => {
        const leadId = el.dataset.attendeeOpen;
        close();
        openClientDetail(leadId);
      });
    });
  }
  if (isActive) {
    document.getElementById('btn-booking-cancel').addEventListener('click', () => cancelBooking(b.id, { reschedule: false }));
    if (hasPackageSession && !isClassBooking) {
      document.getElementById('btn-booking-reschedule').addEventListener('click', () => cancelBooking(b.id, { reschedule: true }));
    }
  }
}

// Cancel a booking and (optionally) immediately re-open the schedule modal for the
// underlying package session so the admin can pick a new time without losing the
// session credit. Frees the session back to 'unscheduled' so it counts as remaining.
async function cancelBooking(bookingId, { reschedule = false } = {}) {
  const booking = scheduleBookings.find(x => x.id === bookingId);
  if (!booking) { showToast('Booking not found', 'error'); return; }

  const svc = services.find(s => s.id === booking.service_id);
  const isClassBooking = !!svc?.is_group_class;

  const confirmMsg = isClassBooking
    ? 'Cancel this class? Every attendee gets their session credit back.'
    : 'Cancel this session? The session credit will go back to the client\u2019s remaining balance.';
  if (!reschedule && !confirm(confirmMsg)) return;

  // 1) Mark the booking cancelled. `cancelled_at IS NULL` is how the schedule
  //    grid filters, so this is enough to hide it from the week view.
  const nowIso = new Date().toISOString();
  const { error: bErr } = await supabase.from('scheduling_bookings')
    .update({ cancelled_at: nowIso, status: 'cancelled' })
    .eq('id', bookingId);
  if (bErr) {
    console.error('cancel booking error:', bErr);
    showToast('Failed to cancel: ' + bErr.message, 'error');
    return;
  }

  // 2) Collect every package_session_id that this booking held — the 1:1 slot
  //    lives on the booking itself, class slots live on the attendee rows.
  const sessionIds = [];
  if (booking.package_session_id) sessionIds.push(booking.package_session_id);
  for (const a of booking.attendees || []) {
    if (a.package_session_id) sessionIds.push(a.package_session_id);
  }

  if (sessionIds.length) {
    const { error: sErr } = await supabase.from('client_package_sessions')
      .update({ status: 'unscheduled', booking_id: null, scheduled_at: null })
      .in('id', sessionIds);
    if (sErr) {
      console.error('free sessions error:', sErr);
      showToast('Cancelled, but failed to release some session credits.', 'error');
    }
  }

  // Flip attendee rows themselves to cancelled so they don't reappear in
  // roster reads if the booking row ever gets reactivated.
  if (isClassBooking) {
    await supabase.from('scheduling_booking_attendees')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('booking_id', bookingId);
  }

  showToast(reschedule ? 'Pick a new time' : (isClassBooking ? 'Class cancelled' : 'Session cancelled'), 'success');
  await loadClientsData();
  await loadScheduleWeek();

  const rescheduleSessionId = booking.package_session_id || null;
  if (reschedule && rescheduleSessionId && !isClassBooking) {
    openScheduleSessionModal(rescheduleSessionId);
  } else {
    // Close the modal
    const modal = document.getElementById('clients-modal');
    if (modal) { modal.style.display = 'none'; modal.innerHTML = ''; }
  }
}

// ---------- House tab (Phase 6, live) ----------
// Three view modes share the same data shape (stays + beds + rooms):
//   night \u2014 single-night room cards (the original layout)
//   week  \u2014 7-day grid: beds as rows, days as columns, cells show client name
//   month \u2014 calendar grid: each day shows occupancy ratio + heat color, click to drill into Night view

function houseClientName(leadId) {
  const c = clients.find(x => x.id === leadId);
  if (!c) return 'Client';
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client';
}

function houseRoomsSorted() {
  return [...lodgingSpaces].sort((a, b) => {
    const fa = a.floor === 'downstairs' ? 0 : 1;
    const fb = b.floor === 'downstairs' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function houseOccupancyForBedOnDate(bedId, dateObj) {
  return stays.find(s =>
    s.bed_id === bedId &&
    s.status !== 'cancelled' &&
    new Date(s.check_in_at) <= dateObj &&
    new Date(s.check_out_at) > dateObj
  );
}

function houseStartOfWeek(dateStr) {
  // Monday as week start, matching the Schedule grid convention.
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function renderHousePanel() {
  const panel = document.getElementById('clients-panel-house');
  if (!panel) return;

  const rooms = houseRoomsSorted();
  if (rooms.length === 0) {
    panel.innerHTML = `${renderHouseToolbar({ totalBeds: 0, occupiedBeds: 0, label: '' })}
      <div style="padding:36px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">No lodging rooms configured.</div>`;
    return;
  }

  if (houseViewMode === 'week')  return renderHouseWeekView(panel, rooms);
  if (houseViewMode === 'month') return renderHouseMonthView(panel, rooms);
  return renderHouseNightView(panel, rooms);
}

// Toolbar shared across all three modes \u2014 view toggle, date controls, summary.
function renderHouseToolbar({ totalBeds, occupiedBeds, label }) {
  const tab = (mode, text) => {
    const active = houseViewMode === mode;
    return `<button class="crm-btn crm-btn-sm" data-house-mode="${mode}" style="${active ? 'background:var(--accent,#c9943e);color:#fff;border-color:var(--accent,#c9943e);' : ''}">${text}</button>`;
  };

  const dateOrLabel = houseViewMode === 'night'
    ? `<input type="date" class="crm-input" id="house-date" value="${escapeHtml(houseSelectedDate)}">`
    : `<span style="font-size:13px;font-weight:600;color:var(--text,#2a1f23);min-width:180px;">${escapeHtml(label)}</span>`;

  return `
    <div class="crm-pipeline-toolbar" style="flex-wrap:wrap;gap:8px;">
      <div style="display:inline-flex;gap:2px;background:var(--bg,#faf9f6);border:1px solid var(--border-color,#eee);border-radius:8px;padding:2px;">
        ${tab('night', 'Night')}${tab('week', 'Week')}${tab('month', 'Month')}
      </div>
      ${dateOrLabel}
      <button class="crm-btn crm-btn-sm" id="house-today">Today</button>
      <button class="crm-btn crm-btn-sm" id="house-prev">&laquo;</button>
      <button class="crm-btn crm-btn-sm" id="house-next">&raquo;</button>
      ${houseViewMode === 'night' ? `<button class="crm-btn crm-btn-sm" id="house-weekly-email" title="Phase 7 \u2014 coming soon">Send weekly summary</button>` : ''}
      <span style="margin-left:auto;font-size:13px;color:var(--text,#2a1f23);font-weight:600;">
        ${occupiedBeds} / ${totalBeds} ${houseViewMode === 'night' ? 'beds occupied' : 'bed-nights booked'}
      </span>
    </div>
  `;
}

// ---- Night view (original layout) ----
function renderHouseNightView(panel, rooms) {
  const d = new Date(houseSelectedDate + 'T12:00:00');
  const occupancyFor = (bedId) => houseOccupancyForBedOnDate(bedId, d);

  let totalBeds = 0, occupiedBeds = 0;
  rooms.forEach(sp => {
    const roomBeds = beds.filter(b => b.space_id === sp.id);
    totalBeds += roomBeds.length;
    occupiedBeds += roomBeds.filter(b => occupancyFor(b.id)).length;
  });

  const roomCard = (sp) => {
    const roomBeds = beds.filter(b => b.space_id === sp.id).sort((a, b) => a.sort_order - b.sort_order);
    const bathBadge = sp.has_private_bath
      ? '<span style="font-size:10px;color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:999px;font-weight:600;">Private bath</span>'
      : '<span style="font-size:10px;color:var(--text-muted,#888);background:var(--bg,#faf9f6);padding:1px 6px;border-radius:999px;">Shared bath</span>';
    return `
      <div style="border:1px solid var(--border-color,#eee);border-radius:10px;padding:14px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--text,#2a1f23);">${escapeHtml(sp.name)}</div>
            <div style="font-size:11px;color:var(--text-muted,#888);text-transform:capitalize;">${escapeHtml(sp.floor || '')}</div>
          </div>
          ${bathBadge}
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${roomBeds.map(b => {
            const occ = occupancyFor(b.id);
            const name = occ ? houseClientName(occ.lead_id) : null;
            return `
              <div class="${occ ? 'clients-bed-row' : ''}" ${occ ? `data-client-id="${occ.lead_id}" style="cursor:pointer;"` : ''}>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${occ ? '#dcfce7' : 'var(--bg,#faf9f6)'};border-left:${occ ? '3px solid #16a34a' : 'none'};border-radius:6px;font-size:12px;">
                  <span style="color:${occ ? '#14532d' : 'var(--text-muted,#666)'};">${escapeHtml(b.label)}</span>
                  <span style="font-weight:${occ ? '700' : '400'};color:${occ ? '#14532d' : 'var(--text-muted,#aaa)'};">${name ? escapeHtml(name) : 'available'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  panel.innerHTML = `
    ${renderHouseToolbar({ totalBeds, occupiedBeds, label: '' })}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">${rooms.map(roomCard).join('')}</div>
  `;
}

// ---- Week view ----
// Beds in rows, 7 days as columns. Cells show client name when occupied.
function renderHouseWeekView(panel, rooms) {
  const start = houseStartOfWeek(houseSelectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const label = `Week of ${startLabel} \u2013 ${endLabel}`;

  // Bed-night totals for the summary stat.
  let totalBedNights = 0, occupiedBedNights = 0;
  rooms.forEach(sp => {
    const roomBeds = beds.filter(b => b.space_id === sp.id);
    days.forEach(d => {
      totalBedNights += roomBeds.length;
      occupiedBedNights += roomBeds.filter(b => houseOccupancyForBedOnDate(b.id, d)).length;
    });
  });

  // Render each room as a section with a sub-table of its beds.
  const roomBlock = (sp) => {
    const roomBeds = beds.filter(b => b.space_id === sp.id).sort((a, b) => a.sort_order - b.sort_order);
    const bathBadge = sp.has_private_bath
      ? '<span style="font-size:10px;color:#16a34a;background:#dcfce7;padding:1px 6px;border-radius:999px;font-weight:600;margin-left:8px;">Private bath</span>'
      : '<span style="font-size:10px;color:var(--text-muted,#888);background:var(--bg,#faf9f6);padding:1px 6px;border-radius:999px;margin-left:8px;">Shared bath</span>';
    const rows = roomBeds.map(b => {
      const cells = days.map(d => {
        const occ = houseOccupancyForBedOnDate(b.id, d);
        const name = occ ? houseClientName(occ.lead_id) : null;
        return `
          <td class="${occ ? 'clients-bed-row' : ''}" ${occ ? `data-client-id="${occ.lead_id}" style="cursor:pointer;"` : 'style="text-align:center;"'}>
            <div style="padding:6px 8px;background:${occ ? '#dcfce7' : 'var(--bg,#faf9f6)'};border-left:${occ ? '3px solid #16a34a' : 'none'};border-radius:6px;font-size:11px;font-weight:${occ ? '700' : '400'};color:${occ ? '#14532d' : 'var(--text-muted,#aaa)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:28px;display:flex;align-items:center;justify-content:${occ ? 'flex-start' : 'center'};">
              ${name ? escapeHtml(name) : '\u2014'}
            </div>
          </td>
        `;
      }).join('');
      return `<tr><td style="padding:6px 12px 6px 0;font-size:12px;color:var(--text-muted,#666);font-weight:500;white-space:nowrap;">${escapeHtml(b.label)}</td>${cells}</tr>`;
    }).join('');

    return `
      <div style="border:1px solid var(--border-color,#eee);border-radius:10px;padding:14px;background:#fff;margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;color:var(--text,#2a1f23);margin-bottom:10px;">
          ${escapeHtml(sp.name)} <span style="font-size:11px;color:var(--text-muted,#888);font-weight:400;text-transform:capitalize;">\u00b7 ${escapeHtml(sp.floor || '')}</span>${bathBadge}
        </div>
        <div style="overflow-x:auto;">
          <table style="border-collapse:separate;border-spacing:4px;width:100%;">
            <thead>
              <tr>
                <th style="text-align:left;padding:0 12px 8px 0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Bed</th>
                ${days.map(d => {
                  const isToday = d.toDateString() === new Date().toDateString();
                  return `<th style="text-align:center;padding:0 0 8px 0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:${isToday ? 'var(--accent,#c9943e)' : 'var(--text-muted,#888)'};">
                    ${d.toLocaleDateString('en-US', { weekday: 'short' })}<br>
                    <span style="font-size:13px;font-weight:700;color:${isToday ? 'var(--accent,#c9943e)' : 'var(--text,#2a1f23)'};">${d.getDate()}</span>
                  </th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  };

  panel.innerHTML = `
    ${renderHouseToolbar({ totalBeds: totalBedNights, occupiedBeds: occupiedBedNights, label })}
    ${rooms.map(roomBlock).join('')}
  `;
}

// ---- Month view ----
// Calendar grid with one cell per day. Each cell shows occupancy ratio and a
// warm tint scaled by occupancy %. Click a day to drill into Night view.
function renderHouseMonthView(panel, rooms) {
  const selected = new Date(houseSelectedDate + 'T12:00:00');
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const label = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Pad to start on Sunday and end on Saturday so the grid is a clean rectangle.
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const totalBeds = rooms.reduce((acc, sp) => acc + beds.filter(b => b.space_id === sp.id).length, 0);
  const cells = [];
  let monthOccupied = 0, monthTotal = 0;

  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const inMonth = date.getMonth() === selected.getMonth();
    const occCount = beds.filter(b => houseOccupancyForBedOnDate(b.id, date)).length;
    const ratio = totalBeds ? occCount / totalBeds : 0;
    if (inMonth) { monthOccupied += occCount; monthTotal += totalBeds; }

    const isToday = date.toDateString() === new Date().toDateString();
    const isSelected = date.toISOString().slice(0, 10) === houseSelectedDate;
    const dateIso = date.toISOString().slice(0, 10);

    // Warm-tint heatmap: 0% = bg, 100% = #c9943e at 0.4 alpha
    const tint = inMonth && occCount > 0 ? `rgba(201,148,62,${0.08 + ratio * 0.32})` : 'transparent';

    cells.push(`
      <button class="house-month-cell" data-house-day="${dateIso}" style="
        position:relative;
        min-height:88px;
        padding:8px 10px;
        border:1px solid ${isSelected ? 'var(--accent,#c9943e)' : 'var(--border-color,#eee)'};
        border-radius:8px;
        background:${tint};
        text-align:left;
        font:inherit;
        cursor:pointer;
        opacity:${inMonth ? '1' : '0.35'};
      ">
        <div style="font-size:14px;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--accent,#c9943e)' : 'var(--text,#2a1f23)'};margin-bottom:6px;">
          ${date.getDate()}
        </div>
        <div style="font-size:11px;color:${occCount === 0 ? 'var(--text-muted,#aaa)' : 'var(--text,#2a1f23)'};font-weight:${occCount > 0 ? '600' : '400'};">
          ${inMonth ? `${occCount}/${totalBeds} beds` : ''}
        </div>
      </button>
    `);
  }

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  panel.innerHTML = `
    ${renderHouseToolbar({ totalBeds: monthTotal, occupiedBeds: monthOccupied, label })}
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;">
      ${dayHeaders.map(h => `<div style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">${h}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">${cells.join('')}</div>
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
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${visible.map(s => `
              <tr class="clients-service-row" data-service-id="${s.id}" style="cursor:pointer;">
                <td>
                  <strong>${escapeHtml(s.name)}</strong>
                  ${s.is_group_class ? `<span style="margin-left:6px;display:inline-block;padding:1px 6px;border-radius:10px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;">Class${s.max_capacity ? ` · ${s.max_capacity}` : ''}</span>` : ''}
                  ${s.description ? `<div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${escapeHtml(s.description)}</div>` : ''}
                </td>
                <td><code style="font-size:12px;color:var(--text-muted,#888);">${escapeHtml(s.slug)}</code></td>
                <td>${s.duration_minutes} min</td>
                <td>${formatPriceCents(s.default_price_cents)}</td>
                <td>${s.requires_upfront_payment ? 'Yes' : 'No'}</td>
                <td>${s.is_active ? '<span style="color:#16a34a;">Active</span>' : '<span style="color:var(--text-muted,#888);">Inactive</span>'}</td>
                <td><button class="crm-btn crm-btn-xs" data-edit-service="${s.id}">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  html += renderPackagesSection();
  html += renderFacilitatorsSection();

  panel.innerHTML = html;
}

function renderPackagesSection() {
  const visible = showInactivePackages ? allServicePackages : allServicePackages.filter(p => p.is_active);
  const svcById = new Map(services.map(s => [s.id, s]));

  let html = `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border,#333);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin:0;font-size:16px;">Packages</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted,#888);">
            <input type="checkbox" id="toggle-show-inactive-packages" ${showInactivePackages ? 'checked' : ''}> Show inactive
          </label>
          <button class="crm-btn crm-btn-primary" id="btn-new-package-template">+ New Package</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:12px;">
        Master package catalog. Selecting a package on a client auto-populates the included sessions.
      </div>
  `;

  if (visible.length === 0) {
    html += `
      <div style="padding:28px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">
        No packages yet. Click "+ New Package" to add one.
      </div>
    </div>`;
    return html;
  }

  // Group by category for visual structure. "Retreats / Immersives" derived
  // from the name (6D/5N pattern); explicit category column drives the rest.
  const CATEGORY_ORDER = [
    { key: 'retreats',    label: 'Retreats / Immersives' },
    { key: 'integration', label: 'Integration Packages' },
    { key: 'overnight',   label: 'Overnight Stays' },
    { key: 'other',       label: 'Packages' },
  ];
  const groupOf = (p) => {
    if (parseRetreatDuration(p.name)) return 'retreats';
    if (p.category === 'integration') return 'integration';
    if (p.category === 'overnight')   return 'overnight';
    return 'other';
  };
  const grouped = new Map(CATEGORY_ORDER.map(g => [g.key, []]));
  visible.forEach(p => grouped.get(groupOf(p)).push(p));

  const renderRow = (p) => {
    const items = packageItemsByPkgId.get(p.id) || [];
    const chips = items.map(it => {
      const svc = svcById.get(it.service_id);
      if (!svc) return '';
      const qty = it.quantity > 1 ? `${it.quantity}&times; ` : '';
      return `<span style="display:inline-block;padding:2px 10px;margin:1px 3px 1px 0;background:#f3ece0;color:#6b4a1f;border:1px solid #e6d9c2;border-radius:999px;font-size:11px;font-weight:500;">${qty}${escapeHtml(svc.name)}</span>`;
    }).filter(Boolean).join('');
    const priceDisplay = p.price_regular ? `$${Number(p.price_regular).toLocaleString()}` : '—';
    return `
      <tr class="clients-package-row" data-package-id="${p.id}" style="cursor:pointer;">
        <td><strong>${escapeHtml(p.name)}</strong>${p.description ? `<div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">${escapeHtml(p.description)}</div>` : ''}</td>
        <td>${priceDisplay}</td>
        <td style="max-width:420px;">${chips || '<span style="color:var(--text-muted,#888);">—</span>'}</td>
        <td>${p.is_active ? '<span style="color:#16a34a;">Active</span>' : '<span style="color:var(--text-muted,#888);">Inactive</span>'}</td>
        <td><button class="crm-btn crm-btn-xs" data-edit-package="${p.id}">Edit</button></td>
      </tr>
    `;
  };

  html += CATEGORY_ORDER.map(g => {
    const rows = grouped.get(g.key) || [];
    if (!rows.length) return '';
    return `
      <div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#666);margin-bottom:6px;">${escapeHtml(g.label)}</div>
        <div class="crm-table-wrap">
          <table class="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Includes</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows.map(renderRow).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  html += `</div>`;
  return html;
}

function openPackageTemplateModal(pkg = null) {
  const isEdit = !!pkg;
  const existingItems = isEdit ? (packageItemsByPkgId.get(pkg.id) || []) : [];
  const qtyByServiceId = new Map(existingItems.map(it => [it.service_id, it.quantity]));
  const activeServices = services.filter(s => s.is_active);

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Package' : 'New Package'}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>Name *</label>
              <input type="text" class="crm-input" id="pkgt-name" value="${escapeHtml(pkg?.name || '')}" required>
            </div>
            <div class="crm-form-field">
              <label>Slug *</label>
              <input type="text" class="crm-input" id="pkgt-slug" value="${escapeHtml(pkg?.slug || '')}" placeholder="residential_6d_private" required>
            </div>
            <div class="crm-form-field">
              <label>Price ($)</label>
              <input type="number" class="crm-input" id="pkgt-price" value="${pkg?.price_regular != null ? Number(pkg.price_regular) : 0}" step="0.01" min="0">
            </div>
            <div class="crm-form-field">
              <label>Promo price ($)</label>
              <input type="number" class="crm-input" id="pkgt-promo" value="${pkg?.price_promo != null ? Number(pkg.price_promo) : ''}" step="0.01" min="0" placeholder="optional">
            </div>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Description</label>
            <textarea class="crm-textarea" id="pkgt-desc" rows="2">${escapeHtml(pkg?.description || '')}</textarea>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Category</label>
            <select class="crm-select" id="pkgt-category">
              <option value="" ${!pkg?.category ? 'selected' : ''}>Auto (Retreats / Packages)</option>
              <option value="integration" ${pkg?.category === 'integration' ? 'selected' : ''}>Integration Packages</option>
              <option value="overnight" ${pkg?.category === 'overnight' ? 'selected' : ''}>Overnight Stays</option>
            </select>
            <div style="font-size:11px;color:var(--text-muted,#888);margin-top:4px;">Drives the optgroup label in the package picker and the section header in the catalog list.</div>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;">
              <input type="checkbox" id="pkgt-active" ${pkg ? (pkg.is_active ? 'checked' : '') : 'checked'}> Active
            </label>
          </div>

          <div style="margin-top:16px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Included services</label>
            <div style="font-size:11px;color:var(--text-muted,#888);margin-bottom:8px;">
              Set the quantity of each service this package includes. 0 means not included.
            </div>
            ${activeServices.length === 0
              ? `<div style="font-size:12px;color:var(--text-muted,#888);">No active services. Add one above first.</div>`
              : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
                  ${activeServices.map(s => {
                    const qty = qtyByServiceId.get(s.id) || 0;
                    return `
                      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:#fff;">
                        <div style="flex:1;min-width:0;">
                          <div style="font-size:13px;color:var(--text,#444);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.name)}</div>
                          <div style="font-size:11px;color:var(--text-muted,#888);">${s.duration_minutes} min</div>
                        </div>
                        <input type="number" class="crm-input pkgt-item-qty" data-service-id="${s.id}" value="${qty}" min="0" max="50" style="width:64px;">
                      </div>
                    `;
                  }).join('')}
                </div>`
            }
          </div>
        </div>
        <div class="crm-modal-footer">
          ${isEdit ? '<button class="crm-btn crm-btn-danger" id="btn-delete-package-template">Delete</button>' : '<span></span>'}
          <div>
            <button class="crm-btn" id="btn-cancel-package-template">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-package-template">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-package-template').addEventListener('click', closeModal);
  document.getElementById('btn-save-package-template').addEventListener('click', () => savePackageTemplate(pkg));
  if (isEdit) {
    document.getElementById('btn-delete-package-template').addEventListener('click', () => deletePackageTemplate(pkg));
  }
}

async function savePackageTemplate(existing) {
  const name = document.getElementById('pkgt-name').value.trim();
  const slug = document.getElementById('pkgt-slug').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  if (!slug) { showToast('Slug is required', 'error'); return; }

  const priceRaw = document.getElementById('pkgt-price').value;
  const promoRaw = document.getElementById('pkgt-promo').value;

  const payload = {
    name,
    slug,
    price_regular: priceRaw === '' ? 0 : Number(priceRaw),
    price_promo: promoRaw === '' ? null : Number(promoRaw),
    description: document.getElementById('pkgt-desc').value.trim() || null,
    is_active: document.getElementById('pkgt-active').checked,
    category: document.getElementById('pkgt-category')?.value || null,
    business_line: 'within',
  };

  let packageId;
  if (existing) {
    const { error } = await supabase.from('crm_service_packages').update(payload).eq('id', existing.id);
    if (error) { console.error(error); showToast(error.message || 'Failed to save', 'error'); return; }
    packageId = existing.id;
  } else {
    const { data, error } = await supabase.from('crm_service_packages').insert(payload).select().single();
    if (error) { console.error(error); showToast(error.message || 'Failed to save', 'error'); return; }
    packageId = data.id;
  }

  // Sync package items: delete all, re-insert with qty > 0
  const delRes = await supabase.from('crm_service_package_items').delete().eq('package_id', packageId);
  if (delRes.error) { console.error(delRes.error); showToast('Saved, but failed to update items', 'error'); }

  const itemRows = [];
  let sortIdx = 10;
  document.querySelectorAll('.pkgt-item-qty').forEach(input => {
    const qty = parseInt(input.value, 10) || 0;
    if (qty > 0) {
      itemRows.push({ package_id: packageId, service_id: input.dataset.serviceId, quantity: qty, sort_order: sortIdx });
      sortIdx += 10;
    }
  });
  if (itemRows.length > 0) {
    const insRes = await supabase.from('crm_service_package_items').insert(itemRows);
    if (insRes.error) { console.error(insRes.error); showToast('Saved, but failed to set items', 'error'); }
  }

  showToast(`Package ${existing ? 'updated' : 'created'}`, 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
}

async function deletePackageTemplate(pkg) {
  if (!pkg) return;
  const confirmed = confirm(`Delete package "${pkg.name}"? This cannot be undone.\n\nIf you want to keep it around, mark it inactive instead.`);
  if (!confirmed) return;

  const { error } = await supabase.from('crm_service_packages').delete().eq('id', pkg.id);
  if (error) { console.error(error); showToast(error.message || 'Failed to delete', 'error'); return; }

  showToast('Package deleted', 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
}

function renderFacilitatorsSection() {
  const visible = showInactiveFacilitators ? facilitators : facilitators.filter(f => f.is_active);
  const svcById = new Map(services.map(s => [s.id, s]));

  let html = `
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border,#333);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin:0;font-size:16px;">Facilitators</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted,#888);">
            <input type="checkbox" id="toggle-show-inactive-facilitators" ${showInactiveFacilitators ? 'checked' : ''}> Show inactive
          </label>
          <button class="crm-btn crm-btn-primary" id="btn-new-facilitator">+ Add Facilitator</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:12px;">
        External practitioners who deliver sessions (massage, astrology, sound journey, etc.).
      </div>
  `;

  if (visible.length === 0) {
    html += `
      <div style="padding:28px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">
        No facilitators yet. Click "+ Add Facilitator" to add one.
      </div>
    </div>`;
    return html;
  }

  html += `
    <div class="crm-table-wrap">
      <table class="crm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Services</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(f => {
            const svcIds = facilitatorServicesByFacId.get(f.id) || new Set();
            const svcNames = [...svcIds].map(id => svcById.get(id)?.name).filter(Boolean);
            const fullName = [f.first_name, f.last_name].filter(Boolean).join(' ');
            return `
              <tr class="clients-facilitator-row" data-facilitator-id="${f.id}" style="cursor:pointer;">
                <td><strong>${escapeHtml(fullName)}</strong></td>
                <td>${f.email ? `<a href="mailto:${escapeHtml(f.email)}" onclick="event.stopPropagation();">${escapeHtml(f.email)}</a>` : '<span style="color:var(--text-muted,#888);">—</span>'}</td>
                <td>${f.phone ? escapeHtml(f.phone) : '<span style="color:var(--text-muted,#888);">—</span>'}</td>
                <td style="max-width:320px;">${svcNames.length ? svcNames.map(n => `<span style="display:inline-block;padding:2px 10px;margin:1px 3px 1px 0;background:#f3ece0;color:#6b4a1f;border:1px solid #e6d9c2;border-radius:999px;font-size:11px;font-weight:500;">${escapeHtml(n)}</span>`).join('') : '<span style="color:var(--text-muted,#888);">—</span>'}</td>
                <td>${f.is_active ? '<span style="color:#16a34a;">Active</span>' : '<span style="color:var(--text-muted,#888);">Inactive</span>'}</td>
                <td><button class="crm-btn crm-btn-xs" data-edit-facilitator="${f.id}">Edit</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    </div>
  `;
  return html;
}

function openFacilitatorModal(facilitator = null) {
  const isEdit = !!facilitator;
  const assignedIds = isEdit ? (facilitatorServicesByFacId.get(facilitator.id) || new Set()) : new Set();
  const activeServices = services.filter(s => s.is_active);

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content">
        <div class="crm-modal-header">
          <h2>${isEdit ? 'Edit Facilitator' : 'New Facilitator'}</h2>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body">
          <div class="crm-form-grid">
            <div class="crm-form-field">
              <label>First name *</label>
              <input type="text" class="crm-input" id="fac-first-name" value="${escapeHtml(facilitator?.first_name || '')}" required>
            </div>
            <div class="crm-form-field">
              <label>Last name</label>
              <input type="text" class="crm-input" id="fac-last-name" value="${escapeHtml(facilitator?.last_name || '')}">
            </div>
            <div class="crm-form-field">
              <label>Email</label>
              <input type="email" class="crm-input" id="fac-email" value="${escapeHtml(facilitator?.email || '')}">
            </div>
            <div class="crm-form-field">
              <label>Phone</label>
              <input type="tel" class="crm-input" id="fac-phone" value="${escapeHtml(facilitator?.phone || '')}">
            </div>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;">
              <input type="checkbox" id="fac-active" ${facilitator ? (facilitator.is_active ? 'checked' : '') : 'checked'}> Active
            </label>
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Notes</label>
            <textarea class="crm-textarea" id="fac-notes" rows="2">${escapeHtml(facilitator?.notes || '')}</textarea>
          </div>
          <div class="crm-form-field" style="margin-top:16px;">
            <label>Services this facilitator delivers</label>
            ${activeServices.length === 0
              ? `<div style="font-size:12px;color:var(--text-muted,#888);">No active services available.</div>`
              : `<div id="fac-services-pills" style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${activeServices.map(s => {
                    const on = assignedIds.has(s.id);
                    return `<button type="button" class="fac-service-pill" data-service-id="${s.id}" data-selected="${on ? '1' : '0'}"
                      style="padding:6px 12px;border-radius:999px;font-size:13px;cursor:pointer;transition:all .1s ease;border:1px solid ${on ? '#d4883a' : 'var(--border,#ddd)'};background:${on ? '#d4883a' : '#fff'};color:${on ? '#fff' : 'var(--text,#444)'};font-weight:${on ? '600' : '400'};">
                      ${escapeHtml(s.name)}
                    </button>`;
                  }).join('')}
                </div>
                <div style="font-size:11px;color:var(--text-muted,#888);margin-top:6px;">Click a service to toggle.</div>`
            }
          </div>
        </div>
        <div class="crm-modal-footer">
          ${isEdit ? '<button class="crm-btn crm-btn-danger" id="btn-delete-facilitator">Delete</button>' : '<span></span>'}
          <div>
            <button class="crm-btn" id="btn-cancel-facilitator">Cancel</button>
            <button class="crm-btn crm-btn-primary" id="btn-save-facilitator">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModal();
  });
  document.getElementById('btn-cancel-facilitator').addEventListener('click', closeModal);
  document.getElementById('btn-save-facilitator').addEventListener('click', () => saveFacilitator(facilitator));
  if (isEdit) {
    document.getElementById('btn-delete-facilitator').addEventListener('click', () => deleteFacilitator(facilitator));
  }

  const pillsWrap = document.getElementById('fac-services-pills');
  if (pillsWrap) {
    pillsWrap.addEventListener('click', (e) => {
      const pill = e.target.closest('.fac-service-pill');
      if (!pill) return;
      const on = pill.dataset.selected === '1';
      pill.dataset.selected = on ? '0' : '1';
      pill.style.background = on ? '#fff' : '#d4883a';
      pill.style.color = on ? 'var(--text,#444)' : '#fff';
      pill.style.borderColor = on ? 'var(--border,#ddd)' : '#d4883a';
      pill.style.fontWeight = on ? '400' : '600';
    });
  }
}

async function saveFacilitator(existing) {
  const firstName = document.getElementById('fac-first-name').value.trim();
  if (!firstName) { showToast('First name is required', 'error'); return; }

  const payload = {
    first_name: firstName,
    last_name: document.getElementById('fac-last-name').value.trim() || null,
    email: document.getElementById('fac-email').value.trim() || null,
    phone: document.getElementById('fac-phone').value.trim() || null,
    notes: document.getElementById('fac-notes').value.trim() || null,
    is_active: document.getElementById('fac-active').checked,
    updated_at: new Date().toISOString(),
  };

  const selectedSvcIds = [...document.querySelectorAll('.fac-service-pill[data-selected="1"]')].map(p => p.dataset.serviceId);

  let facilitatorId;
  if (existing) {
    const { error } = await supabase.from('facilitators').update(payload).eq('id', existing.id);
    if (error) { console.error(error); showToast(error.message || 'Failed to save', 'error'); return; }
    facilitatorId = existing.id;
  } else {
    const { data, error } = await supabase.from('facilitators').insert(payload).select().single();
    if (error) { console.error(error); showToast(error.message || 'Failed to save', 'error'); return; }
    facilitatorId = data.id;
  }

  // Sync junction rows: delete all, re-insert selected
  const delRes = await supabase.from('facilitator_services').delete().eq('facilitator_id', facilitatorId);
  if (delRes.error) { console.error(delRes.error); showToast('Saved, but failed to update services', 'error'); }

  if (selectedSvcIds.length > 0) {
    const junctionRows = selectedSvcIds.map(sid => ({ facilitator_id: facilitatorId, service_id: sid }));
    const insRes = await supabase.from('facilitator_services').insert(junctionRows);
    if (insRes.error) { console.error(insRes.error); showToast('Saved, but failed to assign services', 'error'); }
  }

  showToast(`Facilitator ${existing ? 'updated' : 'created'}`, 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
}

async function deleteFacilitator(facilitator) {
  if (!facilitator) return;
  const fullName = [facilitator.first_name, facilitator.last_name].filter(Boolean).join(' ');
  const confirmed = confirm(`Delete "${fullName}"? This cannot be undone.\n\nIf you want to keep history, mark them inactive instead.`);
  if (!confirmed) return;

  const { error } = await supabase.from('facilitators').delete().eq('id', facilitator.id);
  if (error) { console.error(error); showToast(error.message || 'Failed to delete', 'error'); return; }

  showToast('Facilitator deleted', 'success');
  closeModal();
  await loadAllData();
  renderServicesPanel();
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
          </div>
          <div style="display:flex;align-items:center;gap:20px;margin-top:12px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:13px;">
              <input type="checkbox" id="service-upfront" ${service?.requires_upfront_payment ? 'checked' : ''}> Requires upfront payment
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:13px;">
              <input type="checkbox" id="service-active" ${service ? (service.is_active ? 'checked' : '') : 'checked'}> Active
            </label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:13px;">
              <input type="checkbox" id="service-is-class" ${service?.is_group_class ? 'checked' : ''}> Group class (multiple attendees)
            </label>
          </div>
          <div class="crm-form-field" id="service-capacity-wrap" style="margin-top:12px;${service?.is_group_class ? '' : 'display:none;'}">
            <label>Max capacity (optional)</label>
            <input type="number" class="crm-input" id="service-capacity" value="${service?.max_capacity ?? ''}" min="1" placeholder="e.g. 8">
          </div>
          <div class="crm-form-field" style="margin-top:12px;">
            <label>Description</label>
            <textarea class="crm-textarea" id="service-description" rows="2">${escapeHtml(service?.description || '')}</textarea>
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
  document.getElementById('service-is-class').addEventListener('change', (e) => {
    const wrap = document.getElementById('service-capacity-wrap');
    if (wrap) wrap.style.display = e.target.checked ? '' : 'none';
  });
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
  const requiresUpfront = document.getElementById('service-upfront').checked;
  const isActive = document.getElementById('service-active').checked;
  const isGroupClass = document.getElementById('service-is-class').checked;
  const rawCapacity = document.getElementById('service-capacity').value.trim();
  const maxCapacity = isGroupClass && rawCapacity ? parseInt(rawCapacity, 10) : null;
  if (isGroupClass && maxCapacity !== null && (!Number.isFinite(maxCapacity) || maxCapacity < 1)) {
    showToast('Max capacity must be a positive integer', 'error');
    return;
  }
  const description = document.getElementById('service-description').value.trim() || null;

  const payload = {
    name,
    slug,
    description,
    duration_minutes: duration,
    default_price_cents: priceCents,
    requires_upfront_payment: requiresUpfront,
    is_active: isActive,
    is_group_class: isGroupClass,
    max_capacity: maxCapacity,
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
  currentDrawerLeadId = null;
  activeClientTab = 'overview';
  moreMenuOpen = false;
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
    panelsContainer.addEventListener('input', handlePanelInputs);
  }
  // Modal container is a sibling, not a child — wire the same delegated
  // handlers so data-action buttons rendered inside modals (new-package,
  // new-stay, schedule-session) still fire.
  const modalContainer = document.getElementById('clients-modal');
  if (modalContainer) {
    modalContainer.addEventListener('click', handlePanelClicks);
    modalContainer.addEventListener('change', handlePanelChanges);
    modalContainer.addEventListener('input', handlePanelInputs);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function handlePanelClicks(e) {
  const target = e.target;

  // ----- Services -----
  if (target.id === 'btn-new-service') { openServiceModal(); return; }
  const editSvc = target.closest('[data-edit-service]');
  if (editSvc) {
    e.stopPropagation();
    const svc = services.find(s => s.id === editSvc.dataset.editService);
    if (svc) openServiceModal(svc);
    return;
  }
  const svcRow = target.closest('.clients-service-row');
  if (svcRow) {
    const svc = services.find(s => s.id === svcRow.dataset.serviceId);
    if (svc) openServiceModal(svc);
    return;
  }

  // ----- Packages (master catalog) -----
  if (target.id === 'btn-new-package-template') { openPackageTemplateModal(); return; }
  const editPkg = target.closest('[data-edit-package]');
  if (editPkg) {
    e.stopPropagation();
    const pkg = allServicePackages.find(p => p.id === editPkg.dataset.editPackage);
    if (pkg) openPackageTemplateModal(pkg);
    return;
  }
  const pkgRow = target.closest('.clients-package-row');
  if (pkgRow) {
    const pkg = allServicePackages.find(p => p.id === pkgRow.dataset.packageId);
    if (pkg) openPackageTemplateModal(pkg);
    return;
  }

  // ----- Facilitators -----
  if (target.id === 'btn-new-facilitator') { openFacilitatorModal(); return; }
  const editFac = target.closest('[data-edit-facilitator]');
  if (editFac) {
    e.stopPropagation();
    const fac = facilitators.find(f => f.id === editFac.dataset.editFacilitator);
    if (fac) openFacilitatorModal(fac);
    return;
  }
  const facRow = target.closest('.clients-facilitator-row');
  if (facRow) {
    const fac = facilitators.find(f => f.id === facRow.dataset.facilitatorId);
    if (fac) openFacilitatorModal(fac);
    return;
  }

  // ----- Clients -----
  if (target.id === 'btn-new-client') { openAddClientModal(); return; }

  const promoteBtn = target.closest('[data-add-client-promote]');
  if (promoteBtn) {
    promoteLeadToActiveClient(promoteBtn.dataset.addClientPromote);
    return;
  }
  const openLeadBtn = target.closest('[data-add-client-open]');
  if (openLeadBtn) {
    openClientDetail(openLeadBtn.dataset.addClientOpen);
    return;
  }

  const actionBtn = target.closest('[data-action]');
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    e.stopPropagation();
    if (action === 'schedule-session') {
      openScheduleSessionModal(actionBtn.dataset.sessionId);
      return;
    }
    if (action === 'client-select-tab') {
      selectClientTab(actionBtn.dataset.tab);
      return;
    }
    if (action === 'client-more-toggle') {
      toggleClientMoreMenu();
      return;
    }
    if (action === 'client-more-item') {
      handleClientMoreItem(actionBtn.dataset.leadId, actionBtn.dataset.item);
      return;
    }
    if (action === 'send-invoice-confirm') {
      handleSendInvoiceConfirm(actionBtn.dataset.proposalId, currentDrawerLeadId, actionBtn);
      return;
    }
    if (action === 'remove-package') {
      removeClientPackage(actionBtn.dataset.packageId);
      return;
    }
    const leadId = actionBtn.dataset.clientId;
    if (action === 'new-package') openPackageModal(leadId);
    if (action === 'new-stay')    openStayModal(leadId);
    return;
  }
  // Click outside the More menu closes it.
  if (moreMenuOpen && !target.closest('#client-more-menu') && !target.closest('#client-more-btn')) {
    closeClientMoreMenu();
  }
  const clientRow = target.closest('.clients-client-row');
  if (clientRow) {
    openClientDetail(clientRow.dataset.clientId);
    return;
  }

  // ----- House -----
  const bedRow = target.closest('.clients-bed-row');
  if (bedRow) {
    openClientDetail(bedRow.dataset.clientId);
    return;
  }
  // View-mode toggle (Night / Week / Month).
  const modeBtn = target.closest('[data-house-mode]');
  if (modeBtn) {
    houseViewMode = modeBtn.dataset.houseMode;
    renderHousePanel();
    return;
  }
  // Month cell \u2192 drill into Night view for that day.
  const monthCell = target.closest('[data-house-day]');
  if (monthCell) {
    houseSelectedDate = monthCell.dataset.houseDay;
    houseViewMode = 'night';
    renderHousePanel();
    return;
  }
  if (target.id === 'house-today') {
    houseSelectedDate = new Date().toISOString().slice(0, 10);
    renderHousePanel();
    return;
  }
  if (target.id === 'house-prev' || target.id === 'house-next') {
    const sign = target.id === 'house-prev' ? -1 : 1;
    const d = new Date(houseSelectedDate + 'T12:00:00');
    if (houseViewMode === 'week')      d.setDate(d.getDate() + 7 * sign);
    else if (houseViewMode === 'month') d.setMonth(d.getMonth() + sign);
    else                                 d.setDate(d.getDate() + sign);
    houseSelectedDate = d.toISOString().slice(0, 10);
    renderHousePanel();
    return;
  }
  if (target.id === 'house-weekly-email') {
    showToast('Weekly email lands in Phase 7 \u2014 coming next.', 'info');
    return;
  }

  // ----- Schedule -----
  if (target.id === 'sched-today') {
    scheduleWeekStart = mondayOf(new Date());
    loadScheduleWeek();
    return;
  }
  if (target.id === 'sched-prev' || target.id === 'sched-next') {
    const d = new Date(scheduleWeekStart);
    d.setDate(d.getDate() + (target.id === 'sched-prev' ? -7 : 7));
    scheduleWeekStart = d;
    loadScheduleWeek();
    return;
  }
  const schedPill = target.closest('[data-sched-booking]');
  if (schedPill) {
    openBookingDetail(schedPill.dataset.schedBooking);
    return;
  }
  if (target.id === 'sched-new-booking') {
    openBookingPickerModal();
    return;
  }
  const daySlot = target.closest('[data-empty-slot-day]');
  if (daySlot) {
    const rect = daySlot.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = (y / SCHEDULE_CELL_PX) * 30;
    const snapped = Math.max(0, Math.floor(rawMinutes / 15) * 15);
    const dayIdx = parseInt(daySlot.dataset.emptySlotDay, 10);
    const start = new Date(scheduleWeekStart);
    start.setDate(start.getDate() + dayIdx);
    start.setHours(SCHEDULE_START_HOUR, 0, 0, 0);
    start.setMinutes(snapped);
    openBookingPickerModal({ prefilledStart: start });
    return;
  }
}

function handlePanelChanges(e) {
  if (e.target.id === 'toggle-show-archived-services') {
    showArchivedServices = e.target.checked;
    renderServicesPanel();
    return;
  }
  if (e.target.id === 'toggle-show-inactive-facilitators') {
    showInactiveFacilitators = e.target.checked;
    renderServicesPanel();
    return;
  }
  if (e.target.id === 'toggle-show-inactive-packages') {
    showInactivePackages = e.target.checked;
    renderServicesPanel();
    return;
  }
  if (e.target.id === 'house-date') {
    houseSelectedDate = e.target.value;
    renderHousePanel();
    return;
  }
  if (e.target.id === 'sched-staff-filter') {
    scheduleStaffFilter = e.target.value;
    renderSchedulePanel();
    return;
  }
}

let _clientSearchDebounce = null;
function handlePanelInputs(e) {
  if (e.target.id === 'clients-search') {
    clearTimeout(_clientSearchDebounce);
    const val = e.target.value;
    _clientSearchDebounce = setTimeout(() => {
      clientSearch = val;
      const panel = document.getElementById('clients-panel-clients');
      if (!panel) return;
      // Only re-render the table body so the search box doesn't lose focus
      renderClientsPanel();
      const input = document.getElementById('clients-search');
      if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
    }, 180);
    return;
  }
  if (e.target.id === 'add-client-crm-search') {
    clearTimeout(_addClientSearchDebounce);
    const val = e.target.value;
    _addClientSearchDebounce = setTimeout(() => searchCrmLeads(val), 200);
    return;
  }
}
