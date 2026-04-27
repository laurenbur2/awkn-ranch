-- Retreat House: rates, features, and the Celenite → Citrine rename.
-- Adds bed-level nightly rates ($349 for private-room beds, $239 for shared-room beds),
-- a `features` jsonb on spaces (used to mark Selenite as pool-access), and renames
-- the upstairs shared room from Celenite to Citrine.

BEGIN;

-- ============================================================================
-- 1. Rename Celenite → Citrine (upstairs shared 2-queen room).
-- ============================================================================
UPDATE spaces
SET name = 'Citrine',
    slug = 'citrine',
    booking_name = 'Citrine',
    updated_at = NOW()
WHERE slug = 'celenite';

-- ============================================================================
-- 2. Per-bed nightly rate.
-- ============================================================================
ALTER TABLE beds
  ADD COLUMN IF NOT EXISTS nightly_rate_cents INTEGER NOT NULL DEFAULT 0
    CHECK (nightly_rate_cents >= 0);

-- Private-room beds: $349/night (34900 cents). Booking the bed = booking the whole room.
UPDATE beds b
SET nightly_rate_cents = 34900,
    updated_at = NOW()
FROM spaces s
WHERE b.space_id = s.id
  AND s.slug IN ('quartz','selenite','amethyst','opal','jasper');

-- Shared-room beds: $239/bed/night (23900 cents). Each bed books independently.
UPDATE beds b
SET nightly_rate_cents = 23900,
    updated_at = NOW()
FROM spaces s
WHERE b.space_id = s.id
  AND s.slug IN ('emerald','citrine');

-- ============================================================================
-- 3. Space-level feature tags (extensible: pool_access today, sauna/etc. later).
-- ============================================================================
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE spaces
SET features = jsonb_set(COALESCE(features, '{}'::jsonb), '{pool_access}', 'true'::jsonb),
    updated_at = NOW()
WHERE slug = 'selenite';

COMMIT;
