-- Two columns on crm_leads to support venue rentals that span multiple
-- spaces and/or multiple days:
--
-- additional_space_ids: extra space UUIDs beyond the primary space_id.
--   The calendar still uses space_id as the primary tile (so each event
--   shows up once per day), but the lead drawer and event detail render
--   the full set so the team can see "Temple + Yurts + Dome" at a glance
--   and conflict-checks can be exhaustive.
--
-- event_end_date: optional end of a multi-day event. NULL means the
--   event happens entirely on event_date. When set, the event spans
--   [event_date, event_end_date] inclusive; the calendar renders a tile
--   on each day of the range.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS additional_space_ids UUID[],
  ADD COLUMN IF NOT EXISTS event_end_date DATE;

COMMENT ON COLUMN crm_leads.additional_space_ids IS
  'Extra spaces beyond crm_leads.space_id used by this event (uuid[]). Empty/null = single-space event.';
COMMENT ON COLUMN crm_leads.event_end_date IS
  'Last day of a multi-day event (inclusive). NULL = single-day event ending on event_date.';
