-- Adjust standalone add-on service rates for the team portal services catalog.
-- Package totals (crm_service_packages.price_cents) are stored independently
-- and are unaffected by these changes — this only updates the per-session
-- standalone rate for additional/add-on usage.

UPDATE services SET default_price_cents = 15000, updated_at = NOW()
  WHERE slug = 'integration';

UPDATE services SET default_price_cents = 20000, updated_at = NOW()
  WHERE slug = 'licensed-therapy';
