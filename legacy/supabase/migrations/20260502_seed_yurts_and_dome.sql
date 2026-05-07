-- Seed Honeycomb Dome and the Bali / Barcelona yurts as bookable spaces.
-- They've always existed on the property but were missing from the spaces
-- table, so admins couldn't pick them in the Within Schedule "New Session"
-- modal and Within sessions held there weren't surfacing on the venue
-- events calendar (which filters Within overlays to space.booking_category
-- = 'rental_space').
--
-- Honeycomb Dome → ceremony-only.
-- Yurts → 'both' so they can host sessions AND be assigned as overnight
--         lodging (matches the public site's $699/night yurt rate).

INSERT INTO spaces (
  name, slug, description, space_type, booking_category, booking_name,
  is_archived, is_listed, can_be_dwelling, can_be_event, created_at, updated_at
)
SELECT 'Honeycomb Dome', 'honeycomb-dome',
  'Geodesic dome under the oaks — natural light, cushions, and a quiet stillness for intimate ceremony work.',
  'session', 'rental_space', 'Honeycomb Dome',
  FALSE, FALSE, FALSE, TRUE, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM spaces WHERE slug = 'honeycomb-dome' OR (name = 'Honeycomb Dome' AND is_archived = FALSE)
);

INSERT INTO spaces (
  name, slug, description, space_type, booking_category, booking_name,
  is_archived, is_listed, can_be_dwelling, can_be_event, created_at, updated_at
)
SELECT 'Bali Yurt', 'bali-yurt',
  'Private yurt nestled under the live oaks — ceremony-capable and overnight-stay-capable.',
  'both', 'rental_space', 'Bali Yurt',
  FALSE, FALSE, TRUE, TRUE, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM spaces WHERE slug = 'bali-yurt' OR (name = 'Bali Yurt' AND is_archived = FALSE)
);

INSERT INTO spaces (
  name, slug, description, space_type, booking_category, booking_name,
  is_archived, is_listed, can_be_dwelling, can_be_event, created_at, updated_at
)
SELECT 'Barcelona Yurt', 'barcelona-yurt',
  'Private yurt nestled under the live oaks — ceremony-capable and overnight-stay-capable.',
  'both', 'rental_space', 'Barcelona Yurt',
  FALSE, FALSE, TRUE, TRUE, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM spaces WHERE slug = 'barcelona-yurt' OR (name = 'Barcelona Yurt' AND is_archived = FALSE)
);
