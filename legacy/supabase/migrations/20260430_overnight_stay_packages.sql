-- Two single-night Retreat House stay presets so the team can attach an
-- overnight to a client booking from the package picker. Pricing matches the
-- public site (laurenbur2.github.io/awkn-ranch/pricing/): $349 private room,
-- $239 per shared-room bed. Sits in its own "overnight" category alongside
-- the existing "integration" category on crm_service_packages.
--
-- These packages have no service line items (lodging isn't a session-based
-- service), so they appear in the picker without auto-populating any session
-- credits — admin still picks the actual bed via the existing pkg-bed UI on
-- the New Package modal.

INSERT INTO crm_service_packages (business_line, name, slug, price_regular, description, is_active, sort_order, category)
VALUES
  ('within', 'Single-Night Retreat House Stay — Private Room', 'overnight-private', 349, 'Whole-room exclusive use, queen bed. Add a night to any session, or book as a standalone stay.', TRUE, 200, 'overnight'),
  ('within', 'Single-Night Retreat House Stay — Shared Bed',   'overnight-shared',  239, 'One bed in a shared room (bunk or queen). Add a night to any session, or book as a standalone stay.',   TRUE, 201, 'overnight')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price_regular = EXCLUDED.price_regular,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
