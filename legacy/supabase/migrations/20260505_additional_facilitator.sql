-- Add an optional second facilitator slot to scheduling_bookings.
--
-- Ketamine sessions and other multi-guide ceremonies often have a primary
-- facilitator (already tracked via facilitator_id) plus an assistant /
-- co-facilitator. The new column is nullable so existing single-facilitator
-- sessions continue to validate, and it points at the same facilitators
-- table so the lookup logic in the schedule UI is identical.

ALTER TABLE scheduling_bookings
  ADD COLUMN IF NOT EXISTS additional_facilitator_id UUID REFERENCES facilitators(id);

COMMENT ON COLUMN scheduling_bookings.additional_facilitator_id IS
  'Optional second facilitator (co-facilitator) for sessions that need two guides, e.g. ketamine sessions.';
