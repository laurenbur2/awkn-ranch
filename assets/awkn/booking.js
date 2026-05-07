// AWKN Booking — Phase 1 client logic
//
// Listings data is hardcoded here so the gallery/detail pages render even
// before the Supabase migration is applied. Availability checks against the
// `awkn_listing_availability` view fall back gracefully if the migration
// isn't deployed yet (treated as "all available").
//
// When wired to a fresh seed, this listings array should match
// supabase/migrations/20260507_awkn_booking_v1.sql so the IDs stay stable.

import { supabase } from '../../shared/supabase.js';

// Detect repo base path so we work on both GitHub Pages (/awkn-ranch/) and
// a custom-domain root (/). Used to resolve image paths inside LISTINGS data
// which is shared across pages at different depths.
const BASE = (() => {
  const segments = location.pathname.split('/').filter(Boolean);
  // If first segment is 'awkn-ranch' (GitHub Pages), strip it as prefix.
  if (segments[0] === 'awkn-ranch') return '/awkn-ranch';
  return '';
})();
export function asset(path) {
  return BASE + (path.startsWith('/') ? path : '/' + path);
}

export const LISTINGS = [
  {
    slug: 'shared-room',
    name: 'Shared Room',
    category: 'room',
    short_desc: 'Reserve a bed in one of our shared rooms — quiet, restful, beautifully made.',
    long_desc: 'A bed of your own in one of our two shared rooms in the Retreat House. Soft linens, warm wood, and the morning light through the trees. Shared bathroom, continental breakfast, and full access to the sauna, cold plunge, and gardens. Reserve one bed or several — book up to six together if you\'re traveling with friends or a group.',
    capacity_min: 1,
    capacity_max: 6,
    nightly_rate: 239,
    nightly_unit_label: 'per bed, per night',
    pricing_per_guest: true,
    hourly_rate: null,
    hourly_min_hours: null,
    cleaning_fee: 0,
    addons: [],
    hero_image: '/assets/awkn/awkn-sharedroom.png',
    gallery_images: ['/assets/awkn/awkn-sharedroom.png','/assets/awkn/retreat-house.jpg'],
    amenities: ['A bed of your own','Two shared rooms available','Shared bathroom','Continental breakfast','Wellness facility access'],
  },
  {
    slug: 'private-room',
    name: 'Private Room',
    category: 'room',
    short_desc: 'Five private rooms in the Retreat House — quiet, restful, yours.',
    long_desc: 'A private bedroom in the Retreat House with a queen bed and shared bath access. Five rooms available. Includes continental breakfast and full access to sauna, cold plunge, and gardens.',
    capacity_min: 1,
    capacity_max: 2,
    nightly_rate: 349,
    hourly_rate: null,
    hourly_min_hours: null,
    cleaning_fee: 0,
    addons: [],
    hero_image: '/assets/awkn/retreat-house.jpg',
    gallery_images: ['/assets/awkn/retreat-house.jpg'],
    amenities: ['Queen bed','Shared bath','Continental breakfast','Wellness facility access'],
  },
  {
    slug: 'retreat-house',
    name: 'The Retreat House',
    category: 'room',
    short_desc: 'Take the whole house — sleeps eleven, holds the whole vibe.',
    long_desc: 'Reserve the entire Retreat House for your group. Five private bedrooms and two shared rooms — sleeps up to eleven. Full kitchen, common living spaces, wraparound porch, continental breakfast each morning, and full access to sauna, cold plunge, and gardens. Three-night minimum. Ideal for retreats, family gatherings, and friend trips that want the whole place to themselves.',
    capacity_min: 1,
    capacity_max: 11,
    nightly_rate: 2999,
    hourly_rate: null,
    hourly_min_hours: null,
    cleaning_fee: 0,
    addons: [],
    hero_image: '/assets/awkn/retreat-house.jpg',
    gallery_images: ['/assets/awkn/retreat-house.jpg','/assets/awkn/awkn-sharedroom.png','/assets/awkn/sunflower-group.jpg'],
    amenities: ['Five private bedrooms','Two shared rooms','Sleeps up to 11','Full kitchen & living areas','Continental breakfast','Wellness facility access','Three-night minimum'],
  },
  {
    slug: 'temple',
    name: 'The Temple',
    category: 'space',
    short_desc: 'Our 100-capacity ceremonial hall — for ceremonies, classes, and gatherings.',
    long_desc: 'The Temple holds up to 100 people for ceremony, movement, sound, and gathering. Rentable overnight or by the day. Add AV (projector, mic, sound) or support staff as needed.',
    capacity_min: 1,
    capacity_max: 100,
    nightly_rate: 1600,
    hourly_rate: null,
    hourly_min_hours: null,
    cleaning_fee: 150,
    addons: [
      { key: 'day', label: 'Full Day (up to 9 hours)', price: 1400, unit: 'flat', note: 'Replaces overnight rate for day-only bookings' },
      { key: 'av', label: 'AV Equipment (projector, mic, sound)', price: 150, unit: 'flat' },
      { key: 'staff', label: 'Support Staff', price: 50, unit: 'hour' },
    ],
    hero_image: '/assets/awkn/awkn-temple-1.jpg',
    gallery_images: ['/assets/awkn/awkn-temple-1.jpg','/assets/awkn/temple-inside.jpeg','/assets/awkn/temple-inside-3.jpg','/assets/awkn/temple-interior-2.jpg'],
    amenities: ['Capacity 100','Wood floors','Natural light','AV available','Cleaning fee $150'],
  },
  {
    slug: 'honeycomb-dome',
    name: 'Honeycomb Dome',
    category: 'space',
    short_desc: 'Geodesic dome for intimate gatherings — up to 7 guests.',
    long_desc: 'A geodesic honeycomb dome on the property. Bookable overnight as a stay or by the hour for ceremony, breathwork, or gatherings. Two-hour minimum on hourly rentals.',
    capacity_min: 1,
    capacity_max: 7,
    nightly_rate: 499,
    hourly_rate: 99,
    hourly_min_hours: 2,
    cleaning_fee: 0,
    addons: [],
    hero_image: '/assets/awkn/honey-dome.jpeg',
    gallery_images: ['/assets/awkn/honey-dome.jpeg','/assets/awkn/dome.jpeg'],
    amenities: ['Hexagonal panes','Sky views','Capacity 7','Hourly or overnight'],
  },
  {
    slug: 'yurt-bali',
    name: 'Bali Yurt',
    category: 'space',
    short_desc: 'Bali-themed yurt — sleep, gather, or hold space for 6–10 guests.',
    long_desc: 'One of two yurts on the property. The Bali yurt blends warm wood and natural textures. Bookable overnight or by the hour. Two-hour minimum on hourly rentals.',
    capacity_min: 6,
    capacity_max: 10,
    nightly_rate: 777,
    hourly_rate: 99,
    hourly_min_hours: 2,
    cleaning_fee: 80,
    addons: [],
    hero_image: '/assets/awkn/awkn-yurt-1.jpg',
    gallery_images: ['/assets/awkn/awkn-yurt-1.jpg'],
    amenities: ['Bali aesthetic','Capacity 6–10','Hourly or overnight','Cleaning fee $80'],
  },
  {
    slug: 'yurt-barcelona',
    name: 'Barcelona Yurt',
    category: 'space',
    short_desc: 'Barcelona-themed yurt — sleep, gather, or hold space for 6–10 guests.',
    long_desc: 'The second of two yurts on the property. The Barcelona yurt has its own distinct character. Bookable overnight or by the hour. Two-hour minimum on hourly rentals.',
    capacity_min: 6,
    capacity_max: 10,
    nightly_rate: 777,
    hourly_rate: 99,
    hourly_min_hours: 2,
    cleaning_fee: 80,
    addons: [],
    hero_image: '/assets/awkn/awkn-yurt-1.jpg',
    gallery_images: ['/assets/awkn/awkn-yurt-1.jpg'],
    amenities: ['Barcelona aesthetic','Capacity 6–10','Hourly or overnight','Cleaning fee $80'],
  },
];

export function getListing(slug) {
  return LISTINGS.find(l => l.slug === slug);
}

export function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Availability ───────────────────────────────────────────────────────────
// Pulls existing booking windows from `awkn_listing_availability` (a view that
// excludes guest PII) and returns a Set of YYYY-MM-DD date strings that have
// any booking overlap. Falls back to empty Set on error so the calendar still
// renders if the migration hasn't been applied yet.
export async function fetchBlockedDates(listingId, fromISO, toISO) {
  const blocked = new Set();
  if (!listingId) return blocked;
  try {
    const { data, error } = await supabase
      .from('awkn_listing_availability')
      .select('start_at,end_at,mode')
      .eq('listing_id', listingId)
      .lt('start_at', toISO)
      .gt('end_at', fromISO);
    if (error) {
      console.warn('[booking] availability fetch failed (treating as all available):', error.message);
      return blocked;
    }
    for (const row of data || []) {
      const start = new Date(row.start_at);
      const end = new Date(row.end_at);
      // Walk each day in the window and mark it blocked
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= stop) {
        blocked.add(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  } catch (e) {
    console.warn('[booking] availability error:', e);
  }
  return blocked;
}

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Calendar widget ────────────────────────────────────────────────────────
// Vanilla two-month calendar with date-range selection. Renders into a host
// element and calls onChange({ checkIn, checkOut }) whenever the range updates.
export function mountCalendar(host, { blocked = new Set(), onChange } = {}) {
  let viewMonth = new Date();
  viewMonth.setDate(1);
  let checkIn = null;
  let checkOut = null;
  let hover = null;

  function inRange(key) {
    if (!checkIn) return false;
    if (!checkOut && hover && key >= toDateKey(checkIn) && key <= hover) return true;
    if (!checkOut) return key === toDateKey(checkIn);
    return key >= toDateKey(checkIn) && key <= toDateKey(checkOut);
  }

  function shiftMonth(delta) {
    viewMonth.setMonth(viewMonth.getMonth() + delta);
    render();
  }

  function pick(d) {
    const key = toDateKey(d);
    if (blocked.has(key)) return;
    if (!checkIn || (checkIn && checkOut)) {
      checkIn = d;
      checkOut = null;
    } else if (d <= checkIn) {
      checkIn = d;
      checkOut = null;
    } else {
      checkOut = d;
    }
    onChange?.({ checkIn, checkOut });
    render();
  }

  function buildMonth(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysIn = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    const monthLabel = monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    let html = `<div class="cal-month">
      <div class="cal-month-label">${monthLabel}</div>
      <div class="cal-grid">
        <div class="cal-dow">Su</div><div class="cal-dow">Mo</div><div class="cal-dow">Tu</div>
        <div class="cal-dow">We</div><div class="cal-dow">Th</div><div class="cal-dow">Fr</div><div class="cal-dow">Sa</div>`;
    for (let i = 0; i < startWeekday; i++) html += '<div class="cal-empty"></div>';
    for (let d = 1; d <= daysIn; d++) {
      const dt = new Date(year, month, d);
      const key = toDateKey(dt);
      const isPast = dt < today;
      const isBlocked = blocked.has(key);
      const isCheckIn = checkIn && key === toDateKey(checkIn);
      const isCheckOut = checkOut && key === toDateKey(checkOut);
      const inRng = inRange(key);
      const cls = [
        'cal-day',
        isPast ? 'past' : '',
        isBlocked ? 'blocked' : '',
        isCheckIn ? 'check-in' : '',
        isCheckOut ? 'check-out' : '',
        inRng ? 'in-range' : '',
      ].filter(Boolean).join(' ');
      const dis = isPast || isBlocked ? 'aria-disabled="true"' : '';
      html += `<button type="button" class="${cls}" data-date="${key}" ${dis}>${d}</button>`;
    }
    html += '</div></div>';
    return html;
  }

  function render() {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + 1);
    host.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-cal-prev aria-label="Previous month">&larr;</button>
        <span class="cal-summary">${
          checkIn && checkOut
            ? `${checkIn.toLocaleDateString('en-US', { month:'short', day:'numeric' })} → ${checkOut.toLocaleDateString('en-US', { month:'short', day:'numeric' })}`
            : checkIn
              ? `Check-in ${checkIn.toLocaleDateString('en-US', { month:'short', day:'numeric' })} — pick check-out`
              : 'Select your dates'
        }</span>
        <button type="button" class="cal-nav" data-cal-next aria-label="Next month">&rarr;</button>
      </div>
      <div class="cal-months">${buildMonth(viewMonth)}${buildMonth(next)}</div>
    `;
    host.querySelector('[data-cal-prev]')?.addEventListener('click', () => shiftMonth(-1));
    host.querySelector('[data-cal-next]')?.addEventListener('click', () => shiftMonth(1));
    host.querySelectorAll('.cal-day').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-disabled') === 'true') return;
        pick(fromDateKey(btn.dataset.date));
      });
      btn.addEventListener('mouseenter', () => {
        if (checkIn && !checkOut) {
          hover = btn.dataset.date;
          render();
        }
      });
    });
  }

  render();
  return {
    reset() { checkIn = null; checkOut = null; render(); },
    getRange() { return { checkIn, checkOut }; },
  };
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
export function calculatePrice(listing, { mode, checkIn, checkOut, selectedAddons = [], staffHours = 0, guests = 1 }) {
  const breakdown = { lines: [], total: 0 };
  if (!checkIn || !checkOut) return breakdown;

  const ms = checkOut.getTime() - checkIn.getTime();
  const nights = Math.max(1, Math.round(ms / 86400000));

  // Temple "day" addon replaces base nightly with full-day rate
  const dayAddon = selectedAddons.find(a => a.key === 'day');
  if (dayAddon && listing.slug === 'temple') {
    breakdown.lines.push({ label: 'Full Day rental (up to 9 hours)', amount: dayAddon.price });
    breakdown.total += dayAddon.price;
  } else if (mode === 'nightly' && listing.nightly_rate) {
    const beds = listing.pricing_per_guest ? Math.max(1, Number(guests) || 1) : 1;
    const sub = listing.nightly_rate * nights * beds;
    const label = listing.pricing_per_guest
      ? `${beds} bed${beds > 1 ? 's' : ''} × ${nights} night${nights > 1 ? 's' : ''} × ${fmtMoney(listing.nightly_rate)}`
      : `${nights} night${nights > 1 ? 's' : ''} × ${fmtMoney(listing.nightly_rate)}`;
    breakdown.lines.push({ label, amount: sub });
    breakdown.total += sub;
  } else if (mode === 'hourly' && listing.hourly_rate) {
    const hours = Math.max(listing.hourly_min_hours || 1, Math.round(ms / 3600000));
    const sub = listing.hourly_rate * hours;
    breakdown.lines.push({ label: `${hours} hour${hours > 1 ? 's' : ''} × ${fmtMoney(listing.hourly_rate)}`, amount: sub });
    breakdown.total += sub;
  }

  if (listing.cleaning_fee) {
    breakdown.lines.push({ label: 'Cleaning fee', amount: listing.cleaning_fee });
    breakdown.total += listing.cleaning_fee;
  }

  for (const ad of selectedAddons) {
    if (ad.key === 'day') continue;
    if (ad.unit === 'hour') {
      const hrs = Math.max(0, Number(staffHours) || 0);
      if (hrs <= 0) continue;
      const sub = ad.price * hrs;
      breakdown.lines.push({ label: `${ad.label} × ${hrs} hr`, amount: sub });
      breakdown.total += sub;
    } else {
      breakdown.lines.push({ label: ad.label, amount: ad.price });
      breakdown.total += ad.price;
    }
  }

  return breakdown;
}

// ─── Submit booking ─────────────────────────────────────────────────────────
export async function submitBookingRequest(payload) {
  const { data, error } = await supabase
    .from('awkn_bookings')
    .insert([{
      listing_id: payload.listing_id ?? null,
      guest_name: payload.guest_name,
      guest_email: payload.guest_email,
      guest_phone: payload.guest_phone || null,
      start_at: payload.start_at,
      end_at: payload.end_at,
      mode: payload.mode,
      guests: payload.guests,
      addons: payload.addons || [],
      base_amount: payload.base_amount || 0,
      cleaning_fee: payload.cleaning_fee || 0,
      addons_amount: payload.addons_amount || 0,
      total_amount: payload.total_amount || 0,
      status: 'pending',
      notes: payload.notes || null,
    }])
    .select('id')
    .single();
  return { data, error };
}
