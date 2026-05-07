// Staff directory — visible to any signed-in user with view_staff_directory.
// Respects existing app_users.privacy_phone / privacy_bio (values: public | residents | private).

import { supabase } from '../../shared/supabase.js';
import { initAdminPage } from '../../shared/admin-shell.js';

let authState = null;
let staff = [];
let titleById = new Map();
let filterMode = 'all'; // 'all' | 'here'
let filterTitle = '';
let searchText = '';

document.addEventListener('DOMContentLoaded', async () => {
  authState = await initAdminPage({
    activeTab: 'staff',
    requiredPermission: 'view_staff_directory',
    section: 'staff',
    onReady: async (state) => {
      authState = state;
      await loadData();
      wireToolbar();
      wireAdminBar();
      render();
    },
  });
});

function wireAdminBar() {
  const role = authState?.appUser?.role;
  const isAdmin = role === 'admin' || role === 'oracle';
  const bar = document.getElementById('sdAdminBar');
  if (!bar) return;
  if (!isAdmin) return; // stays hidden
  bar.classList.remove('hidden');

  const btn = document.getElementById('sdStaffAdminBtn');
  const menu = document.getElementById('sdStaffAdminMenu');
  if (!btn || !menu) return;

  const close = () => {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

async function loadData() {
  const { data: titles } = await supabase
    .from('job_titles')
    .select('id, name, color, is_archived')
    .eq('is_archived', false)
    .order('name');
  titleById = new Map((titles || []).map(t => [t.id, t]));

  const titleSel = document.getElementById('sdTitleFilter');
  if (titleSel) {
    (titles || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id; opt.textContent = t.name;
      titleSel.appendChild(opt);
    });
  }

  const { data: rows, error } = await supabase
    .from('app_users')
    .select('id, email, display_name, first_name, last_name, phone, avatar_url, bio, role, is_current_resident, job_title_id, privacy_phone, privacy_bio, privacy_email')
    .in('role', ['staff', 'admin', 'oracle'])
    .eq('is_archived', false)
    .order('display_name', { nullsFirst: false });
  if (!error) staff = rows || [];
}

function wireToolbar() {
  document.getElementById('sdSearch')?.addEventListener('input', (e) => {
    searchText = (e.target.value || '').toLowerCase().trim();
    render();
  });
  document.getElementById('sdTitleFilter')?.addEventListener('change', (e) => {
    filterTitle = e.target.value || '';
    render();
  });
  document.querySelectorAll('.sd-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sd-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterMode = btn.dataset.filter;
      render();
    });
  });
}

function canSee(privacy, viewerRole) {
  // privacy value may be 'public', 'residents', 'private' (nullable = public default)
  if (!privacy || privacy === 'public') return true;
  if (privacy === 'residents') {
    return ['resident', 'associate', 'staff', 'admin', 'oracle'].includes(viewerRole);
  }
  return false; // 'private'
}

function render() {
  const grid = document.getElementById('sdGrid');
  if (!grid) return;

  const viewerRole = authState?.appUser?.role || 'public';

  const list = staff.filter(u => {
    if (filterMode === 'here' && !u.is_current_resident) return false;
    if (filterTitle && u.job_title_id !== filterTitle) return false;
    if (searchText) {
      const hay = [u.display_name, u.first_name, u.last_name, u.email].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(searchText)) return false;
    }
    return true;
  });

  if (list.length === 0) {
    grid.innerHTML = '<div class="sd-empty">No staff match your filters.</div>';
    return;
  }

  grid.innerHTML = list.map(u => {
    const name = u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
    const initials = getInitials(name);
    const title = u.job_title_id ? titleById.get(u.job_title_id)?.name : (u.role ? capitalize(u.role) : '');
    const phoneVisible = u.phone && canSee(u.privacy_phone, viewerRole);
    const emailVisible = u.email && canSee(u.privacy_email, viewerRole);
    const bioVisible = u.bio && canSee(u.privacy_bio, viewerRole);
    return `
      <div class="sd-card">
        <div class="sd-card-head">
          <div class="sd-av">${u.avatar_url ? `<img src="${escapeHtml(u.avatar_url)}" alt="">` : escapeHtml(initials)}</div>
          <div style="flex:1; min-width:0;">
            <div class="sd-name">${escapeHtml(name)}</div>
            ${title ? `<span class="sd-title-chip">${escapeHtml(title)}</span>` : ''}
          </div>
          ${u.is_current_resident ? '<span class="sd-present">On site</span>' : ''}
        </div>
        ${emailVisible ? `<div class="sd-contact"><span class="sd-label">Email</span><a href="mailto:${escapeHtml(u.email)}">${escapeHtml(u.email)}</a></div>` : ''}
        ${phoneVisible ? `<div class="sd-contact"><span class="sd-label">Phone</span><a href="tel:${escapeHtml(u.phone)}">${escapeHtml(u.phone)}</a></div>` : ''}
        ${bioVisible ? `<div class="sd-bio">${escapeHtml(u.bio)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
