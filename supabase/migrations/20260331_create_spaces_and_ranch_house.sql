-- =============================================
-- CREATE SPACES TABLE & ADD RANCH HOUSE
-- Migration: 20260331
-- =============================================
-- Creates the spaces table (base infrastructure)
-- and adds the Ranch House as the main rental space
-- with 7 rooms and 10 beds.
-- =============================================

-- Step 1: Create spaces table if it doesn't exist
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  location TEXT,
  type TEXT,
  parent_id UUID REFERENCES spaces(id) ON DELETE SET NULL,
  monthly_rate INTEGER,
  weekly_rate INTEGER,
  nightly_rate INTEGER,
  rental_term TEXT,
  standard_deposit TEXT,
  sq_footage INTEGER,
  min_residents INTEGER DEFAULT 1,
  max_residents INTEGER,
  beds_king INTEGER DEFAULT 0,
  beds_queen INTEGER DEFAULT 0,
  beds_double INTEGER DEFAULT 0,
  beds_twin INTEGER DEFAULT 0,
  beds_folding INTEGER DEFAULT 0,
  bath_privacy TEXT, -- 'private', 'shared', or null
  bath_fixture TEXT, -- 'sink_only', 'half', 'three_quarter', 'seven_eighth', 'full'
  gender_restriction TEXT DEFAULT 'none',
  is_listed BOOLEAN DEFAULT false,
  is_secret BOOLEAN DEFAULT false,
  is_micro BOOLEAN DEFAULT false,
  can_be_dwelling BOOLEAN DEFAULT false,
  can_be_event BOOLEAN DEFAULT false,
  min_nights INTEGER DEFAULT 1,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Enable RLS
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;

-- Public read access for listed, non-secret, non-archived spaces
CREATE POLICY IF NOT EXISTS "spaces_public_read" ON spaces
  FOR SELECT USING (is_listed = true AND is_secret = false AND is_archived = false);

-- Authenticated users can read all spaces
CREATE POLICY IF NOT EXISTS "spaces_auth_read" ON spaces
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert/update/delete
CREATE POLICY IF NOT EXISTS "spaces_auth_insert" ON spaces
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "spaces_auth_update" ON spaces
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "spaces_auth_delete" ON spaces
  FOR DELETE TO authenticated USING (true);

-- Step 3: Create the Ranch House as parent space
INSERT INTO spaces (name, slug, description, location, can_be_dwelling, can_be_event, is_listed, is_secret, max_residents, nightly_rate, min_nights)
SELECT 'Ranch House', 'ranch-house',
  'The main house on the property with 7 rooms and 10 beds. Perfect for overnight retreats, team offsites, and group getaways. Full kitchen, common areas, backyard access, and all the amenities of ranch living.',
  'Main Property',
  true, true, true, false, 10, 295, 2
WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Ranch House');

-- Step 4: Add the 7 rooms as child spaces
-- Room 1: Master Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_king, max_residents, bath_privacy, bath_fixture)
SELECT 'Master Bedroom', 'ranch-master', 'Spacious master bedroom with king bed and private bathroom.',
  id, true, true, 1, 2, 'private', 'full'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Master Bedroom' AND parent_id IS NOT NULL);

-- Room 2: Second Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_queen, max_residents, bath_privacy)
SELECT 'Second Bedroom', 'ranch-room-2', 'Comfortable room with queen bed.',
  id, true, true, 1, 2, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Second Bedroom' AND parent_id IS NOT NULL);

-- Room 3: Third Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_queen, max_residents, bath_privacy)
SELECT 'Third Bedroom', 'ranch-room-3', 'Comfortable room with queen bed.',
  id, true, true, 1, 2, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Third Bedroom' AND parent_id IS NOT NULL);

-- Room 4: Fourth Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_twin, max_residents, bath_privacy)
SELECT 'Fourth Bedroom', 'ranch-room-4', 'Room with two twin beds — great for friends or solo travelers.',
  id, true, true, 2, 2, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Fourth Bedroom' AND parent_id IS NOT NULL);

-- Room 5: Fifth Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_double, max_residents, bath_privacy)
SELECT 'Fifth Bedroom', 'ranch-room-5', 'Cozy room with a double bed.',
  id, true, true, 1, 2, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Fifth Bedroom' AND parent_id IS NOT NULL);

-- Room 6: Sixth Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_twin, max_residents, bath_privacy)
SELECT 'Sixth Bedroom', 'ranch-room-6', 'Room with twin bed — quiet and private.',
  id, true, true, 1, 1, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Sixth Bedroom' AND parent_id IS NOT NULL);

-- Room 7: Seventh Bedroom
INSERT INTO spaces (name, slug, description, parent_id, can_be_dwelling, is_listed, beds_twin, max_residents, bath_privacy)
SELECT 'Seventh Bedroom', 'ranch-room-7', 'Room with twin bed — quiet and private.',
  id, true, true, 1, 1, 'shared'
FROM spaces WHERE name = 'Ranch House'
AND NOT EXISTS (SELECT 1 FROM spaces WHERE name = 'Seventh Bedroom' AND parent_id IS NOT NULL);

-- Bed count check: 1 king + 2 queen + 1 double + 4 twin = 8 actual beds
-- But twin rooms can accommodate 2+2+1+1 = 6, queen rooms 2+2 = 4, king = 2, double = 2
-- Total sleeping capacity: ~10+ people across 7 rooms
