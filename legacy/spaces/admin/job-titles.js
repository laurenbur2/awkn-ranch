// Job Titles admin — CRUD for title records + permission bundles.
// Assigning a title live-grants its permissions through get_effective_permissions.

import { supabase } from '../../shared/supabase.js';
import { initAdminPage, showToast } from '../../shared/admin-shell.js';

let authState = null;
let titles = [];
let permissions = [];       // all permissions rows
let titleAssigneeCount = new Map(); // title_id -> count of assigned users
let selectedTitleId = null;
let editingPerms = new Set();       // permission_keys currently checked in editor
let originalPerms = new Set();      // for dirty detection
let originalFields = {};            // { name, description, color }
let showArchived = false;

document.addEventListener('DOMContentLoaded', async () => {
  authState = await initAdminPage({
    activeTab: 'jobtitles',
    requiredPermission: 'manage_job_titles',
    section: 'admin',
    onReady: async (state) => {
      authState = state;
      await loadAll();
      wire();
      renderSidebar();
    },
  });
});

async function loadAll() {
  const [tt, pp, counts] = await Promise.all([
    supabase.from('job_titles').select('*').order('name'),
    supabase.from('permissions').select('*').order('category').order('sort_order'),
    supabase.from('app_users').select('job_title_id').eq('is_archived', false),
  ]);
  titles = tt.data || [];
  permissions = pp.data || [];
  titleAssigneeCount = new Map();
  (counts.data || []).forEach(r => {
    if (!r.job_title_id) return;
    titleAssigneeCount.set(r.job_title_id, (titleAssigneeCount.get(r.job_title_id) || 0) + 1);
  });
}

function wire() {
  document.getElementById('jtNewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('jtNewName');
    const name = (input.value || '').trim();
    if (!name) return;
    const { data, error } = await supabase.from('job_titles').insert({
      name,
      color: randomTitleColor(),
      created_by: authState?.appUser?.id || null,
    }).select().single();
    if (error) { showToast('Could not create title: ' + error.message, 'error'); return; }
    input.value = '';
    titles.push(data);
    titles.sort((a, b) => a.name.localeCompare(b.name));
    selectedTitleId = data.id;
    await loadTitlePerms(data.id);
    renderSidebar();
    renderEditor();
    showToast('Title created', 'success');
  });

  document.getElementById('jtShowArchived')?.addEventListener('change', (e) => {
    showArchived = !!e.target.checked;
    renderSidebar();
  });

  document.getElementById('jtEditNameInput')?.addEventListener('input', markDirty);
  document.getElementById('jtEditDesc')?.addEventListener('input', markDirty);
  document.getElementById('jtEditColor')?.addEventListener('input', markDirty);

  document.getElementById('jtSaveBtn')?.addEventListener('click', saveEditor);
  document.getElementById('jtResetBtn')?.addEventListener('click', () => {
    if (selectedTitleId) {
      loadTitlePerms(selectedTitleId).then(renderEditor);
    }
  });
  document.getElementById('jtArchiveBtn')?.addEventListener('click', archiveCurrent);
}

function renderSidebar() {
  const ul = document.getElementById('jtList');
  if (!ul) return;
  const visible = titles.filter(t => showArchived || !t.is_archived);
  if (visible.length === 0) {
    ul.innerHTML = '<li style="color:#9ca3af; justify-content:center; cursor:default;">No titles yet.</li>';
    return;
  }
  ul.innerHTML = visible.map(t => {
    const active = t.id === selectedTitleId ? ' active' : '';
    const count = titleAssigneeCount.get(t.id) || 0;
    return `
      <li class="${active}" data-id="${t.id}">
        <span class="jt-dot" style="background:${t.color || '#d1d5db'}"></span>
        <span>${escapeHtml(t.name)}${t.is_archived ? '<span class="jt-archived-badge">Archived</span>' : ''}</span>
        <span class="jt-count">${count}</span>
      </li>
    `;
  }).join('');
  ul.querySelectorAll('li[data-id]').forEach(li => {
    li.addEventListener('click', async () => {
      selectedTitleId = li.dataset.id;
      await loadTitlePerms(selectedTitleId);
      renderSidebar();
      renderEditor();
    });
  });
}

async function loadTitlePerms(titleId) {
  const { data } = await supabase
    .from('job_title_permissions')
    .select('permission_key')
    .eq('job_title_id', titleId);
  const set = new Set((data || []).map(r => r.permission_key));
  editingPerms = new Set(set);
  originalPerms = new Set(set);
  const title = titles.find(t => t.id === titleId);
  originalFields = {
    name: title?.name || '',
    description: title?.description || '',
    color: title?.color || '#d4883a',
  };
}

function renderEditor() {
  const editor = document.getElementById('jtEditor');
  const placeholder = document.getElementById('jtPlaceholder');
  if (!selectedTitleId) {
    editor?.classList.add('hidden');
    placeholder?.classList.remove('hidden');
    return;
  }
  const t = titles.find(x => x.id === selectedTitleId);
  if (!t) return;

  editor.classList.remove('hidden');
  placeholder.classList.add('hidden');

  document.getElementById('jtEditName').textContent = t.name;
  const count = titleAssigneeCount.get(t.id) || 0;
  document.getElementById('jtEditSub').textContent = `${count} staff member${count === 1 ? '' : 's'} assigned`;
  document.getElementById('jtEditNameInput').value = t.name;
  document.getElementById('jtEditDesc').value = t.description || '';
  document.getElementById('jtEditColor').value = t.color || '#d4883a';

  // Render permissions grouped by category
  const byCat = {};
  permissions.forEach(p => {
    const cat = p.category || 'other';
    (byCat[cat] = byCat[cat] || []).push(p);
  });
  const sectionOrder = ['staff', 'admin'];
  const otherCats = Object.keys(byCat).filter(c => !sectionOrder.includes(c)).sort();
  const order = [...sectionOrder.filter(c => byCat[c]), ...otherCats];

  const secHost = document.getElementById('jtPermSections');
  secHost.innerHTML = order.map(cat => {
    const list = byCat[cat];
    return `
      <div class="jt-perm-section">${escapeHtml(capitalize(cat))}</div>
      <div class="jt-perm-grid">
        ${list.map(p => {
          const checked = editingPerms.has(p.key) ? 'checked' : '';
          return `
            <label class="jt-perm">
              <input type="checkbox" data-key="${p.key}" ${checked}>
              <div>
                <div class="jt-perm-label">${escapeHtml(p.label || p.key)}</div>
                ${p.description ? `<div class="jt-perm-desc">${escapeHtml(p.description)}</div>` : ''}
                <div class="jt-perm-key">${escapeHtml(p.key)}</div>
              </div>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }).join('');

  secHost.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key;
      if (cb.checked) editingPerms.add(key);
      else editingPerms.delete(key);
      markDirty();
    });
  });

  markDirty();
}

function markDirty() {
  const t = titles.find(x => x.id === selectedTitleId);
  const nameVal = document.getElementById('jtEditNameInput')?.value?.trim() ?? '';
  const descVal = document.getElementById('jtEditDesc')?.value ?? '';
  const colorVal = document.getElementById('jtEditColor')?.value ?? '';
  const permsChanged = !setsEqual(editingPerms, originalPerms);
  const fieldsChanged = nameVal !== originalFields.name
    || descVal !== (originalFields.description || '')
    || colorVal !== (originalFields.color || '');
  const btn = document.getElementById('jtSaveBtn');
  if (btn) btn.disabled = !(permsChanged || fieldsChanged) || !nameVal;
}

async function saveEditor() {
  if (!selectedTitleId) return;
  const name = document.getElementById('jtEditNameInput').value.trim();
  const description = document.getElementById('jtEditDesc').value;
  const color = document.getElementById('jtEditColor').value;

  const saveBtn = document.getElementById('jtSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    // 1. Update title fields
    const { error: upErr } = await supabase
      .from('job_titles')
      .update({ name, description: description || null, color, updated_at: new Date().toISOString() })
      .eq('id', selectedTitleId);
    if (upErr) throw upErr;

    // 2. Sync permissions: delete removed, insert added
    const added = [...editingPerms].filter(k => !originalPerms.has(k));
    const removed = [...originalPerms].filter(k => !editingPerms.has(k));

    if (removed.length > 0) {
      const { error: delErr } = await supabase
        .from('job_title_permissions')
        .delete()
        .eq('job_title_id', selectedTitleId)
        .in('permission_key', removed);
      if (delErr) throw delErr;
    }
    if (added.length > 0) {
      const rows = added.map(k => ({ job_title_id: selectedTitleId, permission_key: k }));
      const { error: insErr } = await supabase.from('job_title_permissions').insert(rows);
      if (insErr) throw insErr;
    }

    // Update in-memory state
    const idx = titles.findIndex(t => t.id === selectedTitleId);
    if (idx !== -1) titles[idx] = { ...titles[idx], name, description: description || null, color };
    originalPerms = new Set(editingPerms);
    originalFields = { name, description: description || '', color };
    showToast('Saved', 'success');
    renderSidebar();
    renderEditor();
  } catch (e) {
    console.error(e);
    showToast('Save failed: ' + (e.message || e), 'error');
  } finally {
    saveBtn.textContent = 'Save';
    markDirty();
  }
}

async function archiveCurrent() {
  if (!selectedTitleId) return;
  const t = titles.find(x => x.id === selectedTitleId);
  if (!t) return;
  const action = t.is_archived ? 'unarchive' : 'archive';
  if (!confirm(`Sure you want to ${action} "${t.name}"? Staff assigned to it will keep the assignment but the title will be ${t.is_archived ? 'visible again' : 'hidden from new-assignment pickers'}.`)) return;
  const { error } = await supabase
    .from('job_titles')
    .update({ is_archived: !t.is_archived, updated_at: new Date().toISOString() })
    .eq('id', selectedTitleId);
  if (error) { showToast('Could not ' + action + ': ' + error.message, 'error'); return; }
  t.is_archived = !t.is_archived;
  renderSidebar();
  renderEditor();
  showToast((t.is_archived ? 'Archived' : 'Restored') + ' "' + t.name + '"', 'success');
}

// =============================================
// Helpers
// =============================================
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
function randomTitleColor() {
  const palette = ['#d4883a','#5b3fa0','#1e5f8a','#065f46','#92400e','#9b2c2c','#9d174d','#374151'];
  return palette[Math.floor(Math.random() * palette.length)];
}
