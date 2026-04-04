// Within EMR - Login page (non-module, uses global window.supabase from CDN)

(function() {
  'use strict';

  var SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

  var DEFAULT_ALLOWED_EMAILS = [
    'justin@within.center',
    'lauren@awknranch.com',
    'wdnaylor@gmail.com',
  ];

  // Dynamic list built after loading staff table
  var allowedEmails = DEFAULT_ALLOWED_EMAILS.slice();

  var CACHED_AUTH_KEY = 'awkn-ranch-cached-auth';

  // DOM elements
  var loginContent = document.getElementById('loginContent');
  var loadingContent = document.getElementById('loadingContent');
  var errorContent = document.getElementById('errorContent');
  var unauthorizedContent = document.getElementById('unauthorizedContent');
  var googleSignInBtn = document.getElementById('googleSignIn');
  var errorMessage = document.getElementById('errorMessage');
  var retryBtn = document.getElementById('retryBtn');
  var deniedEmail = document.getElementById('deniedEmail');
  var signOutBtn = document.getElementById('signOutBtn');

  function getBasePath() {
    var path = window.location.pathname;
    var seg = path.split('/').filter(Boolean)[0];
    if (seg && window.location.hostname.endsWith('.github.io')) {
      return '/' + seg;
    }
    return '';
  }

  function showState(state, message) {
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
    return allowedEmails.indexOf((email || '').toLowerCase()) !== -1;
  }

  function waitForSupabase(callback) {
    var attempts = 0;
    var maxAttempts = 50;
    function check() {
      if (window.supabase && window.supabase.createClient) {
        callback(null);
      } else if (attempts >= maxAttempts) {
        callback(new Error('Supabase library failed to load'));
      } else {
        attempts++;
        setTimeout(check, 100);
      }
    }
    check();
  }

  var sb = null; // supabase client

  function initSupabase() {
    if (sb) return sb;
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'awkn-ranch-auth',
        flowType: 'pkce',
      },
    });
    return sb;
  }

  // Load staff emails from Supabase to extend allowed list
  function loadStaffEmails(callback) {
    sb.from('within_staff')
      .select('email, status')
      .eq('status', 'active')
      .then(function(result) {
        if (result.data && !result.error) {
          result.data.forEach(function(s) {
            var e = (s.email || '').toLowerCase();
            if (e && allowedEmails.indexOf(e) === -1) {
              allowedEmails.push(e);
            }
          });
          console.log('[WITHIN]', 'Loaded staff emails, total allowed:', allowedEmails.length);
        }
        callback();
      })
      .catch(function() { callback(); }); // table may not exist yet
  }

  function init() {
    // Fast path: check cached auth (defaults only, no staff check)
    try {
      var raw = localStorage.getItem(CACHED_AUTH_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        var age = Date.now() - (cached.timestamp || 0);
        if (age < 90 * 24 * 60 * 60 * 1000 && cached.email && isEmailAllowed(cached.email)) {
          console.log('[WITHIN]', 'Cached auth found, redirecting');
          window.location.href = getBasePath() + '/within/emr/';
          return;
        }
      }
    } catch (e) { /* ignore */ }

    showState('loading');

    waitForSupabase(function(err) {
      if (err) {
        console.error('[WITHIN]', 'Supabase failed to load:', err);
        showState('error', 'Failed to load authentication. Please refresh.');
        return;
      }

      initSupabase();
      console.log('[WITHIN]', 'Supabase client initialized');

      // Load staff emails first, then check session
      loadStaffEmails(function() {
        sb.auth.getSession().then(function(result) {
          var session = result.data && result.data.session;
          if (session && session.user) {
            var email = (session.user.email || '').toLowerCase();
            console.log('[WITHIN]', 'Existing session found:', email);
            if (isEmailAllowed(email)) {
              try {
                localStorage.setItem(CACHED_AUTH_KEY, JSON.stringify({
                  email: email,
                  timestamp: Date.now(),
                }));
              } catch (e) { /* ignore */ }
              window.location.href = getBasePath() + '/within/emr/';
            } else {
              showState('unauthorized', email);
            }
          } else {
            console.log('[WITHIN]', 'No existing session');
            showState('login');
          }
        }).catch(function(error) {
          console.error('[WITHIN]', 'Session check error:', error);
          showState('login');
        });
      });

      // Listen for auth callback (after OAuth redirect)
      sb.auth.onAuthStateChange(function(event, session) {
        console.log('[WITHIN]', 'Auth state change:', event);
        if (event === 'SIGNED_IN' && session?.user) {
          var email = (session.user.email || '').toLowerCase();
          if (isEmailAllowed(email)) {
            try {
              localStorage.setItem(CACHED_AUTH_KEY, JSON.stringify({
                email: email,
                timestamp: Date.now(),
              }));
            } catch (e) { /* ignore */ }
            window.location.href = getBasePath() + '/within/emr/';
          } else {
            showState('unauthorized', email);
          }
        }
      });
    });
  }

  // Google sign in button
  googleSignInBtn.addEventListener('click', function() {
    console.log('[WITHIN]', 'Google sign-in clicked');
    showState('loading');

    waitForSupabase(function(err) {
      if (err) {
        showState('error', 'Authentication not available. Please refresh.');
        return;
      }

      initSupabase();
      var redirectTo = window.location.origin + getBasePath() + '/within/';
      console.log('[WITHIN]', 'Redirecting to Google OAuth, callback:', redirectTo);

      sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          queryParams: { prompt: 'select_account' },
        },
      }).then(function(result) {
        if (result.error) {
          console.error('[WITHIN]', 'OAuth error:', result.error);
          showState('error', result.error.message);
        } else {
          console.log('[WITHIN]', 'OAuth redirect initiated');
        }
      }).catch(function(error) {
        console.error('[WITHIN]', 'OAuth exception:', error);
        showState('error', error.message);
      });
    });
  });

  // Retry button
  retryBtn.addEventListener('click', function() { showState('login'); });

  // Sign out button
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
      showState('loading');
      if (sb) {
        sb.auth.signOut().then(function() {
          localStorage.removeItem(CACHED_AUTH_KEY);
          showState('login');
        }).catch(function(error) {
          showState('error', error.message);
        });
      } else {
        localStorage.removeItem(CACHED_AUTH_KEY);
        showState('login');
      }
    });
  }

  console.log('[WITHIN]', 'Login page loaded, event listeners attached');
  init();
})();
