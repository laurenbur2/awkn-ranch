-- Mirror the proposal payment-link pattern on crm_invoices: each sent
-- invoice gets two Stripe payment links — ACH (no fee) and card (+3%
-- surcharge disclosed in the email/preview). The base ACH link is already
-- tracked via stripe_payment_link_url; this migration adds the matching
-- card-method columns.

ALTER TABLE crm_invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_link_card_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_card_url TEXT;

COMMENT ON COLUMN crm_invoices.stripe_payment_link_card_url IS
  'Stripe payment link URL for card payment (includes 3% processing fee). Generated when invoice status flips to sent.';
