-- Send-email's gate defaults invoice_sent to "requires approval", which
-- routes it through pending_email_approvals (a queue table that doesn't
-- exist on this project). Add an explicit opt-out row so admin-driven
-- invoice emails ship straight to the client, matching how proposal_sent,
-- welcome_letter, and the invitation emails are configured.

INSERT INTO email_type_approval_config (email_type, requires_approval)
VALUES ('invoice_sent', FALSE)
ON CONFLICT (email_type) DO UPDATE SET requires_approval = FALSE;
