-- Add columns to store a second Stripe Payment Link for card payments (with surcharge)
-- alongside the existing ACH link. The card link charges total × 1.03 to pass Stripe's
-- processing fee to the customer (legal in TX, disclosed in the proposal email).

ALTER TABLE crm_proposals
  ADD COLUMN IF NOT EXISTS payment_link_card_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_card_url TEXT;
