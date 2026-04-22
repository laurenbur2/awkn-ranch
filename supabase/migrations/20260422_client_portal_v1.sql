-- Client Portal v1 — data model for AWKN Within ketamine clients.
-- Introduces: services catalog, client packages (+ sessions), retreat stays,
-- bed-level lodging inventory, and extensions on spaces/scheduling_bookings/app_users.
--
-- Client identity remains in crm_leads; the existing `active_client` pipeline
-- stage (slug: active_client) marks a lead as a client. No separate clients table.
--
-- Session rooms = existing spaces (Yurts, Dome, Wellness, Temple).
-- Lodging rooms = seven "crystal" rooms seeded below, tied to a new beds table
-- so shared rooms (Emerald, Celenite) can be booked bed-by-bed.

BEGIN;

-- ============================================================================
-- 1. Services catalog
-- ============================================================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  default_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (default_price_cents >= 0),
  requires_upfront_payment BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_active_sort ON services(is_active, sort_order);

INSERT INTO services (name, slug, duration_minutes, default_price_cents, sort_order, requires_upfront_payment)
VALUES
  ('Ketamine Session', 'ketamine-session', 120, 0, 10, TRUE),
  ('Massage',          'massage',          60,  0, 20, FALSE),
  ('Integration',      'integration',      50,  0, 30, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. Spaces extensions + room catalog cleanup
-- ============================================================================
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS space_type TEXT
    CHECK (space_type IN ('session','lodging','both')),
  ADD COLUMN IF NOT EXISTS floor TEXT
    CHECK (floor IN ('downstairs','upstairs')),
  ADD COLUMN IF NOT EXISTS has_private_bath BOOLEAN;

-- Classify existing real spaces and rename Yurts to Bali / Barcelona.
UPDATE spaces SET name = 'Bali Yurt',      slug = 'bali-yurt',      booking_name = 'Bali Yurt',      space_type = 'session' WHERE slug = 'yurt-1';
UPDATE spaces SET name = 'Barcelona Yurt', slug = 'barcelona-yurt', booking_name = 'Barcelona Yurt', space_type = 'session' WHERE slug = 'yurt-2';
UPDATE spaces SET space_type = 'session', can_be_dwelling = FALSE, can_be_event = TRUE
  WHERE name IN ('Honeycomb Dome','Temple','Wellness Room 1','Wellness Room 2','Wellness Room 3');

-- Archive template-leftover bedroom rows — being replaced by the seven crystal rooms below.
UPDATE spaces
SET is_archived = TRUE,
    updated_at  = NOW()
WHERE is_archived IS NOT TRUE
  AND booking_category = 'house_room';

-- Seed the seven lodging rooms. `spaces.slug` has no unique constraint, so
-- we guard each insert with WHERE NOT EXISTS to keep the migration idempotent.
INSERT INTO spaces (name, slug, space_type, floor, has_private_bath,
                    can_be_dwelling, can_be_event, booking_category, booking_name,
                    is_listed, is_archived, created_at, updated_at)
SELECT v.name, v.slug, 'lodging', v.floor, v.has_private_bath,
       TRUE, FALSE, 'house_room', v.name, TRUE, FALSE, NOW(), NOW()
FROM (VALUES
  ('Emerald',  'emerald',  'downstairs', TRUE),
  ('Quartz',   'quartz',   'downstairs', FALSE),
  ('Selenite', 'selenite', 'downstairs', FALSE),
  ('Amethyst', 'amethyst', 'downstairs', FALSE),
  ('Opal',     'opal',     'upstairs',   TRUE),
  ('Celenite', 'celenite', 'upstairs',   FALSE),
  ('Jasper',   'jasper',   'upstairs',   FALSE)
) AS v(name, slug, floor, has_private_bath)
WHERE NOT EXISTS (SELECT 1 FROM spaces s WHERE s.slug = v.slug);

-- ============================================================================
-- 3. Beds table — bookable sleeping slots inside lodging rooms
-- ============================================================================
CREATE TABLE IF NOT EXISTS beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  bed_type TEXT NOT NULL CHECK (bed_type IN ('king','queen','double','twin','bunk_top','bunk_bottom')),
  max_guests INTEGER NOT NULL DEFAULT 1 CHECK (max_guests >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, label)
);
CREATE INDEX IF NOT EXISTS idx_beds_space ON beds(space_id) WHERE is_archived = FALSE;

-- Seed beds for each crystal room.
DO $$
DECLARE
  v_emerald  UUID;
  v_quartz   UUID;
  v_selenite UUID;
  v_amethyst UUID;
  v_opal     UUID;
  v_celenite UUID;
  v_jasper   UUID;
BEGIN
  SELECT id INTO v_emerald  FROM spaces WHERE slug = 'emerald';
  SELECT id INTO v_quartz   FROM spaces WHERE slug = 'quartz';
  SELECT id INTO v_selenite FROM spaces WHERE slug = 'selenite';
  SELECT id INTO v_amethyst FROM spaces WHERE slug = 'amethyst';
  SELECT id INTO v_opal     FROM spaces WHERE slug = 'opal';
  SELECT id INTO v_celenite FROM spaces WHERE slug = 'celenite';
  SELECT id INTO v_jasper   FROM spaces WHERE slug = 'jasper';

  INSERT INTO beds (space_id, label, bed_type, max_guests, sort_order) VALUES
    -- Emerald: 2 bunks = 4 singles
    (v_emerald,  'Bunk 1 - Top',    'bunk_top',    1, 1),
    (v_emerald,  'Bunk 1 - Bottom', 'bunk_bottom', 1, 2),
    (v_emerald,  'Bunk 2 - Top',    'bunk_top',    1, 3),
    (v_emerald,  'Bunk 2 - Bottom', 'bunk_bottom', 1, 4),
    -- Private queens/king — max_guests 2 so couples can share one stay each
    (v_quartz,   'Queen',           'queen',       2, 1),
    (v_selenite, 'Queen',           'queen',       2, 1),
    (v_amethyst, 'Queen',           'queen',       2, 1),
    (v_opal,     'King',            'king',        2, 1),
    -- Celenite shared: 2 queens, each independently bookable (up to 2 guests per bed)
    (v_celenite, 'Queen 1',         'queen',       2, 1),
    (v_celenite, 'Queen 2',         'queen',       2, 2),
    (v_jasper,   'Queen',           'queen',       2, 1)
  ON CONFLICT (space_id, label) DO NOTHING;
END $$;

-- ============================================================================
-- 4. Client packages + session credits
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  occupancy_rate TEXT NOT NULL DEFAULT 'private'
    CHECK (occupancy_rate IN ('private','shared')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_packages_lead   ON client_packages(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_status ON client_packages(status);

CREATE TABLE IF NOT EXISTS client_package_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES client_packages(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  status TEXT NOT NULL DEFAULT 'unscheduled'
    CHECK (status IN ('unscheduled','scheduled','completed','cancelled')),
  booking_id UUID REFERENCES scheduling_bookings(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pkg_sessions_package ON client_package_sessions(package_id);
CREATE INDEX IF NOT EXISTS idx_pkg_sessions_status  ON client_package_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pkg_sessions_booking ON client_package_sessions(booking_id);

-- ============================================================================
-- 5. Retreat stays (on-site at AWKN Ranch)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  bed_id UUID NOT NULL REFERENCES beds(id),
  package_id UUID REFERENCES client_packages(id) ON DELETE SET NULL,
  check_in_at TIMESTAMPTZ NOT NULL,
  check_out_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','active','completed','cancelled')),
  google_event_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out_at > check_in_at)
);
CREATE INDEX IF NOT EXISTS idx_client_stays_lead   ON client_stays(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_stays_bed    ON client_stays(bed_id, check_in_at);
CREATE INDEX IF NOT EXISTS idx_client_stays_window ON client_stays(status, check_in_at, check_out_at);

-- ============================================================================
-- 6. scheduling_bookings extensions (service + space + package linkage)
-- ============================================================================
ALTER TABLE scheduling_bookings
  ADD COLUMN IF NOT EXISTS service_id         UUID REFERENCES services(id),
  ADD COLUMN IF NOT EXISTS space_id           UUID REFERENCES spaces(id),
  ADD COLUMN IF NOT EXISTS package_session_id UUID REFERENCES client_package_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_user_id      UUID REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS created_by_admin_id UUID REFERENCES app_users(id);

CREATE INDEX IF NOT EXISTS idx_sched_bookings_service ON scheduling_bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_sched_bookings_space   ON scheduling_bookings(space_id);
CREATE INDEX IF NOT EXISTS idx_sched_bookings_staff   ON scheduling_bookings(staff_user_id);

-- ============================================================================
-- 7. Scheduler permission
-- ============================================================================
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS can_schedule BOOLEAN NOT NULL DEFAULT FALSE;

-- Admins implicitly have scheduler access; flip the flag on for existing admins.
UPDATE app_users SET can_schedule = TRUE WHERE role = 'admin' AND can_schedule = FALSE;

COMMIT;
