-- AWKN Booking v1 — fresh, AWKN-branded booking system.
--
-- Replaces the alpaca-era venue rental / event_space_reservations infrastructure
-- for the public-facing /book/ flow. Two tables:
--   awkn_listings  — the 6 bookable units (rooms + spaces)
--   awkn_bookings  — guest holds and confirmed reservations
--
-- Pricing model supports both nightly stays (rooms, dome, yurt, temple) and
-- hourly rentals (temple, dome, yurts) with add-ons (cleaning, AV, staff).

BEGIN;

-- ============================================================================
-- 1. awkn_listings — the rentable units shown on /book/
-- ============================================================================
CREATE TABLE IF NOT EXISTS awkn_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('room', 'space')),
  short_desc TEXT,
  long_desc TEXT,
  capacity_min INTEGER,
  capacity_max INTEGER NOT NULL,
  -- Pricing (NULL = not offered for that mode)
  nightly_rate NUMERIC,
  hourly_rate NUMERIC,
  hourly_min_hours INTEGER DEFAULT 2,
  cleaning_fee NUMERIC DEFAULT 0,
  -- Add-ons available for this listing, e.g.
  --   [{"key":"av","label":"AV Equipment","price":150,"unit":"flat"},
  --    {"key":"staff","label":"Support Staff","price":50,"unit":"hour"}]
  addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image TEXT,
  gallery_images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  amenities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_awkn_listings_active ON awkn_listings(is_active, display_order);

ALTER TABLE awkn_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "awkn_listings public read"  ON awkn_listings;
DROP POLICY IF EXISTS "awkn_listings auth write"   ON awkn_listings;
CREATE POLICY "awkn_listings public read"
  ON awkn_listings FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY "awkn_listings auth write"
  ON awkn_listings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. awkn_bookings — holds + confirmed reservations
-- ============================================================================
CREATE TABLE IF NOT EXISTS awkn_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES awkn_listings(id) ON DELETE RESTRICT,
  -- Guest info (denormalized — public form, no auth required)
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  -- Booking window
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('nightly', 'hourly')),
  guests INTEGER NOT NULL DEFAULT 1 CHECK (guests >= 1),
  -- Selected add-ons (subset of listing.addons, with chosen quantities)
  -- e.g. [{"key":"staff","label":"Support Staff","price":50,"unit":"hour","qty":4}]
  addons JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Pricing breakdown (snapshotted at booking time)
  base_amount NUMERIC NOT NULL DEFAULT 0,
  cleaning_fee NUMERIC NOT NULL DEFAULT 0,
  addons_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  -- Status flow:
  --   pending  — guest submitted, awaiting admin review/confirmation
  --   hold     — admin confirmed dates, payment link sent (Phase 2)
  --   paid     — payment received (Phase 2)
  --   confirmed — booking is final (used in Phase 1 too — admin approves manually)
  --   cancelled
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'hold', 'paid', 'confirmed', 'cancelled')),
  notes TEXT,
  internal_notes TEXT,
  -- Phase 2 hooks (NULL until Stripe is wired)
  stripe_payment_intent_id TEXT,
  stripe_checkout_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_awkn_bookings_listing_window
  ON awkn_bookings(listing_id, start_at, end_at)
  WHERE status IN ('pending', 'hold', 'paid', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_awkn_bookings_email ON awkn_bookings(guest_email);
CREATE INDEX IF NOT EXISTS idx_awkn_bookings_status ON awkn_bookings(status, created_at DESC);

ALTER TABLE awkn_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "awkn_bookings public insert"        ON awkn_bookings;
DROP POLICY IF EXISTS "awkn_bookings public read minimal"  ON awkn_bookings;
DROP POLICY IF EXISTS "awkn_bookings auth full access"     ON awkn_bookings;

-- Anyone can submit a booking request
CREATE POLICY "awkn_bookings public insert"
  ON awkn_bookings FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND end_at > start_at
    AND char_length(guest_name) > 0
    AND char_length(guest_email) > 0
  );

-- Public can see *only* the booking windows of active holds for availability
-- checking — but NEVER guest_name/email/notes. Implemented via a view below;
-- direct table SELECT is locked to authenticated only.
CREATE POLICY "awkn_bookings auth full access"
  ON awkn_bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. awkn_listing_availability — public-safe view (no PII, just blocked windows)
-- ============================================================================
CREATE OR REPLACE VIEW awkn_listing_availability AS
SELECT
  listing_id,
  start_at,
  end_at,
  mode
FROM awkn_bookings
WHERE status IN ('pending', 'hold', 'paid', 'confirmed');

GRANT SELECT ON awkn_listing_availability TO anon, authenticated;

-- ============================================================================
-- 4. Auto-update updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION awkn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_awkn_listings_updated_at ON awkn_listings;
CREATE TRIGGER trg_awkn_listings_updated_at
  BEFORE UPDATE ON awkn_listings
  FOR EACH ROW EXECUTE FUNCTION awkn_set_updated_at();

DROP TRIGGER IF EXISTS trg_awkn_bookings_updated_at ON awkn_bookings;
CREATE TRIGGER trg_awkn_bookings_updated_at
  BEFORE UPDATE ON awkn_bookings
  FOR EACH ROW EXECUTE FUNCTION awkn_set_updated_at();

-- ============================================================================
-- 5. Seed the 6 launch listings
-- ============================================================================
INSERT INTO awkn_listings
  (slug, name, category, short_desc, long_desc,
   capacity_min, capacity_max, nightly_rate, hourly_rate, hourly_min_hours,
   cleaning_fee, addons, hero_image, gallery_images, amenities, display_order)
VALUES
  -- Rooms ─────────────────────────────────────────────
  ('shared-room',
   'Shared Room',
   'room',
   'Reserve a bed in one of our shared rooms — quiet, restful, beautifully made.',
   'A bed of your own in one of our two shared rooms in the Retreat House. Soft linens, warm wood, and the morning light through the trees. Shared bathroom, continental breakfast, and full access to the sauna, cold plunge, and gardens. Reserve one bed or several — book up to six together if you''re traveling with friends or a group.',
   1, 6, 239, NULL, NULL, 0,
   '[]'::jsonb,
   '/assets/awkn/awkn-sharedroom.png',
   ARRAY['/assets/awkn/awkn-sharedroom.png','/assets/awkn/retreat-house.jpg']::TEXT[],
   ARRAY['A bed of your own','Two shared rooms available','Shared bathroom','Continental breakfast','Wellness facility access']::TEXT[],
   10),

  ('private-room',
   'Private Room',
   'room',
   'Five private rooms in the Retreat House — quiet, restful, yours.',
   'A private bedroom in the Retreat House with a queen bed and shared bath access. Five rooms available. Includes continental breakfast and full access to sauna, cold plunge, and gardens.',
   1, 2, 349, NULL, NULL, 0,
   '[]'::jsonb,
   '/assets/awkn/retreat-house.jpg',
   ARRAY['/assets/awkn/retreat-house.jpg']::TEXT[],
   ARRAY['Queen bed','Shared bath','Continental breakfast','Wellness facility access']::TEXT[],
   20),

  -- Spaces ────────────────────────────────────────────
  ('temple',
   'The Temple',
   'space',
   'Our 100-capacity ceremonial hall — for ceremonies, classes, and gatherings.',
   'The Temple holds up to 100 people for ceremony, movement, sound, and gathering. Rentable overnight or by the day. Add AV (projector, mic, sound) or support staff as needed.',
   1, 100, 1600, NULL, NULL, 150,
   '[
     {"key":"day","label":"Full Day (up to 9 hours)","price":1400,"unit":"flat","note":"Replaces overnight rate for day-only bookings"},
     {"key":"av","label":"AV Equipment (projector, mic, sound)","price":150,"unit":"flat"},
     {"key":"staff","label":"Support Staff","price":50,"unit":"hour"}
   ]'::jsonb,
   '/assets/awkn/awkn-temple-1.jpg',
   ARRAY['/assets/awkn/awkn-temple-1.jpg','/assets/awkn/temple-inside.jpeg','/assets/awkn/temple-inside-3.jpg','/assets/awkn/temple-interior-2.jpg']::TEXT[],
   ARRAY['Capacity 100','Wood floors','Natural light','AV available','Cleaning included separately']::TEXT[],
   30),

  ('honeycomb-dome',
   'Honeycomb Dome',
   'space',
   'Geodesic dome for intimate gatherings — up to 7 guests.',
   'A geodesic honeycomb dome on the property. Bookable overnight as a stay or by the hour for ceremony, breathwork, or gatherings. Two-hour minimum on hourly rentals.',
   1, 7, 499, 99, 2, 0,
   '[]'::jsonb,
   '/assets/awkn/honey-dome.jpeg',
   ARRAY['/assets/awkn/honey-dome.jpeg','/assets/awkn/dome.jpeg']::TEXT[],
   ARRAY['Hexagonal panes','Sky views','Capacity 7','Hourly or overnight']::TEXT[],
   40),

  ('yurt-bali',
   'Bali Yurt',
   'space',
   'Bali-themed yurt — sleep, gather, or hold space for 6–10 guests.',
   'One of two yurts on the property. The Bali yurt blends warm wood and natural textures. Bookable overnight or by the hour. Two-hour minimum on hourly rentals.',
   6, 10, 777, 99, 2, 80,
   '[]'::jsonb,
   '/assets/awkn/awkn-yurt-1.jpg',
   ARRAY['/assets/awkn/awkn-yurt-1.jpg']::TEXT[],
   ARRAY['Bali aesthetic','Capacity 6–10','Hourly or overnight','Cleaning fee $80']::TEXT[],
   50),

  ('yurt-barcelona',
   'Barcelona Yurt',
   'space',
   'Barcelona-themed yurt — sleep, gather, or hold space for 6–10 guests.',
   'The second of two yurts on the property. The Barcelona yurt has its own distinct character. Bookable overnight or by the hour. Two-hour minimum on hourly rentals.',
   6, 10, 777, 99, 2, 80,
   '[]'::jsonb,
   '/assets/awkn/awkn-yurt-1.jpg',
   ARRAY['/assets/awkn/awkn-yurt-1.jpg']::TEXT[],
   ARRAY['Barcelona aesthetic','Capacity 6–10','Hourly or overnight','Cleaning fee $80']::TEXT[],
   60)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
