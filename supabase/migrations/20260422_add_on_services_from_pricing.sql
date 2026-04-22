-- Seed the admin services catalog with the add-ons listed on the public
-- pricing page (https://laurenbur2.github.io/awkn-ranch/pricing/). Keeps
-- existing Ketamine/Massage/Integration/IV rows; updates their prices to
-- match the pricing page where they were previously $0.

UPDATE services SET default_price_cents = 17500 WHERE slug = 'massage' AND default_price_cents = 0;
UPDATE services SET default_price_cents = 20000 WHERE slug = 'integration' AND default_price_cents = 0;

INSERT INTO services (name, slug, duration_minutes, default_price_cents, requires_upfront_payment, is_active, sort_order) VALUES
  ('Human Design Reading',          'human-design-reading',  60, 25000, false, true, 200),
  ('Licensed Therapy Session',      'licensed-therapy',      50, 25000, false, true, 210),
  ('Astrology Session',             'astrology',             60, 20000, false, true, 220),
  ('Hape Ceremony',                 'hape-ceremony',         30,  7500, false, true, 230),
  ('Internal Family System Session','ifs-session',           60, 20000, false, true, 240),
  ('Private Sound Journey',         'sound-journey',         60, 20000, false, true, 250),
  ('Pickleball Lesson',             'pickleball',            60,  5000, false, true, 260)
ON CONFLICT (slug) DO NOTHING;
