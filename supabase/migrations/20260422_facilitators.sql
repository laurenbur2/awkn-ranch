-- Facilitators: standalone directory of practitioners who deliver services
-- (massage therapists, astrologers, sound journey facilitators, etc.).
-- Not tied to app_users — these are external contractors.

CREATE TABLE IF NOT EXISTS facilitators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name  text,
  email      text,
  phone      text,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facilitator_services (
  facilitator_id uuid NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
  service_id     uuid NOT NULL REFERENCES services(id)     ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facilitator_id, service_id)
);

CREATE INDEX IF NOT EXISTS facilitator_services_service_idx ON facilitator_services(service_id);

ALTER TABLE facilitators          ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilitator_services  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read facilitators"         ON facilitators;
DROP POLICY IF EXISTS "Authenticated users can write facilitators"        ON facilitators;
DROP POLICY IF EXISTS "Authenticated users can read facilitator_services" ON facilitator_services;
DROP POLICY IF EXISTS "Authenticated users can write facilitator_services" ON facilitator_services;

CREATE POLICY "Authenticated users can read facilitators"
  ON facilitators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write facilitators"
  ON facilitators FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read facilitator_services"
  ON facilitator_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write facilitator_services"
  ON facilitator_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
