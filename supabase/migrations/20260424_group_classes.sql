-- Group-class support. A "class" is a service that can seat multiple clients at
-- the same start time under one facilitator (e.g. Gentle Yoga). We keep 1:1
-- bookings working as-is (scheduling_bookings.lead_id + package_session_id stay
-- populated for 1:1) and add a parallel attendees table for classes.
--
-- For a class booking:
--   - scheduling_bookings.lead_id           is NULL
--   - scheduling_bookings.package_session_id is NULL
--   - One row per attendee in scheduling_booking_attendees, each tied to a
--     client_package_sessions row so the session credit still burns/restores.
--
-- The existing partial UNIQUE on (facilitator_id, start_datetime) already locks
-- the facilitator's slot for both paths — no extra guard needed.

BEGIN;

-- 1. Service catalog flags
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_group_class BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER
    CHECK (max_capacity IS NULL OR max_capacity > 0);

-- 2. Attendees table
CREATE TABLE IF NOT EXISTS scheduling_booking_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES scheduling_bookings(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id),
  package_session_id UUID REFERENCES client_package_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'attended', 'no_show')),
  attended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_attendees_booking ON scheduling_booking_attendees(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendees_lead    ON scheduling_booking_attendees(lead_id);
CREATE INDEX IF NOT EXISTS idx_attendees_session ON scheduling_booking_attendees(package_session_id);

-- 3. RLS — match the permissive posture used on scheduling_bookings.
ALTER TABLE scheduling_booking_attendees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduling_booking_attendees' AND policyname='Auth read attendees') THEN
    CREATE POLICY "Auth read attendees" ON scheduling_booking_attendees
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduling_booking_attendees' AND policyname='Auth update attendees') THEN
    CREATE POLICY "Auth update attendees" ON scheduling_booking_attendees
      FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='scheduling_booking_attendees' AND policyname='Service role attendees') THEN
    CREATE POLICY "Service role attendees" ON scheduling_booking_attendees
      TO service_role USING (true);
  END IF;
END$$;

COMMIT;
