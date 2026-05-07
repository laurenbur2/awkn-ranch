// Single source of truth for Within Center package pricing.
// Used by the deposit page (book/) and the schedule page (book/schedule/).
// If you update prices, this is the only file you need to change.

window.WITHIN_PACKAGES = {
  discover: {
    name: 'Discover',
    tagline: 'A gentle first step into the medicine',
    description: 'One private guided ketamine ceremony, fully held. Includes preparation, ceremony, and an integration coaching session.',
    price: 1250,
    strike: null,
    label: 'Single Ceremony Investment',
    depositPct: 0.10,
  },
  heal: {
    name: 'Heal',
    tagline: 'A three-ceremony arc to calm the nervous system',
    description: 'Three private guided ceremonies spaced across 6–8 weeks, with preparation and integration support throughout.',
    price: 3300,
    strike: null,
    label: 'Package Investment',
    depositPct: 0.10,
  },
  awkn: {
    name: 'AWKN',
    tagline: 'A six-ceremony container for deep transformation',
    description: 'Our deepest offering — six private guided ceremonies over three to six months, with full preparation and integration support.',
    price: 5500,
    strike: null,
    label: 'Package Investment',
    depositPct: 0.10,
  },
  'twin-flame': {
    name: 'Couples Reset',
    tagline: 'A shared arc for partners healing together',
    description: 'A couples journey designed to restore connection — shared ceremony, joint integration, and private reflection time for each partner.',
    price: 1650,
    strike: null,
    label: 'Couples Package',
    depositPct: 0.10,
  },

  // ── Immersive Retreats ─────────────────────────────
  // Each retreat has two room options. The /book/ page builds the slug as
  // `immersive-<room>` or `immersive-3day-<room>`.
  'immersive-private': {
    name: 'Six-Day Retreat — Private Room',
    tagline: 'Two ceremonies, full immersion, one threshold',
    description: 'Six-day residential ceremonial ketamine retreat at AWKN Ranch — private room.',
    price: 4999,
    strike: null,
    label: 'Retreat Investment',
    depositPct: 0.10,
    retreatType: '6day',
    retreatNights: 5,
    retreatReturnPath: 'immersive-retreat/',
  },
  'immersive-shared': {
    name: 'Six-Day Retreat — Shared Room',
    tagline: 'Two ceremonies, full immersion, one threshold',
    description: 'Six-day residential ceremonial ketamine retreat at AWKN Ranch — shared room.',
    price: 3999,
    strike: null,
    label: 'Retreat Investment',
    depositPct: 0.10,
    retreatType: '6day',
    retreatNights: 5,
    retreatReturnPath: 'immersive-retreat/',
  },
  'immersive-3day-private': {
    name: 'Three-Day Retreat — Private Room',
    tagline: 'A condensed residential reset',
    description: 'Three-day residential ceremonial ketamine retreat at AWKN Ranch — private room.',
    price: 1699,
    strike: null,
    label: 'Retreat Investment',
    depositPct: 0.10,
    retreatType: '3day',
    retreatNights: 2,
    retreatReturnPath: 'immersive-retreat/3-day/',
  },
  'immersive-3day-shared': {
    name: 'Three-Day Retreat — Shared Room',
    tagline: 'A condensed residential reset',
    description: 'Three-day residential ceremonial ketamine retreat at AWKN Ranch — shared room.',
    price: 1499,
    strike: null,
    label: 'Retreat Investment',
    depositPct: 0.10,
    retreatType: '3day',
    retreatNights: 2,
    retreatReturnPath: 'immersive-retreat/3-day/',
  },
};

window.formatCurrency = function (n) {
  return '$' + n.toLocaleString('en-US');
};
