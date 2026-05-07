-- Add email-tracking columns the frontend already writes to.
-- Without these, the UPDATE in sendInvitationEmail() fails silently and the UI
-- keeps showing "Not sent" even when Resend successfully delivers the email.

alter table user_invitations
  add column if not exists email_sent_at     timestamptz,
  add column if not exists email_send_count  integer not null default 0;

create index if not exists idx_user_invitations_email_sent_at
  on user_invitations(email_sent_at);

-- No backfill — we can't know which previously-pending invitations had their
-- email delivered vs. not. Admins can click "Resend" to redeliver and update
-- tracking in one step.
