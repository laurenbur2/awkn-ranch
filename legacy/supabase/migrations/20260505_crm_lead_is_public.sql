-- Add a public/private visibility flag to venue events.
--
-- Default is FALSE (private) so existing rows are conservatively treated as
-- private until an admin marks them public. The flag is shown as a column on
-- the Venue Events list view and is settable from both the new-event modal
-- on that page and the lead edit form in the CRM.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN crm_leads.is_public IS
  'Whether the venue event is publicly visible (true) or private (false). Used by the Venue Events admin view; default false.';
