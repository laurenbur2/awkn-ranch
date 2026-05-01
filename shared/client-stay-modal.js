// Shared modal for creating/editing a client_stays row.
// Used by both spaces/admin/retreat-house.js (calendar grid) and
// spaces/admin/clients.js (Lodging tab in the client drawer).
//
// Usage:
//   import { openClientStayModal } from '../../shared/client-stay-modal.js';
//   const result = await openClientStayModal({ leadId, bedId, checkIn, checkOut });
//   if (result.saved) refresh();
//
// Options:
//   leadId   — pre-select & lock the client (used from clients.js Lodging tab)
//   bedId    — pre-select the bed (used from calendar empty-cell click)
//   checkIn  — Date or ISO string for default check-in
//   checkOut — Date or ISO string for default check-out
//   stayId   — if provided, modal opens in edit mode for this client_stays row
//
// Resolves with { saved: boolean, stay?: object, action?: 'created'|'updated'|'cancelled-stay' }.

import { supabase } from './supabase.js';

const MODAL_ROOT_ID = 'awkn-client-stay-modal-root';

export async function openClientStayModal(opts = {}) {
  return new Promise(async (resolve) => {
    let mode = opts.stayId ? 'edit' : 'create';
    let stay = null;
    let leadId = opts.leadId || null;
    let bedId = opts.bedId || null;
    let checkInISO = toISODate(opts.checkIn || addDays(new Date(), 0));
    let checkOutISO = toISODate(opts.checkOut || addDays(new Date(opts.checkIn || Date.now()), 1));
    let packageId = null;
    let notes = '';

    if (mode === 'edit') {
      const { data, error } = await supabase
        .from('client_stays')
        .select('id, lead_id, bed_id, package_id, check_in_at, check_out_at, notes, status')
        .eq('id', opts.stayId)
        .single();
      if (error || !data) {
        console.warn('Failed to load stay for edit:', error);
        resolve({ saved: false });
        return;
      }
      stay = data;
      leadId     = data.lead_id;
      bedId      = data.bed_id;
      checkInISO = toISODate(data.check_in_at);
      checkOutISO = toISODate(data.check_out_at);
      packageId  = data.package_id;
      notes      = data.notes || '';
    }

    // Load reference data in parallel: beds (with room context) and—if a lead is
    // pre-selected—their active packages. Lead search is on-demand via the input.
    const [bedsRes, packagesRes, leadRes] = await Promise.all([
      supabase
        .from('beds')
        .select('id, label, bed_type, nightly_rate_cents, sort_order, space:spaces(id, name, slug, floor)')
        .eq('is_archived', false)
        .order('sort_order'),
      leadId
        ? supabase
            .from('client_packages')
            .select('id, name, status, occupancy_rate')
            .eq('lead_id', leadId)
            .in('status', ['active'])
            .order('purchased_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      leadId
        ? supabase
            .from('crm_leads')
            .select('id, first_name, last_name, email, business_line')
            .eq('id', leadId)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const beds = bedsRes.data || [];
    let packages = packagesRes.data || [];
    let lead = leadRes.data || null;

    const root = ensureRoot();
    root.innerHTML = renderShell({ mode, stay, lead, leadId, bedId, beds, checkInISO, checkOutISO, packageId, packages, notes });
    root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    function close(result) {
      root.classList.add('hidden');
      root.innerHTML = '';
      document.body.style.overflow = '';
      resolve(result);
    }

    // === Lead search (only when leadId not pre-locked) ===
    const searchInput = root.querySelector('#csm-lead-search');
    const searchResults = root.querySelector('#csm-lead-results');
    const selectedLeadEl = root.querySelector('#csm-selected-lead');
    let searchDebounce;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const q = searchInput.value.trim();
        if (q.length < 2) {
          searchResults.innerHTML = '';
          searchResults.classList.add('hidden');
          return;
        }
        searchDebounce = setTimeout(async () => {
          const { data } = await supabase
            .from('crm_leads')
            .select('id, first_name, last_name, email, business_line')
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
            .limit(10);
          const results = data || [];
          if (results.length === 0) {
            searchResults.innerHTML = '<div class="csm-search-empty">No clients match.</div>';
          } else {
            searchResults.innerHTML = results.map(r => `
              <button class="csm-search-row" data-lead-id="${r.id}">
                <span class="csm-search-name">${esc((r.first_name || '') + ' ' + (r.last_name || ''))}</span>
                <span class="csm-search-meta">${esc(r.email || '')} · ${esc(r.business_line || '')}</span>
              </button>
            `).join('');
          }
          searchResults.classList.remove('hidden');
        }, 200);
      });

      searchResults.addEventListener('click', async (e) => {
        const btn = e.target.closest('.csm-search-row');
        if (!btn) return;
        const id = btn.dataset.leadId;
        const { data } = await supabase
          .from('crm_leads')
          .select('id, first_name, last_name, email, business_line')
          .eq('id', id)
          .single();
        lead = data;
        leadId = data.id;
        // Refresh active packages for this newly chosen lead.
        const pkgRes = await supabase
          .from('client_packages')
          .select('id, name, status, occupancy_rate')
          .eq('lead_id', leadId)
          .in('status', ['active'])
          .order('purchased_at', { ascending: false });
        packages = pkgRes.data || [];
        // Re-render the lead block + package dropdown in place.
        const leadBlock = root.querySelector('#csm-lead-block');
        if (leadBlock) leadBlock.outerHTML = renderLeadBlock({ lead, leadId, locked: false });
        const pkgBlock = root.querySelector('#csm-package-block');
        if (pkgBlock) pkgBlock.outerHTML = renderPackageBlock({ packages, packageId: null });
        wireUpDynamic();
      });
    }

    // Outer/click-away close (only on overlay backdrop, not modal body)
    root.addEventListener('click', (e) => {
      if (e.target === root) close({ saved: false });
    });

    function wireUpDynamic() {
      const cancelBtn = root.querySelector('#csm-cancel');
      if (cancelBtn) cancelBtn.onclick = () => close({ saved: false });
      const closeBtn = root.querySelector('#csm-close');
      if (closeBtn) closeBtn.onclick = () => close({ saved: false });

      const cancelStayBtn = root.querySelector('#csm-cancel-stay');
      if (cancelStayBtn) cancelStayBtn.onclick = async () => {
        if (!confirm('Cancel this stay? It will be marked cancelled but the record is kept.')) return;
        const { error } = await supabase
          .from('client_stays')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', stay.id);
        if (error) {
          alert('Failed to cancel stay: ' + error.message);
          return;
        }
        close({ saved: true, action: 'cancelled-stay' });
      };

      const saveBtn = root.querySelector('#csm-save');
      if (saveBtn) saveBtn.onclick = async () => {
        const bedSel  = root.querySelector('#csm-bed').value;
        const ci      = root.querySelector('#csm-checkin').value;
        const co      = root.querySelector('#csm-checkout').value;
        const pkg     = root.querySelector('#csm-package')?.value || null;
        const noteVal = root.querySelector('#csm-notes').value || '';

        if (!leadId) return alertField('Pick a client first.');
        if (!ci || !co) return alertField('Both check-in and check-out dates are required.');
        if (new Date(co) <= new Date(ci)) return alertField('Check-out must be after check-in.');

        // Conflict check only when a specific bed is selected — unassigned
        // stays don't compete for a bed yet, so there's nothing to overlap.
        const ciIso = ci + 'T15:00:00Z'; // 3pm check-in
        const coIso = co + 'T11:00:00Z'; // 11am check-out
        let conflicts = [];
        if (bedSel) {
          const { data, error: confErr } = await supabase
            .from('client_stays')
            .select('id, check_in_at, check_out_at, lead:crm_leads(first_name, last_name)')
            .eq('bed_id', bedSel)
            .in('status', ['upcoming', 'active'])
            .lt('check_in_at', coIso)
            .gt('check_out_at', ciIso);
          if (confErr) {
            alert('Conflict check failed: ' + confErr.message);
            return;
          }
          conflicts = data || [];
        }
        const overlapping = (conflicts || []).filter(c => !stay || c.id !== stay.id);
        if (overlapping.length > 0) {
          const c = overlapping[0];
          const guest = (c.lead?.first_name || '') + ' ' + (c.lead?.last_name || '');
          return alertField(`This bed already has a stay (${guest.trim() || 'unknown guest'}, ${formatShortDate(c.check_in_at)} → ${formatShortDate(c.check_out_at)}) overlapping these dates.`);
        }

        const payload = {
          lead_id:      leadId,
          bed_id:       bedSel || null,
          package_id:   pkg || null,
          check_in_at:  ciIso,
          check_out_at: coIso,
          notes:        noteVal || null,
        };

        let res;
        if (mode === 'edit') {
          res = await supabase
            .from('client_stays')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', stay.id)
            .select()
            .single();
        } else {
          res = await supabase
            .from('client_stays')
            .insert([{ ...payload, status: 'upcoming' }])
            .select()
            .single();
        }
        if (res.error) {
          alert('Save failed: ' + res.error.message);
          return;
        }
        close({ saved: true, stay: res.data, action: mode === 'edit' ? 'updated' : 'created' });
      };
    }

    wireUpDynamic();
  });
}

// ============================================================================
// Render helpers
// ============================================================================

function renderShell({ mode, stay, lead, leadId, bedId, beds, checkInISO, checkOutISO, packageId, packages, notes }) {
  const title = mode === 'edit' ? 'Edit Stay' : 'New Retreat House Stay';
  return `
    ${INLINE_STYLES}
    <div class="csm-overlay">
      <div class="csm-modal" role="dialog" aria-modal="true">
        <div class="csm-head">
          <div class="csm-title">${esc(title)}</div>
          <button class="csm-x" id="csm-close" aria-label="Close">&times;</button>
        </div>
        <div class="csm-body">
          ${renderLeadBlock({ lead, leadId, locked: !!leadId && mode === 'edit' || (!!lead && !!leadId) })}
          ${renderBedBlock({ beds, bedId })}
          <div class="csm-row csm-row-2">
            <label class="csm-field">
              <span class="csm-label">Check-in</span>
              <input type="date" id="csm-checkin" value="${esc(checkInISO)}" required>
            </label>
            <label class="csm-field">
              <span class="csm-label">Check-out</span>
              <input type="date" id="csm-checkout" value="${esc(checkOutISO)}" required>
            </label>
          </div>
          ${renderPackageBlock({ packages, packageId })}
          <label class="csm-field">
            <span class="csm-label">Notes <span class="csm-optional">(optional)</span></span>
            <textarea id="csm-notes" rows="2" placeholder="Anything the front desk should know about this stay…">${esc(notes)}</textarea>
          </label>
          <div id="csm-error" class="csm-error hidden"></div>
        </div>
        <div class="csm-foot">
          <button class="csm-btn" id="csm-cancel">Cancel</button>
          ${mode === 'edit' ? `<button class="csm-btn csm-btn-danger" id="csm-cancel-stay">Cancel Stay</button>` : ''}
          <button class="csm-btn csm-btn-primary" id="csm-save">${mode === 'edit' ? 'Save Changes' : 'Create Stay'}</button>
        </div>
      </div>
    </div>
  `;
}

function renderLeadBlock({ lead, leadId, locked }) {
  if (lead && (locked || leadId)) {
    const name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.email || 'Client';
    const meta = [lead.email, lead.business_line].filter(Boolean).join(' · ');
    return `
      <div id="csm-lead-block" class="csm-field">
        <span class="csm-label">Client</span>
        <div class="csm-locked">
          <span class="csm-locked-name">${esc(name)}</span>
          ${meta ? `<span class="csm-locked-meta">${esc(meta)}</span>` : ''}
        </div>
      </div>
    `;
  }
  return `
    <div id="csm-lead-block" class="csm-field" style="position:relative;">
      <span class="csm-label">Client</span>
      <input type="text" id="csm-lead-search" placeholder="Search by name or email (min 2 chars)…" autocomplete="off">
      <div id="csm-lead-results" class="csm-search-results hidden"></div>
    </div>
  `;
}

function renderBedBlock({ beds, bedId }) {
  // Group beds by room for the grouped <select>.
  const byRoom = {};
  for (const b of beds) {
    const room = b.space || { name: '?' };
    (byRoom[room.id] = byRoom[room.id] || { room, beds: [] }).beds.push(b);
  }
  const groups = Object.values(byRoom).sort((a, b) =>
    (a.room.floor || '').localeCompare(b.room.floor || '') || a.room.name.localeCompare(b.room.name));

  return `
    <label class="csm-field" id="csm-bed-block">
      <span class="csm-label">Bed <span style="font-weight:400;opacity:0.7;">(optional)</span></span>
      <select id="csm-bed">
        <option value="">— unassigned —</option>
        ${groups.map(g => `
          <optgroup label="${esc(g.room.name)} (${esc(g.room.floor || '')})">
            ${g.beds.map(b => {
              const rate = (b.nightly_rate_cents || 0) / 100;
              const rateLabel = rate > 0 ? ` — $${rate.toFixed(0)}/night` : '';
              return `<option value="${b.id}" ${b.id === bedId ? 'selected' : ''}>${esc(b.label)} · ${esc(b.bed_type.replace('_', ' '))}${rateLabel}</option>`;
            }).join('')}
          </optgroup>
        `).join('')}
      </select>
    </label>
  `;
}

function renderPackageBlock({ packages, packageId }) {
  if (!packages || packages.length === 0) {
    return `
      <div id="csm-package-block" class="csm-field">
        <span class="csm-label">Linked package <span class="csm-optional">(optional)</span></span>
        <select id="csm-package" disabled>
          <option value="">— No active packages on this client —</option>
        </select>
      </div>
    `;
  }
  return `
    <div id="csm-package-block" class="csm-field">
      <span class="csm-label">Linked package <span class="csm-optional">(optional — link this stay to an immersive package)</span></span>
      <select id="csm-package">
        <option value="">— No package link —</option>
        ${packages.map(p => `<option value="${p.id}" ${p.id === packageId ? 'selected' : ''}>${esc(p.name)} (${esc(p.occupancy_rate)})</option>`).join('')}
      </select>
    </div>
  `;
}

// ============================================================================
// Helpers
// ============================================================================

function ensureRoot() {
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function alertField(msg) {
  const errEl = document.getElementById('csm-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  } else {
    alert(msg);
  }
}

function toISODate(dt) {
  if (!dt) return '';
  const d = (dt instanceof Date) ? dt : new Date(dt);
  if (isNaN(d.getTime())) return '';
  // YYYY-MM-DD in local timezone
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatShortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) { return iso; }
}

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ============================================================================
// Inline styles — kept here so the modal is self-contained and works without
// asking host pages to import a CSS file.
// ============================================================================

const INLINE_STYLES = `
<style>
  #${MODAL_ROOT_ID}.hidden { display: none; }
  #${MODAL_ROOT_ID} .csm-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(20, 20, 20, 0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  #${MODAL_ROOT_ID} .csm-modal {
    background: #fff; border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.25);
    width: 100%; max-width: 520px; max-height: calc(100vh - 2rem);
    display: flex; flex-direction: column;
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  #${MODAL_ROOT_ID} .csm-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.25rem; border-bottom: 1px solid #f3f4f6;
  }
  #${MODAL_ROOT_ID} .csm-title { font-size: 1.05rem; font-weight: 700; color: #111827; }
  #${MODAL_ROOT_ID} .csm-x {
    background: none; border: none; font-size: 1.5rem; cursor: pointer;
    color: #6b7280; line-height: 1; padding: 0 0.25rem;
  }
  #${MODAL_ROOT_ID} .csm-body {
    padding: 1rem 1.25rem; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  #${MODAL_ROOT_ID} .csm-field { display: flex; flex-direction: column; gap: 0.3rem; }
  #${MODAL_ROOT_ID} .csm-label {
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    color: #6b7280;
  }
  #${MODAL_ROOT_ID} .csm-optional { font-weight: 500; color: #9ca3af; text-transform: none; letter-spacing: 0; }
  #${MODAL_ROOT_ID} .csm-field input[type="date"],
  #${MODAL_ROOT_ID} .csm-field input[type="text"],
  #${MODAL_ROOT_ID} .csm-field select,
  #${MODAL_ROOT_ID} .csm-field textarea {
    padding: 0.55rem 0.7rem; border: 1px solid #d1d5db; border-radius: 8px;
    font-family: inherit; font-size: 0.88rem; background: #fff;
    box-sizing: border-box;
  }
  #${MODAL_ROOT_ID} .csm-field input:focus,
  #${MODAL_ROOT_ID} .csm-field select:focus,
  #${MODAL_ROOT_ID} .csm-field textarea:focus { outline: 2px solid #d4883a; outline-offset: -1px; border-color: #d4883a; }
  #${MODAL_ROOT_ID} .csm-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  #${MODAL_ROOT_ID} .csm-locked {
    display: flex; flex-direction: column;
    background: #f9fafb; padding: 0.5rem 0.7rem; border-radius: 8px; border: 1px solid #e5e7eb;
  }
  #${MODAL_ROOT_ID} .csm-locked-name { font-size: 0.9rem; font-weight: 600; color: #111827; }
  #${MODAL_ROOT_ID} .csm-locked-meta { font-size: 0.75rem; color: #6b7280; margin-top: 0.1rem; }
  #${MODAL_ROOT_ID} .csm-search-results {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 5;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
    margin-top: 0.25rem; max-height: 240px; overflow-y: auto;
    box-shadow: 0 8px 20px rgba(0,0,0,0.08);
  }
  #${MODAL_ROOT_ID} .csm-search-results.hidden { display: none; }
  #${MODAL_ROOT_ID} .csm-search-row {
    display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem;
    width: 100%; text-align: left; padding: 0.5rem 0.7rem;
    background: none; border: none; border-bottom: 1px solid #f3f4f6;
    font-family: inherit; cursor: pointer;
  }
  #${MODAL_ROOT_ID} .csm-search-row:hover { background: #fafafa; }
  #${MODAL_ROOT_ID} .csm-search-name { font-size: 0.88rem; font-weight: 600; color: #111827; }
  #${MODAL_ROOT_ID} .csm-search-meta { font-size: 0.74rem; color: #6b7280; }
  #${MODAL_ROOT_ID} .csm-search-empty { padding: 0.7rem; font-size: 0.82rem; color: #9ca3af; text-align: center; }
  #${MODAL_ROOT_ID} .csm-error {
    background: #fef2f2; color: #991b1b; padding: 0.55rem 0.7rem;
    border-radius: 8px; font-size: 0.82rem; border: 1px solid #fecaca;
  }
  #${MODAL_ROOT_ID} .csm-error.hidden { display: none; }
  #${MODAL_ROOT_ID} .csm-foot {
    display: flex; gap: 0.5rem; justify-content: flex-end;
    padding: 0.85rem 1.25rem; border-top: 1px solid #f3f4f6;
  }
  #${MODAL_ROOT_ID} .csm-btn {
    padding: 0.55rem 0.95rem; border-radius: 8px; border: 1px solid #d1d5db;
    background: #fff; font-family: inherit; font-size: 0.85rem; font-weight: 600;
    color: #374151; cursor: pointer;
  }
  #${MODAL_ROOT_ID} .csm-btn:hover { background: #f9fafb; }
  #${MODAL_ROOT_ID} .csm-btn-primary { background: #d4883a; color: #fff; border-color: #d4883a; }
  #${MODAL_ROOT_ID} .csm-btn-primary:hover { background: #b87625; }
  #${MODAL_ROOT_ID} .csm-btn-danger { color: #991b1b; border-color: #fecaca; }
  #${MODAL_ROOT_ID} .csm-btn-danger:hover { background: #fef2f2; }
</style>
`;
