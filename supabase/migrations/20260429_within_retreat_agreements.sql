-- within_retreat_agreements — one row per retreat agreement sent to a Within
-- immersive-retreat client for SignWell signature. Mirrors the role that
-- crm_proposals plays for venue rentals (which carry their own signwell_*
-- columns) but lives in its own table because retreat agreements are tied to
-- the lead/package, not to a proposal.
--
-- The signwell-webhook edge function looks up the document_id here when a
-- crm_proposals match isn't found, then stamps signed_at + signer info and
-- writes an entry to crm_activities for the lead.

CREATE TABLE IF NOT EXISTS within_retreat_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  package_id UUID NULL REFERENCES client_packages(id) ON DELETE SET NULL,

  -- SignWell linkage. document_id is the foreign id we look up on webhook.
  signwell_document_id TEXT,
  signing_url TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'signed', 'declined', 'expired', 'voided')),

  -- Snapshot of the merge-field values used when the PDF was rendered, so we
  -- can reproduce or audit what the signer actually saw.
  merge_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_email TEXT,
  signed_pdf_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS within_retreat_agreements_lead_id_idx
  ON within_retreat_agreements(lead_id);
CREATE INDEX IF NOT EXISTS within_retreat_agreements_package_id_idx
  ON within_retreat_agreements(package_id);
CREATE UNIQUE INDEX IF NOT EXISTS within_retreat_agreements_signwell_doc_id_idx
  ON within_retreat_agreements(signwell_document_id) WHERE signwell_document_id IS NOT NULL;

ALTER TABLE within_retreat_agreements ENABLE ROW LEVEL SECURITY;

-- Authenticated admin/staff can read + write.
DROP POLICY IF EXISTS within_retreat_agreements_admin_all ON within_retreat_agreements;
CREATE POLICY within_retreat_agreements_admin_all
  ON within_retreat_agreements FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.auth_user_id = auth.uid()
        AND au.role IN ('admin', 'staff', 'oracle')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users au
      WHERE au.auth_user_id = auth.uid()
        AND au.role IN ('admin', 'staff', 'oracle')
    )
  );

-- Touch updated_at on UPDATE.
CREATE OR REPLACE FUNCTION within_retreat_agreements_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS within_retreat_agreements_updated_at ON within_retreat_agreements;
CREATE TRIGGER within_retreat_agreements_updated_at
  BEFORE UPDATE ON within_retreat_agreements
  FOR EACH ROW EXECUTE FUNCTION within_retreat_agreements_set_updated_at();
