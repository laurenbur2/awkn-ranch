-- Phase 4 of Client Portal v1 — admin-initiated bookings.
--
-- Admin-created sessions don't belong to any Calendly-style scheduling_profile
-- or event_type (those are for staff's own public booking pages). We make those
-- columns nullable and add a new partial unique index on (staff_user_id,
-- start_datetime) so that admin inserts still get atomic double-booking
-- protection against the same staff member.

BEGIN;

ALTER TABLE scheduling_bookings
  ALTER COLUMN profile_id DROP NOT NULL,
  ALTER COLUMN event_type_id DROP NOT NULL;

-- Atomic guard for admin-initiated bookings. Separate from the existing
-- scheduling_bookings_slot_unique index (which guards the public-facing
-- profile+event_type flow).
CREATE UNIQUE INDEX IF NOT EXISTS scheduling_bookings_staff_slot_unique
  ON scheduling_bookings (staff_user_id, start_datetime)
  WHERE cancelled_at IS NULL AND staff_user_id IS NOT NULL;

COMMIT;
