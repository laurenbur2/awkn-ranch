// Retreat House admin landing — read-only inventory view.
// Shows the seven crystal rooms grouped by floor with their beds, attributes,
// nightly rates, and any upcoming `client_stays` (Within immersive bookings + others).
//
// Data sources:
//   - spaces (filtered to space_type='lodging', is_archived=false)
//   - beds (joined to spaces by space_id)
//   - client_stays (joined to crm_leads for guest name, status='upcoming'|'active', next 30 days)

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

const FLOOR_ORDER = ['downstairs', 'upstairs'];
const FLOOR_LABELS = { downstairs: 'Downstairs', upstairs: 'Upstairs' };

let rooms = [];          // spaces with space_type='lodging'
let bedsByRoom = {};     // { space_id: [bed, ...] }
let staysByBed = {};     // { bed_id: [stay, ...] }

(async function () {
  await initAdminPage({
    activeTab: 'retreat-overview',
    section: 'staff',
    requiredPermission: 'view_rentals',
    onReady: async () => {
      await loadData();
      render();
    },
  });
})();

async function loadData() {
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);

  const [roomsRes, bedsRes, staysRes] = await Promise.all([
    supabase
      .from('spaces')
      .select('id, name, slug, floor, has_private_bath, features, booking_category')
      .eq('space_type', 'lodging')
      .eq('is_archived', false)
      .order('floor')
      .order('name'),
    supabase
      .from('beds')
      .select('id, space_id, label, bed_type, max_guests, nightly_rate_cents, sort_order')
      .eq('is_archived', false)
      .order('sort_order'),
    supabase
      .from('client_stays')
      .select('id, lead_id, bed_id, package_id, check_in_at, check_out_at, status, lead:crm_leads(first_name, last_name, business_line)')
      .in('status', ['upcoming', 'active'])
      .lte('check_in_at', horizon.toISOString())
      .gte('check_out_at', today.toISOString())
      .order('check_in_at'),
  ]);

  if (roomsRes.error) console.warn('Failed to load rooms:', roomsRes.error);
  if (bedsRes.error) console.warn('Failed to load beds:', bedsRes.error);
  if (staysRes.error) console.warn('Failed to load stays:', staysRes.error);

  rooms = roomsRes.data || [];
  bedsByRoom = {};
  for (const bed of bedsRes.data || []) {
    (bedsByRoom[bed.space_id] = bedsByRoom[bed.space_id] || []).push(bed);
  }
  staysByBed = {};
  for (const stay of staysRes.data || []) {
    (staysByBed[stay.bed_id] = staysByBed[stay.bed_id] || []).push(stay);
  }
}

function render() {
  renderStats();
  renderFloors();
}

function renderStats() {
  const totalBeds = Object.values(bedsByRoom).reduce((n, arr) => n + arr.length, 0);
  const allStays = Object.values(staysByBed).flat();
  const now = Date.now();
  const activeNow = allStays.filter(s => {
    const ci = new Date(s.check_in_at).getTime();
    const co = new Date(s.check_out_at).getTime();
    return ci <= now && co > now;
  }).length;

  setText('rhStatRooms', String(rooms.length));
  setText('rhStatBeds', String(totalBeds));
  setText('rhStatUpcoming', String(allStays.length));
  setText('rhStatActive', String(activeNow));
}

function renderFloors() {
  const container = document.getElementById('rhFloors');
  if (!container) return;

  if (rooms.length === 0) {
    container.innerHTML = '<div class="rh-empty-state">No retreat house rooms found. Run the latest Supabase migrations to seed the inventory.</div>';
    return;
  }

  // Group rooms by floor, then render in our preferred order.
  const byFloor = {};
  for (const room of rooms) {
    const f = room.floor || 'downstairs';
    (byFloor[f] = byFloor[f] || []).push(room);
  }

  const html = FLOOR_ORDER
    .filter(f => (byFloor[f] || []).length > 0)
    .map(f => `
      <div class="rh-floor-head">${FLOOR_LABELS[f]}</div>
      <div class="rh-grid">
        ${byFloor[f].map(renderRoomCard).join('')}
      </div>
    `).join('');

  container.innerHTML = html;
}

function renderRoomCard(room) {
  const beds = bedsByRoom[room.id] || [];
  const isShared = beds.length > 1;
  const typeLabel = isShared ? 'Shared' : 'Private';
  const bathLabel = room.has_private_bath ? 'Private bath' : 'Shared bath';

  const features = room.features || {};
  const featureTags = [];
  if (features.pool_access) featureTags.push('Pool access');

  const stays = beds.flatMap(b => (staysByBed[b.id] || []).map(s => ({ ...s, _bed: b })));

  return `
    <div class="rh-card">
      <div class="rh-card-head">
        <div class="rh-card-name">${escapeHtml(room.name)}</div>
        <span class="rh-card-type-pill ${isShared ? 'shared' : 'private'}">${typeLabel}</span>
      </div>
      <div class="rh-card-meta">
        <span class="rh-meta-tag">${bathLabel}</span>
        ${featureTags.map(f => `<span class="rh-meta-tag feature">${escapeHtml(f)}</span>`).join('')}
      </div>

      <div class="rh-beds">
        <div class="rh-beds-label">${beds.length} bed${beds.length === 1 ? '' : 's'}</div>
        ${beds.map(renderBedRow).join('') || '<div class="rh-stays-empty">No beds configured.</div>'}
      </div>

      <div class="rh-stays">
        <div class="rh-stays-label">Upcoming stays (next 30 days)</div>
        ${stays.length === 0
          ? '<div class="rh-stays-empty">No stays booked.</div>'
          : stays.map(renderStayRow).join('')}
      </div>
    </div>
  `;
}

function renderBedRow(bed) {
  const rate = (bed.nightly_rate_cents || 0) / 100;
  const rateLabel = rate > 0 ? `$${rate.toFixed(0)}/night` : 'Rate not set';
  return `
    <div class="rh-bed-row">
      <span class="rh-bed-name">${escapeHtml(bed.label)} <span style="color:#9ca3af;font-weight:400;">· ${escapeHtml(bed.bed_type.replace('_', ' '))}</span></span>
      <span class="rh-bed-rate">${rateLabel}</span>
    </div>
  `;
}

function renderStayRow(stay) {
  const lead = stay.lead || {};
  const guestName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Guest';
  const ci = formatShortDate(stay.check_in_at);
  const co = formatShortDate(stay.check_out_at);
  const isWithin = lead.business_line === 'within';
  const sourceLabel = isWithin ? 'Within' : (lead.business_line === 'awkn_ranch' ? 'Venue' : 'Stay');
  return `
    <div class="rh-stay-row">
      <span class="rh-stay-guest">${escapeHtml(guestName)} <span class="rh-stay-source">${sourceLabel}</span></span>
      <span class="rh-stay-dates">${ci} → ${co}</span>
    </div>
  `;
}

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return iso;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
