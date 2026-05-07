-- ========================================================================
-- CRM proposals → Stripe payment link integration
-- Adds payment tracking columns so proposals can carry a Stripe Payment Link
-- and be marked paid via webhook on checkout.session.completed.
-- ========================================================================

alter table crm_proposals
  add column if not exists payment_link_id text,
  add column if not exists payment_link_url text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount_cents integer,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_to_email text;

create index if not exists crm_proposals_payment_link_idx on crm_proposals(payment_link_id);
create index if not exists crm_proposals_checkout_session_idx on crm_proposals(stripe_checkout_session_id);

-- Allow 'paid' status (webhook flips proposals to 'paid' when Stripe settles).
alter table crm_proposals drop constraint if exists crm_proposals_status_check;
alter table crm_proposals add constraint crm_proposals_status_check
  check (status = any (array['draft','sent','accepted','declined','expired','paid']));

-- Allow 'payment' activity type (webhook logs proposal payments).
alter table crm_activities drop constraint if exists crm_activities_activity_type_check;
alter table crm_activities add constraint crm_activities_activity_type_check
  check (activity_type = any (array['note','call','email','stage_change','sms','meeting','system','payment']));

-- Whitelist proposal_sent so send-email bypasses the approval gate.
insert into email_type_approval_config (email_type, requires_approval)
values ('proposal_sent', false)
on conflict (email_type) do nothing;
