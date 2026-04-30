-- Add a category column to crm_service_packages so the admin can group preset
-- packages (Retreats / Immersives / Day Programs / Integration / etc.) and
-- seed two Integration Coaching presets so they show up in the package picker
-- when adding a package to a Within client.

ALTER TABLE crm_service_packages
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS crm_service_packages_category_idx
  ON crm_service_packages(category);

-- Seed packages: insert only if not already present (idempotent by slug).
-- Integration coaching uses the existing 'integration' service
-- (id=7ac4d626-81d5-45c4-a5dd-0e8645963e59, $150 default per session).

INSERT INTO crm_service_packages (business_line, name, slug, price_regular, description, is_active, sort_order, category)
VALUES
  ('within', 'Single Integration Coaching Session', 'integration-single',  150,  '1× integration coaching session — for clients who want continued support after a retreat or session.', TRUE, 100, 'integration'),
  ('within', '3 Integration Coaching Session Package', 'integration-3pack', 399, '3× integration coaching sessions — bundle pricing for ongoing post-retreat support.', TRUE, 101, 'integration')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  price_regular = EXCLUDED.price_regular,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- Wire each new package to the integration service with the right quantity.
DO $$
DECLARE
  integration_service UUID := '7ac4d626-81d5-45c4-a5dd-0e8645963e59';
  pkg_single UUID;
  pkg_3pack UUID;
BEGIN
  SELECT id INTO pkg_single FROM crm_service_packages WHERE slug = 'integration-single';
  SELECT id INTO pkg_3pack  FROM crm_service_packages WHERE slug = 'integration-3pack';

  -- Wipe and re-seed items so we stay in sync with the canonical mapping.
  DELETE FROM crm_service_package_items WHERE package_id IN (pkg_single, pkg_3pack);

  IF pkg_single IS NOT NULL THEN
    INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
    VALUES (pkg_single, integration_service, 1, 0);
  END IF;

  IF pkg_3pack IS NOT NULL THEN
    INSERT INTO crm_service_package_items (package_id, service_id, quantity, sort_order)
    VALUES (pkg_3pack, integration_service, 3, 0);
  END IF;
END $$;
