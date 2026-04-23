// Clients Page - Admin view for AWKN Within ketamine clients.
// Sub-tabs: Clients / Schedule / House / Services.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';

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

// Schedule tab state
let scheduleWeekStart = mondayOf(new Date()); // local Date @ 00:00 on Mon of viewed week
let scheduleBookings = [];
let scheduleStaffFilter = 'all';  // 'all' | facilitator_id | 'unassigned'

// House tab state
let houseSelectedDate = new Date().toISOString().slice(0, 10);

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
    supabase.from('crm_service_packages').select('id, name, slug, price_regular, price_promo, description, includes, business_line, is_active, sort_order').eq('business_line', 'within').order('sort_order').order('name'),
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

  const [clientsRes, pkgsRes, sessRes, staysRes] = await Promise.all([
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
  ]);

  if (clientsRes.error) { console.error('clients load error:', clientsRes.error); showToast('Failed to load clients', 'error'); }
  clients = clientsRes.data || [];

  const allSessions = sessRes.data || [];
  packages = (pkgsRes.data || []).map(p => ({
    ...p,
    sessions: allSessions.filter(s => s.package_id === p.id),
  }));

  stays = staysRes.data || [];
}

function getClientPackages(leadId) {
  return packages.filter(p => p.lead_id === leadId);
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

function openClientDetail(leadId) {
  const c = clients.find(x => x.id === leadId);
  if (!c) return;

  const pkgs = getClientPackages(leadId);
  const clientStays = getClientStays(leadId);

  // Aggregate sessions remaining per service across all active packages.
  // Only unscheduled — once booked the session no longer counts as remaining.
  const remainingByService = new Map();
  for (const p of pkgs) {
    if (p.status !== 'active') continue;
    for (const s of (p.sessions || [])) {
      if (s.status !== 'unscheduled') continue;
      remainingByService.set(s.service_id, (remainingByService.get(s.service_id) || 0) + 1);
    }
  }

  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(no name)';

  const modal = document.getElementById('clients-modal');
  modal.innerHTML = `
    <div class="crm-modal-overlay" id="clients-modal-overlay">
      <div class="crm-modal-content crm-modal-xlarge" style="display:flex;flex-direction:column;max-height:92vh;">
        <div class="crm-modal-header">
          <div>
            <h2>${escapeHtml(name)}</h2>
            <div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">
              ${c.email ? escapeHtml(c.email) : ''}${c.email && c.phone ? ' &middot; ' : ''}${c.phone ? escapeHtml(c.phone) : ''}${(c.city || c.state) ? ` &middot; ${escapeHtml([c.city, c.state].filter(Boolean).join(', '))}` : ''}
            </div>
          </div>
          <button class="crm-modal-close" id="clients-modal-close-btn">&times;</button>
        </div>
        <div class="crm-modal-body" style="padding:20px;overflow-y:auto;">
          ${renderSessionsRemainingBlock(remainingByService)}
          ${renderHospitalityBlock(c)}
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
          ${renderLegacyNoteBlock(c)}
          <section id="integration-notes-section" data-lead-id="${c.id}">
            <div style="color:var(--text-muted,#888);font-size:13px;padding:8px 0;">Loading integration notes\u2026</div>
          </section>
        </div>
      </div>
    </div>
  `;
  modal.style.display = 'block';

  document.getElementById('clients-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('clients-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'clients-modal-overlay') closeModal();
  });
  bootstrapIntegrationNotesSection(leadId);

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

function renderSessionsRemainingBlock(remainingByService) {
  if (!remainingByService.size) {
    return `
      <section style="margin-bottom:20px;padding:14px 16px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;">
        <h3 style="margin:0 0 6px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#888);">Sessions Remaining</h3>
        <div style="font-size:13px;color:var(--text-muted,#999);">No unused sessions on active packages.</div>
      </section>
    `;
  }
  const pills = [];
  for (const [serviceId, count] of remainingByService) {
    pills.push(`
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#fff8ec;border:1px solid #f0d9ae;border-radius:999px;">
        <span style="font-weight:700;font-size:14px;color:#b4691f;">${count}\u00d7</span>
        <span style="font-size:13px;color:var(--text,#2a1f23);">${escapeHtml(getServiceName(serviceId))}</span>
      </div>
    `);
  }
  return `
    <section style="margin-bottom:20px;padding:14px 16px;border:1px solid #f0d9ae;border-radius:10px;background:#fffdf6;">
      <h3 style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#b4691f;">Sessions Remaining</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${pills.join('')}</div>
    </section>
  `;
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
      <div style="border:1px solid var(--border-color,#e5e5e5);border-radius:8px;padding:12px;margin-bottom:8px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:6px;">
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

async function bootstrapIntegrationNotesSection(leadId) {
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
  renderIntegrationNotesSection(leadId);
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
  const otherTemplates = servicePackageTemplates.filter(t => !parseRetreatDuration(t.name));

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
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8a5a1a;margin-bottom:8px;">Retreat stay</div>
            <div class="crm-form-grid">
              <div class="crm-form-field">
                <label>Check-in *</label>
                <input type="date" class="crm-input" id="pkg-checkin" value="${today}">
              </div>
              <div class="crm-form-field">
                <label>Check-out (auto)</label>
                <input type="date" class="crm-input" id="pkg-checkout" readonly style="background:#f5f0e3;">
              </div>
              <div class="crm-form-field" style="grid-column:1 / -1;">
                <label>Room &middot; Bed *</label>
                <select class="crm-select" id="pkg-bed">
                  <option value="">&mdash; pick a bed &mdash;</option>
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
  document.getElementById('pkg-checkin').addEventListener('change', recomputeCheckout);
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
  if (dur) {
    retreatSection.style.display = 'block';
    recomputeCheckout();
  } else {
    retreatSection.style.display = 'none';
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

  let stayPayload = null;
  if (retreatDur) {
    const checkinYmd = document.getElementById('pkg-checkin').value;
    const checkoutYmd = document.getElementById('pkg-checkout').value;
    const bedId = document.getElementById('pkg-bed').value;
    if (!checkinYmd || !checkoutYmd) { showToast('Pick a check-in date', 'error'); return; }
    if (!bedId) { showToast('Pick a room / bed', 'error'); return; }
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
              <label>Room \u00b7 Bed *</label>
              <select class="crm-select" id="stay-bed" required>
                <option value="">\u2014 pick a bed \u2014</option>
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
  const bedId = document.getElementById('stay-bed').value;
  if (!bedId) { showToast('Pick a bed', 'error'); return; }
  const packageId = document.getElementById('stay-package').value || null;
  const checkinDate = document.getElementById('stay-checkin').value;
  const checkoutDate = document.getElementById('stay-checkout').value;
  if (!checkinDate || !checkoutDate) { showToast('Check-in and check-out required', 'error'); return; }
  if (new Date(checkoutDate) <= new Date(checkinDate)) { showToast('Check-out must be after check-in', 'error'); return; }
  const notes = document.getElementById('stay-notes').value.trim() || null;

  // Conflict check (soft, client-side): any existing stay on the same bed overlapping the window?
  const checkinISO = new Date(checkinDate + 'T15:00:00').toISOString();
  const checkoutISO = new Date(checkoutDate + 'T11:00:00').toISOString();
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

  const rows = unscheduled.length
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
    : `<div style="padding:20px;text-align:center;color:var(--text-muted,#888);font-size:13px;">No unscheduled sessions on this client\u2019s packages.</div>`;

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

function renderHousePanel() {
  const panel = document.getElementById('clients-panel-house');
  if (!panel) return;

  // Treat selected date as the *night* (check-in on or before, check-out after)
  const d = new Date(houseSelectedDate + 'T12:00:00');
  const occupancyFor = (bedId) => stays.find(s =>
    s.bed_id === bedId &&
    s.status !== 'cancelled' &&
    new Date(s.check_in_at) <= d &&
    new Date(s.check_out_at) > d
  );

  const clientName = (leadId) => {
    const c = clients.find(x => x.id === leadId);
    if (!c) return 'Client';
    return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client';
  };

  const roomsSorted = [...lodgingSpaces].sort((a, b) => {
    const fa = a.floor === 'downstairs' ? 0 : 1;
    const fb = b.floor === 'downstairs' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (a.name || '').localeCompare(b.name || '');
  });

  let totalBeds = 0, occupiedBeds = 0;
  roomsSorted.forEach(sp => {
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
            const name = occ ? clientName(occ.lead_id) : null;
            return `
              <div class="${occ ? 'clients-bed-row' : ''}" ${occ ? `data-client-id="${occ.lead_id}" style="cursor:pointer;"` : ''}>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${occ ? '#fff8ec' : 'var(--bg,#faf9f6)'};border-radius:6px;font-size:12px;">
                  <span style="color:var(--text-muted,#666);">${escapeHtml(b.label)}</span>
                  <span style="font-weight:${occ ? '600' : '400'};color:${occ ? 'var(--text,#2a1f23)' : 'var(--text-muted,#aaa)'};">${name ? escapeHtml(name) : 'available'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  panel.innerHTML = `
    <div class="crm-pipeline-toolbar">
      <label style="font-size:13px;color:var(--text-muted,#666);">Night of</label>
      <input type="date" class="crm-input" id="house-date" value="${escapeHtml(houseSelectedDate)}">
      <button class="crm-btn crm-btn-sm" id="house-today">Today</button>
      <button class="crm-btn crm-btn-sm" id="house-prev">&laquo;</button>
      <button class="crm-btn crm-btn-sm" id="house-next">&raquo;</button>
      <button class="crm-btn crm-btn-sm" id="house-weekly-email" title="Phase 7 \u2014 coming soon">Send weekly summary</button>
      <span style="margin-left:auto;font-size:13px;color:var(--text,#2a1f23);font-weight:600;">
        ${occupiedBeds} / ${totalBeds} beds occupied
      </span>
    </div>

    ${roomsSorted.length === 0
      ? `<div style="padding:36px 24px;text-align:center;color:var(--text-muted,#888);font-size:13px;">No lodging rooms configured.</div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">${roomsSorted.map(roomCard).join('')}</div>`
    }
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

  html += `
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
        <tbody>
          ${visible.map(p => {
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
          }).join('')}
        </tbody>
      </table>
    </div>
    </div>
  `;
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
    e.stopPropagation();
    if (actionBtn.dataset.action === 'schedule-session') {
      openScheduleSessionModal(actionBtn.dataset.sessionId);
      return;
    }
    const leadId = actionBtn.dataset.clientId;
    if (actionBtn.dataset.action === 'new-package') openPackageModal(leadId);
    if (actionBtn.dataset.action === 'new-stay')    openStayModal(leadId);
    return;
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
  if (target.id === 'house-today') {
    houseSelectedDate = new Date().toISOString().slice(0, 10);
    renderHousePanel();
    return;
  }
  if (target.id === 'house-prev' || target.id === 'house-next') {
    const delta = target.id === 'house-prev' ? -1 : 1;
    const d = new Date(houseSelectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
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
