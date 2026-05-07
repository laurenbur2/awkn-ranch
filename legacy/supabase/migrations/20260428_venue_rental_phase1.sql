-- Venue Rental — Phase 1 schema additions.
--
-- Establishes:
--   1. Multi-space event reservations table (one lead can hold multiple spaces
--      for the same event window — e.g. Temple for ceremony + Yurt for lodging).
--   2. Event metadata + deposit/balance tracking on crm_leads.
--   3. Per-booking setup/breakdown buffer support on event_space_reservations.
--
-- Wellness Rooms 1 & 2 will be added to the rentable space catalog in a
-- follow-up migration once their rates are confirmed.

BEGIN;

-- ============================================================================
-- 1. event_space_reservations — link an event lead to one or more spaces.
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_space_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  setup_minutes INTEGER NOT NULL DEFAULT 0 CHECK (setup_minutes >= 0),
  breakdown_minutes INTEGER NOT NULL DEFAULT 0 CHECK (breakdown_minutes >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_esr_lead   ON event_space_reservations(lead_id);
CREATE INDEX IF NOT EXISTS idx_esr_space  ON event_space_reservations(space_id, start_at);
CREATE INDEX IF NOT EXISTS idx_esr_window ON event_space_reservations(start_at, end_at);

ALTER TABLE event_space_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "esr authenticated read"  ON event_space_reservations;
DROP POLICY IF EXISTS "esr authenticated write" ON event_space_reservations;
CREATE POLICY "esr authenticated read"  ON event_space_reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "esr authenticated write" ON event_space_reservations FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. crm_leads — extra fields for venue events.
-- ============================================================================
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS vendor_list TEXT,
  ADD COLUMN IF NOT EXISTS day_of_timeline TEXT,
  ADD COLUMN IF NOT EXISTS internal_staff_notes TEXT,
  -- Deposit policy: 50% if event ≥30 days out, 100% if <30 days. Balance
  -- (the remaining 50%) is due at event_date - 30 days. These fields get
  -- auto-calculated by the proposal builder but admins can override.
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS deposit_due_at DATE,
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS balance_due_at DATE,
  ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMPTZ;

COMMIT;
