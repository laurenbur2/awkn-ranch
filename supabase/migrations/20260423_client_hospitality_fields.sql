-- Hospitality / non-clinical intake fields on crm_leads.
-- Everything here is non-PHI by design: preferences, logistics, and admin flags.
-- Clinical data (medications, conditions, allergies, diagnoses) must live in
-- the HIPAA-compliant intake system, not this table.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS preferred_name                 text,
  ADD COLUMN IF NOT EXISTS pronouns                       text,

  ADD COLUMN IF NOT EXISTS emergency_contact_name         text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,

  ADD COLUMN IF NOT EXISTS dietary_preferences            text,
  ADD COLUMN IF NOT EXISTS dietary_dislikes               text,

  ADD COLUMN IF NOT EXISTS room_preferences               text,

  ADD COLUMN IF NOT EXISTS arrival_method                 text,
  ADD COLUMN IF NOT EXISTS arrival_details                text,
  ADD COLUMN IF NOT EXISTS arrival_pickup_needed          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS departure_details              text,
  ADD COLUMN IF NOT EXISTS departure_pickup_needed        boolean DEFAULT false,

  ADD COLUMN IF NOT EXISTS waiver_signed                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_completed               boolean DEFAULT false;
