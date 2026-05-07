// Venue Clients — list of people who've booked venue events, deduped by
// email (or name+phone fallback when no email). Each "client" aggregates
// all their crm_leads records with business_line='awkn_ranch' and a set
// event_date. Click a client to see their full booking history and
// quick-access actions per event (Open in CRM jumps into the lead drawer
// where Send Agreement / Create Proposal / Create Invoice live).

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

let allLeads = [];
let allClients = [];   // grouped by email/identity
let filterState = { search: '', show: 'all', sort: 'recent' };

(async function () {
  await initAdminPage({
    activeTab: 'venue-clients',
    section: 'staff',
    requiredPermission: 'view_crm',
    onReady: async () => {
      await loadAll();
      bindControls();
      bindModal();
      render();
    },
  });
})();

// ============================================================================
// Data
// ============================================================================
async function loadAll() {
  // Pull all venue leads with a date set. We'll group them client-side.
  const { data, error } = await supabase
    .from('crm_leads')
    .select(`
      id, first_name, last_name, email, phone,
      event_date, event_start_time, event_end_time, event_type, guest_count,
      space_id, stage_id, estimated_value, actual_revenue,
      deposit_amount, deposit_paid_at, balance_amount, balance_paid_at,
      notes, internal_staff_notes, created_at, updated_at,
      space:spaces(id, name),
      stage:crm_pipeline_stages(id, slug, name)
    `)
    .eq('business_line', 'awkn_ranch')
    .not('event_date', 'is', null)
    .order('event_date', { ascending: false });

  if (error) {
    console.warn('venue-clients load error:', error);
    allLeads = [];
  } else {
    allLeads = data || [];
  }

  allClients = groupIntoClients(allLeads);
}

// Group leads into "clients". Match priority: email (case-insensitive,
// trimmed) > phone (digits only) > full name. Anyone we can't match falls
// into their own single-event client record.
function groupIntoClients(leads) {
  const byKey = new Map();

  for (const lead of leads) {
    const key = identityKey(lead);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        // Pull the most-recent name/contact (leads are already ordered desc by event_date)
        first_name: lead.first_name || '',
        last_name:  lead.last_name  || '',
        email:      lead.email      || '',
        phone:      lead.phone      || '',
        events: [],
      });
    }
    const client = byKey.get(key);
    client.events.push(lead);
    // If this newer lead has email/phone the older one didn't, fill in.
    if (!client.email && lead.email) client.email = lead.email;
    if (!client.phone && lead.phone) client.phone = lead.phone;
    if (!client.first_name && lead.first_name) client.first_name = lead.first_name;
    if (!client.last_name && lead.last_name) client.last_name = lead.last_name;
  }

  return Array.from(byKey.values());
}

function identityKey(lead) {
  const email = (lead.email || '').trim().toLowerCase();
  if (email) return `e:${email}`;
  const phoneDigits = (lead.phone || '').replace(/\D/g, '');
  if (phoneDigits.length >= 10) return `p:${phoneDigits.slice(-10)}`;
  const name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim().toLowerCase();
  if (name) return `n:${name}`;
  return `i:${lead.id}`;
}

// ============================================================================
// Stats + filtering
// ============================================================================
function computeStats() {
  const total = allClients.length;
  const repeat = allClients.filter(c => c.events.length >= 2).length;
  const todayKey_ = ymd(new Date());
  const upcoming = allClients.filter(c => c.events.some(e => e.event_date >= todayKey_)).length;
  const lifetimeRevenue = allClients.reduce((sum, c) => {
    return sum + c.events.reduce((s, e) => s + Number(e.actual_revenue || e.estimated_value || 0), 0);
  }, 0);

  setText('statClients', String(total));
  setText('statRepeat', String(repeat));
  setText('statRevenue', formatMoney(lifetimeRevenue));
  setText('statUpcoming', String(upcoming));
}

function applyFilters(clients) {
  const todayKey_ = ymd(new Date());
  let out = clients;

  if (filterState.show === 'upcoming') {
    out = out.filter(c => c.events.some(e => e.event_date >= todayKey_));
  } else if (filterState.show === 'past') {
    out = out.filter(c => c.events.every(e => e.event_date < todayKey_));
  } else if (filterState.show === 'repeat') {
    out = out.filter(c => c.events.length >= 2);
  }

  if (filterState.search) {
    const q = filterState.search;
    out = out.filter(c => {
      const hay = [
        c.first_name, c.last_name, c.email, c.phone,
        ...c.events.map(e => e.event_type || ''),
        ...c.events.map(e => e.space?.name || ''),
        ...c.events.map(e => e.notes || ''),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  // Sort
  const sortFn = {
    recent: (a, b) => mostRecentEventDate(b).localeCompare(mostRecentEventDate(a)),
    upcoming: (a, b) => {
      const an = nextUpcomingDate(a, todayKey_);
      const bn = nextUpcomingDate(b, todayKey_);
      // Clients with no upcoming sink to the bottom
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return an.localeCompare(bn);
    },
    revenue: (a, b) => clientLifetimeRevenue(b) - clientLifetimeRevenue(a),
    events:  (a, b) => b.events.length - a.events.length,
    name:    (a, b) => clientName(a).localeCompare(clientName(b)),
  }[filterState.sort] || (() => 0);

  return out.slice().sort(sortFn);
}

function clientName(c) {
  return ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || c.phone || '(unnamed)';
}
function clientLifetimeRevenue(c) {
  return c.events.reduce((s, e) => s + Number(e.actual_revenue || e.estimated_value || 0), 0);
}
function mostRecentEventDate(c) {
  return c.events.map(e => e.event_date || '').sort().slice(-1)[0] || '';
}
function nextUpcomingDate(c, todayKey_) {
  const upcoming = c.events.filter(e => e.event_date >= todayKey_).map(e => e.event_date).sort();
  return upcoming[0] || null;
}
function lastPastDate(c, todayKey_) {
  const past = c.events.filter(e => e.event_date < todayKey_).map(e => e.event_date).sort();
  return past[past.length - 1] || null;
}

// ============================================================================
// Render
// ============================================================================
function render() {
  computeStats();
  const filtered = applyFilters(allClients);
  renderTable(filtered);
}

function renderTable(clients) {
  const body = document.getElementById('clientsBody');
  const todayKey_ = ymd(new Date());

  if (clients.length === 0) {
    const hint = (filterState.search || filterState.show !== 'all')
      ? 'Try clearing the filters.'
      : 'No venue clients yet — bookings will show up here once leads have an event date set.';
    body.innerHTML = `<tr><td colspan="5" class="vc-empty"><strong>No clients match.</strong>${esc(hint)}</td></tr>`;
    return;
  }

  body.innerHTML = clients.map(c => {
    const name = clientName(c);
    const meta = [c.email, c.phone].filter(Boolean).join(' · ');
    const last = lastPastDate(c, todayKey_);
    const next = nextUpcomingDate(c, todayKey_);
    const revenue = formatMoney(clientLifetimeRevenue(c));
    const eventsLabel = c.events.length === 1 ? '1 event' : `${c.events.length} events`;
    return `
      <tr data-key="${esc(c.key)}">
        <td class="vc-cell-name">${esc(name)}${meta ? `<span class="vc-meta">${esc(meta)}</span>` : ''}</td>
        <td class="vc-cell-count">${eventsLabel}</td>
        <td class="vc-cell-date">${last ? esc(formatShortDate(last)) + `<span class="vc-rel">${esc(formatRelative(last))}</span>` : '—'}</td>
        <td class="vc-cell-date">${next ? esc(formatShortDate(next)) + `<span class="vc-rel">${esc(formatRelative(next))}</span>` : '—'}</td>
        <td class="vc-cell-revenue">${esc(revenue)}</td>
      </tr>
    `;
  }).join('');

  body.querySelectorAll('tr[data-key]').forEach(tr => {
    tr.addEventListener('click', () => {
      const key = tr.dataset.key;
      const client = allClients.find(c => c.key === key);
      if (client) openClientModal(client);
    });
  });
}

// ============================================================================
// Modal — full event history per client
// ============================================================================
function bindModal() {
  document.getElementById('vcClose').addEventListener('click', closeClientModal);
  document.getElementById('vcModal').addEventListener('click', (e) => {
    if (e.target.id === 'vcModal') closeClientModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('vcModal').classList.contains('hidden')) closeClientModal();
  });
}

function openClientModal(c) {
  setText('vcTitle', clientName(c));
  setText('vcSub', [c.email, c.phone].filter(Boolean).join(' · '));

  const todayKey_ = ymd(new Date());
  const upcoming = c.events.filter(e => e.event_date >= todayKey_).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = c.events.filter(e => e.event_date < todayKey_).sort((a, b) => b.event_date.localeCompare(a.event_date));
  const revenue = clientLifetimeRevenue(c);
  const lastDate = lastPastDate(c, todayKey_);

  // Summary
  document.getElementById('vcSummary').innerHTML = `
    <div class="vc-summary-item"><strong>${c.events.length}</strong>${c.events.length === 1 ? 'event' : 'events'}</div>
    <div class="vc-summary-item"><strong>${formatMoney(revenue)}</strong>lifetime revenue</div>
    <div class="vc-summary-item"><strong>${upcoming.length}</strong>upcoming</div>
    ${lastDate ? `<div class="vc-summary-item"><strong>${formatShortDate(lastDate)}</strong>last event</div>` : ''}
  `;

  // Body
  const body = document.getElementById('vcBody');
  const sections = [];
  if (upcoming.length > 0) {
    sections.push(`<div class="vc-section-title">Upcoming</div>` + upcoming.map(e => renderEventCard(e, false)).join(''));
  }
  if (past.length > 0) {
    sections.push(`<div class="vc-section-title">Past</div>` + past.map(e => renderEventCard(e, true)).join(''));
  }
  if (sections.length === 0) {
    sections.push(`<div class="vc-empty">No events on file.</div>`);
  }
  body.innerHTML = sections.join('');

  // Foot
  document.getElementById('vcFoot').innerHTML = `<button class="vc-action" id="vcCloseBtn">Close</button>`;
  document.getElementById('vcCloseBtn').addEventListener('click', closeClientModal);

  document.getElementById('vcModal').classList.remove('hidden');
}

function closeClientModal() {
  document.getElementById('vcModal').classList.add('hidden');
}

function renderEventCard(e, isPast) {
  const dateStr = formatLongDate(e.event_date);
  const time = formatTimeRange(e.event_start_time, e.event_end_time);
  const space = e.space?.name || '—';
  const eventType = e.event_type || '—';
  const guests = e.guest_count != null ? `${e.guest_count} guests` : '';
  const stage = e.stage?.name || '—';
  const stageSlug = (e.stage?.slug || '').toLowerCase();
  let stageClass = '';
  if (/lost/.test(stageSlug)) stageClass = 'lost';
  else if (/signed/.test(stageSlug)) stageClass = 'signed';
  else if (/deposit/.test(stageSlug)) stageClass = 'deposit';
  else if (/book|confirmed|scheduled/.test(stageSlug)) stageClass = 'confirmed';
  const amount = e.actual_revenue || e.estimated_value
    ? formatMoney(Number(e.actual_revenue || e.estimated_value))
    : '—';

  // Action links — these all deep-link into the CRM's lead drawer where the
  // existing Create Proposal / Send Agreement / Create Invoice menu lives.
  const crmLink = `crm.html?pillar=ranch&lead=${encodeURIComponent(e.id)}`;
  const proposalLink = `${crmLink}&action=create-proposal`;
  const agreementLink = `${crmLink}&action=send-agreement`;
  const invoiceLink = `${crmLink}&action=create-invoice`;

  return `
    <div class="vc-event ${isPast ? 'is-past' : ''}">
      <div class="vc-event-head">
        <span class="vc-event-date">${esc(dateStr)} · ${esc(time)}</span>
        <span class="vc-event-amount">${esc(amount)}</span>
      </div>
      <div class="vc-event-meta">
        <strong>${esc(space)}</strong>${eventType !== '—' ? ` · ${esc(eventType)}` : ''}${guests ? ` · ${esc(guests)}` : ''}
      </div>
      <span class="vc-event-stage ${stageClass}">${esc(stage)}</span>
      <div class="vc-event-actions">
        <a class="vc-action primary" href="${crmLink}">Open in CRM</a>
        <a class="vc-action" href="${proposalLink}">Create Proposal</a>
        <a class="vc-action" href="${agreementLink}">Send Agreement</a>
        <a class="vc-action" href="${invoiceLink}">Create Invoice</a>
      </div>
    </div>
  `;
}

// ============================================================================
// Controls
// ============================================================================
function bindControls() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterState.search = e.target.value.toLowerCase();
    render();
  });
  document.getElementById('filterType').addEventListener('change', (e) => {
    filterState.show = e.target.value;
    render();
  });
  document.getElementById('sortBy').addEventListener('change', (e) => {
    filterState.sort = e.target.value;
    render();
  });
}

// ============================================================================
// Helpers
// ============================================================================
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function formatShortDate(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatLongDate(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatRelative(yyyymmdd) {
  if (!yyyymmdd) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  const diff = Math.round((t - today) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0 && diff < 30) return `in ${diff} days`;
  if (diff < 0 && diff > -30) return `${Math.abs(diff)} days ago`;
  if (diff >= 30) return `in ~${Math.round(diff / 30)} months`;
  return `${Math.round(Math.abs(diff) / 30)} months ago`;
}
function formatTimeRange(start, end) {
  if (!start && !end) return '';
  const fmt = (t) => {
    if (!t) return '';
    if (/^\d{1,2}:\d{2}/.test(t)) {
      const [h, m] = t.split(':');
      const hh = Number(h);
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const h12 = ((hh + 11) % 12) + 1;
      return m === '00' ? `${h12} ${ampm}` : `${h12}:${m} ${ampm}`;
    }
    return t;
  };
  const s = fmt(start), e = fmt(end);
  if (s && e) return `${s}–${e}`;
  return s || e;
}
function formatMoney(n) {
  if (!n) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
