-- One-shot import of confirmed venue events from the manual master
-- spreadsheet (PDF: "AWKN Master Rental Calendar — EVENTS 2026"). Only
-- future-dated events from 2026-05-01 onward are loaded. Each event lands
-- in crm_leads with business_line='awkn_ranch' and stage='event_scheduled'
-- (per the source: every event is at least deposit-paid and confirmed)
-- except a handful of TBD entries (no host or no time) that go to
-- 'proposal_sent' so they appear in the CRM list but NOT on the calendar.
--
-- Idempotency: each row keys on (business_line, first_name, last_name,
--   event_date) — re-running this script won't duplicate. Subsequent
--   imports of the same source data will UPDATE the row in place.
--
-- The script intentionally writes into the migrations folder so it stays
-- versioned, but it has been applied via the Management API as a one-off
-- and shouldn't auto-run on a clean rebuild without a fresh review.

-- Stage UUIDs (looked up by slug — set as variables for readability)
DO $import$
DECLARE
  -- spaces
  v_temple    UUID := '12251137-0fc1-4b98-b0c5-926b51dc18c3';
  v_dome      UUID := 'd34d1055-064f-4fbc-86f5-690c6e544f9b';
  v_bali      UUID := 'b6423249-e065-4ac5-ba3f-84437517fc9d';
  v_barcelona UUID := 'dcb7ca0b-81b6-4b08-aa05-4036893c4b1e';
  v_wr1       UUID := 'dc099bf5-5d1d-4a44-8497-a0a8453b0728';
  v_wr2       UUID := 'ba53850c-d04c-4e18-9d44-46ca08c612a4';
  v_wr3       UUID := 'bd2f3af5-5acf-4d9e-bc1f-491a0dcc0a2e';
  v_ranch     UUID := '2f67c552-f415-4057-b9f3-3e1c22962f69';
  -- stages
  v_scheduled UUID := 'dccba91c-50ca-43c7-bccd-07fe66f0a139'; -- event_scheduled
  v_proposal  UUID := '391b7663-aa19-41eb-bf53-82edc9b06e10'; -- proposal_sent
BEGIN

-- Helper: temp staging table so we can MERGE in one pass.
CREATE TEMPORARY TABLE _venue_import (
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  event_date DATE,
  event_end_date DATE,
  event_start_time TEXT,
  event_end_time TEXT,
  event_type TEXT,
  guest_count INT,
  space_id UUID,
  additional_space_ids UUID[],
  estimated_value NUMERIC,
  deposit_amount NUMERIC,
  deposit_paid_at TIMESTAMPTZ,
  balance_amount NUMERIC,
  balance_paid_at TIMESTAMPTZ,
  notes TEXT,
  internal_staff_notes TEXT,
  email_addr TEXT,
  stage_id UUID
) ON COMMIT DROP;

-- ============================================================
-- MAY 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('Parul', '', NULL, NULL, '2026-05-01', NULL, '18:30', '21:00', 'Cacao Ceremony Breathwork', 20, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'AWKN split', 'Sales rep: Jeri', NULL, v_scheduled),
('Claude Code', '', NULL, NULL, '2026-05-02', NULL, '12:00', '20:00', 'VIP Event', 50, v_temple, NULL, 444, NULL, NULL, NULL, NULL, 'VIP rate $444', 'Sales rep: Jeri | Invoice sent 2026-04-20', NULL, v_scheduled),
('Anup Drum Circle', '', NULL, NULL, '2026-05-04', NULL, '16:00', '18:00', 'Drum circle', 20, v_wr1, NULL, NULL, NULL, NULL, NULL, NULL, '70/30 split', 'Sales rep: Jeri', NULL, v_scheduled),
('Somatic Power Up', '', NULL, NULL, '2026-05-05', NULL, '18:00', '20:30', 'AWKN Series', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, 'AWKN Series 50/50 split. Also using firepit.', 'Sales rep: Jeri', NULL, v_scheduled),
('Teddy', 'Extra Ordinaries', NULL, NULL, '2026-05-06', '2026-05-08', '18:00', NULL, 'Matt Birthday + Training', 50, v_temple, ARRAY[v_dome, v_bali], 4500, 2250, NULL, 2250, NULL, 'Founder discount rate. Training 6-7, Party 8th overnight, leave 9th early am. Also using Dome or Yurt for sleeping.', 'Sales rep: Jeri | Invoice sent 2026-04-30 | $2,250 deposit, $2,250 balance', NULL, v_scheduled),
('Somatic Slumber Party', '', NULL, NULL, '2026-05-08', NULL, '18:00', NULL, 'Slumber Party', 10, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, '70/30 split. 6pm overnight, ends 11am next day.', NULL, NULL, v_scheduled),
('Paul Kuhn', '', NULL, NULL, '2026-05-08', NULL, NULL, NULL, 'Sound / Meditation', NULL, v_temple, NULL, 550, 550, '2026-04-29'::TIMESTAMPTZ, NULL, NULL, 'VIP rate $550', 'Sales rep: Jeri | Paid 2026-04-29', NULL, v_scheduled),
('Summit', '', NULL, NULL, '2026-05-09', NULL, NULL, NULL, 'Summit Influencer Event', 50, v_temple, ARRAY[v_dome, v_bali], 1200, NULL, NULL, NULL, NULL, 'Summit Influencer event. All-day across Temple, Yurts, Dome.', 'Sales rep: Kyle | Invoice sent 2026-03-31', NULL, v_scheduled),
('Shanila Sound Dome', '', NULL, NULL, '2026-05-10', NULL, '16:00', '18:00', 'Spa Day Sound', 20, v_dome, NULL, 200, NULL, NULL, NULL, NULL, '2 hours $200', 'Sales rep: Jeri', NULL, v_scheduled),
('4 Element Experience', 'Richness', NULL, NULL, '2026-05-10', NULL, '13:00', '18:00', '4 Element — Water (Mother''s Day)', 100, v_temple, NULL, 500, NULL, NULL, NULL, NULL, '4-5 hours, $55/person, 50-100 guests, Mother''s Day (Water).', 'Sales rep: Jeri', NULL, v_scheduled),
('Somatic Opening', '', NULL, NULL, '2026-05-11', NULL, '18:30', '20:30', 'Somatic class', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, '70/30 split', NULL, NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-05-12', NULL, '19:00', '20:00', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('Ocean Medicine Waves', '', NULL, NULL, '2026-05-12', NULL, '19:00', '22:00', 'Medicine Waves', 15, v_dome, NULL, 200, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('AWKN Red Tent', '', NULL, NULL, '2026-05-13', NULL, NULL, NULL, 'AWKN Community', NULL, v_bali, NULL, 0, NULL, NULL, NULL, NULL, 'AWKN community offering', 'Sales rep: Jeri', NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-05-14', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
('Maeve Training', '', NULL, NULL, '2026-05-15', NULL, '13:00', '16:00', 'Training', 100, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free training', 'Sales rep: AWKN', NULL, v_scheduled),
('Ashleigh', 'Ceremony', NULL, NULL, '2026-05-15', '2026-05-17', '17:00', NULL, 'Ceremony', 25, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, 'Fri 5pm setup, Sun 2pm checkout', NULL, NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-05-17', NULL, '17:00', '18:30', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('Masha', 'Spinal Energetics', NULL, NULL, '2026-05-21', NULL, '18:00', '20:00', 'Spinal Energetics / Somatic Mvmt', 15, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, '70/30 split', NULL, NULL, v_scheduled),
('Parul', '', NULL, NULL, '2026-05-22', NULL, '19:00', '21:00', 'Cacao + Breath + Cold', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, 'AWKN split', 'Sales rep: Jeri', NULL, v_scheduled),
('Misty', 'Somatic Full Day Retreat', NULL, NULL, '2026-05-23', NULL, '09:00', '17:00', 'Full Day Retreat w/ Heather Hoover', 20, v_bali, ARRAY[v_wr1], NULL, NULL, NULL, NULL, NULL, '70/30 split', 'Sales rep: Jeri', NULL, v_scheduled),
('Charles', 'Farewell Party', NULL, NULL, '2026-05-24', NULL, '16:00', '23:00', 'Farewell Party', 50, v_temple, NULL, 500, NULL, NULL, NULL, NULL, 'William VIP Pricing', 'Sales rep: Jeri | Invoice sent 2026-04-24', NULL, v_scheduled),
('Somatic Voice Activation', '', NULL, NULL, '2026-05-26', NULL, '18:00', '20:30', 'Somatic Voice Activation', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, 'Split rate 70/30', 'Sales rep: Jeri', NULL, v_scheduled),
('Tracey', 'Creation Retreat', NULL, NULL, '2026-05-28', '2026-05-30', NULL, NULL, 'Creation Retreat', 30, v_temple, ARRAY[v_bali, v_ranch], NULL, NULL, NULL, NULL, NULL, 'Th-Sat with early end on Saturday am, out by 9am cleaned, ready for 10am set up. Morning ceremony in different space.', 'Sales rep: Jeri | William VIP Pricing', NULL, v_scheduled),
('Christina', 'Biohacking Love', NULL, NULL, '2026-05-30', '2026-05-31', '11:00', NULL, 'Biohacking Love', 100, v_temple, NULL, 2565, NULL, NULL, NULL, NULL, 'Saturday overnight setup 10am start, 11am-4pm lecture, 7pm evening lounging. Sunday 3 hour check out noon. Pricing: Overnight $1,600, Sunday 3 hours $465, Cleaning $200, AV $300 = $2,565. AV/projector w/ screen.', 'Sales rep: Juls', NULL, v_scheduled),
('4 Element Experience', 'Richness', NULL, NULL, '2026-05-31', NULL, '15:00', '20:00', '4 Element — Fire', 50, v_temple, NULL, 555, NULL, NULL, NULL, NULL, '$55/person', 'Sales rep: Jeri', NULL, v_scheduled);

-- ============================================================
-- JUNE 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('Somatic Voice Activation', '', NULL, NULL, '2026-06-02', NULL, '18:30', '20:30', 'Somatic Voice Activation', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, '70/30 split', NULL, NULL, v_scheduled),
('Vanush', 'Sonic Visions', NULL, NULL, '2026-06-04', NULL, '18:00', '21:00', 'Sonic Visions', 20, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'AWKN Community Event Revenue Share', NULL, NULL, v_scheduled),
('Parul', '', NULL, NULL, '2026-06-05', NULL, '19:00', '21:00', 'Cacao + Breathwork', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('Kayla', '', NULL, NULL, '2026-06-06', '2026-06-07', '08:00', '20:00', 'Overnight event', 50, v_temple, NULL, 3700, 925, NULL, 1850, NULL, 'Time each day: 8:00 AM to 8:00 PM. Temple overnight $1600 x 2 = $3200, AV $150 x 2 = $300, Cleaning $200 = $3,700.', 'Sales rep: Juls | Invoice sent 2026-02-25 | $925 deposit unpaid, $1,850 balance', NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-06-09', NULL, '19:00', '20:00', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('AWKN Red Tent', '', NULL, NULL, '2026-06-10', NULL, '18:30', '21:00', 'AWKN Community', 20, v_bali, NULL, 0, NULL, NULL, NULL, NULL, 'AWKN community offering. Temple or Yurt.', NULL, NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-06-11', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
('Masha', 'Spinal Somatic', NULL, NULL, '2026-06-11', NULL, '18:00', '20:00', 'Spinal Somatic Mvmt', 15, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, 'Split', 'Sales rep: Jeri', NULL, v_scheduled),
('4 Element Experience', 'Richness', NULL, NULL, '2026-06-14', NULL, '13:00', '18:00', '4 Element — Air', 50, v_temple, NULL, 555, NULL, NULL, NULL, NULL, '$55/person, AIR', 'Sales rep: Jeri', NULL, v_scheduled),
('Ivan', 'Ayahuasca/Iboga Ceremony', NULL, NULL, '2026-06-18', '2026-06-22', NULL, NULL, 'Ayahuasca / Iboga Ceremony', NULL, v_temple, ARRAY[v_dome], NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('Masha', 'Spinal Somatic', NULL, NULL, '2026-06-25', NULL, '18:00', '20:00', 'Spinal Somatic Mvmt', 15, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, 'Split', 'Sales rep: Jeri', NULL, v_scheduled),
('Joshua', 'Grow with Play', NULL, NULL, '2026-06-26', NULL, '18:00', '21:00', 'Improv', 40, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('Somatic Voice Activation', '', NULL, NULL, '2026-06-26', NULL, NULL, NULL, 'Full Day', 20, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, 'Full Day 70/30 split', 'Sales rep: Jeri', NULL, v_scheduled),
('4 Element Experience', 'Richness', NULL, NULL, '2026-06-28', NULL, '15:00', '20:00', '4 Element — Earth (Arika gut)', 50, v_temple, NULL, 555, NULL, NULL, NULL, NULL, '$55/person, EARTH (Arika - gut)', 'Sales rep: Jeri', NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-06-28', NULL, '17:00', '18:30', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled);

-- ============================================================
-- JULY 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('Parul', '', NULL, NULL, '2026-07-03', NULL, NULL, NULL, 'Cacao + Breath + Spa', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('4 Element Festival', '', NULL, NULL, '2026-07-04', NULL, NULL, NULL, '4 Element Festival', 100, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, 'All Day/Night: AIR/Water/Fire/Earth', NULL, NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-07-07', NULL, '19:00', '20:00', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('ARecelli or Tina', 'Ceremony', NULL, '254-702-2720', '2026-07-08', '2026-07-13', NULL, NULL, '4 night / 5 day Ceremony', 30, v_temple, ARRAY[v_dome, v_bali, v_ranch], NULL, NULL, NULL, NULL, NULL, '4 night / 5 days', NULL, NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-07-09', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
('Masha', 'Spinal Energetics', NULL, NULL, '2026-07-16', NULL, '18:00', '20:00', 'Spinal Energetics / Somatic Mvmt', 15, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, 'Split cost', NULL, NULL, v_scheduled),
('Parul', '', NULL, NULL, '2026-07-17', NULL, NULL, NULL, 'Cacao + Breath', 20, v_temple, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-07-19', NULL, '17:00', '18:30', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('Trystan Birthday', '', NULL, NULL, '2026-07-25', '2026-07-26', NULL, NULL, 'Trystan''s Birthday', NULL, v_temple, ARRAY[v_ranch], NULL, NULL, NULL, NULL, NULL, '2 days / overnight. Temple + Within Home.', 'Sales rep: Jeri', NULL, v_scheduled);

-- ============================================================
-- AUGUST 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('Madelyn Moon', '', NULL, NULL, '2026-08-05', '2026-08-09', NULL, NULL, 'Madelyn Moon residency', 17, v_temple, NULL, 4772, 2982, NULL, 1988, NULL, 'Temple Space and RV Rental 8/5-8/9. They will move furniture if needed and move back, no support staff. $50/hr, $100 minimum for support if requested. Pricing: Temple $3,976 + RV $796.', 'Sales rep: Juls | Invoice sent 2026-03-06 | $2,982 deposit, $1,988 balance', NULL, v_scheduled),
('Kama Flight', '', NULL, NULL, '2026-08-11', NULL, '19:00', '20:00', 'Kama Flight', 40, v_temple, NULL, 222, NULL, NULL, NULL, NULL, NULL, 'Sales rep: Jeri', NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-08-13', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
-- TBD entries → proposal_sent so they show in CRM list but NOT on calendar
('Dallas event', '', NULL, NULL, '2026-08-29', '2026-08-30', NULL, NULL, 'Dallas event', NULL, v_temple, NULL, 2000, NULL, NULL, NULL, NULL, 'Budget $2000', NULL, NULL, v_proposal);

-- ============================================================
-- SEPTEMBER 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('Sunflower Club', '', NULL, NULL, '2026-09-10', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
-- TBD
('David Ruby', '', NULL, NULL, '2026-09-18', '2026-09-19', NULL, NULL, '2 day ceremony', 20, v_bali, NULL, NULL, NULL, NULL, NULL, NULL, '2 day ceremony - TBD', NULL, NULL, v_proposal),
('Madelyn Moon', '', NULL, NULL, '2026-09-24', '2026-09-28', NULL, NULL, 'Madelyn Moon residency', NULL, v_temple, NULL, 5550, NULL, NULL, NULL, NULL, 'Half day setup on the 24th, 25-27 Full Day Event, Morning cleanup on the 28th. 3 full days x $1,600 = $4,800; setup/takedown 5 hours @ $150/hr = $750; total $5,550.', 'Sales rep: Juls | Invoice sent 2026-02-23 | $5,550 paid', NULL, v_scheduled);

-- ============================================================
-- OCTOBER 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('John Wineland', 'Fierce Love', NULL, NULL, '2026-10-08', '2026-10-11', NULL, NULL, 'Fierce Love retreat', 80, v_temple, ARRAY[v_bali], 17777, 500, NULL, 8888, NULL, 'Temple space for main event, Yurt for small sessions. 60-80 guests.', 'Sales rep: Jeri | Invoice sent 2026-02-25 | $500 deposit, $8,888 owed, $5,332 paid', NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-10-15', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
('Sarah Entrup', '', NULL, NULL, '2026-10-21', '2026-10-25', NULL, NULL, 'Sarah Entrup retreat', NULL, v_temple, NULL, 7000, NULL, NULL, NULL, NULL, 'Oct 21 setup window. Oct 22-24 overnight. Oct 25 until 3 PM. Setup: $155 x 4hr = $620. Overnight: $1,600 x 3 = $4,800. $155 x 6hr = $930. Cleaning $200. AV $150 x 3 = $450. 50% payment $3,500 due 4/1, 2nd payment due 10/8.', 'Sales rep: Juls | Invoice sent 2026-03-31 | $3,500 paid', NULL, v_scheduled);

-- ============================================================
-- NOVEMBER 2026
-- ============================================================
INSERT INTO _venue_import VALUES
('John Wineland', 'November Intensive', NULL, NULL, '2026-11-03', '2026-11-09', NULL, NULL, 'TT 2026 November Intensive', 80, v_temple, ARRAY[v_bali], 19999, 500, NULL, 11110, NULL, 'Temple space for main event, Yurt for small sessions. 60-80 guests. Half upfront $8,888 + $500 refunded deposit. Total $17,777 + $2,222.', 'Sales rep: Jeri | Invoice sent 2026-02-23 | $500 deposit, $11,110 owed, $8,888 paid', NULL, v_scheduled),
('Sunflower Club', '', NULL, NULL, '2026-11-12', NULL, '19:00', '22:00', 'Open Mic / Community', 50, v_temple, NULL, 0, NULL, NULL, NULL, NULL, 'Free community event', NULL, NULL, v_scheduled),
('Mariya', 'Boundary Blueprint', 'mariyagraestone@gmail.com', NULL, '2026-11-15', NULL, '12:30', '16:30', 'Boundary Blueprint', 50, v_temple, NULL, 770, 150, NULL, 0, NULL, '4 hour event, no special set up/breakdown. $620 + $150 cleaning = $770.', 'Sales rep: Jeri | Invoice sent 2026-03-06 | Paid in full', NULL, v_scheduled),
('NXP Corporate', '', NULL, NULL, '2026-11-19', NULL, NULL, NULL, 'Corporate Holiday Event', 10, v_temple, ARRAY[v_dome], 515, NULL, NULL, NULL, NULL, 'Corporate Holiday event, details tbd. Hourly 3 hours $515.', 'Sales rep: Jeri', NULL, v_scheduled);

-- ============================================================
-- MERGE INTO crm_leads
-- ============================================================
INSERT INTO crm_leads (
  business_line, stage_id, status, first_name, last_name, email, phone,
  event_date, event_end_date, event_start_time, event_end_time,
  event_type, guest_count, space_id, additional_space_ids,
  estimated_value, deposit_amount, deposit_paid_at,
  balance_amount, balance_paid_at, notes, internal_staff_notes,
  created_at, updated_at
)
SELECT
  'awkn_ranch', stage_id, 'open',
  first_name, COALESCE(NULLIF(last_name, ''), ''),
  email, phone,
  event_date, event_end_date, event_start_time, event_end_time,
  event_type, guest_count, space_id, additional_space_ids,
  estimated_value, deposit_amount, deposit_paid_at,
  balance_amount, balance_paid_at, notes, internal_staff_notes,
  NOW(), NOW()
FROM _venue_import
WHERE NOT EXISTS (
  SELECT 1 FROM crm_leads cl
  WHERE cl.business_line = 'awkn_ranch'
    AND cl.first_name = _venue_import.first_name
    AND COALESCE(cl.last_name, '') = COALESCE(_venue_import.last_name, '')
    AND cl.event_date = _venue_import.event_date
);

END $import$;
