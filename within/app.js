// Within EMR - Login page
import { supabase } from '../shared/supabase.js';
import { initAuth, signInWithGoogle, signOut, getAuthState, onAuthStateChange, getBasePath } from '../shared/auth.js';

// Authorized emails for Within EMR access
const ALLOWED_EMAILS = [
  'justin@within.center',
  'lauren@awknranch.com',
  'wdnaylor@gmail.com',
];

const CACHED_AUTH_KEY = 'awkn-ranch-cached-auth';

// DOM elements
const loginContent = document.getElementById('loginContent');
const loadingContent = document.getElementById('loadingContent');
const errorContent = document.getElementById('errorContent');
const unauthorizedContent = document.getElementById('unauthorizedContent');
const googleSignInBtn = document.getElementById('googleSignIn');
const errorMessage = document.getElementById('errorMessage');
const retryBtn = document.getElementById('retryBtn');
const deniedEmail = document.getElementById('deniedEmail');

function showState(state, message = '') {
  loginContent.classList.add('hidden');
  loadingContent.classList.add('hidden');
  errorContent.classList.add('hidden');
  unauthorizedContent.classList.add('hidden');

  switch (state) {
    case 'login': loginContent.classList.remove('hidden'); break;
    case 'loading': loadingContent.classList.remove('hidden'); break;
    case 'error':
      errorContent.classList.remove('hidden');
      errorMessage.textContent = message || 'An error occurred';
      break;
    case 'unauthorized':
      unauthorizedContent.classList.remove('hidden');
      if (deniedEmail) deniedEmail.textContent = message || '';
      break;
  }
}

function isEmailAllowed(email) {
  return ALLOWED_EMAILS.includes(email?.toLowerCase());
}

async function init() {
  // Fast path: check cached auth
  try {
    const raw = localStorage.getItem(CACHED_AUTH_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      const age = Date.now() - (cached.timestamp || 0);
      if (age < 90 * 24 * 60 * 60 * 1000 && cached.email && isEmailAllowed(cached.email)) {
        console.log('[WITHIN]', 'Cached auth found, redirecting');
        window.location.href = getBasePath() + '/within/emr/';
        return;
      }
    }
  } catch (e) { /* ignore */ }

  showState('loading');

  try {
    await initAuth();

    let state = getAuthState();
    if (state.isAuthenticated && state.isPending) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 12000);
        const unsub = onAuthStateChange((newState) => {
          if (!newState.isPending) { clearTimeout(timeout); unsub(); resolve(); }
        });
      });
    }

    checkAuthAndRedirect();
  } catch (error) {
    console.error('[WITHIN]', 'Auth init error:', error);
    showState('error', error.message);
  }
}

function checkAuthAndRedirect() {
  const state = getAuthState();
  const email = state.user?.email?.toLowerCase();

  if (state.isAuthenticated) {
    if (isEmailAllowed(email)) {
      window.location.href = getBasePath() + '/within/emr/';
    } else {
      showState('unauthorized', email);
    }
  } else {
    showState('login');
  }
}

// Google sign in
googleSignInBtn.addEventListener('click', async () => {
  showState('loading');
  try {
    const loginRedirect = window.location.origin + getBasePath() + '/within/';
    await signInWithGoogle(loginRedirect);
  } catch (error) {
    showState('error', error.message);
  }
});

retryBtn.addEventListener('click', () => showState('login'));

const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    showState('loading');
    try { await signOut(); showState('login'); }
    catch (error) { showState('error', error.message); }
  });
}

init();
