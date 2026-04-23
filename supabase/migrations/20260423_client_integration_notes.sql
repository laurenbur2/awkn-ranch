-- EMR-style integration notes on a client (crm_leads row).
-- Multiple timestamped, authored notes per client. Editable by any admin/staff/oracle
-- (not just the original author). No deletes -- chart-style append and amend only.
-- Strictly internal: the client portal never reads this table.

CREATE TABLE IF NOT EXISTS client_integration_notes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  author_app_user_id   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  content              text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_integration_notes_lead_idx
  ON client_integration_notes(lead_id, created_at DESC);

ALTER TABLE client_integration_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read integration notes"   ON client_integration_notes;
DROP POLICY IF EXISTS "staff insert integration notes" ON client_integration_notes;
DROP POLICY IF EXISTS "staff update integration notes" ON client_integration_notes;

CREATE POLICY "staff read integration notes"
  ON client_integration_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','oracle')
  ));

CREATE POLICY "staff insert integration notes"
  ON client_integration_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','oracle')
  ));

CREATE POLICY "staff update integration notes"
  ON client_integration_notes FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','oracle')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM app_users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin','staff','oracle')
  ));

-- No DELETE policy: notes are append-and-amend only.
