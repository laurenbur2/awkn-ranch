-- Allow admin-created bookings to be assigned to a facilitator (external
-- contractor) instead of an app_users staff row. Facilitators are already
-- their own directory (see 20260422_facilitators.sql). Keep staff_user_id
-- nullable so existing bookings and any future staff-assigned bookings still
-- work, but add a parallel partial unique index on (facilitator_id,
-- start_datetime) for atomic double-booking protection against the same
-- facilitator.
--
-- A booking must reference either a staff user or a facilitator (not neither,
-- not both) — enforced by a CHECK constraint.

BEGIN;

ALTER TABLE scheduling_bookings
  ADD COLUMN IF NOT EXISTS facilitator_id uuid REFERENCES facilitators(id);

ALTER TABLE scheduling_bookings
  ALTER COLUMN staff_user_id DROP NOT NULL;

-- One of the three assignment paths must be set: either the Calendly-style
-- profile_id (public booking flow), or an admin-assigned staff user, or an
-- admin-assigned facilitator. Cancelled bookings are exempt so we can keep
-- legacy data around even if the FK was later deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduling_bookings_assignee_chk'
  ) THEN
    ALTER TABLE scheduling_bookings
      ADD CONSTRAINT scheduling_bookings_assignee_chk
      CHECK (
        cancelled_at IS NOT NULL
        OR profile_id IS NOT NULL
        OR staff_user_id IS NOT NULL
        OR facilitator_id IS NOT NULL
      );
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS scheduling_bookings_facilitator_slot_unique
  ON scheduling_bookings (facilitator_id, start_datetime)
  WHERE cancelled_at IS NULL AND facilitator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scheduling_bookings_facilitator_idx
  ON scheduling_bookings (facilitator_id)
  WHERE facilitator_id IS NOT NULL;

COMMIT;
