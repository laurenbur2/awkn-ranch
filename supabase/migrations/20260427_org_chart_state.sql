-- Shared org chart state for the public /team/ page.
-- Single-row table (id='main') holding the current chart as JSONB.
-- Public can read; authenticated team members can update.

CREATE TABLE IF NOT EXISTS org_chart_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  chart_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_email TEXT,
  CHECK (id = 'main')
);

ALTER TABLE org_chart_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_chart public read" ON org_chart_state;
CREATE POLICY "org_chart public read" ON org_chart_state
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "org_chart auth write" ON org_chart_state;
CREATE POLICY "org_chart auth write" ON org_chart_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed singleton row if missing.
INSERT INTO org_chart_state (id, chart_data) VALUES ('main', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Make the table broadcast realtime UPDATE events so editors see each other live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'org_chart_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE org_chart_state';
  END IF;
END $$;
