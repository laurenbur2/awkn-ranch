/* AWKN Ranch — shared site behavior (nav, menu, submenus) */

function awknInit() {
  // Nav background swap on scroll (no-op on pages where the nav already
  // has class="solid", but harmless).
  var nav = document.getElementById('siteNav');
  if (nav) {
    var update = function () {
      if (nav.classList.contains('solid')) return;
      if (window.scrollY > 80) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Menu panel + submenus
  var toggle = document.getElementById('menuToggle');
  var panel = document.getElementById('menuPanel');
  var backdrop = document.getElementById('menuBackdrop');
  if (!nav || !toggle || !panel || !backdrop) return;

  var allSubs = document.querySelectorAll('.menu-sub');

  function isOpen() { return panel.classList.contains('open'); }

  function closeAllSubs() {
    allSubs.forEach(function (s) { s.classList.remove('open'); });
    document.querySelectorAll('.menu-panel li.has-sub').forEach(function (li) {
      li.classList.remove('active');
    });
  }

  function openSub(subId, li) {
    closeAllSubs();
    var s = document.getElementById(subId);
    if (s) {
      s.classList.add('open');
      li.classList.add('active');
    }
  }

  function openMenu() {
    panel.classList.add('open');
    backdrop.classList.add('open');
    nav.classList.add('menu-is-open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    nav.classList.remove('menu-is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    closeAllSubs();
  }

  toggle.addEventListener('click', function () {
    isOpen() ? closeMenu() : openMenu();
  });
  backdrop.addEventListener('click', closeMenu);

  // Hover-based submenu only on true pointer devices (skip iOS/Android touch)
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.menu-panel li.has-sub').forEach(function (li) {
      li.addEventListener('mouseenter', function () {
        var a = li.querySelector('[data-sub]');
        if (a) openSub(a.getAttribute('data-sub'), li);
      });
    });
    allSubs.forEach(function (s) {
      s.addEventListener('mouseleave', closeAllSubs);
    });
    document.querySelectorAll('.menu-panel li:not(.has-sub)').forEach(function (li) {
      li.addEventListener('mouseenter', closeAllSubs);
    });
  }

  // Click toggles submenus on touch devices (also fine on desktop)
  document.querySelectorAll('[data-submenu-toggle]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var li = a.parentNode;
      if (li.classList.contains('active')) {
        closeAllSubs();
      } else {
        openSub(a.getAttribute('data-sub'), li);
      }
    });
  });

  document.querySelectorAll('[data-menu-link]').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  document.querySelectorAll('[data-sub-back]').forEach(function (btn) {
    btn.addEventListener('click', closeAllSubs);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) closeMenu();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', awknInit);
} else {
  awknInit();
}
