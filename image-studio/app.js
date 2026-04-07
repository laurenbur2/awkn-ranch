// Image Studio — AWKN
// Standalone admin tool for generating AI images via Gemini 2.5 Flash Image
// Non-module IIFE — uses global window.supabase from CDN

(function() {
  'use strict';

  var SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

  // Hardcoded allowlist (matches is_within_authorized in DB)
  var ALLOWED_EMAILS = [
    'justin@within.center',
    'lauren@awknranch.com',
    'wdnaylor@gmail.com'
  ];

  var sb = null;
  var currentUserEmail = '';
  var galleryItems = [];
  var lastImage = null;

  // ============ INIT ============
  function waitForSupabase(cb) {
    if (window.supabase && window.supabase.createClient) return cb();
    setTimeout(function() { waitForSupabase(cb); }, 50);
  }

  function getBasePath() {
    // GitHub Pages serves repo under /awkn-ranch/
    var path = window.location.pathname;
    var match = path.match(/^(\/[^\/]+)\/image-studio/);
    return match ? match[1] : '';
  }

  function getRedirectUrl() {
    return window.location.origin + getBasePath() + '/image-studio/';
  }

  waitForSupabase(function() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
    init();
  });

  function init() {
    // Check existing session
    sb.auth.getSession().then(function(res) {
      var session = res && res.data && res.data.session;
      if (session && session.user && session.user.email) {
        var email = session.user.email.toLowerCase();
        // Check allowlist (also check staff table fallback)
        checkAllowed(email, function(allowed) {
          if (allowed) {
            currentUserEmail = email;
            showApp();
          } else {
            sb.auth.signOut();
            showError('Account ' + email + ' is not authorized for Image Studio.');
          }
        });
      } else {
        showLogin();
      }
    });

    // Listen for auth state changes (after OAuth redirect)
    sb.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN' && session && session.user) {
        var email = session.user.email.toLowerCase();
        checkAllowed(email, function(allowed) {
          if (allowed) {
            currentUserEmail = email;
            showApp();
          } else {
            sb.auth.signOut();
            showError('Account ' + email + ' is not authorized for Image Studio.');
          }
        });
      }
    });

    setupEventListeners();
  }

  function checkAllowed(email, cb) {
    if (ALLOWED_EMAILS.indexOf(email) !== -1) return cb(true);
    // Check within_staff table
    sb.from('within_staff')
      .select('email,status')
      .eq('email', email)
      .eq('status', 'active')
      .limit(1)
      .then(function(res) {
        cb(res && res.data && res.data.length > 0);
      })
      .catch(function() { cb(false); });
  }

  function showLogin() {
    document.getElementById('loginGate').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }

  function showApp() {
    document.getElementById('loginGate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userEmail').textContent = currentUserEmail;
    loadGallery();
  }

  function showError(msg) {
    var el = document.getElementById('loginError');
    if (el) el.textContent = msg;
    showLogin();
  }

  // ============ EVENT LISTENERS ============
  function setupEventListeners() {
    document.getElementById('signInBtn').addEventListener('click', function() {
      sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getRedirectUrl() }
      });
    });

    document.getElementById('signOutBtn').addEventListener('click', function() {
      sb.auth.signOut().then(function() { window.location.reload(); });
    });

    document.getElementById('generateBtn').addEventListener('click', generateImage);

    // Quick tags
    document.querySelectorAll('.quick-tag').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tag = btn.dataset.tag;
        var input = document.getElementById('tagsInput');
        var current = input.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (current.indexOf(tag) === -1) {
          current.push(tag);
          input.value = current.join(', ');
          btn.classList.add('active');
        } else {
          current = current.filter(function(t) { return t !== tag; });
          input.value = current.join(', ');
          btn.classList.remove('active');
        }
      });
    });

    // Result actions
    document.getElementById('copyUrlBtn').addEventListener('click', function() {
      if (lastImage) copyToClipboard(lastImage.public_url);
    });
    document.getElementById('downloadBtn').addEventListener('click', function() {
      if (lastImage) downloadImage(lastImage.public_url, lastImage.prompt);
    });
    document.getElementById('regenerateBtn').addEventListener('click', generateImage);
    document.getElementById('deleteResultBtn').addEventListener('click', function() {
      if (lastImage && confirm('Delete this image permanently?')) {
        deleteImage(lastImage.id, lastImage.storage_path, function() {
          document.getElementById('resultPanel').classList.add('hidden');
          lastImage = null;
        });
      }
    });

    // Gallery
    document.getElementById('refreshGalleryBtn').addEventListener('click', loadGallery);
    document.getElementById('gallerySearch').addEventListener('input', renderGallery);
    document.getElementById('galleryFilter').addEventListener('change', renderGallery);

    // Lightbox
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox__overlay').addEventListener('click', closeLightbox);

    // Enter to generate
    document.getElementById('promptInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        generateImage();
      }
    });
  }

  // ============ GENERATE ============
  function generateImage() {
    var prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
      showStatus('Enter a prompt first', 'error');
      return;
    }

    var style = document.getElementById('styleSelect').value;
    var aspectRatio = document.getElementById('aspectSelect').value;
    var tagsRaw = document.getElementById('tagsInput').value;
    var tags = tagsRaw.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);

    var btn = document.getElementById('generateBtn');
    var label = document.getElementById('generateBtnLabel');
    btn.disabled = true;
    label.textContent = 'Generating...';
    showStatus('Calling Gemini... this can take 10-30 seconds', 'loading');

    sb.functions.invoke('gemini-image', {
      body: { prompt: prompt, style: style, aspect_ratio: aspectRatio, tags: tags }
    }).then(function(res) {
      btn.disabled = false;
      label.textContent = 'Generate Image';

      if (res.error) {
        var msg = res.error.message || 'Unknown error';
        if (res.error.context && res.error.context.json) {
          msg = res.error.context.json.error || msg;
        }
        showStatus('Error: ' + msg, 'error');
        return;
      }

      var data = res.data;
      if (!data || !data.success) {
        showStatus('Error: ' + (data && data.error ? data.error : 'Generation failed'), 'error');
        return;
      }

      lastImage = data.image;
      showResult(data.image);
      hideStatus();
      loadGallery();
      showToast('Image generated and saved to library', 'success');
    }).catch(function(err) {
      btn.disabled = false;
      label.textContent = 'Generate Image';
      showStatus('Network error: ' + (err.message || err), 'error');
    });
  }

  function showResult(image) {
    document.getElementById('resultPanel').classList.remove('hidden');
    document.getElementById('resultImage').src = image.public_url;
    document.getElementById('resultPrompt').textContent = image.prompt;
    document.getElementById('resultUrl').textContent = image.public_url;
  }

  // ============ GALLERY ============
  function loadGallery() {
    sb.from('image_library')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function(res) {
        if (res.error) {
          document.getElementById('galleryGrid').innerHTML = '<div class="gallery-empty">Error loading library: ' + res.error.message + '</div>';
          return;
        }
        galleryItems = res.data || [];
        updateTagFilter();
        renderGallery();
      });
  }

  function updateTagFilter() {
    var allTags = {};
    galleryItems.forEach(function(item) {
      (item.tags || []).forEach(function(t) { allTags[t] = (allTags[t] || 0) + 1; });
    });
    var sel = document.getElementById('galleryFilter');
    var current = sel.value;
    sel.innerHTML = '<option value="">All tags</option>' +
      Object.keys(allTags).sort().map(function(t) {
        return '<option value="' + t + '">' + t + ' (' + allTags[t] + ')</option>';
      }).join('');
    sel.value = current;
  }

  function renderGallery() {
    var container = document.getElementById('galleryGrid');
    var search = document.getElementById('gallerySearch').value.toLowerCase().trim();
    var filterTag = document.getElementById('galleryFilter').value;

    var filtered = galleryItems.filter(function(item) {
      if (filterTag && (item.tags || []).indexOf(filterTag) === -1) return false;
      if (search) {
        var hay = (item.prompt || '').toLowerCase() + ' ' + (item.tags || []).join(' ').toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="gallery-empty">' + (galleryItems.length === 0 ? 'No images yet. Generate your first one!' : 'No images match your filters.') + '</div>';
      return;
    }

    container.innerHTML = filtered.map(function(item) {
      var date = new Date(item.created_at).toLocaleDateString();
      var tags = (item.tags || []).slice(0, 3).map(function(t) {
        return '<span class="gallery-item__tag">' + escapeHtml(t) + '</span>';
      }).join('');
      return '<div class="gallery-item" data-id="' + item.id + '">' +
        '<div class="gallery-item__img"><img src="' + item.public_url + '" loading="lazy" alt=""></div>' +
        '<div class="gallery-item__info">' +
        '<div class="gallery-item__prompt">' + escapeHtml(item.prompt) + '</div>' +
        '<div class="gallery-item__meta"><span>' + date + '</span><span>' + (item.aspect_ratio || '') + '</span></div>' +
        (tags ? '<div class="gallery-item__tags">' + tags + '</div>' : '') +
        '</div></div>';
    }).join('');

    // Wire up clicks
    container.querySelectorAll('.gallery-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.dataset.id;
        var item = galleryItems.find(function(i) { return i.id === id; });
        if (item) openLightbox(item);
      });
    });
  }

  // ============ LIGHTBOX ============
  var lightboxItem = null;
  function openLightbox(item) {
    lightboxItem = item;
    document.getElementById('lightboxImg').src = item.public_url;
    document.getElementById('lightboxPrompt').textContent = item.prompt;
    var meta = (item.aspect_ratio || '') +
      (item.style ? ' • ' + item.style : '') +
      ' • ' + new Date(item.created_at).toLocaleString() +
      (item.created_by ? ' • by ' + item.created_by : '') +
      ((item.tags || []).length ? ' • tags: ' + item.tags.join(', ') : '');
    document.getElementById('lightboxMeta').textContent = meta;
    document.getElementById('lightbox').classList.remove('hidden');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
    lightboxItem = null;
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
  });

  // Lightbox actions wired after DOM ready in setupEventListeners is too early — wire here
  document.addEventListener('DOMContentLoaded', function() {
    var copyBtn = document.getElementById('lightboxCopyBtn');
    var dlBtn = document.getElementById('lightboxDownloadBtn');
    var delBtn = document.getElementById('lightboxDeleteBtn');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      if (lightboxItem) copyToClipboard(lightboxItem.public_url);
    });
    if (dlBtn) dlBtn.addEventListener('click', function() {
      if (lightboxItem) downloadImage(lightboxItem.public_url, lightboxItem.prompt);
    });
    if (delBtn) delBtn.addEventListener('click', function() {
      if (lightboxItem && confirm('Delete this image permanently?')) {
        deleteImage(lightboxItem.id, lightboxItem.storage_path, function() {
          closeLightbox();
        });
      }
    });
  });

  // ============ DELETE ============
  function deleteImage(id, storagePath, cb) {
    sb.storage.from('generated-images').remove([storagePath]).then(function() {
      sb.from('image_library').delete().eq('id', id).then(function() {
        showToast('Image deleted', 'success');
        loadGallery();
        if (cb) cb();
      });
    });
  }

  // ============ UTILS ============
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('URL copied', 'success');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('URL copied', 'success');
    }
  }

  function downloadImage(url, name) {
    fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name || 'image').replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  function showStatus(msg, kind) {
    var el = document.getElementById('genStatus');
    el.textContent = msg;
    el.className = 'gen-status ' + (kind || '');
  }
  function hideStatus() {
    document.getElementById('genStatus').className = 'gen-status hidden';
  }

  function showToast(msg, kind) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + (kind || '');
    setTimeout(function() { el.className = 'toast hidden'; }, 2500);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
