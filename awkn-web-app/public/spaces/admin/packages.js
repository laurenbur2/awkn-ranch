// Packages — simple read-only catalog of active service packages.
// Edits happen in Clients > Services. This page is for quick reference.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'packages',
    requiredRole: 'staff',
    section: 'staff',
    onReady: async () => {
      await loadAndRender();
    },
  });
});

async function loadAndRender() {
  const pillar = new URL(window.location.href).searchParams.get('pillar');
  if (pillar === 'ranch') {
    await loadAndRenderVenueCatalog();
    return;
  }
  await loadAndRenderWithinPackages();
}

// Within Center service packages — original behaviour for the within pillar.
async function loadAndRenderWithinPackages() {
  const [pkgRes, svcRes, itemsRes] = await Promise.all([
    supabase.from('crm_service_packages')
      .select('id, name, slug, price_regular, price_promo, description, business_line, is_active, sort_order')
      .eq('business_line', 'within')
      .eq('is_active', true)
      .order('sort_order').order('name'),
    supabase.from('services').select('id, name, duration_minutes').order('name'),
    supabase.from('crm_service_package_items').select('package_id, service_id, quantity, sort_order'),
  ]);

  const packages = pkgRes.data || [];
  const services = svcRes.data || [];
  const items = itemsRes.data || [];

  const svcById = new Map(services.map(s => [s.id, s]));
  const itemsByPkg = new Map();
  items.forEach(r => {
    if (!itemsByPkg.has(r.package_id)) itemsByPkg.set(r.package_id, []);
    itemsByPkg.get(r.package_id).push(r);
  });
  itemsByPkg.forEach(arr => arr.sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)));

  const body = document.getElementById('pkg-body');
  if (packages.length === 0) {
    body.innerHTML = '<div class="pkg-empty">No active packages yet. Add one in Clients &rsaquo; Services.</div>';
    return;
  }

  // Split into retreats (anything with "Residential" in the name) and everything else.
  const retreats = packages.filter(p => /residential|immersion|retreat/i.test(p.name));
  const treatments = packages.filter(p => !retreats.includes(p) && (itemsByPkg.get(p.id) || []).length > 1);
  const addOns = packages.filter(p => !retreats.includes(p) && !treatments.includes(p));

  const groups = [
    { title: 'Retreats & Immersions', items: retreats },
    { title: 'Treatment Packages',    items: treatments },
    { title: 'Individual Sessions & Add-ons', items: addOns },
  ].filter(g => g.items.length > 0);

  body.innerHTML = groups.map(g => `
    <div class="pkg-group">
      <div class="pkg-group-title">${escapeHtml(g.title)}</div>
      <div class="pkg-grid">
        ${g.items.map(p => renderCard(p, itemsByPkg.get(p.id) || [], svcById)).join('')}
      </div>
    </div>
  `).join('');
}

// Venue Rental catalog — the same source the AWKN Ranch proposal builder uses.
// Items live in `crm_venue_catalog` with a `category` (venue / cleaning /
// equipment / amenity / furniture / staff) and a per-unit price.
async function loadAndRenderVenueCatalog() {
  const { data, error } = await supabase
    .from('crm_venue_catalog')
    .select('id, category, name, description, unit_price, unit, minimum_qty, capacity')
    .eq('is_active', true)
    .order('sort_order').order('name');

  const body = document.getElementById('pkg-body');
  if (error) {
    body.innerHTML = `<div class="pkg-empty">Couldn't load venue catalog: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const items = data || [];
  if (items.length === 0) {
    body.innerHTML = '<div class="pkg-empty">No active venue catalog items yet.</div>';
    return;
  }

  const CATEGORY_TITLES = {
    venue:     'Venue Spaces',
    cleaning:  'Cleaning Fees',
    equipment: 'Equipment',
    amenity:   'Amenities',
    furniture: 'Furniture',
    staff:     'Staff',
  };
  const CATEGORY_ORDER = ['venue', 'cleaning', 'equipment', 'amenity', 'furniture', 'staff'];

  // Group by category in the predefined order; unknown categories go last.
  const byCat = new Map();
  items.forEach(it => {
    const k = it.category || 'other';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(it);
  });
  const groups = [
    ...CATEGORY_ORDER.filter(c => byCat.has(c)).map(c => ({ title: CATEGORY_TITLES[c] || c, items: byCat.get(c) })),
    ...Array.from(byCat.keys())
      .filter(c => !CATEGORY_ORDER.includes(c))
      .map(c => ({ title: c.charAt(0).toUpperCase() + c.slice(1), items: byCat.get(c) })),
  ];

  body.innerHTML = `
    <div class="pkg-empty" style="padding:0 0 18px;font-style:normal;text-align:left;color:var(--text-muted,#666);">
      These line items power the AWKN Ranch proposal builder. To edit a price or add an item, go to <strong>CRM &rsaquo; Catalog</strong> (or run a SQL update on <code>crm_venue_catalog</code>).
    </div>
    ${groups.map(g => `
      <div class="pkg-group">
        <div class="pkg-group-title">${escapeHtml(g.title)}</div>
        <div class="pkg-grid">
          ${g.items.map(renderVenueCard).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

function renderVenueCard(item) {
  const price = Number(item.unit_price || 0);
  const unitLabel = formatUnit(item.unit, item.minimum_qty);
  const priceLine = `$${price.toLocaleString()}${unitLabel ? ` <span style="font-size:0.7em;color:var(--text-muted,#888);">${unitLabel}</span>` : ''}`;
  const capacity = item.capacity
    ? `<div class="pkg-card-desc" style="margin-top:4px;font-size:0.8em;color:var(--text-muted,#888);"><strong>Capacity:</strong> ${escapeHtml(item.capacity)}</div>`
    : '';
  const minQty = item.minimum_qty && item.minimum_qty > 1
    ? `<div class="pkg-card-desc" style="margin-top:4px;font-size:0.8em;color:var(--text-muted,#888);"><strong>Min:</strong> ${item.minimum_qty} ${escapeHtml(item.unit || '')}${item.minimum_qty === 1 ? '' : 's'}</div>`
    : '';
  return `
    <div class="pkg-card">
      <div>
        <div class="pkg-card-title">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="pkg-card-desc" style="margin-top:4px;">${escapeHtml(item.description)}</div>` : ''}
        ${capacity}
        ${minQty}
      </div>
      <div class="pkg-card-price">${priceLine}</div>
    </div>
  `;
}

function formatUnit(unit, minQty) {
  if (!unit) return '';
  const u = String(unit).toLowerCase();
  if (u === 'flat') return '';
  if (u === 'hour') return `/ hour${minQty > 1 ? ` (min ${minQty})` : ''}`;
  if (u === 'each') return '/ each';
  if (u === 'bundle') return '/ bundle';
  if (u === 'per person/day') return '/ person / day';
  return `/ ${unit}`;
}

function renderCard(pkg, items, svcById) {
  const priceDisplay = pkg.price_regular != null
    ? `$${Number(pkg.price_regular).toLocaleString()}`
    : '—';
  const promoDisplay = pkg.price_promo != null && Number(pkg.price_promo) < Number(pkg.price_regular)
    ? `<span class="pkg-card-price-promo">$${Number(pkg.price_regular).toLocaleString()}</span>`
    : '';
  const effectivePrice = pkg.price_promo != null && Number(pkg.price_promo) < Number(pkg.price_regular)
    ? pkg.price_promo : pkg.price_regular;

  const itemRows = items.map(it => {
    const svc = svcById.get(it.service_id);
    if (!svc) return '';
    const qtyClass = it.quantity > 1 ? '' : 'single';
    return `
      <div class="pkg-item">
        <span class="pkg-item-qty ${qtyClass}">${it.quantity}&times;</span>
        <span class="pkg-item-name">${escapeHtml(svc.name)}</span>
        <span class="pkg-item-dur">${svc.duration_minutes} min</span>
      </div>
    `;
  }).filter(Boolean).join('');

  return `
    <div class="pkg-card">
      <div>
        <div class="pkg-card-title">${escapeHtml(pkg.name)}</div>
        ${pkg.description ? `<div class="pkg-card-desc" style="margin-top:4px;">${escapeHtml(pkg.description)}</div>` : ''}
      </div>
      <div class="pkg-card-price">$${Number(effectivePrice || 0).toLocaleString()}${promoDisplay}</div>
      ${itemRows ? `
        <div class="pkg-includes">
          <div class="pkg-includes-label">Includes</div>
          ${itemRows}
        </div>
      ` : `
        <div class="pkg-includes">
          <div class="pkg-includes-label" style="color:#c9a876;">No included services set</div>
        </div>
      `}
    </div>
  `;
}
