-- Allow client_stays.bed_id to be NULL so the team can book a stay (dates +
-- guest) before committing to a specific bed assignment. The House calendar
-- already filters by bed_id, so unassigned stays simply don't surface there
-- until a bed is set — which matches the desired workflow (admin assigns a
-- bed later via the stay-edit flow).

ALTER TABLE client_stays
  ALTER COLUMN bed_id DROP NOT NULL;
