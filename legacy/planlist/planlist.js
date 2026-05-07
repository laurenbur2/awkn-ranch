/**
 * PlanList — Public development todo / checklist page
 * Backed by Supabase todo_categories + todo_items tables
 * Fully self-contained — no auth, no shared imports.
 */

const SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

// Wait for Supabase CDN to load
function waitForSupabase(maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (window.supabase?.createClient) resolve(window.supabase);
      else if (attempts >= maxAttempts) reject(new Error('Supabase failed to load'));
      else { attempts++; setTimeout(check, 100); }
    };
    check();
  });
}

let supabase;
let todoCategories = [];
let todoAllItems = [];
let todoSearchQuery = '';

const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const defaultIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
const icons = {
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  chevron: '<svg class="todo-category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};

// Boot
(async () => {
  try {
    const sb = window.supabase?.createClient ? window.supabase : await waitForSupabase();
    supabase = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await loadTodoData();
  } catch (err) {
    document.getElementById('planlistContent').innerHTML =
      `<div style="text-align:center;padding:3rem;color:#991b1b">Failed to load: ${esc(err.message)}</div>`;
  }
})();

// ═══════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════

async function loadTodoData() {
  try {
    const [catRes, itemRes] = await Promise.all([
      supabase.from('todo_categories').select('*').order('display_order'),
      supabase.from('todo_items').select('*').order('display_order'),
    ]);
    if (catRes.error) showToast('Failed to load categories: ' + catRes.error.message, 'error');
    if (itemRes.error) showToast('Failed to load items: ' + itemRes.error.message, 'error');
    todoAllItems = itemRes.data || [];
    todoCategories = (catRes.data || []).map(cat => ({
      ...cat,
      items: todoAllItems.filter(i => i.category_id === cat.id)
    }));
  } catch (err) {
    showToast('Error loading data: ' + err.message, 'error');
  }
  render();
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════

function render() {
  const container = document.getElementById('planlistContent');
  const total = todoAllItems.length;
  const done = todoAllItems.filter(i => i.is_checked).length;
  const remaining = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  container.innerHTML = `
    <h2 style="font-size:1.375rem;font-weight:700;margin-bottom:0.25rem;">PlanList</h2>
    <p style="color:var(--text-muted,#7d6f74);font-size:0.8125rem;margin-bottom:1.25rem;">Development todo items, implementation plans, and project checklists</p>

    <div class="todo-summary">
      <div class="todo-summary-stat"><span class="todo-summary-value total">${total}</span><span class="todo-summary-label">Total</span></div>
      <div class="todo-summary-stat"><span class="todo-summary-value done">${done}</span><span class="todo-summary-label">Done</span></div>
      <div class="todo-summary-stat"><span class="todo-summary-value remaining">${remaining}</span><span class="todo-summary-label">Remaining</span></div>
      <div class="todo-summary-stat"><span class="todo-summary-value" style="color:${pct === 100 ? 'var(--success,#54a326)' : 'var(--text,#2a1f23)'}">${pct}%</span><span class="todo-summary-label">Progress</span></div>
    </div>
    <div class="todo-progress-bar"><div class="todo-progress-fill" style="width:${pct}%"></div></div>

    <div class="todo-search">
      ${icons.search}
      <input type="text" id="todoSearch" placeholder="Search tasks..." autocomplete="off" value="${esc(todoSearchQuery)}">
      <span class="todo-search-count" id="todoSearchCount"></span>
      <button class="todo-search-clear ${todoSearchQuery ? '' : 'hidden'}" id="todoSearchClear">&times;</button>
    </div>

    <div class="todo-actions">
      <button class="btn-reset" id="resetAllBtn">Reset All</button>
      <button class="btn-add-cat" id="addCategoryBtn">+ Category</button>
    </div>

    <div id="todoContainer">${todoCategories.map(cat => {
      const visibleItems = cat.items.filter(i => itemMatchesSearch(i, todoSearchQuery));
      const catHidden = todoSearchQuery && visibleItems.length === 0;
      const catDone = cat.items.filter(i => i.is_checked).length;
      const catTotal = cat.items.length;
      const allDone = catDone === catTotal && catTotal > 0;
      const collapsed = todoSearchQuery ? false : allDone;
      return `
        <div class="todo-category${collapsed ? ' collapsed' : ''}${catHidden ? ' search-hidden' : ''}" data-cat="${cat.id}">
          <div class="todo-category-header" onclick="this.parentElement.classList.toggle('collapsed')">
            ${cat.icon_svg || defaultIcon}
            <h2>${esc(cat.title)}</h2>
            <span class="todo-category-progress"><span class="${allDone ? 'done' : ''}">${todoSearchQuery ? `${visibleItems.length}/` : ''}${catDone}/${catTotal}</span></span>
            <div class="todo-cat-actions" onclick="event.stopPropagation()">
              <button class="todo-action-btn" title="Add item" data-action="add-item" data-cat-id="${cat.id}">${icons.plus}</button>
              <button class="todo-action-btn" title="Edit" data-action="edit-cat" data-cat-id="${cat.id}">${icons.edit}</button>
              <button class="todo-action-btn" title="Move up" data-action="move-cat-up" data-cat-id="${cat.id}">${icons.up}</button>
              <button class="todo-action-btn" title="Move down" data-action="move-cat-down" data-cat-id="${cat.id}">${icons.down}</button>
            </div>
            ${icons.chevron}
          </div>
          <div class="todo-items">
            ${cat.items.map((item, idx) => {
              const matches = itemMatchesSearch(item, todoSearchQuery);
              const checked = item.is_checked;
              const badgeHtml = item.badge ? `<span class="todo-badge ${item.badge}">${item.badge}</span>` : '';
              const checkedInfo = checked && item.checked_at ? `<div class="todo-checked-info">${timeAgo(item.checked_at)}</div>` : '';
              const titleHtml = todoSearchQuery ? highlightText(item.title, todoSearchQuery) : esc(item.title);
              const descHtml = item.description ? (todoSearchQuery ? highlightHtml(item.description, todoSearchQuery) : item.description) : '';
              return `
                <div class="todo-item${checked ? ' checked' : ''}${!matches ? ' search-hidden' : ''}">
                  <input type="checkbox" class="todo-checkbox" data-id="${item.id}" ${checked ? 'checked' : ''}>
                  <div class="todo-item-content">
                    <div class="todo-item-title">${titleHtml}</div>
                    ${descHtml ? `<div class="todo-item-desc">${descHtml}</div>` : ''}
                    ${checkedInfo}
                  </div>
                  ${badgeHtml}
                  <button class="todo-item-edit-btn" title="Edit" data-action="edit-item" data-item-id="${item.id}">${icons.edit}</button>
                  <div class="todo-item-actions" onclick="event.stopPropagation()">
                    <button class="todo-action-btn" title="Move up" data-action="move-item-up" data-item-id="${item.id}" ${idx === 0 ? 'disabled' : ''}>${icons.up}</button>
                    <button class="todo-action-btn" title="Move down" data-action="move-item-down" data-item-id="${item.id}" ${idx === cat.items.length - 1 ? 'disabled' : ''}>${icons.down}</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('')}</div>

    <!-- Modal -->
    <div id="todoModal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="todoModalTitle">Add Category</h2>
          <button class="modal-close" id="todoModalClose">&times;</button>
        </div>
        <div class="modal-body" id="todoModalBody"></div>
        <div class="modal-footer">
          <button class="btn-delete" id="todoModalDelete" style="display:none">Delete</button>
          <button class="btn-cancel" id="todoModalCancel">Cancel</button>
          <button class="btn-save" id="todoModalSave">Save</button>
        </div>
      </div>
    </div>`;

  bindEvents();

  if (todoSearchQuery) {
    const matchCount = todoAllItems.filter(i => itemMatchesSearch(i, todoSearchQuery)).length;
    const countEl = document.getElementById('todoSearchCount');
    if (countEl) countEl.textContent = `${matchCount}/${todoAllItems.length}`;
  }
}

// ═══════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════

function bindEvents() {
  const container = document.getElementById('todoContainer');
  if (!container) return;

  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('todo-checkbox')) toggleItem(e.target.dataset.id);
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, catId, itemId } = btn.dataset;
    switch (action) {
      case 'add-item': openItemModal(catId); break;
      case 'edit-cat': { const c = todoCategories.find(x => x.id === catId); if (c) openCategoryModal(c); break; }
      case 'move-cat-up': moveCategory(catId, 'up'); break;
      case 'move-cat-down': moveCategory(catId, 'down'); break;
      case 'edit-item': { const i = todoAllItems.find(x => x.id === itemId); if (i) openItemModal(i.category_id, i); break; }
      case 'move-item-up': moveItem(itemId, 'up'); break;
      case 'move-item-down': moveItem(itemId, 'down'); break;
    }
  });

  const searchInput = document.getElementById('todoSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => { todoSearchQuery = searchInput.value.trim(); render(); });
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
  document.getElementById('todoSearchClear')?.addEventListener('click', () => { todoSearchQuery = ''; render(); });
  document.getElementById('resetAllBtn')?.addEventListener('click', handleResetAll);
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryModal());
  document.getElementById('todoModalClose')?.addEventListener('click', closeModal);
  document.getElementById('todoModalCancel')?.addEventListener('click', closeModal);
  document.getElementById('todoModal')?.addEventListener('click', (e) => { if (e.target.id === 'todoModal') closeModal(); });
}

// ═══════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════

async function toggleItem(itemId) {
  const item = todoAllItems.find(i => i.id === itemId);
  if (!item) return;
  const newChecked = !item.is_checked;
  item.is_checked = newChecked;
  item.checked_at = newChecked ? new Date().toISOString() : null;
  render();
  const { error } = await supabase.from('todo_items').update({
    is_checked: newChecked,
    checked_by: null,
    checked_at: newChecked ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('id', itemId);
  if (error) { item.is_checked = !newChecked; render(); showToast('Failed to update', 'error'); }
}

function openCategoryModal(category = null) {
  const modal = document.getElementById('todoModal');
  const title = document.getElementById('todoModalTitle');
  const body = document.getElementById('todoModalBody');
  const saveBtn = document.getElementById('todoModalSave');
  const deleteBtn = document.getElementById('todoModalDelete');
  title.textContent = category ? 'Edit Category' : 'Add Category';
  body.innerHTML = `
    <label for="catTitle">Title</label>
    <input type="text" id="catTitle" value="${esc(category?.title || '')}" placeholder="Category name">
    <label for="catIcon">Icon SVG</label>
    <textarea id="catIcon" rows="3" style="font-family:monospace;font-size:0.8rem" placeholder="Paste SVG element">${esc(category?.icon_svg || defaultIcon)}</textarea>
    <small style="color:var(--text-muted,#7d6f74);display:block;margin-top:0.25rem">Paste a Feather Icons SVG or leave default</small>`;
  deleteBtn.style.display = category ? '' : 'none';
  deleteBtn.onclick = async () => {
    if (!confirm(`Delete "${category.title}" and all its items?`)) return;
    const { error } = await supabase.from('todo_categories').delete().eq('id', category.id);
    if (error) { showToast('Delete failed', 'error'); return; }
    closeModal(); showToast('Category deleted', 'info'); await loadTodoData();
  };
  saveBtn.onclick = async () => {
    const t = document.getElementById('catTitle').value.trim();
    const icon = document.getElementById('catIcon').value.trim();
    if (!t) { showToast('Title is required', 'error'); return; }
    if (category) {
      const { error } = await supabase.from('todo_categories').update({ title: t, icon_svg: icon, updated_at: new Date().toISOString() }).eq('id', category.id);
      if (error) { showToast('Save failed', 'error'); return; }
      showToast('Category updated', 'success');
    } else {
      const maxOrder = todoCategories.reduce((max, c) => Math.max(max, c.display_order), -1);
      const { error } = await supabase.from('todo_categories').insert({ title: t, icon_svg: icon, display_order: maxOrder + 1 });
      if (error) { showToast('Save failed', 'error'); return; }
      showToast('Category added', 'success');
    }
    closeModal(); await loadTodoData();
  };
  modal.classList.remove('hidden');
}

function openItemModal(categoryId, item = null) {
  const modal = document.getElementById('todoModal');
  const title = document.getElementById('todoModalTitle');
  const body = document.getElementById('todoModalBody');
  const saveBtn = document.getElementById('todoModalSave');
  const deleteBtn = document.getElementById('todoModalDelete');
  title.textContent = item ? 'Edit Item' : 'Add Item';
  const catOptions = todoCategories.map(c =>
    `<option value="${c.id}" ${c.id === (item?.category_id || categoryId) ? 'selected' : ''}>${esc(c.title)}</option>`
  ).join('');
  body.innerHTML = `
    <label for="itemTitle">Title</label>
    <input type="text" id="itemTitle" value="${esc(item?.title || '')}" placeholder="Task title">
    <label for="itemDesc">Description <small style="font-weight:400;color:var(--text-muted,#7d6f74)">(HTML allowed)</small></label>
    <textarea id="itemDesc" rows="3" placeholder="Optional description...">${item?.description || ''}</textarea>
    <label for="itemBadge">Priority</label>
    <select id="itemBadge">
      <option value="" ${!item?.badge ? 'selected' : ''}>None</option>
      <option value="critical" ${item?.badge === 'critical' ? 'selected' : ''}>Critical</option>
      <option value="important" ${item?.badge === 'important' ? 'selected' : ''}>Important</option>
      <option value="nice" ${item?.badge === 'nice' ? 'selected' : ''}>Nice to Have</option>
      <option value="blocked" ${item?.badge === 'blocked' ? 'selected' : ''}>Blocked</option>
    </select>
    <label for="itemCategory">Category</label>
    <select id="itemCategory">${catOptions}</select>`;
  deleteBtn.style.display = item ? '' : 'none';
  deleteBtn.onclick = async () => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    const { error } = await supabase.from('todo_items').delete().eq('id', item.id);
    if (error) { showToast('Delete failed', 'error'); return; }
    closeModal(); showToast('Item deleted', 'info'); await loadTodoData();
  };
  saveBtn.onclick = async () => {
    const t = document.getElementById('itemTitle').value.trim();
    const desc = document.getElementById('itemDesc').value.trim();
    const badge = document.getElementById('itemBadge').value || null;
    const catId = document.getElementById('itemCategory').value;
    if (!t) { showToast('Title is required', 'error'); return; }
    if (item) {
      const { error } = await supabase.from('todo_items').update({ title: t, description: desc || null, badge, category_id: catId, updated_at: new Date().toISOString() }).eq('id', item.id);
      if (error) { showToast('Save failed', 'error'); return; }
      showToast('Item updated', 'success');
    } else {
      const catItems = todoAllItems.filter(i => i.category_id === catId);
      const maxOrder = catItems.reduce((max, i) => Math.max(max, i.display_order), -1);
      const { error } = await supabase.from('todo_items').insert({ category_id: catId, title: t, description: desc || null, badge, display_order: maxOrder + 1 });
      if (error) { showToast('Save failed', 'error'); return; }
      showToast('Item added', 'success');
    }
    closeModal(); await loadTodoData();
  };
  modal.classList.remove('hidden');
}

function closeModal() { document.getElementById('todoModal')?.classList.add('hidden'); }

async function moveCategory(catId, direction) {
  const idx = todoCategories.findIndex(c => c.id === catId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= todoCategories.length) return;
  const a = todoCategories[idx], b = todoCategories[swapIdx];
  await Promise.all([
    supabase.from('todo_categories').update({ display_order: b.display_order }).eq('id', a.id),
    supabase.from('todo_categories').update({ display_order: a.display_order }).eq('id', b.id)
  ]);
  await loadTodoData();
}

async function moveItem(itemId, direction) {
  const cat = todoCategories.find(c => c.items.some(i => i.id === itemId));
  if (!cat) return;
  const items = cat.items;
  const idx = items.findIndex(i => i.id === itemId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;
  const a = items[idx], b = items[swapIdx];
  await Promise.all([
    supabase.from('todo_items').update({ display_order: b.display_order }).eq('id', a.id),
    supabase.from('todo_items').update({ display_order: a.display_order }).eq('id', b.id)
  ]);
  await loadTodoData();
}

async function handleResetAll() {
  if (!confirm('Reset all checkboxes? This will uncheck everything.')) return;
  const { error } = await supabase.from('todo_items').update({
    is_checked: false, checked_by: null, checked_at: null, updated_at: new Date().toISOString()
  }).eq('is_checked', true);
  if (error) { showToast('Reset failed', 'error'); return; }
  showToast('All tasks reset', 'info');
  await loadTodoData();
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function itemMatchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (item.title || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q) || (item.badge || '').toLowerCase().includes(q);
}

function highlightText(text, query) {
  if (!query || !text) return esc(text);
  const escaped = esc(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${q})`, 'gi'), '<span class="todo-search-highlight">$1</span>');
}

function highlightHtml(html, query) {
  if (!query || !html) return html;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    return text.replace(new RegExp(`(${q})`, 'gi'), '<span class="todo-search-highlight">$1</span>');
  });
}
