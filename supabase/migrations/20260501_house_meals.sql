-- Editable meals on the Within Schedule. Previously meals were hardcoded
-- as a recurring visualization in within-schedule.js (Mon–Fri breakfast,
-- Tue/Wed lunch, Sun–Thu dinner) with no way to edit/move/cancel a single
-- day. This table replaces that — each row is one concrete meal entry
-- (date + time + name + optional description) that the team can edit,
-- move, or delete from the schedule UI.
--
-- We seed the next ~26 weeks of recurring meals from the previous
-- hardcoded pattern so the schedule keeps looking the same on day one.

CREATE TABLE IF NOT EXISTS house_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS house_meals_date_idx ON house_meals(meal_date);

-- Idempotency: re-running the migration shouldn't double-seed. The seed
-- block uses ON CONFLICT DO NOTHING against this constraint.
ALTER TABLE house_meals
  DROP CONSTRAINT IF EXISTS house_meals_unique;
ALTER TABLE house_meals
  ADD CONSTRAINT house_meals_unique UNIQUE (meal_date, start_time, name);

ALTER TABLE house_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS house_meals_select ON house_meals;
CREATE POLICY house_meals_select
  ON house_meals FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS house_meals_modify ON house_meals;
CREATE POLICY house_meals_modify
  ON house_meals FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed: next ~26 weeks of the prior hardcoded recurring pattern.
WITH days AS (
  SELECT generate_series(
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE + INTERVAL '180 days',
    INTERVAL '1 day'
  )::DATE AS d
)
INSERT INTO house_meals (meal_date, start_time, end_time, name)
SELECT d, '09:30:00'::TIME, '10:30:00'::TIME, 'Continental Breakfast'
FROM days WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
UNION ALL
SELECT d, '12:00:00'::TIME, '13:00:00'::TIME, 'Lunch'
FROM days WHERE EXTRACT(DOW FROM d) IN (2, 3)
UNION ALL
SELECT d, '18:00:00'::TIME, '19:30:00'::TIME, 'Dinner'
FROM days WHERE EXTRACT(DOW FROM d) BETWEEN 0 AND 4
ON CONFLICT (meal_date, start_time, name) DO NOTHING;
