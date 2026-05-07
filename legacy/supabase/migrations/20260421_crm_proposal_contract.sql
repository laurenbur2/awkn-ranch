-- Contract-signing support on crm_proposals (AWKN Ranch venue-rental flow).
-- SignWell tracks the signed copy; deposit_percent controls the initial
-- payment amount (50% default, balance due 30 days before event).

ALTER TABLE crm_proposals
  ADD COLUMN IF NOT EXISTS signwell_document_id TEXT,
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_signed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS contract_signed_by_email TEXT,
  ADD COLUMN IF NOT EXISTS deposit_percent INTEGER DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_crm_proposals_signwell_document_id
  ON crm_proposals(signwell_document_id)
  WHERE signwell_document_id IS NOT NULL;
