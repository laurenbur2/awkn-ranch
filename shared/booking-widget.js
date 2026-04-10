/**
 * Within Booking Widget — self-contained, zero-dependency scheduler
 * Usage: <div id="within-booking" data-slug="william"></div>
 *        <script src="/shared/booking-widget.js"></script>
 */
(function () {
  'use strict';

  const API_BASE = 'https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1';

  // ── Inject styles ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .wb-root {
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 480px;
      margin: 0 auto;
      background: #faf9f6;
      border-radius: 10px;
      padding: 1.5rem;
      color: #2a1f23;
      box-sizing: border-box;
    }
    .wb-root *, .wb-root *::before, .wb-root *::after { box-sizing: border-box; }
    .wb-heading {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0 0 1rem 0;
      text-align: center;
    }
    .wb-subheading {
      font-size: 0.85rem;
      color: #888;
      margin: 0 0 1rem 0;
      text-align: center;
    }

    /* Date picker row */
    .wb-dates {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .wb-dates::-webkit-scrollbar { display: none; }
    .wb-date-btn {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem 0.75rem;
      border: 1.5px solid #e0dcd6;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.8rem;
      color: #2a1f23;
      transition: border-color 0.15s, background 0.15s;
      min-width: 58px;
    }
    .wb-date-btn:hover { border-color: #d4883a; }
    .wb-date-btn.wb-active {
      background: #d4883a;
      color: #fff;
      border-color: #d4883a;
    }
    .wb-date-day { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    .wb-date-num { font-size: 0.85rem; margin-top: 2px; }

    /* Time slots grid */
    .wb-slots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .wb-slot-btn {
      padding: 0.6rem 0.25rem;
      border: 1.5px solid #e0dcd6;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85rem;
      color: #2a1f23;
      font-weight: 500;
      transition: border-color 0.15s, background 0.15s;
    }
    .wb-slot-btn:hover {
      border-color: #d4883a;
      background: #fef6ee;
    }

    /* Spinner */
    .wb-spinner-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem 0;
    }
    .wb-spinner {
      width: 28px; height: 28px;
      border: 3px solid #e0dcd6;
      border-top-color: #d4883a;
      border-radius: 50%;
      animation: wb-spin 0.7s linear infinite;
    }
    @keyframes wb-spin { to { transform: rotate(360deg); } }

    /* Empty state */
    .wb-empty {
      text-align: center;
      padding: 1.5rem 0;
      color: #999;
      font-size: 0.9rem;
    }

    /* Form */
    .wb-form { margin-top: 1rem; }
    .wb-form label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #2a1f23;
    }
    .wb-form input, .wb-form textarea {
      display: block;
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1.5px solid #e0dcd6;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.9rem;
      color: #2a1f23;
      background: #fff;
      margin-bottom: 0.75rem;
      transition: border-color 0.15s;
    }
    .wb-form input:focus, .wb-form textarea:focus {
      outline: none;
      border-color: #d4883a;
    }
    .wb-form textarea { resize: vertical; min-height: 60px; }
    .wb-selected-info {
      background: #fff;
      border: 1.5px solid #e0dcd6;
      border-radius: 8px;
      padding: 0.6rem 0.75rem;
      font-size: 0.85rem;
      margin-bottom: 1rem;
      text-align: center;
      color: #555;
    }
    .wb-confirm-btn {
      display: block;
      width: 100%;
      padding: 0.75rem;
      background: #d4883a;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .wb-confirm-btn:hover { background: #bf7530; }
    .wb-confirm-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .wb-back {
      display: inline-block;
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: #999;
      cursor: pointer;
      text-decoration: none;
      background: none;
      border: none;
      font-family: inherit;
      padding: 0;
    }
    .wb-back:hover { color: #d4883a; }

    /* Confirmation */
    .wb-done {
      text-align: center;
      padding: 1rem 0;
    }
    .wb-done-check {
      width: 48px; height: 48px;
      border-radius: 50%;
      background: #d4883a;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .wb-done h3 {
      font-size: 1.15rem;
      margin: 0 0 0.75rem 0;
    }
    .wb-done-detail {
      font-size: 0.85rem;
      color: #555;
      line-height: 1.6;
    }
    .wb-restart {
      display: inline-block;
      margin-top: 1rem;
      font-size: 0.8rem;
      color: #d4883a;
      cursor: pointer;
      text-decoration: none;
      background: none;
      border: none;
      font-family: inherit;
      padding: 0;
    }
    .wb-restart:hover { text-decoration: underline; }

    /* Error toast */
    .wb-toast {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      background: #c0392b;
      color: #fff;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 0.85rem;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    .wb-toast.wb-show { opacity: 1; }
  `;
  document.head.appendChild(style);

  // ── Helpers ────────────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtDisplay(d) {
    return DAY_NAMES_FULL[d.getDay()] + ', ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getDate();
  }

  function to12h(t24) {
    var parts = t24.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return h + ':' + m + ' ' + ampm;
  }

  function toISO(dateStr, time24) {
    return dateStr + 'T' + time24 + ':00';
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'wb-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.classList.add('wb-show');
    });
    setTimeout(function () {
      t.classList.remove('wb-show');
      setTimeout(function () { t.remove(); }, 300);
    }, 4000);
  }

  // ── Widget class ──────────────────────────────────────────────
  function BookingWidget(el) {
    this.el = el;
    this.slug = el.getAttribute('data-slug') || '';
    this.dates = [];
    this.selectedDate = null;
    this.selectedSlot = null;
    this.slots = [];

    if (!this.slug) {
      el.innerHTML = '<div class="wb-root"><div class="wb-empty">Scheduling is not available.</div></div>';
      return;
    }

    this.el.innerHTML = '<div class="wb-root"><div class="wb-spinner-wrap"><div class="wb-spinner"></div></div></div>';
    this.root = this.el.querySelector('.wb-root');
    this.buildDates();
    this.renderDatePicker();
  }

  BookingWidget.prototype.buildDates = function () {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    for (var i = 1; i <= 30; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      this.dates.push(d);
    }
  };

  BookingWidget.prototype.renderDatePicker = function () {
    var self = this;
    var html = '<div class="wb-heading">Select a Date</div>';
    html += '<div class="wb-dates">';
    this.dates.forEach(function (d, i) {
      html += '<button class="wb-date-btn' + (i === 0 ? ' wb-active' : '') +
        '" data-idx="' + i + '">' +
        '<span class="wb-date-day">' + DAY_NAMES[d.getDay()] + '</span>' +
        '<span class="wb-date-num">' + MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + '</span>' +
        '</button>';
    });
    html += '</div>';
    html += '<div class="wb-slots-area"></div>';
    this.root.innerHTML = html;

    this.root.querySelectorAll('.wb-date-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.root.querySelectorAll('.wb-date-btn').forEach(function (b) { b.classList.remove('wb-active'); });
        btn.classList.add('wb-active');
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        self.selectedDate = self.dates[idx];
        self.fetchSlots();
      });
    });

    // Auto-select first date
    this.selectedDate = this.dates[0];
    this.fetchSlots();
  };

  BookingWidget.prototype.fetchSlots = function () {
    var self = this;
    var area = this.root.querySelector('.wb-slots-area');
    area.innerHTML = '<div class="wb-spinner-wrap"><div class="wb-spinner"></div></div>';

    var dateStr = fmtDate(this.selectedDate);

    fetch(API_BASE + '/google-calendar-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: this.slug, date: dateStr })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        self.slots = (data.slots || data.available || []);
        if (!Array.isArray(self.slots)) self.slots = [];
        self.renderSlots();
      })
      .catch(function () {
        area.innerHTML = '<div class="wb-empty">Unable to load availability. Please try again.</div>';
      });
  };

  BookingWidget.prototype.renderSlots = function () {
    var self = this;
    var area = this.root.querySelector('.wb-slots-area');

    if (this.slots.length === 0) {
      area.innerHTML = '<div class="wb-empty">No availability for this day. Try another date.</div>';
      return;
    }

    var html = '<div class="wb-slots">';
    this.slots.forEach(function (slot) {
      var time = typeof slot === 'string' ? slot : (slot.time || slot.start || '');
      html += '<button class="wb-slot-btn" data-time="' + time + '">' + to12h(time) + '</button>';
    });
    html += '</div>';
    area.innerHTML = html;

    area.querySelectorAll('.wb-slot-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.selectedSlot = btn.getAttribute('data-time');
        self.renderForm();
      });
    });
  };

  BookingWidget.prototype.renderForm = function () {
    var self = this;
    var displayDate = fmtDisplay(this.selectedDate);
    var displayTime = to12h(this.selectedSlot);

    var html = '<div class="wb-heading">Your Details</div>';
    html += '<div class="wb-selected-info">' + displayDate + ' at ' + displayTime + '</div>';
    html += '<div class="wb-form">';
    html += '<label for="wb-name">Name *</label>';
    html += '<input type="text" id="wb-name" placeholder="Your full name" required>';
    html += '<label for="wb-email">Email *</label>';
    html += '<input type="email" id="wb-email" placeholder="you@email.com" required>';
    html += '<label for="wb-phone">Phone</label>';
    html += '<input type="tel" id="wb-phone" placeholder="(555) 555-5555">';
    html += '<label for="wb-message">Message (optional)</label>';
    html += '<textarea id="wb-message" placeholder="Anything you\'d like us to know"></textarea>';
    html += '<button class="wb-confirm-btn" id="wb-submit">Confirm Booking</button>';
    html += '<button class="wb-back" id="wb-back-btn">&larr; Back to time slots</button>';
    html += '</div>';

    this.root.innerHTML = html;

    this.root.querySelector('#wb-back-btn').addEventListener('click', function () {
      self.renderDatePicker();
    });

    this.root.querySelector('#wb-submit').addEventListener('click', function () {
      self.submitBooking();
    });
  };

  BookingWidget.prototype.submitBooking = function () {
    var self = this;
    var name = this.root.querySelector('#wb-name').value.trim();
    var email = this.root.querySelector('#wb-email').value.trim();
    var phone = this.root.querySelector('#wb-phone').value.trim();
    var message = this.root.querySelector('#wb-message').value.trim();

    if (!name || !email) {
      showToast('Please fill in your name and email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Please enter a valid email address.');
      return;
    }

    var btn = this.root.querySelector('#wb-submit');
    btn.disabled = true;
    btn.textContent = 'Booking...';

    var dateStr = fmtDate(this.selectedDate);
    var datetime = toISO(dateStr, this.selectedSlot);

    fetch(API_BASE + '/google-calendar-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: this.slug,
        datetime: datetime,
        name: name,
        email: email,
        phone: phone,
        message: message
      })
    })
      .then(function (r) {
        if (r.status === 409) {
          showToast('This slot was just taken. Please choose another time.');
          self.renderDatePicker();
          return null;
        }
        if (!r.ok) throw new Error('Booking failed');
        return r.json();
      })
      .then(function (data) {
        if (data) {
          self.renderConfirmation(name, email, data);
        }
      })
      .catch(function () {
        showToast('Something went wrong. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Confirm Booking';
      });
  };

  BookingWidget.prototype.renderConfirmation = function (name, email, data) {
    var self = this;
    var displayDate = fmtDisplay(this.selectedDate);
    var displayTime = to12h(this.selectedSlot);
    var duration = (data && data.duration) ? data.duration : '45 min';
    var staffName = (data && data.staff_name) ? data.staff_name : '';

    var html = '<div class="wb-done">';
    html += '<div class="wb-done-check">&#10003;</div>';
    html += '<h3>You\'re booked!</h3>';
    html += '<div class="wb-done-detail">';
    html += displayDate + '<br>';
    html += displayTime + (duration ? ' (' + duration + ')' : '') + '<br>';
    if (staffName) html += 'with ' + staffName + '<br>';
    html += '<br>A confirmation email has been sent to <strong>' + email + '</strong>';
    html += '</div>';
    html += '<button class="wb-restart" id="wb-restart">Book another</button>';
    html += '</div>';

    this.root.innerHTML = html;

    this.root.querySelector('#wb-restart').addEventListener('click', function () {
      self.selectedSlot = null;
      self.renderDatePicker();
    });
  };

  // ── Init ───────────────────────────────────────────────────────
  function init() {
    var targets = document.querySelectorAll('#within-booking');
    targets.forEach(function (el) {
      new BookingWidget(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
