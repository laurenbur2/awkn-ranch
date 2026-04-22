-- Daily T-30 balance-due reminder for AWKN Ranch venue rentals.
-- Adds a stamp column so reminders are sent exactly once per proposal,
-- and schedules pg_cron to hit the send-balance-reminders edge function daily.
--
-- The x-cron-secret header must match the CRON_SECRET env var set on the
-- send-balance-reminders function. Rotate by updating both.

ALTER TABLE crm_proposals
  ADD COLUMN IF NOT EXISTS balance_reminder_sent_at TIMESTAMPTZ;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'awkn-send-balance-reminders-daily') THEN
    PERFORM cron.unschedule('awkn-send-balance-reminders-daily');
  END IF;
END $$;

-- Run every day at 15:00 UTC (10am Austin CT during CDT).
SELECT cron.schedule(
  'awkn-send-balance-reminders-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/send-balance-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '6005f587984ea114ca9231e7a4bbd07ab4b13ed9c98f61f74d60ab52811c2f3c'
    ),
    body := '{}'::jsonb
  );
  $$
);
