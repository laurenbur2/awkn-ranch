-- Add notes column to crm_leads for Clients admin (integration notes, intake details).
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS notes text;
