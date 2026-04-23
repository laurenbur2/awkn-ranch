-- Structured link between service packages (retreat/treatment templates)
-- and the individual services they include. Makes crm_service_packages the
-- single source of truth for "what's in each package" so the admin Packages
-- panel, the New Client Package modal auto-populate, the public pricing page,
-- and CRM proposals can all read the same quantities.

CREATE TABLE IF NOT EXISTS crm_service_package_items (
  package_id uuid NOT NULL REFERENCES crm_service_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id)             ON DELETE CASCADE,
  quantity   integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, service_id)
);

CREATE INDEX IF NOT EXISTS crm_service_package_items_service_idx ON crm_service_package_items(service_id);

ALTER TABLE crm_service_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read crm_service_package_items"  ON crm_service_package_items;
DROP POLICY IF EXISTS "Authenticated users can write crm_service_package_items" ON crm_service_package_items;

CREATE POLICY "Authenticated users can read crm_service_package_items"
  ON crm_service_package_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write crm_service_package_items"
  ON crm_service_package_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed from existing package `includes` jsonb text so the catalog is usable
-- immediately. Uses slugs so re-running is safe. ON CONFLICT protects against
-- double-seeding if the package already has structured items.

-- Discover: 1 ketamine + 1 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'discover' AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 20 FROM crm_service_packages p, services s
WHERE p.slug = 'discover' AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- Heal: 3 ketamine + 3 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 3, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'heal' AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 3, 20 FROM crm_service_packages p, services s
WHERE p.slug = 'heal' AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- AWKN: 6 ketamine + 6 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 6, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'awkn' AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 6, 20 FROM crm_service_packages p, services s
WHERE p.slug = 'awkn' AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- Journey for Two: 1 shared ketamine + 2 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'journey_for_two' AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 2, 20 FROM crm_service_packages p, services s
WHERE p.slug = 'journey_for_two' AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- Residential 6D/5N (private + shared): 2 ketamine + 2 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 2, 10 FROM crm_service_packages p, services s
WHERE p.slug IN ('residential_6d_private','residential_6d_shared') AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 2, 20 FROM crm_service_packages p, services s
WHERE p.slug IN ('residential_6d_private','residential_6d_shared') AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- Residential 3D/2N (private + shared): 1 ketamine + 1 integration
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug IN ('residential_3d_private','residential_3d_shared') AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 20 FROM crm_service_packages p, services s
WHERE p.slug IN ('residential_3d_private','residential_3d_shared') AND s.slug = 'integration'
ON CONFLICT DO NOTHING;

-- Additional Ketamine Session: 1 ketamine
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'additional_session' AND s.slug = 'ketamine-session'
ON CONFLICT DO NOTHING;

-- Single-session add-on "packages" map 1:1 to their service
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_massage' AND s.slug = 'massage'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_integration' AND s.slug = 'integration'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_human_design' AND s.slug = 'human-design-reading'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_therapy' AND s.slug = 'licensed-therapy'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_astrology' AND s.slug = 'astrology'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_hape' AND s.slug = 'hape-ceremony'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_ifs' AND s.slug = 'ifs-session'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_sound_journey' AND s.slug = 'sound-journey'
ON CONFLICT DO NOTHING;
INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
SELECT p.id, s.id, 1, 10 FROM crm_service_packages p, services s
WHERE p.slug = 'addon_pickleball' AND s.slug = 'pickleball'
ON CONFLICT DO NOTHING;
