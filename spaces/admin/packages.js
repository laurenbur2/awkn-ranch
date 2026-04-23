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
