// Single source of truth for Within Center package pricing.
// Used by the deposit page (book/) and the schedule page (book/schedule/).
// If you update prices, this is the only file you need to change.

window.WITHIN_PACKAGES = {
  discover: {
    name: 'Discover',
    tagline: 'A gentle first step into the medicine',
    description: 'One private guided ketamine ceremony, fully held. Includes preparation, ceremony, and an integration coaching session.',
    price: 799,        // total package price in USD
    strike: 1250,      // original price (optional, for strikethrough)
    label: 'April Special — Limited Time',
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
};

window.formatCurrency = function (n) {
  return '$' + n.toLocaleString('en-US');
};
