// Facilitators admin — directory of practitioners/guides who run Within sessions.
// Same shape as the existing facilitators table; the Within Schedule "+ New
// Session" modal pulls from this list when assigning who's running a session.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';

let allFacilitators = [];
let editingId = null;
let filterState = {
  search: '',
  showArchived: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminPage({
    activeTab: 'facilitators',
    requiredPermission: 'view_crm',
    section: 'staff',
    onReady: async () => {
      await loadAll();
      bindControls();
      bindModal();
      render();
    },
  });
});

async function loadAll() {
  const { data, error } = await supabase
    .from('facilitators')
    .select('id, first_name, last_name, email, phone, notes, is_active, sort_order')
    .order('first_name');
  if (error) {
    console.warn('facilitators load error:', error);
    showToast('Could not load facilitators', 'error');
    return;
  }
  allFacilitators = data || [];
}

function bindControls() {
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    filterState.search = (e.target.value || '').toLowerCase();
    render();
  });
  document.getElementById('showArchived')?.addEventListener('change', (e) => {
    filterState.showArchived = !!e.target.checked;
    render();
  });
  document.getElementById('btnNew')?.addEventListener('click', () => openModal(null));
}

function applyFilters(rows) {
  return rows.filter(f => {
    if (!filterState.showArchived && !f.is_active) return false;
    if (filterState.search) {
      const hay = [f.first_name, f.last_name, f.email, f.phone, f.notes]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(filterState.search)) return false;
    }
    return true;
  });
}

function render() {
  const body = document.getElementById('facilitatorsBody');
  const filtered = applyFilters(allFacilitators);
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="fc-empty">
      <strong>No facilitators yet.</strong>
      Click "+ New Facilitator" to add one.
    </td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(renderRow).join('');
  body.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
}

function renderRow(f) {
  const fullName = ((f.first_name || '') + ' ' + (f.last_name || '')).trim() || '(unnamed)';
  const statusPill = f.is_active
    ? '<span class="fc-pill active">Active</span>'
    : '<span class="fc-pill archived">Archived</span>';
  return `
    <tr class="${f.is_active ? '' : 'is-archived'}">
      <td class="fc-cell-name">${esc(fullName)}</td>
      <td class="fc-cell-contact">${esc(f.email || '—')}</td>
      <td class="fc-cell-contact col-phone">${esc(f.phone || '—')}</td>
      <td>${statusPill}</td>
      <td>
        <div class="fc-row-actions">
          <button class="fc-btn" data-edit="${esc(f.id)}">Edit</button>
        </div>
      </td>
    </tr>
  `;
}

// ============================================================================
// Modal — new + edit + delete
// ============================================================================
function openModal(id) {
  editingId = id;
  hideError();
  const isNew = !id;
  document.getElementById('modalTitle').textContent = isNew ? 'New Facilitator' : 'Edit Facilitator';
  document.getElementById('btnDelete').classList.toggle('hidden', isNew);

  let f = { first_name: '', last_name: '', email: '', phone: '', notes: '', is_active: true };
  if (id) {
    const found = allFacilitators.find(x => x.id === id);
    if (found) f = found;
  }
  document.getElementById('fldFirstName').value = f.first_name || '';
  document.getElementById('fldLastName').value  = f.last_name  || '';
  document.getElementById('fldEmail').value     = f.email      || '';
  document.getElementById('fldPhone').value     = f.phone      || '';
  document.getElementById('fldNotes').value     = f.notes      || '';
  document.getElementById('fldActive').checked  = f.is_active !== false;

  document.getElementById('editModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('fldFirstName').focus(), 30);
}

function closeModal() {
  document.getElementById('editModal').classList.add('hidden');
  editingId = null;
}

function bindModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('btnCancel').addEventListener('click', closeModal);
  document.getElementById('btnSave').addEventListener('click', save);
  document.getElementById('btnDelete').addEventListener('click', remove);
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('editModal').classList.contains('hidden')) {
      closeModal();
    }
  });
}

function showError(msg) {
  const el = document.getElementById('modalError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('modalError').classList.add('hidden');
}

async function save() {
  hideError();
  const firstName = document.getElementById('fldFirstName').value.trim();
  const lastName  = document.getElementById('fldLastName').value.trim();
  const email     = document.getElementById('fldEmail').value.trim();
  const phone     = document.getElementById('fldPhone').value.trim();
  const notes     = document.getElementById('fldNotes').value.trim();
  const isActive  = document.getElementById('fldActive').checked;

  if (!firstName) {
    showError('First name is required.');
    return;
  }

  const payload = {
    first_name: firstName,
    last_name:  lastName  || null,
    email:      email     || null,
    phone:      phone     || null,
    notes:      notes     || null,
    is_active:  isActive,
  };

  const btn = document.getElementById('btnSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  let result;
  if (editingId) {
    result = await supabase.from('facilitators').update(payload).eq('id', editingId).select().single();
  } else {
    result = await supabase.from('facilitators').insert(payload).select().single();
  }

  btn.disabled = false;
  btn.textContent = 'Save';

  if (result.error) {
    showError('Could not save: ' + result.error.message);
    return;
  }

  // Update local cache and re-render
  if (editingId) {
    const idx = allFacilitators.findIndex(x => x.id === editingId);
    if (idx >= 0) allFacilitators[idx] = result.data;
  } else {
    allFacilitators.push(result.data);
  }
  allFacilitators.sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
  closeModal();
  render();
  showToast(editingId ? 'Facilitator updated' : 'Facilitator added', 'success');
}

async function remove() {
  if (!editingId) return;
  const f = allFacilitators.find(x => x.id === editingId);
  if (!f) return;
  const fullName = ((f.first_name || '') + ' ' + (f.last_name || '')).trim() || 'this facilitator';
  if (!confirm(`Delete ${fullName}? Sessions previously assigned to them will keep the record but the name lookup will be empty.`)) {
    return;
  }
  const btn = document.getElementById('btnDelete');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  const { error } = await supabase.from('facilitators').delete().eq('id', editingId);

  btn.disabled = false;
  btn.textContent = 'Delete';

  if (error) {
    // Foreign key constraint will fire if any scheduling_bookings still ref
    // this facilitator. Surface a useful message and suggest archiving.
    showError('Could not delete: ' + error.message + '. Try unchecking "Active" and saving instead.');
    return;
  }
  allFacilitators = allFacilitators.filter(x => x.id !== editingId);
  closeModal();
  render();
  showToast('Facilitator removed', 'success');
}

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
