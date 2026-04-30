import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { renderTemplate, SENDER_MAP } from "../_shared/template-engine.ts";
import { wrapEmailHtml } from "../_shared/email-brand-wrapper.ts";
import {
  paymentMethodsBlock,
  paymentMethodsText,
  dataTable,
  dataTableText,
  ledgerTable,
  balanceBox,
  calloutBox,
  B,
  type DataRow,
  type PaymentMethod,
} from "../_shared/email-components.ts";

const RESEND_API_URL = "https://api.resend.com/emails";

// In-memory template cache (survives within a single edge function instance)
const templateCache = new Map<string, { template: any; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Email template types
type EmailType =
  // Rental notifications
  | "application_submitted"
  | "application_approved"
  | "application_denied"
  | "lease_generated"
  | "lease_sent"
  | "lease_signed"
  | "deposit_requested"
  | "deposit_received"
  | "deposits_confirmed"
  | "move_in_confirmed"
  // Payment notifications
  | "payment_reminder"
  | "payment_overdue"
  | "payment_received"
  // Invitations
  | "event_invitation"
  | "general_invitation"
  | "staff_invitation"
  | "prospect_invitation"
  // CRM proposal sent (with Stripe payment link)
  | "proposal_sent"
  // CRM rental agreement e-sign request (AWKN Ranch only, separate from proposal email)
  | "agreement_to_sign"
  | "retreat_agreement_to_sign"
  // Within Center welcome letter (HEAL package, prep instructions)
  | "welcome_letter"
  // Admin notifications
  | "admin_event_request"
  | "admin_rental_application"
  // FAQ notifications
  | "faq_unanswered"
  // Contact form
  | "contact_form"
  | "community_fit_inquiry"
  | "community_fit_confirmation"
  // Bug reports
  | "bug_report_received"
  | "bug_report_fixed"
  | "bug_report_failed"
  | "bug_report_verified"
  // Rental invite
  | "invite_to_apply"
  // Identity verification
  | "dl_upload_link"
  | "dl_verified"
  | "dl_mismatch"
  // W-9 tax form
  | "w9_request"
  // Feature builder
  | "feature_review"
  // Claudero AI developer
  | "claudero_feature_complete"
  // PAI email
  | "pai_email_reply"
  | "pai_document_received"
  // Payment statement
  | "payment_statement"
  // Waiver
  | "waiver_confirmation"
  // Work photo reminder
  | "work_photo_reminder"
  // Work clock-in summary (tasks + photo reminder)
  | "work_clockin_summary"
  // Work checkout summary
  | "work_checkout_summary"
  // Associate payout
  | "associate_payout_sent"
  // Weekly payroll summary (admin approval)
  | "weekly_payroll_summary"
  // Task assignment
  | "task_assigned"
  // Time entry edited
  | "time_entry_edited"
  // Weekly associate schedule report
  | "weekly_associate_schedule"
  // Custom (raw HTML passthrough)
  | "custom"
  // Internal — never sent to recipients directly
  | "email_approval_request";

interface EmailRequest {
  type: EmailType;
  to: string | string[];
  data: Record<string, any>;
  // Optional overrides
  subject?: string;
  from?: string;
  reply_to?: string;
  cc?: string | string[];
  bcc?: string | string[];
  // When true, render the template and return { html, subject, text } without sending
  preview?: boolean;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Format "09:30:00" → "9:30 AM"
function formatTime12(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Template generators
function getTemplate(type: EmailType, data: Record<string, any>): EmailTemplate {
  switch (type) {
    // ===== RENTAL NOTIFICATIONS =====
    case "application_submitted":
      return {
        subject: "Application Received - AWKN Ranch",
        html: `
          <h2>Thank you for your application!</h2>
          <p>Hi ${data.first_name},</p>
          <p>We've received your rental application for <strong>${data.space_name || "AWKN Ranch"}</strong>.</p>
          <p>We'll review your application and get back to you within 2-3 business days.</p>
          <p><strong>What's next?</strong></p>
          <ul>
            <li>Our team will review your application</li>
            <li>We may reach out for additional information</li>
            <li>You'll receive an email once a decision is made</li>
          </ul>
          <p>If you have any questions, feel free to reply to this email.</p>
        `,
        text: `Thank you for your application!

Hi ${data.first_name},

We've received your rental application for ${data.space_name || "AWKN Ranch"}.

We'll review your application and get back to you within 2-3 business days.

What's next?
- Our team will review your application
- We may reach out for additional information
- You'll receive an email once a decision is made

If you have any questions, feel free to reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "application_approved": {
      const requireLease = data.require_lease !== false;
      const hasDeposits = data.monthly_rate > 0 || (data.security_deposit_amount && data.security_deposit_amount > 0);
      const rateDisplay = Number(data.monthly_rate) === 0 ? 'Complimentary' : `$${Number(data.monthly_rate).toLocaleString()}/mo`;

      // Build conditional next steps
      const nextSteps: string[] = [];
      const nextStepsText: string[] = [];
      if (requireLease) {
        nextSteps.push('<li style="margin-bottom:8px;">Review and sign the lease agreement (we\'ll send it shortly)</li>');
        nextStepsText.push('Review and sign the lease agreement (we\'ll send it shortly)');
      }
      if (hasDeposits) {
        nextSteps.push('<li style="margin-bottom:8px;">Submit required deposits</li>');
        nextStepsText.push('Submit required deposits');
      }
      nextSteps.push('<li style="margin-bottom:8px;">Get ready to move in!</li>');
      nextStepsText.push('Get ready to move in!');

      // Space image section
      const spaceImageSection = data.space_image_url
        ? `<div style="margin:24px 0;border-radius:12px;overflow:hidden;">
              <img src="${data.space_image_url}" alt="${data.space_name}" style="width:100%;max-height:280px;object-fit:cover;display:block;">
            </div>`
        : '';

      return {
        subject: `Congratulations! Your Application is Approved - AWKN Ranch`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <p style="color:#333;font-size:16px;line-height:1.6;">Great news, ${data.first_name}!</p>
            <p style="color:#333;font-size:16px;line-height:1.6;">Your rental application for <strong>${data.space_name}</strong> has been <strong style="color:#54a326;">approved</strong>!</p>

            ${spaceImageSection}

            <div style="background:#faf9f6;border-radius:12px;padding:24px;margin:24px 0;">
              <p style="margin:0 0 16px;font-weight:700;color:#1c1618;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Reservation Details</p>
              <table style="border-collapse:collapse;width:100%;font-size:15px;">
                <tr>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Space</td>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#1c1618;font-weight:600;font-size:16px;">${data.space_name}</td>
                </tr>
                <tr>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Rate</td>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#1c1618;font-weight:600;font-size:16px;">${rateDisplay}</td>
                </tr>
                <tr>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Move-in</td>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#1c1618;font-weight:600;font-size:16px;">${data.move_in_date}</td>
                </tr>
                ${data.lease_end_date ? `<tr>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Until</td>
                  <td style="padding:12px 8px;border-bottom:1px solid #e8e4df;color:#1c1618;font-weight:600;font-size:16px;">${data.lease_end_date}</td>
                </tr>` : ''}
              </table>
            </div>

            ${nextSteps.length > 0 ? `
            <div style="background:linear-gradient(135deg,#fff8f0 0%,#fef3e6 100%);border-left:4px solid #d4883a;padding:20px;margin:24px 0;border-radius:0 8px 8px 0;">
              <p style="margin:0 0 12px;font-weight:700;color:#1c1618;font-size:15px;">Next Steps</p>
              <ol style="margin:0;padding-left:20px;color:#555;line-height:1.6;">
                ${nextSteps.join('')}
              </ol>
            </div>` : ''}

            <div style="background:#f5f0eb;border-radius:8px;padding:16px 20px;margin:24px 0;">
              <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">Please re-familiarize yourself with our key operational guidelines at this link: <a href="https://laurenbur2.github.io/awkn-ranch/visiting" style="color:#d4883a;font-weight:600;">awknranch.com/visiting</a> &mdash; which also has a map link to the property.</p>
            </div>

            <div style="background:#fff8e1;border-left:4px solid #f9a825;padding:14px 20px;margin:24px 0;border-radius:0 8px 8px 0;">
              <p style="margin:0;color:#555;font-size:13px;line-height:1.5;"><strong style="color:#333;">Reminder:</strong> Please don't give the address out to potential guests. Instead, send them the visiting link above so they can read the guidelines first.</p>
            </div>

            <p style="color:#555;font-size:15px;line-height:1.6;">We're thrilled to have you joining the AWKN Ranch community. If you have any questions, just reply to this email!</p>
          </div>
        `,
        text: `Great news, ${data.first_name}!

Your rental application for ${data.space_name} has been approved!

Reservation Details:
- Space: ${data.space_name}
- Rate: ${rateDisplay}
- Move-in: ${data.move_in_date}
${data.lease_end_date ? `- Until: ${data.lease_end_date}` : ''}

Next Steps:
${nextStepsText.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Please re-familiarize yourself with our key operational guidelines: https://laurenbur2.github.io/awkn-ranch/visiting — which also has a map link to the property.

Reminder: Please don't give the address out to potential guests. Instead, send them the visiting link so they can read the guidelines first.

We're thrilled to have you joining the AWKN Ranch community!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };
    }

    case "application_denied":
      return {
        subject: "Application Update - AWKN Ranch",
        html: `
          <p>Hi ${data.first_name},</p>
          <p>We're sorry but we are not able to approve you to apply for housing at the AWKN Ranch at this time. This may be due to our gender balance goals, or it may be due to other reasons related to our assessment of community fit at this specific time.</p>
          <p>If you have questions, please contact a community manager.</p>
        `,
        text: `Hi ${data.first_name},

We're sorry but we are not able to approve you to apply for housing at the AWKN Ranch at this time. This may be due to our gender balance goals, or it may be due to other reasons related to our assessment of community fit at this specific time.

If you have questions, please contact a community manager.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "lease_generated":
      return {
        subject: "Your Lease Agreement is Ready - AWKN Ranch",
        html: `
          <h2>Your Lease is Ready for Review</h2>
          <p>Hi ${data.first_name},</p>
          <p>Your lease agreement has been prepared and is ready for your review.</p>
          <p>Please take a moment to review the terms. We'll send you a signature request shortly.</p>
        `,
        text: `Your Lease is Ready for Review

Hi ${data.first_name},

Your lease agreement has been prepared and is ready for your review.

Please take a moment to review the terms. We'll send you a signature request shortly.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "lease_sent":
      return {
        subject: "Action Required: Sign Your Lease Agreement - AWKN Ranch",
        html: `
          <h2>Please Sign Your Lease Agreement</h2>
          <p>Hi ${data.first_name},</p>
          <p>Your lease agreement has been sent for electronic signature.</p>
          <p>Please check your email from SignWell and complete the signing process at your earliest convenience.</p>
          <p><strong>Important:</strong> The lease must be signed before we can proceed with your move-in.</p>
        `,
        text: `Please Sign Your Lease Agreement

Hi ${data.first_name},

Your lease agreement has been sent for electronic signature.

Please check your email from SignWell and complete the signing process at your earliest convenience.

Important: The lease must be signed before we can proceed with your move-in.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "lease_signed":
      return {
        subject: "Lease Signed Successfully - AWKN Ranch",
        html: `
          <h2>Lease Signing Complete!</h2>
          <p>Hi ${data.first_name},</p>
          <p>Your lease agreement has been successfully signed. A copy will be provided for your records.</p>
          ${calloutBox(`
            <p style="margin:0 0 12px;font-weight:700;color:${B.text};font-size:15px;">Next Steps</p>
            <ul style="margin:0;padding-left:20px;color:${B.text};line-height:1.8;">
              <li>Submit your move-in deposit: <strong>$${data.move_in_deposit || data.monthly_rate}</strong></li>
              ${data.security_deposit ? `<li>Submit your security deposit: <strong>$${data.security_deposit}</strong></li>` : ''}
            </ul>
          `)}
          ${paymentMethodsBlock(data._payment_methods_raw, { heading: 'Pay with no fees', memoText: 'deposit' })}
          <p>Once deposits are received, we'll confirm your move-in date.</p>
        `,
        text: `Lease Signing Complete!

Hi ${data.first_name},

Your lease agreement has been successfully signed. A copy will be provided for your records.

Next Steps:
- Submit your move-in deposit: $${data.move_in_deposit || data.monthly_rate}
${data.security_deposit ? `- Submit your security deposit: $${data.security_deposit}` : ''}

${paymentMethodsText(data._payment_methods_raw, { memoText: 'deposit' })}

Once deposits are received, we'll confirm your move-in date.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "deposit_requested": {
      const depositRows: DataRow[] = [];
      if (data.move_in_deposit) depositRows.push({ label: 'Move-in Deposit', value: `$${data.move_in_deposit}` });
      if (data.security_deposit) depositRows.push({ label: 'Security Deposit', value: `$${data.security_deposit}` });
      depositRows.push({ label: 'Total Due', value: `$${data.total_due}`, valueStyle: 'font-weight:700;font-size:18px;' });
      if (data.due_date) depositRows.push({ label: 'Due Date', value: data.due_date, valueStyle: 'font-weight:600;' });

      return {
        subject: "Deposit Request - AWKN Ranch",
        html: `
          <h2>Deposit Payment Request</h2>
          <p>Hi ${data.first_name},</p>
          <p>Please submit the following deposits to secure your rental:</p>
          ${dataTable(depositRows, { heading: 'Deposits' })}
          ${paymentMethodsBlock(data._payment_methods_raw, { heading: 'Pay with no fees', payUrl: data.pay_url, memoText: 'deposit' })}
          ${data.needs_id_verification ? calloutBox(`
            <p style="margin:0 0 8px;font-weight:bold;color:#333;">ID Verification Required</p>
            <p style="margin:0;color:#555;">We also need a copy of your government-issued photo ID (driver's license or passport) to complete your rental setup.</p>
            ${data.id_upload_url
              ? `<p style="margin:12px 0 0;"><a href="${data.id_upload_url}" style="display:inline-block;padding:10px 20px;background:#f9a825;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;">Upload Your ID</a></p>`
              : `<p style="margin:8px 0 0;color:#555;">Please reply to this email with a photo of your ID.</p>`}
          `, 'warning') : ''}
        `,
        text: `Deposit Payment Request

Hi ${data.first_name},

${dataTableText(depositRows)}

${paymentMethodsText(data._payment_methods_raw, { memoText: 'deposit' })}
${data.pay_url ? `\nOr pay online (0.8% processing fee, max $5): ${data.pay_url}\n` : ''}
${data.needs_id_verification ? `\nID VERIFICATION REQUIRED\nWe also need a copy of your government-issued photo ID.\n${data.id_upload_url ? `Upload here: ${data.id_upload_url}` : 'Please reply to this email with a photo of your ID.'}` : ''}

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };
    }

    case "deposit_received":
      return {
        subject: "Deposit Received - AWKN Ranch",
        html: `
          <h2>Payment Received</h2>
          <p>Hi ${data.first_name},</p>
          <p>We've received your deposit payment of <strong>$${data.amount}</strong>.</p>
          ${data.remaining_balance > 0 ? `<p><strong>Remaining Balance:</strong> $${data.remaining_balance}</p>` : '<p>All deposits have been received!</p>'}
          <p>Thank you!</p>
        `,
        text: `Payment Received

Hi ${data.first_name},

We've received your deposit payment of $${data.amount}.
${data.remaining_balance > 0 ? `Remaining Balance: $${data.remaining_balance}` : 'All deposits have been received!'}

Thank you!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "deposits_confirmed":
      return {
        subject: "Deposits Confirmed - Ready for Move-in! - AWKN Ranch",
        html: `
          <h2>You're All Set!</h2>
          <p>Hi ${data.first_name},</p>
          <p>All your deposits have been received and confirmed.</p>
          <p><strong>Move-in Date:</strong> ${data.move_in_date}</p>
          <p>We'll be in touch with move-in details and key handoff arrangements.</p>
          <p>Welcome to AWKN Ranch!</p>
        `,
        text: `You're All Set!

Hi ${data.first_name},

All your deposits have been received and confirmed.

Move-in Date: ${data.move_in_date}

We'll be in touch with move-in details and key handoff arrangements.

Welcome to AWKN Ranch!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "move_in_confirmed": {
      const isMonthly = data.is_monthly !== false;
      const isPaid = Number(data.monthly_rate) > 0;
      const miRateDisplay = !isPaid ? 'Complimentary' : (isMonthly ? `$${Number(data.monthly_rate).toLocaleString()}/mo` : `$${Number(data.monthly_rate).toLocaleString()}`);
      const checkInDisplay = data.check_in_time === 'flexible' ? 'Flexible (no set time)' : (data.check_in_time || null);
      const checkOutDisplay = data.check_out_time === 'flexible' ? 'Flexible (no set time)' : (data.check_out_time || null);
      const showRentDue = isPaid && isMonthly;
      const showPaymentMethods = isPaid;

      // Space link
      const spaceLink = data.space_id
        ? `<a href="https://laurenbur2.github.io/awkn-ranch/spaces/?id=${data.space_id}" style="color:${B.accent};font-weight:600;text-decoration:none;">${data.space_name}</a>`
        : `<strong>${data.space_name}</strong>`;

      // Build detail rows using shared dataTable component
      const detailRowData: DataRow[] = [];
      detailRowData.push({ label: 'Space', value: spaceLink, valueStyle: 'font-weight:600;' });
      detailRowData.push({ label: 'Move-in', value: data.move_in_date, valueStyle: 'font-weight:600;' });
      if (checkInDisplay) detailRowData.push({ label: 'Check-in', value: checkInDisplay });
      if (data.lease_end_date) detailRowData.push({ label: 'Check-out', value: data.lease_end_date, valueStyle: 'font-weight:600;' });
      if (checkOutDisplay) detailRowData.push({ label: 'Check-out Time', value: checkOutDisplay });
      detailRowData.push({ label: 'Rate', value: miRateDisplay, valueStyle: 'font-weight:600;' });
      if (showRentDue) detailRowData.push({ label: 'Rent Due', value: `${data.rent_due_day || '1st'} of each month` });

      // Use shared payment methods block
      const miPaymentSection = showPaymentMethods
        ? paymentMethodsBlock(data._payment_methods_raw, {
            payUrl: data.pay_url,
            memoText: 'rent',
          })
        : '';

      // Pass space image as extraImages for the brand wrapper gallery
      const _extraImages: string[] = [];
      if (data.space_image_url) _extraImages.push(data.space_image_url);

      return {
        subject: `Reservation Confirmed - ${data.space_name}${data.move_in_date ? ` - ${data.move_in_date}` : ''}`,
        _extraImages,
        html: `
          <p style="color:${B.text};font-size:15px;line-height:1.5;margin:0 0 8px;">Hi ${data.first_name},</p>
          <p style="color:${B.textMuted};font-size:14px;line-height:1.5;margin:0 0 16px;">We're excited that you have chosen to come to the AWKN Ranch. Our goal is to redefine your idea of what an AWKN Ranch can be. When it comes to selecting an AWKN Ranch, we feel no one need settle.</p>

          ${dataTable(detailRowData, { heading: 'Reservation Details' })}

          ${miPaymentSection}

          ${calloutBox(`<span style="font-size:13px;color:${B.text};line-height:1.5;">&#128218; Please re-familiarize yourself with our <a href="https://laurenbur2.github.io/awkn-ranch/visiting" style="color:${B.accent};font-weight:600;">visiting &amp; operational guidelines</a> &mdash; which also has a map link to the property.</span>`)}

          ${calloutBox(`<p style="margin:0;color:${B.textMuted};font-size:12px;line-height:1.5;"><strong style="color:${B.text};">Reminder:</strong> Please don't give the address out to potential guests. Instead, send them the visiting link above so they can read the guidelines first.</p>`, 'warning')}

          <p style="color:${B.textMuted};font-size:14px;line-height:1.5;margin:0 0 4px;">If you have any questions or need anything, don't hesitate to reach out!</p>
        `,
        text: `Welcome to AWKN Ranch!

Hi ${data.first_name},

We're excited that you have chosen to come to the AWKN Ranch.

${dataTableText(detailRowData)}

${showPaymentMethods ? paymentMethodsText(data._payment_methods_raw, { memoText: 'rent' }) : ''}

Please re-familiarize yourself with our operational guidelines: https://laurenbur2.github.io/awkn-ranch/visiting

Reminder: Please don't give the address out to potential guests. Instead, send them the visiting link so they can read the guidelines first.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };
    }

    // ===== PAYMENT NOTIFICATIONS =====
    case "payment_reminder":
      return {
        subject: `Rent Reminder - Due ${data.due_date} - AWKN Ranch`,
        html: `
          <h2>Friendly Rent Reminder</h2>
          <p>Hi ${data.first_name},</p>
          <p>This is a friendly reminder that your rent payment of <strong>$${data.amount}</strong> is due on <strong>${data.due_date}</strong>.</p>
          ${paymentMethodsBlock(data._payment_methods_raw, { memoText: data.period || 'rent' })}
          ${data.needs_id_verification ? calloutBox(`
            <p style="margin:0 0 8px;font-weight:bold;color:#333;">ID Verification Required</p>
            <p style="margin:0;color:#555;">We also need a copy of your government-issued photo ID to complete your rental setup.</p>
            ${data.id_upload_url
              ? `<p style="margin:12px 0 0;"><a href="${data.id_upload_url}" style="display:inline-block;padding:10px 20px;background:#f9a825;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;">Upload Your ID</a></p>`
              : `<p style="margin:8px 0 0;color:#555;">Please reply to this email with a photo of your ID.</p>`}
          `, 'warning') : ''}
          <p>Thank you!</p>
        `,
        text: `Friendly Rent Reminder

Hi ${data.first_name},

This is a friendly reminder that your rent payment of $${data.amount} is due on ${data.due_date}.

${paymentMethodsText(data._payment_methods_raw, { memoText: data.period || 'rent' })}
${data.needs_id_verification ? `\nID VERIFICATION REQUIRED\n${data.id_upload_url ? `Upload here: ${data.id_upload_url}` : 'Please reply with a photo of your ID.'}` : ''}

Thank you!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "payment_overdue":
      return {
        subject: `URGENT: Rent Payment Overdue - AWKN Ranch`,
        html: `
          <h2 style="color:${B.danger};">Rent Payment Overdue</h2>
          <p>Hi ${data.first_name},</p>
          <p>Your rent payment of <strong>$${data.amount}</strong> was due on <strong>${data.due_date}</strong> and is now <strong>${data.days_overdue} day${data.days_overdue > 1 ? 's' : ''} overdue</strong>.</p>
          ${data.late_fee ? `${dataTable([
            { label: 'Late Fee', value: `$${data.late_fee}`, valueStyle: `color:${B.danger};` },
            { label: 'Total Due', value: `$${data.total_due}`, valueStyle: `font-weight:700;font-size:18px;color:${B.danger};` },
          ])}` : ''}
          <p>Please submit payment as soon as possible to avoid any additional fees or action.</p>
          ${paymentMethodsBlock(data._payment_methods_raw)}
          ${data.needs_id_verification ? calloutBox(`
            <p style="margin:0 0 8px;font-weight:bold;color:#333;">ID Verification Required</p>
            <p style="margin:0;color:#555;">We also need a copy of your government-issued photo ID to complete your rental setup.</p>
            ${data.id_upload_url
              ? `<p style="margin:12px 0 0;"><a href="${data.id_upload_url}" style="display:inline-block;padding:10px 20px;background:#f9a825;color:#fff;text-decoration:none;border-radius:4px;font-weight:bold;">Upload Your ID</a></p>`
              : `<p style="margin:8px 0 0;color:#555;">Please reply to this email with a photo of your ID.</p>`}
          `, 'warning') : ''}
          <p>If you're experiencing difficulties, please reach out to discuss options.</p>
        `,
        text: `RENT PAYMENT OVERDUE

Hi ${data.first_name},

Your rent payment of $${data.amount} was due on ${data.due_date} and is now ${data.days_overdue} day${data.days_overdue > 1 ? 's' : ''} overdue.
${data.late_fee ? `\nLate Fee: $${data.late_fee}\nTotal Due: $${data.total_due}` : ''}

Please submit payment as soon as possible.

${paymentMethodsText(data._payment_methods_raw)}
${data.needs_id_verification ? `\nID VERIFICATION REQUIRED\n${data.id_upload_url ? `Upload here: ${data.id_upload_url}` : 'Please reply with a photo of your ID.'}` : ''}

If you're experiencing difficulties, please reach out to discuss options.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "payment_received":
      return {
        subject: "Payment Received - Thank You! - AWKN Ranch",
        html: `
          <h2>Payment Received</h2>
          <p>Hi ${data.first_name},</p>
          <p>We've received your payment of <strong>$${data.amount}</strong>${data.period ? ` for <strong>${data.period}</strong>` : ''}.</p>
          <p>Thank you for your prompt payment!</p>
        `,
        text: `Payment Received

Hi ${data.first_name},

We've received your payment of $${data.amount}${data.period ? ` for ${data.period}` : ''}.

Thank you for your prompt payment!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "payment_statement": {
      // line_items: [{ date, description, amount, status }]
      // balance_due, upcoming_amount, upcoming_date, space_name, pay_now_url
      const items = data.line_items || [];

      const rowsText = items.map((item: any) =>
        `  ${item.date}  |  ${item.description}  |  $${Number(item.amount).toFixed(2)}  |  ${item.status}`
      ).join("\n");

      const hasDue = data.balance_due && Number(data.balance_due) > 0;

      const upcomingSection = data.upcoming_amount
        ? `<div style="background:#f3e5f5;border-left:4px solid #7b1fa2;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
              <span style="font-size:13px;color:#7b1fa2;">&#9203; <strong>Next payment:</strong> $${Number(data.upcoming_amount).toFixed(2)} due ${data.upcoming_date}</span>
            </div>`
        : '';

      // CTA button
      const ctaSection = hasDue && data.pay_now_url
        ? `<div style="text-align:center;margin:32px 0;">
              <a href="${data.pay_now_url}" style="display:inline-block;background:linear-gradient(135deg,#e65100 0%,#bf360c 100%);color:white;padding:16px 48px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(230,81,0,0.3);">Pay $${Number(data.balance_due).toFixed(2)} Now</a>
              <p style="margin:8px 0 0;font-size:12px;color:#999;">Credit card, debit card, or bank transfer (ACH) &mdash; 0.8% processing fee, max $5</p>
            </div>`
        : hasDue
        ? `<div style="text-align:center;margin:32px 0;">
              <p style="font-size:16px;font-weight:600;color:${B.warning};">Please send $${Number(data.balance_due).toFixed(2)} using one of the methods below</p>
            </div>`
        : '';

      // Use shared components
      const ledgerHtml = ledgerTable(items);
      const balanceSectionHtml = balanceBox(data.balance_due, data.overdue_since);
      const pmBlock = paymentMethodsBlock(data._payment_methods_raw, data.pay_now_url);

      return {
        subject: `Payment Statement - ${data.space_name || 'AWKN Ranch'}`,
        html: `
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;letter-spacing:0.5px;">AWKN Ranch</h1>
              <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">Payment Statement</p>
            </div>
            <div style="padding:32px;">
              <p style="color:#333;font-size:16px;">Hi ${data.first_name},</p>
              <p style="color:#555;font-size:15px;">Here's your payment summary for <strong>${data.space_name || 'AWKN Ranch'}</strong>.</p>

              ${ledgerHtml}
              ${balanceSectionHtml}
              ${upcomingSection}
              ${ctaSection}
              ${pmBlock}

              <p style="font-size:13px;color:#999;margin-top:16px;">Please include your name and &quot;rent&quot; in the payment memo so we can match your payment.</p>
              <p style="color:#555;font-size:15px;">If you have any questions about your statement, just reply to this email.</p>
              <p style="color:#7d6f74;font-size:15px;margin:16px 0 0;"><em>Yours generatively,</em><br><strong style="color:#2a1f23;">PAI</strong><br><span style="font-size:13px;">the AWKN Ranch property AI agent</span></p>
            </div>
            <div style="background:#f5f5f5;padding:20px 32px;text-align:center;border-top:1px solid #e0e0e0;">
              <p style="margin:0;color:#bbb;font-size:11px;">AWKN Team Portal &bull; AWKN Ranch</p>
            </div>
          </div>
        `,
        text: `Payment Statement

Hi ${data.first_name},

Here's your payment summary for ${data.space_name || 'AWKN Ranch'}.

${rowsText}

${hasDue ? `Outstanding Balance: $${Number(data.balance_due).toFixed(2)}${data.overdue_since ? ` (overdue since ${data.overdue_since})` : ''}` : 'All caught up! No outstanding balance.'}
${data.upcoming_amount ? `Next payment: $${Number(data.upcoming_amount).toFixed(2)} due ${data.upcoming_date}` : ''}
${data.pay_now_url ? `\nPay now: ${data.pay_now_url}\n` : ''}
${paymentMethodsText(data._payment_methods_raw)}

Please include your name and "rent" in the payment memo.

If you have any questions about your statement, just reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };
    }

    // ===== INVITATIONS =====
    case "event_invitation":
      return {
        subject: `You're Invited: ${data.event_name} - AWKN Ranch`,
        html: `
          <h2>You're Invited!</h2>
          <p>Hi ${data.first_name},</p>
          <p>You're invited to <strong>${data.event_name}</strong> at AWKN Ranch!</p>
          ${dataTable([
            { label: 'Date', value: data.event_date },
            ...(data.event_time ? [{ label: 'Time', value: data.event_time }] : []),
            ...(data.location ? [{ label: 'Location', value: data.location }] : []),
          ])}
          ${data.description ? `<p>${data.description}</p>` : ''}
          ${data.rsvp_link ? `<p><a href="${data.rsvp_link}" style="background:${B.accent}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">RSVP Now</a></p>` : ''}
          <p>We hope to see you there!</p>
        `,
        text: `You're Invited!

Hi ${data.first_name},

You're invited to ${data.event_name} at AWKN Ranch!

Date: ${data.event_date}
${data.event_time ? `Time: ${data.event_time}` : ''}
${data.location ? `Location: ${data.location}` : ''}

${data.description || ''}

${data.rsvp_link ? `RSVP: ${data.rsvp_link}` : ''}

We hope to see you there!

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "general_invitation":
      return {
        subject: data.subject || "Invitation from AWKN Ranch",
        html: `
          <p>Hi ${data.first_name},</p>
          ${data.message || '<p>You have been invited!</p>'}
          ${data.action_url ? `<p><a href="${data.action_url}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">${data.action_text || 'Learn More'}</a></p>` : ''}
        `,
        text: `Hi ${data.first_name},

${data.message_text || 'You have been invited!'}

${data.action_url ? `${data.action_text || 'Learn More'}: ${data.action_url}` : ''}

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "staff_invitation": {
      const roleLabels: Record<string, string> = {
        admin: "an admin",
        staff: "a staff member",
        demo: "a demo user",
        resident: "a resident",
        associate: "an associate",
        public: "a public user",
      };
      const roleDescriptions: Record<string, string> = {
        admin: "full admin access (view all spaces, occupant details, edit spaces, manage photos, and invite users)",
        staff: "staff access (view all spaces and occupant details)",
        demo: "demo access (explore the product; names and amounts are sample data only)",
        resident: "resident access (cameras, lighting, and house info)",
        associate: "associate access (cameras, lighting, and house info)",
        public: "public access (view available spaces)",
      };
      const roleLabel = roleLabels[data.role as string] ?? "a user";
      const roleDescription = roleDescriptions[data.role as string] ?? "access to the platform";
      const bannerUrl = "https://lnqxarwqckpmirpmixcw.supabase.co/storage/v1/object/public/investor/hero-ranch.jpg";
      return {
        subject: "You're Invited to the AWKN Team Portal",
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header with gradient -->
            <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:40px 32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Welcome to the AWKN Team Portal</h1>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:15px;font-weight:400;">AWKN Ranch</p>
            </div>

            <!-- Body -->
            <div style="padding:32px;">
              <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi there,</p>
              <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px;">You've been invited to join the <strong style="color:#0f3460;">AWKN Team Portal</strong> as ${roleLabel}. You'll have ${roleDescription}.</p>

              <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">Your access is <strong>pre-approved</strong> — just create your account and you're in.</p>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${data.login_url}" style="background:linear-gradient(135deg,#c2410c 0%,#ea580c 100%);color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:700;font-size:16px;letter-spacing:0.3px;box-shadow:0 4px 12px rgba(194,65,12,0.3);">Sign in to the AWKN Team Portal</a>
              </div>

              <!-- Getting started card -->
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:24px 0;">
                <p style="color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;">Getting Started</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 12px 6px 0;vertical-align:top;color:#c2410c;font-weight:700;font-size:14px;width:24px;">1.</td>
                    <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.5;">Click the button above to go to the login page</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 12px 6px 0;vertical-align:top;color:#c2410c;font-weight:700;font-size:14px;">2.</td>
                    <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.5;">Sign in with <strong>${data.email}</strong> using <strong>Continue with Google</strong> (one tap) or create a password</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 12px 6px 0;vertical-align:top;color:#c2410c;font-weight:700;font-size:14px;">3.</td>
                    <td style="padding:6px 0;color:#475569;font-size:14px;line-height:1.5;">That's it — you'll have immediate access</td>
                  </tr>
                </table>
              </div>

              <p style="color:#94a3b8;font-size:13px;text-align:center;margin:24px 0 0;">Questions or trouble signing in? Email <a href="mailto:admin@awknranch.com" style="color:#c2410c;">admin@awknranch.com</a>.</p>
            </div>

            <!-- Property art banner -->
            <div style="padding:0;">
              <img src="${bannerUrl}" alt="AWKN Ranch" style="width:100%;display:block;border-radius:0;" />
            </div>

            <!-- Footer -->
            <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">AWKN Ranch</p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">Where the herd gathers</p>
            </div>
          </div>
        `,
        text: `Welcome to the AWKN Team Portal!

Hi there,

You've been invited to join the AWKN Team Portal as ${roleLabel}. You'll have ${roleDescription}.

Your access is pre-approved — just sign in and you're in.

Getting Started:
1. Go to: ${data.login_url}
2. Sign in with ${data.email} — use "Continue with Google" (one tap) or create a password
3. That's it — you'll have immediate access

Questions or trouble signing in? Email admin@awknranch.com.

— The AWKN Ranch Team`
      };
    }

    case "proposal_sent": {
      const fmtCurrency = (n: number) =>
        `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
      const lineItemRows = lineItems.map((li: any) => {
        const qty = Number(li.quantity || 1);
        const desc = String(li.description || '');
        const qtyPrefix = qty > 1 ? `<strong style="color:#1c1618;">${qty} ×</strong> ` : '';
        return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(201,148,62,0.18);font-family:'Inter',sans-serif;color:#1c1618;font-size:14px;line-height:1.5;vertical-align:top;">${qtyPrefix}${desc}</td>
          <td style="padding:12px 0;border-bottom:1px solid rgba(201,148,62,0.18);font-family:'Inter',sans-serif;color:#1c1618;font-size:14px;text-align:right;white-space:nowrap;vertical-align:top;">${fmtCurrency(li.total)}</td>
        </tr>`;
      }).join('');
      const lineItemRowsText = lineItems.map((li: any) =>
        `  ${li.description}  ×${li.quantity}  @ ${fmtCurrency(li.unit_price)}  = ${fmtCurrency(li.total)}`
      ).join('\n');
      const eventDate = data.event_date
        ? new Date(data.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      const validUntil = data.valid_until
        ? new Date(data.valid_until + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      const isWithin = data.business_line === 'within';
      const brand = isWithin
        ? {
            name: 'Within Center',
            wordmark: 'WITHIN CENTER',
            subheader: 'at AWKN Ranch · Austin, Texas',
            supportEmail: 'admin@within.center',
            defaultTitle: 'Your Program at Within Center',
          }
        : {
            name: 'AWKN Ranch',
            wordmark: 'AWKN RANCH',
            subheader: 'Austin, Texas',
            supportEmail: 'admin@awknranch.com',
            defaultTitle: 'Your Event at AWKN Ranch',
          };
      return {
        subject: `Proposal ${data.proposal_number} from ${brand.name} — ${data.title}`,
        html: `
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;">

  <!-- Header -->
  <div style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">${brand.wordmark}</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">${brand.subheader}</div>
  </div>

  <!-- Proposal hero -->
  <div style="padding:40px 40px 24px 40px;text-align:center;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Proposal ${String(data.proposal_number || '')}</div>
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.25;">${String(data.title || brand.defaultTitle)}</h1>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.6;">Hi ${String(data.recipient_first_name || 'there')} — thank you for considering ${brand.name}. Your proposal is ready below.</p>
  </div>

  ${eventDate || data.guest_count || data.event_type ? `
  <!-- Event details -->
  <div style="padding:0 40px 28px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:12px;">Event Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;">
        ${eventDate ? `<tr><td style="padding:4px 0;color:#6b4c3b;width:120px;">Date</td><td style="padding:4px 0;font-weight:600;">${eventDate}</td></tr>` : ''}
        ${data.event_type ? `<tr><td style="padding:4px 0;color:#6b4c3b;">Event type</td><td style="padding:4px 0;font-weight:600;text-transform:capitalize;">${String(data.event_type)}</td></tr>` : ''}
        ${data.guest_count ? `<tr><td style="padding:4px 0;color:#6b4c3b;">Guest count</td><td style="padding:4px 0;font-weight:600;">${data.guest_count}</td></tr>` : ''}
      </table>
    </div>
  </div>` : ''}

  ${lineItems.length > 0 ? `
  <!-- Line items -->
  <div style="padding:0 40px 8px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:14px;">What's Included</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tbody>
        ${lineItemRows}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Totals -->
  <div style="padding:20px 40px 8px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;">
      ${data.subtotal !== undefined ? `<tr><td style="padding:3px 0;text-align:right;">Subtotal</td><td style="padding:3px 0;text-align:right;width:120px;color:#1c1618;font-weight:500;">${fmtCurrency(data.subtotal)}</td></tr>` : ''}
      ${data.discount_amount && Number(data.discount_amount) > 0 ? `<tr><td style="padding:3px 0;text-align:right;">Discount</td><td style="padding:3px 0;text-align:right;color:#1c1618;font-weight:500;">−${fmtCurrency(data.discount_amount)}</td></tr>` : ''}
      ${data.tax_amount && Number(data.tax_amount) > 0 ? `<tr><td style="padding:3px 0;text-align:right;">Tax</td><td style="padding:3px 0;text-align:right;color:#1c1618;font-weight:500;">${fmtCurrency(data.tax_amount)}</td></tr>` : ''}
    </table>
  </div>

  <!-- Total Due (black box). For AWKN Ranch (venue rental): shows Deposit + Balance
  split; otherwise shows the full Total Due -->
  <div style="padding:12px 40px 28px 40px;">
    <div style="background:#1c1618;border-radius:4px;padding:22px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${data.deposit_amount ? `
        <tr>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;">Deposit to Confirm (${String(data.deposit_percent || 50)}%)</td>
          <td style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:500;color:#ffffff;text-align:right;">${fmtCurrency(data.deposit_amount)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:6px;font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,0.6);">Balance of ${fmtCurrency(data.balance_due || 0)} due 30 days before event · Event total ${fmtCurrency(data.total)}</td>
        </tr>` : `
        <tr>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;">Total Due</td>
          <td style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:500;color:#ffffff;text-align:right;">${fmtCurrency(data.total)}</td>
        </tr>`}
      </table>
    </div>
  </div>

  ${data.signing_url ? `
  <!-- Sign contract CTA (AWKN Ranch venue rentals only) -->
  <div style="padding:0 40px 18px 40px;text-align:center;">
    <a href="${String(data.signing_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1c1618;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;">Step 1 · Sign Rental Agreement</a>
    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:10px 0 0 0;">Secure e-signature via SignWell · takes about 2 minutes</p>
  </div>` : ''}

  <!-- CTA: ACH (deposit or full total) + optional card (+3% surcharge disclosed) -->
  <div style="padding:0 40px 8px 40px;text-align:center;">
    <a href="${String(data.payment_link_url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#c9943e;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;">${data.signing_url ? 'Step 2 · ' : ''}Pay by Bank — ${fmtCurrency(data.deposit_amount || data.total)}</a>
    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:10px 0 0 0;">Secure bank transfer (ACH) via Stripe · no processing fee</p>
  </div>
  ${data.payment_link_card_url ? `
  <div style="padding:14px 40px 8px 40px;text-align:center;">
    <a href="${String(data.payment_link_card_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ffffff;color:#1c1618;border:1px solid #1c1618;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:13px 32px;border-radius:3px;">Pay by Card — ${fmtCurrency(data.card_total || ((Number(data.deposit_amount || data.total || 0)) * 1.03))}</a>
    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:10px 0 0 0;">Includes a 3% credit card processing surcharge</p>
  </div>` : ''}
  ${validUntil ? `<p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:14px 0 0 0;text-align:center;">Valid until ${validUntil}</p>` : ''}

  ${isWithin ? `
  <!-- Available Add-Ons -->
  <div style="padding:32px 40px 0 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:6px;">Enhance Your Experience</div>
      <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.3;">Available Add-Ons</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td width="50%" valign="top" style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">60-Minute Massage</td>
          <td valign="top" style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$175</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Additional Integration Coaching</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$200</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Human Design Reading</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$250</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Licensed Therapy Session</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$250</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Astrology Session</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$200</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Hap&eacute; Ceremony</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$75</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Internal Family System Session</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$200</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;border-bottom:1px solid rgba(201,148,62,0.18);">Private Sound Journey</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;border-bottom:1px solid rgba(201,148,62,0.18);">$200</td>
        </tr>
        <tr>
          <td style="padding:6px 10px 6px 0;font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;">Pickleball Lesson</td>
          <td style="padding:6px 0 6px 10px;font-family:'Inter',sans-serif;font-size:13px;color:#c9943e;font-weight:600;text-align:right;">$50</td>
        </tr>
      </table>
      <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:#6b4c3b;line-height:1.6;margin:14px 0 0 0;">Reply to this email or contact Shannon in admissions to add any of these to your experience.</p>
    </div>
  </div>` : ''}

  ${data.notes ? `
  <!-- Notes -->
  <div style="padding:28px 40px 0 40px;">
    <div style="background:#faf8f5;border:1px solid rgba(201,148,62,0.18);border-radius:4px;padding:18px 22px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">Notes</div>
      <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.6;margin:0;white-space:pre-wrap;">${String(data.notes)}</p>
    </div>
  </div>` : ''}

  ${data.terms ? `
  <!-- Terms -->
  <div style="padding:20px 40px 0 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:8px;">Terms</div>
    <p style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;margin:0;white-space:pre-wrap;">${String(data.terms)}</p>
  </div>` : ''}

  <!-- Signoff -->
  <div style="padding:32px 40px 36px 40px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#1c1618;line-height:1.7;margin:0 0 16px 0;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
      Questions? Reply to this email or write <a href="mailto:${brand.supportEmail}" style="color:#c9943e;text-decoration:none;">${brand.supportEmail}</a>.
    </p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:0;">With care,<br><em style="color:#6b4c3b;">The ${brand.name} Team</em></p>
  </div>

  <!-- Footer -->
  <div style="padding:0 40px 32px 40px;text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;">
    © 2026 Hearth Space Health, Inc. · 7600 Grove Crest Circle, Austin, TX
  </div>

</div>
        `,
        text: `Proposal ${data.proposal_number} — ${data.title}

Hi ${data.recipient_first_name || 'there'},

Thanks for considering ${brand.name}. Here's your proposal${eventDate ? ` for ${eventDate}` : ''}.

${data.event_type ? `Event type: ${data.event_type}\n` : ''}${data.guest_count ? `Guest count: ${data.guest_count}\n` : ''}
Line items:
${lineItemRowsText}

${data.subtotal !== undefined ? `Subtotal: ${fmtCurrency(data.subtotal)}\n` : ''}${data.discount_amount && Number(data.discount_amount) > 0 ? `Discount: −${fmtCurrency(data.discount_amount)}\n` : ''}${data.tax_amount && Number(data.tax_amount) > 0 ? `Tax: ${fmtCurrency(data.tax_amount)}\n` : ''}Total Due: ${fmtCurrency(data.total)}

Pay & secure your date: ${data.payment_link_url || ''}
${validUntil ? `Valid until ${validUntil}` : ''}

${data.notes ? `Notes:\n${data.notes}\n\n` : ''}${data.terms ? `Terms:\n${data.terms}\n\n` : ''}Questions? Reply to this email or write ${brand.supportEmail}.

— The ${brand.name} Team`
      };
    }

    case "agreement_to_sign": {
      const eventDate = data.event_date
        ? new Date(data.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      return {
        subject: `Please sign your rental agreement — AWKN Ranch${data.title ? ` · ${data.title}` : ''}`,
        html: `
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;">

  <!-- Header -->
  <div style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">AWKN RANCH</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">Austin, Texas</div>
  </div>

  <!-- Hero -->
  <div style="padding:40px 40px 24px 40px;text-align:center;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Rental Agreement</div>
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.25;">${String(data.title || 'Your Event at AWKN Ranch')}</h1>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.6;">Hi ${String(data.recipient_first_name || 'there')} — your rental agreement is ready for signature.</p>
  </div>

  ${eventDate ? `
  <!-- Event details -->
  <div style="padding:0 40px 28px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:12px;">Event Date</div>
      <div style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;font-weight:600;">${eventDate}</div>
    </div>
  </div>` : ''}

  <!-- Body -->
  <div style="padding:0 40px 12px 40px;">
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.7;margin:0 0 14px 0;">
      Please review and sign the rental agreement below. Signing takes about two minutes via SignWell's secure e-signature portal. Once signed, we'll follow up separately with payment details to confirm your date.
    </p>
  </div>

  <!-- Sign CTA -->
  <div style="padding:8px 40px 32px 40px;text-align:center;">
    <a href="${String(data.signing_url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1c1618;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;">Sign Rental Agreement</a>
    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:10px 0 0 0;">Secure e-signature via SignWell</p>
  </div>

  <!-- Signoff -->
  <div style="padding:0 40px 36px 40px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#1c1618;line-height:1.7;margin:0 0 16px 0;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
      Questions? Reply to this email or write <a href="mailto:admin@awknranch.com" style="color:#c9943e;text-decoration:none;">admin@awknranch.com</a>.
    </p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:0;">With care,<br><em style="color:#6b4c3b;">The AWKN Ranch Team</em></p>
  </div>

  <!-- Footer -->
  <div style="padding:0 40px 32px 40px;text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;">
    © 2026 Hearth Space Health, Inc. · 7600 Grove Crest Circle, Austin, TX
  </div>
</div>
        `,
        text: `Rental Agreement — AWKN Ranch${data.title ? ` · ${data.title}` : ''}

Hi ${data.recipient_first_name || 'there'},

Your rental agreement is ready for signature${eventDate ? ` for ${eventDate}` : ''}. Please review and sign via the secure SignWell link below. Once signed, we'll follow up separately with payment details to confirm your date.

Sign your rental agreement: ${data.signing_url || ''}

Questions? Reply to this email or write admin@awknranch.com.

— The AWKN Ranch Team`
      };
    }

    case "retreat_agreement_to_sign": {
      // Within-branded version of agreement_to_sign for immersive retreat clients.
      // Sent after create-retreat-agreement finishes uploading the SignWell doc;
      // delivered via Resend from noreply@within.center so it lands in the same
      // thread aesthetic as the welcome letter.
      const arrivalDate = data.arrival_date
        ? new Date(data.arrival_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';
      const accommodation = String(data.accommodation_type || '');
      return {
        subject: `Please sign your Within retreat agreement`,
        html: `
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;">

  <!-- Header -->
  <div style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">WITHIN CENTER</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">at AWKN Ranch · Austin, Texas</div>
  </div>

  <!-- Hero -->
  <div style="padding:40px 40px 24px 40px;text-align:center;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Retreat Agreement</div>
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.25;">A small step before your retreat, ${String(data.recipient_first_name || 'there')}.</h1>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.6;">Your Within retreat agreement is ready for your signature. It covers the practical and legal terms of your stay so we can both arrive prepared.</p>
  </div>

  ${arrivalDate || accommodation ? `
  <!-- Arrival details -->
  <div style="padding:0 40px 28px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      ${arrivalDate ? `<div style="margin-bottom:10px;">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:4px;">Arrival</div>
        <div style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;font-weight:600;">${arrivalDate}</div>
      </div>` : ''}
      ${accommodation ? `<div>
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:4px;">Accommodation</div>
        <div style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;font-weight:600;">${accommodation}</div>
      </div>` : ''}
    </div>
  </div>` : ''}

  <!-- Body -->
  <div style="padding:0 40px 12px 40px;">
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.7;margin:0 0 14px 0;">
      Please review and sign the agreement at the link below. Signing takes about two minutes via SignWell's secure e-signature portal. Your separate Medical Consent and Informed Consent for Ketamine-Assisted Therapy remain in place — this agreement covers lodging, conduct, payment, and the on-site policies for your stay.
    </p>
  </div>

  <!-- Sign CTA -->
  <div style="padding:8px 40px 32px 40px;text-align:center;">
    <a href="${String(data.signing_url || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1c1618;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 32px;border-radius:3px;">Sign Retreat Agreement</a>
    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;line-height:1.6;margin:10px 0 0 0;">Secure e-signature via SignWell</p>
  </div>

  <!-- Signoff -->
  <div style="padding:0 40px 36px 40px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#1c1618;line-height:1.7;margin:0 0 16px 0;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
      Questions? Reply to this email or write <a href="mailto:info@within.center" style="color:#c9943e;text-decoration:none;">info@within.center</a>.
    </p>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:0;">With care,<br><em style="color:#6b4c3b;">The Within Center Team</em></p>
  </div>

  <!-- Footer -->
  <div style="padding:0 40px 32px 40px;text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;">
    © 2026 Hearth Space Health, Inc. · 7600 Grove Crest Circle, Austin, TX
  </div>
</div>
        `,
        text: `Your Within retreat agreement is ready for signature.

Hi ${data.recipient_first_name || 'there'},

Please review and sign your retreat agreement${arrivalDate ? ` for your arrival on ${arrivalDate}` : ''}. Signing takes about two minutes via the secure SignWell link below. Your separate Medical Consent and Informed Consent for Ketamine-Assisted Therapy remain in place — this agreement covers lodging, conduct, payment, and the on-site policies for your stay.

Sign your retreat agreement: ${data.signing_url || ''}

Questions? Reply to this email or write info@within.center.

With care,
The Within Center Team`
      };
    }

    case "prospect_invitation":
      return {
        subject: "You're Invited to Browse Spaces - AWKN Ranch",
        html: `
          <h2>Welcome${data.first_name ? ', ' + data.first_name : ''}!</h2>
          <p>You've been invited to browse available spaces at <strong>AWKN Ranch</strong>, a unique co-living community in Austin, Texas.</p>
          <p>No account or login is needed — just click the button below to start browsing. You'll be able to see photos, amenities, pricing, and availability for all of our spaces.</p>
          <p style="margin: 30px 0; text-align: center;">
            <a href="${data.access_url}" style="background:${B.accent}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Browse Available Spaces</a>
          </p>
          <p style="color: #666; font-size: 14px;">This link is personal to you and will expire in 14 days.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p>When you're ready, you can also:</p>
          <ul style="line-height: 1.8;">
            <li><a href="https://laurenbur2.github.io/awkn-ranch/spaces/apply/">Apply for a rental space</a></li>
            <li><a href="https://laurenbur2.github.io/awkn-ranch/spaces/hostevent/">Host an event</a></li>
          </ul>
          <p>If you have any questions or would like to schedule a tour, just reply to this email.</p>
        `,
        text: `Welcome${data.first_name ? ', ' + data.first_name : ''}!

You've been invited to browse available spaces at AWKN Ranch, a unique co-living community in Austin, Texas.

No account or login is needed — just click the link below to start browsing:

${data.access_url}

You'll be able to see photos, amenities, pricing, and availability for all of our spaces.

This link is personal to you and will expire in 14 days.

When you're ready, you can also:
- Apply for a rental space: https://laurenbur2.github.io/awkn-ranch/spaces/apply/
- Host an event: https://laurenbur2.github.io/awkn-ranch/spaces/hostevent/

If you have any questions or would like to schedule a tour, just reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    // ===== RENTAL INVITE =====
    case "invite_to_apply":
      return {
        subject: "You're Invited to Apply - AWKN Ranch",
        html: `
          <h2>Great news, ${data.first_name}!</h2>
          <p>Thank you for your interest in joining the AWKN Ranch community. We've reviewed your inquiry and feel you would be a great fit for the AWKN Ranch community. We would love to invite you to apply for a rental space when you are ready and have clarity on your dates.</p>
          <p>Please review the <a href="https://USERNAME.github.io/REPO/spaces/">available spaces here</a> or click the button below to finish your application.</p>
          <p style="margin: 30px 0; text-align: center;">
            <a href="${data.continue_url}" style="background:${B.accent}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Complete Your Application</a>
          </p>
          <p>We are excited by the potential to have you join us at the AWKN Ranch. Where our mission is to let your Property Dreams run free. Our goal is to redefine your idea of what an AWKN Ranch can be. When it comes to selecting an AWKN Ranch, we feel no one need settle.</p>
        `,
        text: `Great news, ${data.first_name}!

Thank you for your interest in joining the AWKN Ranch community. We've reviewed your inquiry and feel you would be a great fit for the AWKN Ranch community. We would love to invite you to apply for a rental space when you are ready and have clarity on your dates.

Please review the available spaces here: https://USERNAME.github.io/REPO/spaces/

Or complete your application here: ${data.continue_url}

We are excited by the potential to have you join us at the AWKN Ranch. Where our mission is to let your Property Dreams run free. Our goal is to redefine your idea of what an AWKN Ranch can be. When it comes to selecting an AWKN Ranch, we feel no one need settle.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    // ===== ADMIN NOTIFICATIONS =====
    case "admin_event_request":
      return {
        subject: `New Event Request: ${data.event_name} - ${data.event_date}`,
        html: `
          <h2>New Event Hosting Request</h2>
          <p>A new event hosting request has been submitted.</p>

          <p style="margin: 20px 0;">
            <a href="https://USERNAME.github.io/REPO/spaces/admin/manage.html#events" style="background:${B.accent}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">View in Events Pipeline</a>
          </p>

          ${dataTable([
            { label: 'Name', value: `${data.first_name} ${data.last_name}` },
            { label: 'Email', value: `<a href="mailto:${data.email}">${data.email}</a>` },
            { label: 'Phone', value: `<a href="tel:${data.phone}">${data.phone}</a>` },
            ...(data.organization_name ? [{ label: 'Organization', value: data.organization_name }] : []),
            { label: 'Hosted Before', value: data.has_hosted_before ? 'Yes' : 'No' },
          ], { heading: 'Host Information' })}

          ${dataTable([
            { label: 'Event Name', value: data.event_name },
            { label: 'Event Type', value: data.event_type },
            { label: 'Date', value: data.event_date },
            { label: 'Time', value: `${data.event_start_time} - ${data.event_end_time}` },
            { label: 'Guests', value: String(data.expected_guests) },
            { label: 'Ticketed', value: data.is_ticketed ? 'Yes' : 'No' },
          ], { heading: 'Event Details' })}

          <h3>Event Description</h3>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${data.event_description}</p>

          ${dataTable([
            { label: 'Setup', value: `${data.setup_staff_name} - <a href="tel:${data.setup_staff_phone}">${data.setup_staff_phone}</a>` },
            { label: 'Cleanup', value: `${data.cleanup_staff_name} - <a href="tel:${data.cleanup_staff_phone}">${data.cleanup_staff_phone}</a>` },
            { label: 'Parking', value: `${data.parking_manager_name} - <a href="tel:${data.parking_manager_phone}">${data.parking_manager_phone}</a>` },
          ], { heading: 'Staffing Contacts' })}

          ${data.marketing_materials_link ? `<p><strong>Marketing Materials:</strong> <a href="${data.marketing_materials_link}">${data.marketing_materials_link}</a></p>` : ''}
          ${data.special_requests ? `<h3>Special Requests</h3><p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${data.special_requests}</p>` : ''}

          <p style="margin-top: 20px; color: #666; font-size: 14px;">All required acknowledgments have been confirmed by the applicant.</p>
        `,
        text: `New Event Hosting Request

View in Events Pipeline: https://USERNAME.github.io/REPO/spaces/admin/manage.html#events

HOST INFORMATION
Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone}
${data.organization_name ? `Organization: ${data.organization_name}` : ''}
Hosted Before: ${data.has_hosted_before ? 'Yes' : 'No'}

EVENT DETAILS
Event Name: ${data.event_name}
Event Type: ${data.event_type}
Date: ${data.event_date}
Time: ${data.event_start_time} - ${data.event_end_time}
Expected Guests: ${data.expected_guests}
Ticketed Event: ${data.is_ticketed ? 'Yes' : 'No'}

EVENT DESCRIPTION
${data.event_description}

STAFFING CONTACTS
Setup: ${data.setup_staff_name} - ${data.setup_staff_phone}
Cleanup: ${data.cleanup_staff_name} - ${data.cleanup_staff_phone}
Parking: ${data.parking_manager_name} - ${data.parking_manager_phone}

${data.marketing_materials_link ? `Marketing Materials: ${data.marketing_materials_link}` : ''}
${data.special_requests ? `SPECIAL REQUESTS\n${data.special_requests}` : ''}

All required acknowledgments have been confirmed by the applicant.`
      };

    case "admin_rental_application":
      return {
        subject: `New Rental Application: ${data.first_name} ${data.last_name}${data.space_name ? ` for ${data.space_name}` : ''}`,
        html: `
          <h2>New Rental Application</h2>
          <p>A new rental application has been submitted.</p>

          <p style="margin: 20px 0;">
            <a href="https://USERNAME.github.io/REPO/spaces/admin/manage.html#rentals" style="background:${B.accent}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">View in Rentals Pipeline</a>
          </p>

          ${dataTable([
            { label: 'Name', value: `${data.first_name} ${data.last_name}` },
            { label: 'Email', value: `<a href="mailto:${data.email}">${data.email}</a>` },
            { label: 'Phone', value: `<a href="tel:${data.phone}">${data.phone}</a>` },
            ...(data.current_location ? [{ label: 'Current Location', value: data.current_location }] : []),
          ], { heading: 'Applicant Information' })}

          ${dataTable([
            ...(data.space_name ? [{ label: 'Space', value: data.space_name }] : []),
            ...(data.desired_move_in ? [{ label: 'Desired Move-in', value: data.desired_move_in }] : []),
            ...(data.desired_lease_length ? [{ label: 'Lease Length', value: data.desired_lease_length }] : []),
            ...(data.budget ? [{ label: 'Budget', value: `$${data.budget}/month` }] : []),
          ], { heading: 'Rental Details' })}

          ${data.employment_status || data.occupation ? dataTable([
            ...(data.employment_status ? [{ label: 'Status', value: data.employment_status }] : []),
            ...(data.occupation ? [{ label: 'Occupation', value: data.occupation }] : []),
            ...(data.employer ? [{ label: 'Employer', value: data.employer }] : []),
            ...(data.monthly_income ? [{ label: 'Monthly Income', value: `$${data.monthly_income}` }] : []),
          ], { heading: 'Employment' }) : ''}

          ${data.about_yourself ? `<h3>About Themselves</h3><p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${data.about_yourself}</p>` : ''}
          ${data.why_interested ? `<h3>Why Interested</h3><p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${data.why_interested}</p>` : ''}
          ${data.additional_notes ? `<h3>Additional Notes</h3><p style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${data.additional_notes}</p>` : ''}

          ${data.emergency_contact_name ? dataTable([
            { label: 'Name', value: data.emergency_contact_name },
            ...(data.emergency_contact_phone ? [{ label: 'Phone', value: `<a href="tel:${data.emergency_contact_phone}">${data.emergency_contact_phone}</a>` }] : []),
            ...(data.emergency_contact_relationship ? [{ label: 'Relationship', value: data.emergency_contact_relationship }] : []),
          ], { heading: 'Emergency Contact' }) : ''}
        `,
        text: `New Rental Application

View in Rentals Pipeline: https://USERNAME.github.io/REPO/spaces/admin/manage.html#rentals

APPLICANT INFORMATION
Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone}
${data.current_location ? `Current Location: ${data.current_location}` : ''}

RENTAL DETAILS
${data.space_name ? `Space: ${data.space_name}` : ''}
${data.desired_move_in ? `Desired Move-in: ${data.desired_move_in}` : ''}
${data.desired_lease_length ? `Lease Length: ${data.desired_lease_length}` : ''}
${data.budget ? `Budget: $${data.budget}/month` : ''}

${data.employment_status || data.occupation ? `EMPLOYMENT
${data.employment_status ? `Status: ${data.employment_status}` : ''}
${data.occupation ? `Occupation: ${data.occupation}` : ''}
${data.employer ? `Employer: ${data.employer}` : ''}
${data.monthly_income ? `Monthly Income: $${data.monthly_income}` : ''}` : ''}

${data.about_yourself ? `ABOUT THEMSELVES\n${data.about_yourself}` : ''}
${data.why_interested ? `\nWHY INTERESTED\n${data.why_interested}` : ''}
${data.additional_notes ? `\nADDITIONAL NOTES\n${data.additional_notes}` : ''}

${data.emergency_contact_name ? `EMERGENCY CONTACT
Name: ${data.emergency_contact_name}
${data.emergency_contact_phone ? `Phone: ${data.emergency_contact_phone}` : ''}
${data.emergency_contact_relationship ? `Relationship: ${data.emergency_contact_relationship}` : ''}` : ''}`
      };

    // ===== FAQ NOTIFICATIONS =====
    case "faq_unanswered":
      return {
        subject: "New Question Needs an Answer - AWKN Ranch",
        html: `
          <h2>New Unanswered Question</h2>
          <p>Someone asked a question that our AI assistant couldn't confidently answer:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; font-style: italic;">"${data.question}"</p>
          </div>
          ${data.user_email && data.user_email !== 'Not provided' ? `<p><strong>User email for follow-up:</strong> <a href="mailto:${data.user_email}">${data.user_email}</a></p>` : ''}
          <p>Add an answer to improve our knowledge base:</p>
          <p style="margin: 20px 0;">
            <a href="${data.faq_admin_url}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Answer This Question</a>
          </p>
          <p style="color: #666; font-size: 14px;">After answering, remember to recompile the context so future visitors get better responses.</p>
        `,
        text: `New Unanswered Question

Someone asked a question that our AI assistant couldn't confidently answer:

"${data.question}"

${data.user_email && data.user_email !== 'Not provided' ? `User email for follow-up: ${data.user_email}` : ''}

Add an answer to improve our knowledge base:
${data.faq_admin_url}

After answering, remember to recompile the context so future visitors get better responses.`
      };

    // ===== CONTACT FORM =====
    case "contact_form":
      return {
        subject: `[Website Contact] ${data.subject || 'General Inquiry'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; margin-bottom: 4px;">${data.name || 'Someone'} submitted a message from awknranch.com</h2>
            <p style="color: #888; font-size: 13px; margin-top: 0;">${data.subject || 'General Inquiry'}</p>
            ${dataTable([
              { label: 'Name', value: data.name || 'Not provided' },
              ...(data.email ? [{ label: 'Email', value: `<a href="mailto:${data.email}" style="color: #2563eb;">${data.email}</a>` }] : []),
              ...(data.phone ? [{ label: 'Phone', value: `<a href="tel:${data.phone}" style="color: #2563eb;">${data.phone}</a>` }] : []),
            ])}
            ${data.message ? `
            <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 16px 0; white-space: pre-wrap; line-height: 1.5; color: #333;">${data.message}</div>
            ` : ''}
            ${data.email ? `<p style="margin-top: 20px;"><a href="mailto:${data.email}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; font-size: 14px;">Reply to ${data.name || data.email}</a></p>` : ''}
          </div>
        `,
        text: `${data.name || 'Someone'} submitted a message from awknranch.com

Name: ${data.name || 'Not provided'}
Email: ${data.email || 'Not provided'}
Phone: ${data.phone || 'Not provided'}
Subject: ${data.subject || 'General Inquiry'}

Message:
${data.message || 'No message'}`
      };

    // ===== ACCESS REQUEST =====
    case "access_request":
      return {
        subject: `[Access Request] ${data.user_name} → ${data.page_name}`,
        html: `
          <h2 style="color: #333;">Access Request</h2>
          <p><strong>${data.user_name}</strong> (${data.user_role}) is requesting access to a page they can't reach.</p>
          ${dataTable([
            { label: 'Name', value: data.user_name },
            { label: 'Email', value: `<a href="mailto:${data.user_email}">${data.user_email}</a>` },
            { label: 'Role', value: data.user_role },
            { label: 'Page', value: `<a href="${data.page_url}">${data.page_name}</a>` },
          ])}
          ${data.message ? `<div style="background: #f8f9fa; padding: 16px; border-radius: 8px; border-left: 4px solid #d4883a; margin: 16px 0; white-space: pre-wrap;">${data.message}</div>` : ''}
          <p style="margin-top: 20px;"><a href="https://laurenbur2.github.io/awkn-ranch/spaces/admin/users.html" style="background: #d4883a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">Manage Users</a></p>
        `,
        text: `Access Request

${data.user_name} (${data.user_role}) is requesting access.

Name: ${data.user_name}
Email: ${data.user_email}
Role: ${data.user_role}
Page: ${data.page_name}
URL: ${data.page_url}
${data.message ? `\nMessage: ${data.message}` : ''}

Manage users: https://laurenbur2.github.io/awkn-ranch/spaces/admin/users.html`
      };

    // ===== COMMUNITY FIT INQUIRY =====
    case "community_fit_inquiry":
      return {
        subject: `[Community Fit] ${data.name || 'New Inquiry'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; margin-bottom: 4px;">${data.name || 'Someone'} submitted an inquiry from awknranch.com</h2>
            <p style="color: #888; font-size: 13px; margin-top: 0;">Community Fit Inquiry</p>

            ${dataTable([
              { label: 'Name', value: data.name || 'Not provided' },
              ...(data.email ? [{ label: 'Email', value: `<a href="mailto:${data.email}" style="color: #2563eb;">${data.email}</a>` }] : []),
              ...(data.phone ? [{ label: 'Phone', value: `<a href="tel:${data.phone}" style="color: #2563eb;">${data.phone}</a>` }] : []),
              ...(data.dob ? [{ label: 'DOB', value: data.dob }] : []),
              { label: 'Accommodation', value: data.accommodation || 'Not specified' },
              { label: 'Timeframe', value: data.timeframe || 'Not specified' },
              { label: 'Volunteer', value: data.volunteer || 'Not specified' },
              { label: 'Referral', value: data.referral || 'Not specified' },
            ])}

            ${data.coliving_experience ? `
            <h3 style="color: #555; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 8px;">Co-living Experience</h3>
            <div style="background: #f8f9fa; padding: 14px 16px; border-radius: 8px; line-height: 1.5; color: #333;">${data.coliving_experience}</div>
            ` : ''}

            ${data.life_focus ? `
            <h3 style="color: #555; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 8px;">Life Focus / Goals</h3>
            <div style="background: #f8f9fa; padding: 14px 16px; border-radius: 8px; line-height: 1.5; color: #333;">${data.life_focus}</div>
            ` : ''}

            ${data.visiting_guide ? `
            <h3 style="color: #555; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 8px;">Visiting Guide Response</h3>
            <div style="background: #f8f9fa; padding: 14px 16px; border-radius: 8px; line-height: 1.5; color: #333;">${data.visiting_guide}</div>
            ` : ''}

            ${data.photo_url ? `
            <h3 style="color: #555; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin: 24px 0 8px;">Photo</h3>
            <img src="${data.photo_url}" style="max-width: 200px; border-radius: 8px; border: 1px solid #eee;" />
            ` : ''}

            <p style="margin-top: 24px;"><a href="https://laurenbur2.github.io/awkn-ranch/spaces/admin/rentals.html" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; font-size: 14px;">View in Rentals Pipeline</a></p>
          </div>
        `,
        text: `${data.name || 'Someone'} submitted an inquiry from awknranch.com

Name: ${data.name || 'Not provided'}
Email: ${data.email || 'Not provided'}
Phone: ${data.phone || 'Not provided'}
DOB: ${data.dob || 'Not provided'}
Accommodation: ${data.accommodation || 'Not specified'}
Timeframe: ${data.timeframe || 'Not specified'}
Volunteer: ${data.volunteer || 'Not specified'}
Referral: ${data.referral || 'Not specified'}

Co-living Experience:
${data.coliving_experience || 'Not provided'}

Life Focus / Goals:
${data.life_focus || 'Not provided'}

Visiting Guide Response:
${data.visiting_guide || 'Not provided'}

${data.photo_url ? `Photo: ${data.photo_url}` : ''}`
      };

    // ===== COMMUNITY FIT CONFIRMATION (to applicant) =====
    case "community_fit_confirmation":
      return {
        subject: `Thanks for your inquiry, ${data.name || 'there'}!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; margin-bottom: 8px;">We got your inquiry!</h2>
            <p style="color: #555; line-height: 1.6;">Hi ${data.name || 'there'},</p>
            <p style="color: #555; line-height: 1.6;">Thanks for reaching out about living at the AWKN Ranch. We're excited that you're interested in our community!</p>

            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
              <p style="margin: 0 0 8px; color: #333; font-weight: 600;">What you submitted:</p>
              <p style="margin: 0 0 4px; color: #555;">Accommodation: <strong>${data.accommodation || 'Flexible'}</strong></p>
              <p style="margin: 0; color: #555;">Timeframe: <strong>${data.timeframe || 'Not specified'}</strong></p>
            </div>

            <p style="color: #555; line-height: 1.6;">Our team will review your inquiry and get back to you soon. In the meantime, feel free to reply to this email if you have any questions.</p>

            <p style="color: #555; line-height: 1.6;">We look forward to getting to know you!</p>
          </div>
        `,
        text: `Hi ${data.name || 'there'},

Thanks for reaching out about living at the AWKN Ranch. We're excited that you're interested in our community!

What you submitted:
- Accommodation: ${data.accommodation || 'Flexible'}
- Timeframe: ${data.timeframe || 'Not specified'}

Our team will review your inquiry and get back to you soon. In the meantime, feel free to reply to this email if you have any questions.

We look forward to getting to know you!`
      };

    // ===== BUG REPORT NOTIFICATIONS =====
    case "bug_report_received":
      return {
        subject: `Bug by ${data.reporter_name || 'Unknown'}: ${(data.description || '').replace(/[\r\n]+/g, ' ').substring(0, 50)}`,
        html: `
          <h2 style="color: #2980b9;">Bug Report Received</h2>
          <p>Hi ${data.reporter_name},</p>
          <p>We've received your bug report and our automated system is working on a fix right now.</p>

          <h3>Your Report</h3>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 8px;">${data.description}</p>
          ${data.page_url ? `<p><strong>Page:</strong> <a href="${data.page_url}">${data.page_url}</a></p>` : ''}

          ${data.screenshot_url ? `
          <h3>Your Screenshot</h3>
          <p><img src="${data.screenshot_url}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;" alt="Bug screenshot"></p>
          ` : ''}

          <p style="color: #666; font-size: 13px; margin-top: 20px;">You'll receive another email when the fix is deployed or if we need to escalate to a human.</p>
        `,
        text: `Bug Report Received

Hi ${data.reporter_name},

We've received your bug report and our automated system is working on a fix right now.

YOUR REPORT:
${data.description}
${data.page_url ? `Page: ${data.page_url}` : ''}

You'll receive another email when the fix is deployed or if we need to escalate to a human.`
      };

    case "bug_report_fixed":
      return {
        subject: `Re: Bug by ${data.reporter_name || 'Unknown'}: ${(data.description || '').replace(/[\r\n]+/g, ' ').substring(0, 50)}`,
        html: `
          <h2 style="color: #27ae60;">Bug Fixed!</h2>
          <p>Hi ${data.reporter_name},</p>
          <p>Your bug report has been automatically fixed and deployed.</p>

          <h3>Your Report</h3>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 8px;">${data.description}</p>
          ${data.page_url ? `<p><strong>Page:</strong> <a href="${data.page_url}">${data.page_url}</a></p>` : ''}

          ${data.screenshot_url ? `
          <h3>Your Screenshot</h3>
          <p><img src="${data.screenshot_url}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;" alt="Bug screenshot"></p>
          ` : ''}

          <h3>What Was Fixed</h3>
          <p style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">${data.fix_summary || 'The issue has been resolved.'}</p>

          ${data.fix_commit_sha ? `<p><strong>Commit:</strong> <a href="https://github.com/USERNAME/REPO/commit/${data.fix_commit_sha}">${data.fix_commit_sha.substring(0, 7)}</a></p>` : ''}

          <p>The fix is live now. Please verify at:<br>
          <a href="${data.page_url || 'https://USERNAME.github.io/REPO/spaces/'}" style="background: #27ae60; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 8px;">View Live Site</a></p>

          <p style="color: #666; font-size: 13px; margin-top: 20px;">If the fix doesn't look right, submit another bug report and we'll take another look.</p>
        `,
        text: `Bug Fixed!

Hi ${data.reporter_name},

Your bug report has been automatically fixed and deployed.

YOUR REPORT:
${data.description}
${data.page_url ? `Page: ${data.page_url}` : ''}

WHAT WAS FIXED:
${data.fix_summary || 'The issue has been resolved.'}

${data.fix_commit_sha ? `Commit: https://github.com/USERNAME/REPO/commit/${data.fix_commit_sha}` : ''}

The fix is live now. Please verify at:
${data.page_url || 'https://USERNAME.github.io/REPO/spaces/'}

If the fix doesn't look right, submit another bug report and we'll take another look.`
      };

    case "bug_report_failed":
      return {
        subject: `Re: Bug by ${data.reporter_name || 'Unknown'}: ${(data.description || '').replace(/[\r\n]+/g, ' ').substring(0, 50)}`,
        html: `
          <h2 style="color: #e67e22;">Bug Report Update</h2>
          <p>Hi ${data.reporter_name},</p>
          <p>We received your bug report but the automated fix was not successful. A human will take a look.</p>

          <h3>Your Report</h3>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 8px;">${data.description}</p>
          ${data.page_url ? `<p><strong>Page:</strong> <a href="${data.page_url}">${data.page_url}</a></p>` : ''}

          ${data.screenshot_url ? `
          <h3>Your Screenshot</h3>
          <p><img src="${data.screenshot_url}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;" alt="Bug screenshot"></p>
          ` : ''}

          ${data.error_message ? `
          <h3>What Went Wrong</h3>
          <p style="background: #fef3e2; padding: 15px; border-radius: 8px; border-left: 4px solid #e67e22;">${data.error_message}</p>
          ` : ''}

          <p>We'll review this manually and follow up. Thank you for reporting!</p>
        `,
        text: `Bug Report Update

Hi ${data.reporter_name},

We received your bug report but the automated fix was not successful. A human will take a look.

YOUR REPORT:
${data.description}
${data.page_url ? `Page: ${data.page_url}` : ''}

${data.error_message ? `WHAT WENT WRONG:\n${data.error_message}` : ''}

We'll review this manually and follow up. Thank you for reporting!`
      };

    case "bug_report_verified":
      return {
        subject: `Re: Bug by ${data.reporter_name || 'Unknown'}: ${(data.description || '').replace(/[\r\n]+/g, ' ').substring(0, 50)}`,
        html: `
          <h2 style="color: #27ae60;">Screenshot of the Fix</h2>
          <p>Hi ${data.reporter_name},</p>
          <p>Here's a screenshot of the page after the fix was deployed:</p>

          ${data.verification_screenshot_url ? `
          <p><img src="${data.verification_screenshot_url}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 4px;" alt="Screenshot after fix"></p>
          ` : ''}

          ${data.page_url ? `<p><strong>Page:</strong> <a href="${data.page_url}">${data.page_url}</a></p>` : ''}

          ${data.fix_summary ? `
          <h3>What Was Fixed</h3>
          <p style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">${data.fix_summary}</p>
          ` : ''}

          <p style="color: #666; font-size: 13px; margin-top: 20px;">If the fix doesn't look right, submit another bug report and we'll take another look.</p>
        `,
        text: `Screenshot of the Fix

Hi ${data.reporter_name},

Here's a screenshot of the page after the fix was deployed.

${data.page_url ? `Page: ${data.page_url}` : ''}

${data.fix_summary ? `WHAT WAS FIXED:\n${data.fix_summary}` : ''}

If the fix doesn't look right, submit another bug report and we'll take another look.`
      };

    // ===== FEATURE BUILDER =====
    case "feature_review": {
      const riskAss = data.risk_assessment || {};
      const filesStr = (data.files_created || []).join(', ');
      const filesModStr = (data.files_modified || []).join(', ');
      const compareUrl = data.branch_name ? `https://github.com/USERNAME/REPO/compare/${data.branch_name}` : '';
      return {
        subject: `PAI Feature Review: ${(data.description || 'New Feature').substring(0, 60)}`,
        html: `
          <h2 style="color: #e67e22;">Feature Ready for Review</h2>
          <p><strong>${data.requester_name}</strong> (${data.requester_role}) asked PAI to build:</p>
          <p style="background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #e67e22;">${data.description}</p>

          <h3>Build Summary</h3>
          <p>${data.build_summary || 'No summary available.'}</p>

          ${filesStr ? `<p><strong>Files created:</strong> ${filesStr}</p>` : ''}
          ${filesModStr ? `<p><strong>Files modified:</strong> <span style="color: #e74c3c;">${filesModStr}</span></p>` : ''}
          ${data.branch_name ? `<p><strong>Branch:</strong> <code>${data.branch_name}</code></p>` : ''}

          ${dataTable([
            { label: 'Reason', value: riskAss.reason || 'N/A' },
            { label: 'Touches existing functionality', value: riskAss.touches_existing_functionality ? 'Yes' : 'No' },
            { label: 'Could confuse users', value: riskAss.could_confuse_users ? 'Yes' : 'No' },
            { label: 'Removes or changes features', value: riskAss.removes_or_changes_features ? 'Yes' : 'No' },
          ], { heading: 'Risk Assessment' })}

          ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}

          <div style="margin: 20px 0;">
            <a href="https://laurenbur2.github.io/awkn-ranch/spaces/admin/appdev.html" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 10px;">Review in App Dev Console</a>
            ${compareUrl ? `<a href="${compareUrl}" style="background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">View Diff on GitHub</a>` : ''}
          </div>

          <p style="color: #666; font-size: 13px; margin-top: 20px;">
            <strong>To deploy:</strong> click "Approve &amp; Merge" in the App Dev console, or merge the branch manually on GitHub.<br>
            <strong>To reject:</strong> delete the branch on GitHub.
          </p>
        `,
        text: `PAI Feature Ready for Review

${data.requester_name} (${data.requester_role}) asked PAI to build:
${data.description}

BUILD SUMMARY:
${data.build_summary || 'No summary available.'}

${filesStr ? `Files created: ${filesStr}` : ''}
${filesModStr ? `Files modified: ${filesModStr}` : ''}
${data.branch_name ? `Branch: ${data.branch_name}` : ''}

RISK ASSESSMENT:
- Reason: ${riskAss.reason || 'N/A'}
- Touches existing functionality: ${riskAss.touches_existing_functionality ? 'Yes' : 'No'}
- Could confuse users: ${riskAss.could_confuse_users ? 'Yes' : 'No'}
- Removes or changes features: ${riskAss.removes_or_changes_features ? 'Yes' : 'No'}

${data.notes ? `Notes: ${data.notes}` : ''}

Review in App Dev Console: https://laurenbur2.github.io/awkn-ranch/spaces/admin/appdev.html
${compareUrl ? `View diff: ${compareUrl}` : ''}

To deploy: click "Approve & Merge" in the App Dev console, or merge the branch manually on GitHub.
To reject: delete the branch on GitHub.`
      };
    }

    // ===== CLAUDERO AI DEVELOPER =====
    case "claudero_feature_complete": {
      const cFilesStr = (data.files_created || []).join(', ');
      const cFilesModStr = (data.files_modified || []).join(', ');
      const cRisk = data.risk_assessment || {};
      const isReview = data.deploy_decision === 'branched_for_review';
      const isAdminApproved = data.deploy_decision === 'admin_approved';
      const compareUrl = data.branch_name ? `https://github.com/USERNAME/REPO/compare/${data.branch_name}` : '';
      const pageUrl = data.page_url ? `https://laurenbur2.github.io/awkn-ranch${data.page_url}` : '';

      return {
        senderType: 'claudero',
        subject: isReview
          ? `Feature Ready for Review: ${(data.build_summary || data.description || 'New Feature').substring(0, 55)}`
          : `Feature Built: ${(data.build_summary || data.description || 'New Feature').substring(0, 55)}`,
        html: `
          <h2 style="margin-top:0;">Hey ${data.requester_name || 'there'},</h2>
          <p>${isReview
            ? "I've finished building your feature, but it needs a human review before going live."
            : "Good news — I've built and deployed your feature. It's live now."
          }</p>

          <h3>What you asked for</h3>
          <p style="background: #f8f5f0; padding: 15px; border-radius: 8px; border-left: 4px solid #d4883a;">${data.description || ''}</p>

          <h3>What I built</h3>
          <p>${data.build_summary || 'Feature implemented as requested.'}</p>

          ${data.design_outline ? `<h3>Design</h3><p>${data.design_outline}</p>` : ''}

          ${data.testing_instructions ? `
            <h3>How to test</h3>
            <p>${data.testing_instructions}</p>
          ` : ''}

          ${cFilesStr ? `<p><strong>Files created:</strong> <code>${cFilesStr}</code></p>` : ''}
          ${cFilesModStr ? `<p><strong>Files modified:</strong> <code>${cFilesModStr}</code></p>` : ''}

          <h3>Build details</h3>
          <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
            ${data.commit_sha ? `<tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Commit</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;"><code>${data.commit_sha.substring(0, 8)}</code></td></tr>` : ''}
            ${data.branch_name ? `<tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Branch</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;"><code>${data.branch_name}</code></td></tr>` : ''}
            <tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Deploy</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${isReview ? 'Branched for review' : isAdminApproved ? 'Admin approved & merged' : 'Auto-merged to main'}</td></tr>
            ${data.version ? `<tr><td style="padding: 6px 12px; border: 1px solid #ddd;"><strong>Version</strong></td><td style="padding: 6px 12px; border: 1px solid #ddd;">${data.version}</td></tr>` : ''}
          </table>

          ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}

          <div style="margin: 20px 0;">
            ${pageUrl && !isReview ? `<a href="${pageUrl}" style="background: #d4883a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 10px;">View Live Page</a>` : ''}
            ${compareUrl && isReview ? `<a href="${compareUrl}" style="background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Review on GitHub</a>` : ''}
          </div>

          ${isReview ? `
            <p style="color: #666; font-size: 13px;">
              <strong>To deploy:</strong> merge the branch to main and push.<br>
              <strong>To reject:</strong> delete the branch on GitHub.
            </p>
          ` : ''}

          <p style="color: #666; font-size: 13px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
            Reply to this email to request changes or provide feedback — I'll pick up right where I left off with the context from this build.
          </p>
        `,
        text: `Hey ${data.requester_name || 'there'},

${isReview
  ? "I've finished building your feature, but it needs a human review before going live."
  : "Good news — I've built and deployed your feature. It's live now."
}

WHAT YOU ASKED FOR:
${data.description || ''}

WHAT I BUILT:
${data.build_summary || 'Feature implemented as requested.'}
${data.design_outline ? `\nDESIGN:\n${data.design_outline}` : ''}
${data.testing_instructions ? `\nHOW TO TEST:\n${data.testing_instructions}` : ''}

${cFilesStr ? `Files created: ${cFilesStr}` : ''}
${cFilesModStr ? `Files modified: ${cFilesModStr}` : ''}

BUILD DETAILS:
${data.commit_sha ? `- Commit: ${data.commit_sha.substring(0, 8)}` : ''}
${data.branch_name ? `- Branch: ${data.branch_name}` : ''}
- Deploy: ${isReview ? 'Branched for review' : 'Auto-merged to main'}
${data.version ? `- Version: ${data.version}` : ''}
${data.notes ? `\nNotes: ${data.notes}` : ''}
${pageUrl && !isReview ? `\nLive page: ${pageUrl}` : ''}
${compareUrl && isReview ? `\nReview: ${compareUrl}` : ''}

Reply to this email to request changes or provide feedback — I'll pick up right where I left off.`
      };
    }

    // ===== IDENTITY VERIFICATION =====
    case "dl_upload_link":
      return {
        subject: "Action Required: Identity Verification - AWKN Ranch",
        html: `
          <h2>Identity Verification Required</h2>
          <p>Hi ${data.first_name},</p>
          <p>As part of your rental application, we need to verify your identity. Please upload a clear photo of your driver's license or state ID or other valid government ID.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.upload_url}" style="background: #3d8b7a; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 1.1em; display: inline-block;">Upload Your ID</a>
          </div>
          <p style="color: #666; font-size: 0.9em;">This link will expire in 7 days. If you need a new link, please let us know.</p>
          <p><strong>Tips for a good photo:</strong></p>
          <ul>
            <li>Use good lighting - avoid glare and shadows</li>
            <li>Make sure all text is readable</li>
            <li>Include the full card in the frame</li>
          </ul>
          <p>If you have any questions, feel free to reply to this email.</p>
        `,
        text: `Identity Verification Required

Hi ${data.first_name},

As part of your rental application, we need to verify your identity. Please upload a clear photo of your driver's license or state ID or other valid government ID.

Upload your ID here: ${data.upload_url}

This link will expire in 7 days. If you need a new link, please let us know.

Tips for a good photo:
- Use good lighting - avoid glare and shadows
- Make sure all text is readable
- Include the full card in the frame

If you have any questions, feel free to reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "dl_verified":
      return {
        subject: "Identity Verified - AWKN Ranch",
        html: `
          <h2 style="color: #27ae60;">Identity Verified!</h2>
          <p>Hi ${data.first_name},</p>
          <p>Your identity has been successfully verified. Thank you for completing this step!</p>
          <p>We'll continue processing your rental application and will be in touch with next steps soon.</p>
          <p>If you have any questions, feel free to reply to this email.</p>
        `,
        text: `Identity Verified!

Hi ${data.first_name},

Your identity has been successfully verified. Thank you for completing this step!

We'll continue processing your rental application and will be in touch with next steps soon.

If you have any questions, feel free to reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    case "dl_mismatch":
      return {
        subject: `Identity Verification Flagged: ${data.applicant_name}`,
        html: `
          <h2 style="color: #e67e22;">Identity Verification Flagged</h2>
          <p>An identity verification needs your review.</p>
          ${dataTable([
            { label: 'Application Name', value: data.applicant_name },
            { label: 'Name on ID', value: data.extracted_name || 'Could not extract' },
            { label: 'Match Score', value: `${data.match_score}%` },
            ...(data.is_expired ? [{ label: 'Note', value: 'ID appears to be expired', valueStyle: `color:${B.danger}` }] : []),
          ])}
          <p><a href="${data.admin_url}" style="background: #3d8b7a; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Review in Admin</a></p>
        `,
        text: `Identity Verification Flagged

An identity verification needs your review.

Application Name: ${data.applicant_name}
Name on ID: ${data.extracted_name || 'Could not extract'}
Match Score: ${data.match_score}%
${data.is_expired ? 'Note: ID appears to be expired' : ''}

Review in Admin: ${data.admin_url}`
      };

    // ===== W-9 TAX FORM =====
    case "w9_request":
      return {
        subject: "Action Required: W-9 Tax Form - AWKN Ranch",
        html: `
          <h2 style="margin:0 0 8px;font-size:22px;">W-9 Tax Form Required</h2>
          <p>Hi ${data.first_name},</p>
          <p>As part of your work arrangement with AWKN Ranch, we need you to complete a W-9 tax form. The IRS requires this from anyone we pay $600 or more in a calendar year.</p>

          <div style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;padding:20px 24px;margin:20px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#2a1f23;">You will need:</p>
            <ul style="margin:0;padding-left:20px;color:#2a1f23;">
              <li style="margin-bottom:6px;">Your legal name (as shown on your income tax return)</li>
              <li style="margin-bottom:6px;">Your Social Security Number (SSN) or Employer ID Number (EIN)</li>
              <li>Your current mailing address</li>
            </ul>
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;text-align:center;">
            <tr>
              <td style="background:#d4883a;border-radius:8px;box-shadow:0 2px 8px rgba(212,136,58,0.30);">
                <a href="${data.w9_url}" style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.02em;" target="_blank">Complete W-9 Form</a>
              </td>
            </tr>
          </table>

          <div style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#7d6f74;line-height:1.5;">
              &#128274; Your tax information is encrypted with AES-256 encryption. Only the last 4 digits of your SSN/EIN are visible to administrators.
            </p>
          </div>

          <p style="font-size:14px;color:#7d6f74;">This link will expire in 7 days. If you need a new link, please let us know.</p>
          <p>If you have any questions, feel free to reply to this email.</p>
        `,
        text: `W-9 Tax Form Required

Hi ${data.first_name},

As part of your work arrangement with AWKN Ranch, we need you to complete a W-9 tax form. The IRS requires this from anyone we pay $600 or more in a calendar year.

You will need:
- Your legal name (as shown on your income tax return)
- Your Social Security Number (SSN) or Employer ID Number (EIN)
- Your current mailing address

Complete your W-9 form here: ${data.w9_url}

Your tax information is encrypted with AES-256 encryption. Only the last 4 digits of your SSN/EIN are visible to administrators.

This link will expire in 7 days. If you need a new link, please let us know.

If you have any questions, feel free to reply to this email.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };

    // ===== PAI EMAIL =====
    case "pai_email_reply":
      return {
        subject: `Re: ${data.original_subject || 'Your message to PAI'}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1a1a2e; padding: 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: #e0d68a; margin: 0;">PAI</h2>
              <p style="color: #aaa; margin: 4px 0 0 0; font-size: 13px;">Prompt Property Intelligence</p>
            </div>
            <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0; border-top: none;">
              <div style="white-space: pre-wrap; line-height: 1.6;">${data.reply_body || ''}</div>
              ${data.original_body ? `
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 16px;">
              <p style="color: #888; font-size: 12px; margin-bottom: 8px;">Your original message:</p>
              <div style="color: #999; font-size: 13px; border-left: 3px solid #ddd; padding-left: 12px;">${data.original_body}</div>
              ` : ''}
            </div>
            ${data.pai_art_url ? `
            <div style="border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px; overflow: hidden;">
              <img src="${data.pai_art_url}" alt="PAI - Prompt Property Intelligence" style="width: 100%; height: auto; display: block;" />
            </div>
            ` : '<div style="border-radius: 0 0 12px 12px; height: 4px; background: #1a1a2e;"></div>'}
            <p style="color: #999; font-size: 11px; text-align: center; margin-top: 12px;">
              This is an automated reply from PAI at AWKN Ranch. Reply to this email to continue the conversation.
            </p>
          </div>
        `,
        text: `PAI - Prompt Property Intelligence

${data.reply_body || ''}

${data.original_body ? `---\nYour original message:\n${data.original_body}` : ''}

This is an automated reply from PAI at AWKN Ranch.`
      };

    case "pai_document_received": {
      const fileList = (data.files || []).map((f: any) => `• ${f.name} (${f.type}, ${f.size})`).join('\n');
      const fileListHtml = (data.files || []).map((f: any) => `<li><strong>${f.name}</strong> (${f.type}, ${f.size})</li>`).join('');
      return {
        subject: `PAI Document Upload: ${data.file_count || 1} file(s) from ${data.sender_name || data.sender_email}`,
        html: `
          <h2 style="color: #3d8b7a;">Document Received via PAI Email</h2>
          <p><strong>${data.sender_name || 'Unknown'}</strong> (${data.sender_email}) sent ${data.file_count || 1} document(s) to <code>pai@awknranch.com</code>.</p>

          <div style="background: #f0faf7; padding: 15px; border-radius: 8px; border-left: 4px solid #3d8b7a; margin: 15px 0;">
            <strong>Subject:</strong> ${data.original_subject || '(none)'}<br>
            ${data.message_body ? `<strong>Message:</strong> ${data.message_body.substring(0, 500)}` : ''}
          </div>

          <h3>Uploaded Files</h3>
          <ul>${fileListHtml}</ul>

          <p>Files have been uploaded to R2 and added to the <strong>document index</strong> as <strong>inactive</strong> (pending admin review).</p>
          <p><a href="${data.admin_url || 'https://laurenbur2.github.io/awkn-ranch/spaces/admin/manage.html'}" style="background: #3d8b7a; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Review in Admin</a></p>
        `,
        text: `PAI Document Upload

${data.sender_name || 'Unknown'} (${data.sender_email}) sent ${data.file_count || 1} document(s) to pai@awknranch.com.

Subject: ${data.original_subject || '(none)'}
${data.message_body ? `Message: ${data.message_body.substring(0, 500)}` : ''}

Files:
${fileList}

Files have been uploaded to R2 and added to the document index as inactive (pending admin review).`
      };
    }

    case "waiver_confirmation": {
      const sigDate = data.signing_date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return {
        subject: "Waiver Signed \u2014 AWKN Ranch",
        html: `
          <h2 style="color: #3d8b7a;">Waiver Signed Successfully</h2>
          <p>Hi <strong>${data.signer_name}</strong>,</p>
          <p>This confirms that you have electronically signed the <strong>Waiver of Liability, Assumption of Risk, and Indemnity Agreement</strong> for the AWKN Ranch.</p>

          <div style="background: #f0faf7; padding: 15px; border-radius: 8px; border-left: 4px solid #3d8b7a; margin: 15px 0;">
            <strong>Name:</strong> ${data.signer_name}<br>
            <strong>Date:</strong> ${sigDate}<br>
            ${data.confirmation_ref ? `<strong>Reference:</strong> ${data.confirmation_ref}` : ''}
          </div>

          <p>Thank you for signing. If you have any questions about the property or your visit, feel free to reply to this email or contact us at <a href="tel:+17377474737">(737) 747-4737</a>.</p>
        `,
        text: `Waiver Signed Successfully

Hi ${data.signer_name},

This confirms that you have electronically signed the Waiver of Liability, Assumption of Risk, and Indemnity Agreement for the AWKN Ranch.

Name: ${data.signer_name}
Date: ${sigDate}
${data.confirmation_ref ? `Reference: ${data.confirmation_ref}` : ''}

Thank you for signing. If you have any questions, contact us at (737) 747-4737.`
      };
    }

    case "work_photo_reminder": {
      const phase = data.phase || 'clock_in'; // 'clock_in' or 'clock_out'
      const isClockIn = phase === 'clock_in';
      const photoType = isClockIn ? '"Before"' : '"After"';
      const suggestion = isClockIn
        ? 'a quick "before" photo of the space before you start working'
        : 'an "after" photo showing your completed work';
      const workPageUrl = 'https://laurenbur2.github.io/awkn-ranch/associates/worktracking.html';
      return {
        subject: `Reminder: Upload ${isClockIn ? 'Before' : 'After'} Photos for Your Work Session`,
        html: `
          <h2>Work Photo Reminder</h2>
          <p>Hi ${data.first_name},</p>
          <p>You recently ${isClockIn ? 'clocked in' : 'clocked out'}${data.space_name ? ` at <strong>${data.space_name}</strong>` : ''} but we noticed you haven't uploaded any ${photoType} photos yet.</p>
          <p>If relevant to your task, consider uploading ${suggestion}. Work photos help track progress and quality.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${workPageUrl}" style="display: inline-block; background: #3d8b7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Upload Photos</a>
          </div>
          <p style="color: #666; font-size: 0.9em;">This is just a friendly nudge — no photos are required if they aren't relevant to the task.</p>
        `,
        text: `Work Photo Reminder

Hi ${data.first_name},

You recently ${isClockIn ? 'clocked in' : 'clocked out'}${data.space_name ? ` at ${data.space_name}` : ''} but we noticed you haven't uploaded any ${photoType} photos yet.

If relevant to your task, consider uploading ${suggestion}. Work photos help track progress and quality.

Upload photos: ${workPageUrl}

This is just a friendly nudge — no photos are required if they aren't relevant to the task.

Yours generatively,
PAI
the AWKN Ranch property AI agent`
      };
    }

    case "work_clockin_summary": {
      const tasks = data.tasks || [];
      const pLabels: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
      const pColors: Record<number, string> = { 1: '#dc2626', 2: '#ea580c', 3: '#ca8a04', 4: '#2563eb' };

      const taskRows = tasks.length > 0
        ? tasks.map((t: any) => {
            const p = t.priority ? Number(t.priority) : 0;
            const badge = p ? `<span style="display:inline-block;background:${pColors[p] || '#9ca3af'};color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;margin-right:6px;">${pLabels[p] || ''}</span>` : '';
            const loc = t.location ? ` <span style="color:#7d6f74;font-size:12px;">(${t.location})</span>` : '';
            return `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${badge}<strong>${t.title}</strong>${loc}${t.notes ? `<br><span style="color:#7d6f74;font-size:12px;">${t.notes}</span>` : ''}</td></tr>`;
          }).join('')
        : '<tr><td style="padding:6px 0;color:#7d6f74;">No open tasks — you\'re all caught up!</td></tr>';

      return {
        subject: `Clocked In — ${data.first_name}${data.space_name ? ` at ${data.space_name}` : ''} (${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`,
        html: `
          <h2 style="margin:0 0 4px;">You're Clocked In</h2>
          <p style="margin:0 0 20px;color:#7d6f74;font-size:14px;">${data.first_name} clocked in at ${data.clock_in_time}${data.space_name ? ` — ${data.space_name}` : ''}.</p>

          <p style="margin:0 0 8px;font-weight:600;font-size:16px;">📋 Your Task List</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 20px;">
            <tr><td style="padding:12px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${taskRows}
              </table>
            </td></tr>
          </table>

          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:0 0 20px;text-align:center;">
            <p style="margin:0;font-weight:700;color:#92400e;font-size:15px;">📸 Before Photos Required</p>
            <p style="margin:8px 0 12px;color:#92400e;font-size:13px;">Take a photo of the work area before you start.</p>
            <a href="https://laurenbur2.github.io/awkn-ranch/associates/worktracking.html" style="display:inline-block;background:#3d8b7a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Upload Photos</a>
          </div>

          <p style="margin:16px 0 0;color:#7d6f74;font-size:13px;">This is an automated clock-in summary from AWKN Ranch work tracking.</p>
        `,
        text: `You're Clocked In

${data.first_name} clocked in at ${data.clock_in_time}${data.space_name ? ` — ${data.space_name}` : ''}.

YOUR TASK LIST:
${tasks.length > 0 ? tasks.map((t: any) => `• ${t.title}${t.location ? ` (${t.location})` : ''}${t.notes ? ` — ${t.notes}` : ''}`).join('\n') : 'No open tasks — you\'re all caught up!'}

BEFORE PHOTOS REQUIRED
Take a photo of the work area before you start.
Upload: https://laurenbur2.github.io/awkn-ranch/associates/worktracking.html

This is an automated clock-in summary from AWKN Ranch work tracking.`,
      };
    }

    case "work_checkout_summary": {
      const photos = data.photos || [];
      const beforePhotos = photos.filter((p: any) => p.type === 'before');
      const progressPhotos = photos.filter((p: any) => p.type === 'progress');
      const afterPhotos = photos.filter((p: any) => p.type === 'after');

      const photoSection = (label: string, items: any[]) => {
        if (items.length === 0) return '';
        return `
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0 0 8px;font-weight:600;font-size:14px;color:#2a1f23;">${label} Photos</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${items.map((p: any) => `
                    <td style="width:${Math.floor(100 / Math.min(items.length, 3))}%;padding:0 4px 4px 0;vertical-align:top;">
                      <img src="${p.url}" alt="${p.caption || label}" width="170" style="display:block;width:100%;max-width:170px;height:auto;border-radius:6px;border:1px solid #e6e2d9;" />
                      ${p.caption ? `<p style="margin:4px 0 0;font-size:11px;color:#7d6f74;">${p.caption}</p>` : ''}
                    </td>
                  `).join('')}
                </tr>
              </table>
            </td>
          </tr>`;
      };

      const hasPhotos = photos.length > 0;

      return {
        subject: `Work Session Summary — ${data.first_name} (${data.date})`,
        html: `
          <h2 style="margin:0 0 4px;">Work Session Complete</h2>
          <p style="margin:0 0 20px;color:#7d6f74;font-size:14px;">${data.first_name} has clocked out.</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 20px;">
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:0 0 8px;"><strong>Date:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.date}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 8px;"><strong>Clock In:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.clock_in_time}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 8px;"><strong>Clock Out:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.clock_out_time}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 8px;"><strong>Duration:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.duration}</td>
                  </tr>
                  ${data.space_name ? `<tr>
                    <td style="padding:0 0 8px;"><strong>Location:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.space_name}</td>
                  </tr>` : ''}
                  ${data.task_name ? `<tr>
                    <td style="padding:0 0 8px;"><strong>Task:</strong></td>
                    <td style="padding:0 0 8px;text-align:right;">${data.task_name}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding:0 0 0;border-top:1px solid #e6e2d9;padding-top:8px;"><strong>Earnings:</strong></td>
                    <td style="padding:0 0 0;border-top:1px solid #e6e2d9;padding-top:8px;text-align:right;font-weight:600;color:#d4883a;">${data.earnings} <span style="font-weight:400;color:#7d6f74;font-size:13px;">@ $${data.hourly_rate}/hr</span></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          ${data.cumulative ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f6f1;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 20px;">
            <tr>
              <td style="padding:16px 24px;">
                <p style="margin:0 0 10px;font-weight:600;font-size:14px;color:#2a1f23;">Cumulative Totals</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr style="color:#7d6f74;font-size:12px;">
                    <td style="padding:0 0 6px;"></td>
                    <td style="padding:0 0 6px;text-align:right;">Hours</td>
                    <td style="padding:0 0 6px;text-align:right;">Earnings</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 4px;font-size:13px;"><strong>This Week</strong></td>
                    <td style="padding:0 0 4px;text-align:right;font-size:13px;">${data.cumulative.week.hours}</td>
                    <td style="padding:0 0 4px;text-align:right;font-size:13px;color:#d4883a;font-weight:600;">${data.cumulative.week.earnings}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 4px;font-size:13px;"><strong>This Month</strong></td>
                    <td style="padding:0 0 4px;text-align:right;font-size:13px;">${data.cumulative.month.hours}</td>
                    <td style="padding:0 0 4px;text-align:right;font-size:13px;color:#d4883a;font-weight:600;">${data.cumulative.month.earnings}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 0;font-size:13px;border-top:1px solid #e6e2d9;padding-top:4px;"><strong>This Year</strong></td>
                    <td style="padding:0 0 0;text-align:right;font-size:13px;border-top:1px solid #e6e2d9;padding-top:4px;">${data.cumulative.year.hours}</td>
                    <td style="padding:0 0 0;text-align:right;font-size:13px;border-top:1px solid #e6e2d9;padding-top:4px;color:#d4883a;font-weight:600;">${data.cumulative.year.earnings}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>` : ''}

          ${data.description ? `
          <p style="margin:0 0 4px;font-weight:600;font-size:14px;">Work Description</p>
          <p style="margin:0 0 20px;color:#2a1f23;">${data.description}</p>` : ''}

          ${hasPhotos ? `
          <p style="margin:0 0 12px;font-weight:600;font-size:16px;">Work Photos</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${photoSection('Before', beforePhotos)}
            ${photoSection('Progress', progressPhotos)}
            ${photoSection('After', afterPhotos)}
          </table>` : '<p style="color:#7d6f74;font-size:13px;font-style:italic;margin:0 0 16px;">No photos were uploaded for this session.</p>'}

          <p style="margin:16px 0 0;color:#7d6f74;font-size:13px;">This is an automated summary from AWKN Ranch work tracking.</p>
        `,
        text: `Work Session Complete

${data.first_name} has clocked out.

Date: ${data.date}
Clock In: ${data.clock_in_time}
Clock Out: ${data.clock_out_time}
Duration: ${data.duration}
${data.space_name ? `Location: ${data.space_name}\n` : ''}${data.task_name ? `Task: ${data.task_name}\n` : ''}Earnings: ${data.earnings} @ $${data.hourly_rate}/hr
${data.cumulative ? `\nCumulative Totals:\n  This Week:  ${data.cumulative.week.hours}  |  ${data.cumulative.week.earnings}\n  This Month: ${data.cumulative.month.hours}  |  ${data.cumulative.month.earnings}\n  This Year:  ${data.cumulative.year.hours}  |  ${data.cumulative.year.earnings}` : ''}
${data.description ? `\nWork Description: ${data.description}` : ''}
${hasPhotos ? `\nPhotos: ${photos.length} photo(s) uploaded (view in HTML email)` : '\nNo photos uploaded for this session.'}

This is an automated summary from AWKN Ranch work tracking.`
      };
    }

    case "task_assigned": {
      const priorityLabels: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
      const priorityColors: Record<number, string> = { 1: '#dc2626', 2: '#f59e0b', 3: '#3b82f6', 4: '#94a3b8' };
      const taskPriority = data.task_priority ? Number(data.task_priority) : null;
      const priorityLabel = taskPriority ? (priorityLabels[taskPriority] || '') : '';
      const priorityColor = taskPriority ? (priorityColors[taskPriority] || '#94a3b8') : '#94a3b8';
      const taskLocation = data.task_location || '';

      // Build the todo list rows
      const todoTasks: Array<{ title: string; priority: number | null; location: string; is_new: boolean }> = data.todo_list || [];
      const todoRows = todoTasks.map((t: any) => {
        const pLabel = t.priority ? (priorityLabels[t.priority] || '') : '';
        const pColor = t.priority ? (priorityColors[t.priority] || '#94a3b8') : '#94a3b8';
        const highlight = t.is_new ? 'background:#fffbeb;' : '';
        const newBadge = t.is_new ? ' <span style="font-size:10px;font-weight:700;color:#d4883a;background:#fef3c7;padding:1px 6px;border-radius:4px;margin-left:6px;">NEW</span>' : '';
        return `
          <tr style="${highlight}">
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;font-size:14px;color:#2a1f23;">
              ${t.title}${newBadge}
              ${t.location ? `<br><span style="font-size:12px;color:#7d6f74;">${t.location}</span>` : ''}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0ede8;text-align:center;">
              ${pLabel ? `<span style="display:inline-block;font-size:11px;font-weight:700;color:${pColor};background:${pColor}15;padding:2px 8px;border-radius:4px;">${pLabel}</span>` : ''}
            </td>
          </tr>`;
      }).join('');

      const todoSection = todoTasks.length > 0 ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0;">
          <tr>
            <td>
              <p style="margin:0 0 12px;font-weight:700;font-size:15px;color:#2a1f23;">Your Prioritized To-Do List</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e6e2d9;border-radius:8px;overflow:hidden;">
                <tr style="background:#f7f6f1;">
                  <td style="padding:8px 12px;font-size:12px;font-weight:700;color:#7d6f74;text-transform:uppercase;letter-spacing:0.5px;">Task</td>
                  <td style="padding:8px 12px;font-size:12px;font-weight:700;color:#7d6f74;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Priority</td>
                </tr>
                ${todoRows}
              </table>
            </td>
          </tr>
        </table>` : '';

      const todoText = todoTasks.map((t: any, i: number) => {
        const pLabel = t.priority ? (priorityLabels[t.priority] || '') : '';
        const marker = t.is_new ? ' [NEW]' : '';
        return `  ${i + 1}. ${t.title}${t.location ? ` (${t.location})` : ''} — ${pLabel}${marker}`;
      }).join('\n');

      return {
        subject: `New Task Assigned: ${data.task_title} — AWKN Ranch`,
        html: `
          <h2 style="margin:0 0 4px;">New Task Assigned to You</h2>
          <p style="margin:0 0 20px;color:#7d6f74;font-size:14px;">Hi ${data.first_name}, you've been assigned a new task.</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 4px;">
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:0 0 10px;" colspan="2">
                      <span style="font-size:18px;font-weight:700;color:#2a1f23;">${data.task_title}</span>
                      ${priorityLabel ? `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:${priorityColor};background:${priorityColor}15;padding:2px 10px;border-radius:4px;">${priorityLabel}</span>` : ''}
                    </td>
                  </tr>
                  ${data.task_notes ? `<tr><td colspan="2" style="padding:0 0 10px;font-size:14px;color:#4a3f43;line-height:1.5;">${data.task_notes}</td></tr>` : ''}
                  ${taskLocation ? `<tr><td style="padding:0 0 6px;font-size:13px;color:#7d6f74;"><strong>Location:</strong> ${taskLocation}</td></tr>` : ''}
                </table>
              </td>
            </tr>
          </table>

          ${todoSection}

          <p style="margin:24px 0 0;font-size:13px;color:#7d6f74;">Clock in at <a href="https://laurenbur2.github.io/awkn-ranch/associates/worktracking.html" style="color:#d4883a;">awknranch.com</a> to get started. Your task list will be waiting for you.</p>
        `,
        text: `New Task Assigned to You

Hi ${data.first_name}, you've been assigned a new task.

Task: ${data.task_title}
${priorityLabel ? `Priority: ${priorityLabel}` : ''}
${data.task_notes ? `Notes: ${data.task_notes}` : ''}
${taskLocation ? `Location: ${taskLocation}` : ''}

${todoTasks.length > 0 ? `Your Prioritized To-Do List:\n${todoText}` : ''}

Clock in at https://laurenbur2.github.io/awkn-ranch/associates/worktracking.html to get started.

— AWKN Ranch`
      };
    }

    case "time_entry_edited": {
      const changedRows = [];
      if (data.old_clock_in !== data.new_clock_in) {
        changedRows.push({ label: 'Clock In', old: data.old_clock_in, new: data.new_clock_in });
      }
      if (data.old_clock_out !== data.new_clock_out) {
        changedRows.push({ label: 'Clock Out', old: data.old_clock_out, new: data.new_clock_out });
      }
      if (data.old_duration !== data.new_duration) {
        changedRows.push({ label: 'Duration', old: data.old_duration, new: data.new_duration });
      }

      const changeTable = changedRows.length > 0 ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
          <tr style="background:#f0ede8;">
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;border-radius:6px 0 0 0;"></td>
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;text-align:center;">Before</td>
            <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;text-align:center;border-radius:0 6px 0 0;">After</td>
          </tr>
          ${changedRows.map((r: any) => `
          <tr>
            <td style="padding:8px 12px;font-size:14px;font-weight:600;color:#2a1f23;border-bottom:1px solid #f0ede8;">${r.label}</td>
            <td style="padding:8px 12px;font-size:14px;color:#7d6f74;text-align:center;border-bottom:1px solid #f0ede8;text-decoration:line-through;">${r.old}</td>
            <td style="padding:8px 12px;font-size:14px;color:#2a1f23;text-align:center;border-bottom:1px solid #f0ede8;font-weight:600;">${r.new}</td>
          </tr>`).join('')}
        </table>` : '<p style="color:#7d6f74;font-size:14px;">No time changes (description or space updated).</p>';

      return {
        subject: `Hours edited — ${data.first_name} (${data.entry_date})`,
        html: `
          <h2 style="margin:0 0 4px;">Time Entry Edited</h2>
          <p style="margin:0 0 20px;color:#7d6f74;font-size:14px;">${data.first_name} edited their hours for <strong>${data.entry_date}</strong>.</p>

          ${changeTable}

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 20px;">
            <tr>
              <td style="padding:16px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:0 0 6px;font-size:13px;"><strong>Date:</strong></td>
                    <td style="padding:0 0 6px;text-align:right;font-size:13px;">${data.entry_date}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 6px;font-size:13px;"><strong>New Times:</strong></td>
                    <td style="padding:0 0 6px;text-align:right;font-size:13px;">${data.new_clock_in} — ${data.new_clock_out}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 6px;font-size:13px;"><strong>Duration:</strong></td>
                    <td style="padding:0 0 6px;text-align:right;font-size:13px;">${data.new_duration}</td>
                  </tr>
                  ${data.space_name ? `<tr>
                    <td style="padding:0 0 6px;font-size:13px;"><strong>Location:</strong></td>
                    <td style="padding:0 0 6px;text-align:right;font-size:13px;">${data.space_name}</td>
                  </tr>` : ''}
                  ${data.description ? `<tr>
                    <td style="padding:0 0 0;font-size:13px;"><strong>Description:</strong></td>
                    <td style="padding:0 0 0;text-align:right;font-size:13px;">${data.description}</td>
                  </tr>` : ''}
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:0;color:#7d6f74;font-size:13px;">This is an automated notification from AWKN Ranch work tracking.</p>
        `,
        text: `Time Entry Edited

${data.first_name} edited their hours for ${data.entry_date}.

${changedRows.map((r: any) => `${r.label}: ${r.old} → ${r.new}`).join('\n')}

Date: ${data.entry_date}
New Times: ${data.new_clock_in} — ${data.new_clock_out}
Duration: ${data.new_duration}
${data.space_name ? `Location: ${data.space_name}\n` : ''}${data.description ? `Description: ${data.description}\n` : ''}
This is an automated notification from AWKN Ranch work tracking.`
      };
    }

    case "weekly_associate_schedule": {
      const schedDays = (data.schedule_days || []) as any[];
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      const scheduleRows = schedDays.length > 0
        ? schedDays.map((d: any) => {
            const dt = new Date(d.schedule_date + 'T12:00:00');
            const dayName = dayNames[dt.getUTCDay()];
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            const startTime = formatTime12(d.start_time);
            const endTime = formatTime12(d.end_time);
            const hours = (d.scheduled_minutes / 60).toFixed(1);
            return `
              <tr>
                <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#2a1f23;border-bottom:1px solid #f0ede8;">${dayName}, ${dateStr}</td>
                <td style="padding:10px 12px;font-size:14px;color:#2a1f23;text-align:center;border-bottom:1px solid #f0ede8;">${startTime}</td>
                <td style="padding:10px 12px;font-size:14px;color:#2a1f23;text-align:center;border-bottom:1px solid #f0ede8;">${endTime}</td>
                <td style="padding:10px 12px;font-size:14px;color:#2a1f23;text-align:center;border-bottom:1px solid #f0ede8;">${hours}h</td>
              </tr>`;
          }).join('')
        : `<tr><td colspan="4" style="padding:16px 12px;text-align:center;color:#7d6f74;font-style:italic;">No scheduled days this week</td></tr>`;

      const totalHours = schedDays.reduce((sum: number, d: any) => sum + (d.scheduled_minutes || 0), 0) / 60;
      const weekLabel = data.week_label || 'Upcoming Week';

      return {
        subject: `Weekly Schedule — ${data.associate_name} (${weekLabel})`,
        html: `
          <h2 style="margin:0 0 4px;">Weekly Work Schedule</h2>
          <p style="margin:0 0 20px;color:#7d6f74;font-size:14px;">${data.associate_name}'s schedule for <strong>${weekLabel}</strong></p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
            <tr style="background:#f0ede8;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;border-radius:6px 0 0 0;">Day</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;text-align:center;">Start</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;text-align:center;">End</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#7d6f74;text-align:center;border-radius:0 6px 0 0;">Hours</td>
            </tr>
            ${scheduleRows}
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f0e8;border:1px solid #e6e2d9;border-radius:8px;margin:0 0 20px;">
            <tr>
              <td style="padding:16px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="font-size:14px;font-weight:600;color:#2a1f23;">Total Scheduled Hours</td>
                    <td style="font-size:20px;font-weight:700;color:#2a1f23;text-align:right;">${totalHours.toFixed(1)}h</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#7d6f74;padding-top:4px;">Scheduled Days</td>
                    <td style="font-size:13px;color:#7d6f74;text-align:right;padding-top:4px;">${schedDays.length} day${schedDays.length !== 1 ? 's' : ''}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:0;color:#7d6f74;font-size:13px;">This is an automated weekly schedule report from AWKN Ranch.</p>
        `,
        text: `Weekly Work Schedule — ${data.associate_name}
Week: ${weekLabel}

${schedDays.map((d: any) => {
  const dt = new Date(d.schedule_date + 'T12:00:00');
  const dayName = dayNames[dt.getUTCDay()];
  return `${dayName}, ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${formatTime12(d.start_time)} — ${formatTime12(d.end_time)} (${(d.scheduled_minutes / 60).toFixed(1)}h)`;
}).join('\n')}

Total: ${totalHours.toFixed(1)} hours across ${schedDays.length} day(s)

This is an automated weekly schedule report from AWKN Ranch.`
      };
    }

    case "welcome_letter": {
      // Within Center welcome letter for clients entering a ketamine program.
      // "What's included" is rendered from the proposal line items sent to the lead.
      const firstName = String(data.recipient_first_name || "there");
      const isWithin = data.business_line !== "awkn_ranch";
      const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
      const sessionDate = data.session_date
        ? new Date(data.session_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "TBD";
      const arrivalTime = String(data.arrival_time || "30 min early");
      const proposalTitle = String(data.proposal_title || "Your Program");

      // Immersive retreat variant — multi-night stay at the house. Reuses the
      // brand chrome but swaps in retreat-specific arrival/orientation/packing
      // sections. Triggered by the front-end forms when an immersive package is
      // selected (immersive-3day / immersive-6day).
      if (data.variant === "immersive") {
        return buildImmersiveWelcomeLetter({
          firstName,
          proposalTitle,
          lineItems,
          checkInDate: sessionDate,
          checkInWindow: data.arrival_time ? String(data.arrival_time) : "4pm – 6pm",
          nights: Number(data.nights) || (proposalTitle.toLowerCase().includes("six") ? 5 : proposalTitle.toLowerCase().includes("three") ? 2 : 5),
        });
      }

      const includedItems = lineItems.length > 0
        ? lineItems.map((li: any) => {
            const qty = Number(li.quantity || 1);
            const desc = String(li.description || "");
            const label = qty > 1 ? `<strong>${qty} ×</strong> ${desc}` : desc;
            return `<li>${label}</li>`;
          }).join("")
        : `
            <li><strong>3 ×</strong> Personalized guided ketamine sessions</li>
            <li><strong>3 ×</strong> Integration coaching sessions</li>
            <li>1-month AWKN membership — saunas, cold plunges, hot tub, co-working, temple space, pickleball, fire pits, community</li>
            <li>Access to on-site wellness amenities and events as available</li>
          `;

      return {
        subject: `Welcome to Within Center — ${proposalTitle}`,
        html: `
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;">

  <!-- Header -->
  <div style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">WITHIN CENTER</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">at AWKN Ranch · Austin, Texas</div>
  </div>

  <!-- Welcome hero -->
  <div style="padding:40px 40px 24px 40px;text-align:center;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Welcome · ${proposalTitle}</div>
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.25;">We're honored to walk this with you, ${firstName}.</h1>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.6;">You're in good hands. Our whole team — medical, integration, guides, care, and operations — is here to hold you through this, mind, body, and spirit.</p>
  </div>

  <!-- What's included -->
  <div style="padding:0 40px 32px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:12px;">Your Package Includes</div>
      <ul style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.85;margin:0;padding-left:18px;">
        ${includedItems}
      </ul>
    </div>
  </div>

  <!-- First session details -->
  <div style="padding:0 40px 32px 40px;">
    <div style="border:1px solid rgba(201,148,62,0.25);border-radius:4px;padding:20px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:4px;">First Session</td>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:4px;text-align:right;">Arrive By</td>
        </tr>
        <tr>
          <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#1c1618;font-weight:500;">${sessionDate}</td>
          <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#c9943e;font-weight:500;text-align:right;">${arrivalTime}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;padding-top:10px;">Plan for <strong style="color:#1c1618;">3–4 hours</strong> on site. Leslie will send your full schedule separately.</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Fasting window -->
  <div style="padding:0 40px 16px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">The Most Important Part</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 20px 0;">Your fasting window</h2>
  </div>

  <div style="padding:0 40px 28px 40px;">
    <div style="background:#1c1618;border-radius:4px;padding:26px 30px;">
      <div style="padding-bottom:16px;border-bottom:1px solid rgba(201,148,62,0.25);">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">No solid food</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">3 hours before your session</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">Non-negotiable. If you've eaten inside the window, we must reschedule — ketamine on a full stomach risks nausea and aspiration.</div>
      </div>
      <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.25);">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">No clear liquids</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">2 hours before your session</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">Water, herbal tea, or black coffee is fine up until two hours prior. A small sip for required medication is okay.</div>
      </div>
      <div style="padding-top:16px;">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">Hydrate the day before</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">Drink water all day prior</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">A light, clean dinner the night before. Nothing heavy, spicy, or alcoholic.</div>
      </div>
    </div>
  </div>

  <!-- Week leading in -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">The Week Leading In</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 18px 0;">Prepare the vessel</h2>
    <ul style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.9;margin:0;padding-left:20px;">
      <li><strong>No alcohol or cannabis for 48 hours</strong> before. They dull the nervous system and muddy the experience.</li>
      <li><strong>Continue your prescribed medications</strong> as normal unless our clinician has told you otherwise. Confirm timing with us if you're on benzodiazepines, lamotrigine, or stimulants.</li>
      <li><strong>Sit with your intention.</strong> One honest question or feeling — not a list of fixes.</li>
      <li><strong>Arrange your ride home</strong> in advance. You cannot drive for the rest of the day. Staying on the ranch? We'll walk you to your room.</li>
      <li><strong>Protect the day after.</strong> No big meetings, no hard conversations. Integration happens in rest.</li>
    </ul>
  </div>

  <!-- What to bring / Morning of -->
  <div style="padding:0 40px 32px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" valign="top" style="padding-right:12px;">
          <div style="background:#faf8f5;border:1px solid rgba(201,148,62,0.18);border-radius:4px;padding:18px 20px;">
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">What to Bring</div>
            <ul style="font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;line-height:1.7;margin:0;padding-left:16px;">
              <li>Loose, warm, layered clothing</li>
              <li>Cozy socks</li>
              <li>A grounding object (photo, stone, note)</li>
              <li>A journal for after</li>
              <li>Current medication list</li>
            </ul>
            <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:13px;color:#6b4c3b;line-height:1.6;margin-top:10px;">Eye masks, blankets, music, tea, water — all provided.</div>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:12px;">
          <div style="background:#faf8f5;border:1px solid rgba(201,148,62,0.18);border-radius:4px;padding:18px 20px;">
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">The Morning Of</div>
            <ul style="font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;line-height:1.7;margin:0;padding-left:16px;">
              <li>Shower if it helps you arrive in your body</li>
              <li>Skip heavy perfume or oils</li>
              <li>Come a little early — slow down before we begin</li>
              <li>Feel sick or feverish? Call us. Rescheduling is fine.</li>
            </ul>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Finding us -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Finding Us</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 16px 0;">Check-in at the Wellness Center</h2>
    <div style="background:#1c1618;border-radius:4px;padding:22px 26px;text-align:center;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;line-height:1.4;">7600 Grove Crest Circle<br>Austin, TX</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);margin-top:10px;">Gate code: <strong style="color:#c9943e;letter-spacing:0.05em;">2321#</strong> (enter)</div>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;line-height:1.7;margin:16px 0 0 0;">Maps sometimes routes through the commercial gate off 71 — we prefer the neighborhood entrance. Once through the gate, <strong style="color:#1c1618;">turn left</strong> — the Wellness Center is the <strong style="color:#1c1618;">first building on your left</strong>. Park there. We're a secluded ranch, 15 minutes from downtown. Trouble finding it or any questions day-of? Call or text Justin at <a href="tel:5127961886" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-796-1886</a>.</p>
  </div>

  <!-- Your team -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Your Core Team</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 20px 0;">Who to reach, for what</h2>
    <div style="padding-bottom:16px;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Heather Hoover</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Director of Client Experience</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Your point of contact for anything about how this is going for you — feedback, concerns, or just needing to talk something through. Call or text <a href="tel:5127383750" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-738-3750</a> or email <a href="mailto:heatherhoover@within.center" style="color:#c9943e;text-decoration:none;">heatherhoover@within.center</a>.</div>
    </div>
    <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Leslie Glace</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Clinic Scheduler &amp; Client Care</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Your schedule and any appointment changes. She'll follow up with your full schedule. <a href="mailto:leslie@within.center" style="color:#c9943e;text-decoration:none;">leslie@within.center</a></div>
    </div>
    <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Shannon Grossman</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Admissions</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Adding services to your experience — call or text <a href="tel:7372262569" style="color:#c9943e;text-decoration:none;white-space:nowrap;">737-226-2569</a> or email <a href="mailto:shannon@within.center" style="color:#c9943e;text-decoration:none;">shannon@within.center</a>.</div>
    </div>
    <div style="padding-top:16px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Justin De La Cruz</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Executive Director</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Holds the long-view direction of Within Center and AWKN Ranch — leadership, partnerships, and the vision that ties everything together. Also your direct line for day-of questions, late arrivals, or anything on the road. Call or text <a href="tel:5127961886" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-796-1886</a> or email <a href="mailto:justin@within.center" style="color:#c9943e;text-decoration:none;">justin@within.center</a>.</div>
    </div>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:#6b4c3b;line-height:1.6;margin:18px 0 0 0;text-align:center;">Plus medical, integration coaches, guides, retreat care, and operations — the whole team looks forward to meeting you.</p>
  </div>

  <!-- WhatsApp community -->
  <div style="padding:0 40px 32px 40px;">
    <div style="background:#1c1618;border-radius:4px;padding:28px 30px;text-align:center;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Stay Connected</div>
      <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:500;color:#ffffff;margin:0 0 10px 0;line-height:1.3;">Join the Within Center WhatsApp community</h3>
      <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.6;margin:0 0 18px 0;">Where we share weekly classes, retreats, gatherings, events, and member-only specials. Schedule posted every week.</p>
      <a href="https://chat.whatsapp.com/JYVkug3HYOCLGnrMsGodtB?mode=wwt" style="display:inline-block;background:#c9943e;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:12px 26px;border-radius:3px;">Join the Community</a>
      <p style="font-family:'Inter',sans-serif;font-size:11px;color:rgba(255,255,255,0.5);line-height:1.6;margin:16px 0 0 0;">Times, classes, and facilitators may occasionally change as we adapt to community needs.</p>
    </div>
  </div>

  <!-- Signoff -->
  <div style="padding:0 40px 36px 40px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#1c1618;line-height:1.7;margin:0 0 20px 0;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
      We're honored to walk beside you on this journey of self-discovery and healing. Thank you for trusting us with your care — we can't wait to support your transformation.
    </p>
    <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.8;">
      <a href="mailto:info@within.center" style="color:#c9943e;text-decoration:none;">info@within.center</a> &nbsp;·&nbsp;
      <a href="tel:5129692399" style="color:#c9943e;text-decoration:none;">512-969-2399</a>
    </div>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:20px 0 0 0;">With care,<br><em style="color:#6b4c3b;">The Within Center Team</em></p>
  </div>

  <!-- Footer disclaimer -->
  <div style="padding:0 40px 32px 40px;text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;">
    <strong style="color:rgba(28,22,24,0.6);">MEDICAL DISCLAIMER</strong> · These are general preparation instructions. If our medical team has given you different guidance, follow theirs. Not medical advice.
    <br><br>
    © 2026 Hearth Space Health, Inc. · 7600 Grove Crest Circle, Austin, TX<br>
    Within Center is a sister practice to <a href="https://awknranch.com" style="color:rgba(28,22,24,0.5);text-decoration:underline;">AWKN Ranch</a>
  </div>

</div>
        `,
        text: `Welcome to Within Center — ${proposalTitle}

Hi ${firstName},

We're honored to walk this with you. You're in good hands.

YOUR OUTPATIENT PROGRAM INCLUDES
${lineItems.length > 0
  ? lineItems.map((li: any) => `- ${Number(li.quantity || 1) > 1 ? Number(li.quantity) + ' × ' : ''}${li.description}`).join('\n')
  : `- 3 × Personalized guided ketamine sessions\n- 3 × Integration coaching sessions\n- 1-month AWKN membership\n- Access to on-site wellness amenities`}

FIRST SESSION
${sessionDate} — arrive by ${arrivalTime}. Plan for 3–4 hours on site.

YOUR FASTING WINDOW (THE MOST IMPORTANT PART)
- No solid food: 3 hours before your session (non-negotiable)
- No clear liquids: 2 hours before your session
- Hydrate the day before, light clean dinner the night before

THE WEEK LEADING IN
- No alcohol or cannabis for 48 hours before
- Continue prescribed medications as normal unless told otherwise
- Sit with your intention
- Arrange your ride home in advance — you cannot drive the rest of the day
- Protect the day after

WHAT TO BRING
Loose warm clothing, cozy socks, a grounding object, a journal, current medication list.
Eye masks, blankets, music, tea, water — all provided.

FINDING US
7600 Grove Crest Circle, Austin, TX
Gate code: 2321# (enter)
Check-in at the Wellness Center. Once through the gate, turn left — the Wellness Center is the first building on your left. Park there.
Trouble finding it or any questions day-of? Call or text Justin at 512-796-1886.

YOUR CORE TEAM
- Heather Hoover — Director of Client Experience · 512-738-3750 · heatherhoover@within.center
- Leslie Glace — Clinic Scheduler & Client Care · leslie@within.center
- Shannon Grossman — Admissions · 737-226-2569 · shannon@within.center
- Justin De La Cruz — Executive Director · 512-796-1886 · justin@within.center

JOIN THE WHATSAPP COMMUNITY
https://chat.whatsapp.com/JYVkug3HYOCLGnrMsGodtB?mode=wwt

Questions? info@within.center · 512-969-2399

With care,
The Within Center Team`,
      };
    }

    case "custom":
      if (!data.html) throw new Error("Custom email requires data.html");
      return {
        subject: data.subject || "Message from AWKN Ranch",
        html: data.html,
        text: data.text || "",
      };

    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

// Immersive-retreat welcome letter — for guests booked into a multi-night stay
// (3-day or 6-day retreat). Same brand styling as the standard welcome letter
// but reorders/swaps sections for an arrival-at-the-house flow: check-in
// window, gate + carport directions, weather + swimsuit packing list, what's
// already provided, daily rhythm, and a departure / integration note.
function buildImmersiveWelcomeLetter({
  firstName,
  proposalTitle,
  lineItems,
  checkInDate,
  checkInWindow,
  nights,
}: {
  firstName: string;
  proposalTitle: string;
  lineItems: any[];
  checkInDate: string;
  checkInWindow: string;
  nights: number;
}) {
  const includedItems = lineItems.length > 0
    ? lineItems.map((li: any) => {
        const qty = Number(li.quantity || 1);
        const desc = String(li.description || "");
        const label = qty > 1 ? `<strong>${qty} ×</strong> ${desc}` : desc;
        return `<li>${label}</li>`;
      }).join("")
    : `
        <li><strong>${nights}</strong> nights of residential stay at AWKN Ranch</li>
        <li>Private guided ketamine ceremonies during the retreat</li>
        <li>Group integration circles and daily practices</li>
        <li>Full access to AWKN amenities — saunas, cold plunges, hot tub, temple space</li>
        <li>All meals and on-site care</li>
      `;

  const forecastUrl = "https://weather.com/weather/tenday/l/Austin+TX";

  return {
    subject: `Welcome to your AWKN Ranch immersive retreat — ${proposalTitle}`,
    html: `
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;">

  <!-- Header -->
  <div style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">WITHIN CENTER</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">at AWKN Ranch · Austin, Texas</div>
  </div>

  <!-- Welcome hero -->
  <div style="padding:40px 40px 24px 40px;text-align:center;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Welcome · ${proposalTitle}</div>
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 14px 0;line-height:1.25;">We're honored to host you, ${firstName}.</h1>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.6;">For ${nights} nights, the ranch is yours. Our whole team — medical, integration, guides, kitchen, care, and operations — is here to hold you through this, mind, body, and spirit.</p>
  </div>

  <!-- Your retreat at a glance -->
  <div style="padding:0 40px 32px 40px;">
    <div style="border:1px solid rgba(201,148,62,0.25);border-radius:4px;padding:20px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:4px;">Check-in</td>
          <td style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:4px;text-align:right;">Window</td>
        </tr>
        <tr>
          <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#1c1618;font-weight:500;">${checkInDate}</td>
          <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#c9943e;font-weight:500;text-align:right;">${checkInWindow}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;padding-top:10px;"><strong style="color:#1c1618;">${nights} nights</strong> at the ranch. Your facilitator will share your full daily schedule on arrival.</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- What's included -->
  <div style="padding:0 40px 32px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:12px;">Your Package Includes</div>
      <ul style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.85;margin:0;padding-left:18px;">
        ${includedItems}
      </ul>
    </div>
  </div>

  <!-- Arrival / finding the house -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Arriving at the Ranch</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 16px 0;">Check in at the house</h2>
    <div style="background:#1c1618;border-radius:4px;padding:22px 26px;text-align:center;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;line-height:1.4;">7600 Grove Crest Circle<br>Austin, TX</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);margin-top:10px;">Gate code: <strong style="color:#c9943e;letter-spacing:0.05em;">2321#</strong> (enter)</div>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;line-height:1.7;margin:16px 0 0 0;">Once through the gate, <strong style="color:#1c1618;">stay right</strong> and follow the drive up to the main house. <strong style="color:#1c1618;">Park near the carport</strong> and walk in to check in — someone from our team will be there to greet you and show you to your room. Plan to arrive between <strong style="color:#1c1618;">${checkInWindow}</strong>; if your travel runs late, just text Justin at <a href="tel:5127961886" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-796-1886</a> so we can hold dinner.</p>
  </div>

  <!-- Weather / what to bring -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Packing for the Land</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 16px 0;">Texas can swing — pack in layers</h2>
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.7;margin:0 0 16px 0;text-align:center;">A few days out, take a look at the <a href="${forecastUrl}" style="color:#c9943e;text-decoration:none;font-weight:600;">10-day Austin forecast</a>. Mornings can be cool, afternoons warm, evenings breezy on the porch.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" valign="top" style="padding-right:12px;">
          <div style="background:#faf8f5;border:1px solid rgba(201,148,62,0.18);border-radius:4px;padding:18px 20px;">
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">What to Bring</div>
            <ul style="font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;line-height:1.7;margin:0;padding-left:16px;">
              <li><strong>Swimsuit</strong> — pool, hot tub, sauna, cold plunge are all yours</li>
              <li>Layered clothing (the forecast will guide you)</li>
              <li>Loose, soft clothes for ceremony — something you'd nap in</li>
              <li>Slippers or sandals for around the house</li>
              <li>Journal + pen for integration</li>
              <li>Reusable water bottle</li>
              <li>Any prescriptions in original containers</li>
              <li>A grounding object (photo, stone, note)</li>
            </ul>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:12px;">
          <div style="background:#faf8f5;border:1px solid rgba(201,148,62,0.18);border-radius:4px;padding:18px 20px;">
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">Already Provided</div>
            <ul style="font-family:'Inter',sans-serif;font-size:13px;color:#1c1618;line-height:1.7;margin:0;padding-left:16px;">
              <li>All meals, snacks, tea, coffee</li>
              <li>Bed linens, bath + pool towels, robe</li>
              <li>Basic toiletries — shampoo, conditioner, body wash, soap</li>
              <li>Yoga mats, meditation cushions, blankets</li>
              <li>Eye masks, headphones, ceremony music</li>
              <li>Fully stocked kitchen between meals</li>
              <li>Wi-Fi (password shared at check-in)</li>
            </ul>
            <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:13px;color:#6b4c3b;line-height:1.6;margin-top:10px;">Travel light. We've thought through the rest.</div>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Daily rhythm -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">A Day in Retreat</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 18px 0;">A gentle, deliberate rhythm</h2>
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.8;margin:0 0 14px 0;">Days move slowly here on purpose. A typical rhythm — flexible to the group and your needs:</p>
    <ul style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.85;margin:0;padding-left:20px;">
      <li><strong>Mornings</strong> — gentle movement or breathwork on the deck, then a shared breakfast</li>
      <li><strong>Ceremony days</strong> — held in the temple space, fully supported, with rest and integration to follow</li>
      <li><strong>Integration days</strong> — small group circles, one-on-one coaching, journaling, walks on the land</li>
      <li><strong>Afternoons</strong> — open time for sauna, cold plunge, hot tub, pool, or simply doing nothing</li>
      <li><strong>Evenings</strong> — group dinner, then quiet time. Lights low after 10pm so the body can settle</li>
    </ul>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:#6b4c3b;line-height:1.6;margin:16px 0 0 0;">You'll get the full schedule on arrival. Nothing here is forced — you can opt out of anything that doesn't feel right.</p>
  </div>

  <!-- Fasting window -->
  <div style="padding:0 40px 16px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Before Each Ceremony</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 20px 0;">Your fasting window</h2>
  </div>

  <div style="padding:0 40px 28px 40px;">
    <div style="background:#1c1618;border-radius:4px;padding:26px 30px;">
      <div style="padding-bottom:16px;border-bottom:1px solid rgba(201,148,62,0.25);">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">No solid food</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">3 hours before each ceremony</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">Non-negotiable. Our kitchen will time meals around your ceremony schedule, so you don't have to think about it.</div>
      </div>
      <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.25);">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">No alcohol or cannabis</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">48 hours before arrival, and through the retreat</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">They dull the nervous system and muddy the experience. Step away early — your body will thank you.</div>
      </div>
      <div style="padding-top:16px;">
        <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:4px;">Hydrate the days leading in</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#ffffff;font-weight:500;">Drink water like it's your job</div>
        <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.6;margin-top:4px;">Continue your prescribed medications as normal unless our clinician has told you otherwise.</div>
      </div>
    </div>
  </div>

  <!-- The land + amenities -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">The Land</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 18px 0;">Yours to wander</h2>
    <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.85;margin:0;">The pool, hot tub, sauna, and cold plunge are open to you throughout your stay. The temple holds our ceremonies and group practice. Common areas in the house are shared; your bedroom is yours alone. Phones are welcome in your room and the kitchen, but we encourage leaving them tucked away during ceremony, meals, and circle. We're a quiet, secluded ranch — let the land hold you.</p>
  </div>

  <!-- Your team -->
  <div style="padding:0 40px 32px 40px;">
    <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Your Core Team</div>
    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 20px 0;">Who to reach, for what</h2>
    <div style="padding-bottom:16px;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Heather Hoover</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Director of Client Experience</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Your point of contact for anything about how the retreat is going for you — feedback, concerns, or just needing to talk something through. Call or text <a href="tel:5127383750" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-738-3750</a> or email <a href="mailto:heatherhoover@within.center" style="color:#c9943e;text-decoration:none;">heatherhoover@within.center</a>.</div>
    </div>
    <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Leslie Glace</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Schedule &amp; Client Care</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Your retreat schedule and any pre-arrival changes. <a href="mailto:leslie@within.center" style="color:#c9943e;text-decoration:none;">leslie@within.center</a></div>
    </div>
    <div style="padding:16px 0;border-bottom:1px solid rgba(201,148,62,0.18);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Shannon Grossman</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Admissions</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Adding any add-on services to your retreat — extra coaching, licensed therapy, bodywork, extended stays. Call or text <a href="tel:7372262569" style="color:#c9943e;text-decoration:none;white-space:nowrap;">737-226-2569</a> or email <a href="mailto:shannon@within.center" style="color:#c9943e;text-decoration:none;">shannon@within.center</a>.</div>
    </div>
    <div style="padding-top:16px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:#1c1618;font-weight:500;">Justin De La Cruz</div>
      <div style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c9943e;margin:2px 0 6px 0;">Executive Director</div>
      <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.6;">Holds the long-view direction of Within Center and AWKN Ranch — leadership, partnerships, and the vision that ties everything together. Also your direct line for day-of questions, late arrivals, or anything on the road. Call or text <a href="tel:5127961886" style="color:#c9943e;text-decoration:none;white-space:nowrap;">512-796-1886</a> or email <a href="mailto:justin@within.center" style="color:#c9943e;text-decoration:none;">justin@within.center</a>.</div>
    </div>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:#6b4c3b;line-height:1.6;margin:18px 0 0 0;text-align:center;">Plus medical, integration coaches, guides, kitchen, retreat care, and operations — the whole team looks forward to meeting you.</p>
  </div>

  <!-- Departure & integration -->
  <div style="padding:0 40px 32px 40px;">
    <div style="background:#faf8f5;border-left:3px solid #c9943e;padding:22px 26px;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b4c3b;font-weight:600;margin-bottom:8px;">Departure &amp; What Comes After</div>
      <p style="font-family:'Inter',sans-serif;font-size:14px;color:#1c1618;line-height:1.8;margin:0;">Check-out is by <strong>11am</strong> on your final day, after a slow morning and breakfast together. <strong>Integration packages are available</strong> for anyone who wants continued support as they ease back into everyday life: extended coaching, additional sessions, and gentle check-ins to help what opened here keep unfolding at home. Reach out whenever you're ready — we'd love to walk the next stretch with you. Protect the days following: no big meetings, no hard conversations. Integration happens in rest.</p>
    </div>
  </div>

  <!-- WhatsApp community -->
  <div style="padding:0 40px 32px 40px;">
    <div style="background:#1c1618;border-radius:4px;padding:28px 30px;text-align:center;">
      <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Stay Connected</div>
      <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:500;color:#ffffff;margin:0 0 10px 0;line-height:1.3;">Join the Within Center WhatsApp community</h3>
      <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.6;margin:0 0 18px 0;">Where we share weekly classes, retreats, gatherings, events, and member-only specials.</p>
      <a href="https://chat.whatsapp.com/JYVkug3HYOCLGnrMsGodtB?mode=wwt" style="display:inline-block;background:#c9943e;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:12px 26px;border-radius:3px;">Join the Community</a>
    </div>
  </div>

  <!-- Signoff -->
  <div style="padding:0 40px 36px 40px;text-align:center;">
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#1c1618;line-height:1.7;margin:0 0 20px 0;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
      We can't wait to welcome you to the ranch. Until then, breathe slow, drink water, and let the anticipation soften.
    </p>
    <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.8;">
      <a href="mailto:info@within.center" style="color:#c9943e;text-decoration:none;">info@within.center</a> &nbsp;·&nbsp;
      <a href="tel:5129692399" style="color:#c9943e;text-decoration:none;">512-969-2399</a>
    </div>
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:20px 0 0 0;">With care,<br><em style="color:#6b4c3b;">The Within Center Team</em></p>
  </div>

  <!-- Footer disclaimer -->
  <div style="padding:0 40px 32px 40px;text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;">
    <strong style="color:rgba(28,22,24,0.6);">MEDICAL DISCLAIMER</strong> · These are general preparation instructions. If our medical team has given you different guidance, follow theirs. Not medical advice.
    <br><br>
    © 2026 Hearth Space Health, Inc. · 7600 Grove Crest Circle, Austin, TX<br>
    Within Center is a sister practice to <a href="https://awknranch.com" style="color:rgba(28,22,24,0.5);text-decoration:underline;">AWKN Ranch</a>
  </div>

</div>
    `,
    text: `Welcome to your AWKN Ranch immersive retreat — ${proposalTitle}

Hi ${firstName},

For ${nights} nights, the ranch is yours. We're honored to host you.

CHECK-IN
${checkInDate} · ${checkInWindow}
${nights} nights at the ranch — your facilitator will share the full daily schedule on arrival.

YOUR PACKAGE INCLUDES
${lineItems.length > 0
  ? lineItems.map((li: any) => `- ${Number(li.quantity || 1) > 1 ? Number(li.quantity) + ' × ' : ''}${li.description}`).join('\n')
  : `- ${nights} nights of residential stay\n- Private guided ketamine ceremonies\n- Group integration circles and daily practices\n- Full access to AWKN amenities — saunas, cold plunges, hot tub, temple\n- All meals and on-site care`}

ARRIVING AT THE RANCH
7600 Grove Crest Circle, Austin, TX
Gate code: 2321# (enter)
Once through the gate, STAY RIGHT and follow the drive up to the main house. Park near the carport and walk in to check in. If your travel runs late, text Justin at 512-796-1886.

WEATHER & WHAT TO BRING
A few days out, check the 10-day Austin forecast: ${forecastUrl}
Mornings cool, afternoons warm, evenings breezy — pack in layers.

What to bring:
- SWIMSUIT — pool, hot tub, sauna, cold plunge
- Layered clothing
- Loose, soft clothes for ceremony
- Slippers or sandals for around the house
- Journal + pen
- Reusable water bottle
- Any prescriptions in original containers
- A grounding object

Already provided (travel light):
- All meals, snacks, tea, coffee
- Bed linens, bath + pool towels, robe
- Basic toiletries
- Yoga mats, meditation cushions, blankets
- Eye masks, headphones, ceremony music
- Wi-Fi (password at check-in)

A DAY IN RETREAT
- Mornings — gentle movement or breathwork, shared breakfast
- Ceremony days — held in the temple space, fully supported
- Integration days — group circles, coaching, journaling, walks
- Afternoons — sauna, cold plunge, hot tub, pool, or rest
- Evenings — group dinner, quiet after 10pm

Nothing here is forced. You can opt out of anything that doesn't feel right.

BEFORE EACH CEREMONY (THE FASTING WINDOW)
- No solid food: 3 hours before each ceremony (non-negotiable)
- No alcohol or cannabis: 48 hours before arrival, and through the retreat
- Hydrate the days leading in
- Continue prescribed medications as normal unless told otherwise

YOUR CORE TEAM
- Heather Hoover — Director of Client Experience · 512-738-3750 · heatherhoover@within.center
- Leslie Glace — Schedule & Client Care · leslie@within.center
- Shannon Grossman — Admissions, add-on services · 737-226-2569 · shannon@within.center
- Justin De La Cruz — Executive Director · 512-796-1886 · justin@within.center

DEPARTURE & WHAT COMES AFTER
Check-out by 11am on your final day, after a slow morning and breakfast. Integration packages are available for anyone who wants continued support as they ease back into everyday life: extended coaching, additional sessions, and gentle check-ins to help what opened here keep unfolding at home. Reach out whenever you're ready — we'd love to walk the next stretch with you. Protect the days after — no big meetings, no hard conversations. Integration happens in rest.

JOIN THE WHATSAPP COMMUNITY
https://chat.whatsapp.com/JYVkug3HYOCLGnrMsGodtB?mode=wwt

Questions? info@within.center · 512-969-2399

With care,
The Within Center Team`,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Fetch active payment methods from DB and format them for email templates.
 * Returns html (list items), text (plain text), and raw (array of method objects).
 */
async function getPaymentMethodsForEmail(): Promise<{ html: string; text: string; raw: any[] }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data: methods } = await sb
      .from("payment_methods")
      .select("name, method_type, account_identifier, instructions")
      .eq("is_active", true)
      .order("display_order");

    if (!methods || methods.length === 0) {
      return {
        html: `<li>Contact us for payment options</li>`,
        text: `- Contact us for payment options`,
        raw: [],
      };
    }

    const htmlItems = methods.map((m: any) => {
      const id = m.account_identifier ? `: <strong>${m.account_identifier}</strong>` : "";
      const instr = m.instructions ? ` <span style="color:#666;font-size:0.9em;">(${m.instructions.split('\n')[0]})</span>` : "";
      return `<li style="margin-bottom:6px;">${m.name}${id}${instr}</li>`;
    }).join("\n            ");

    const textItems = methods.map((m: any) => {
      const id = m.account_identifier ? `: ${m.account_identifier}` : "";
      const instr = m.instructions ? ` (${m.instructions.split('\n')[0]})` : "";
      return `- ${m.name}${id}${instr}`;
    }).join("\n");

    return { html: htmlItems, text: textItems, raw: methods };
  } catch (e) {
    console.error("Failed to fetch payment methods:", e);
    return {
      html: `<li>Contact us for payment options</li>`,
      text: `- Contact us for payment options`,
      raw: [],
    };
  }
}

/**
 * Try to load a template from the DB (with cache), fall back to hardcoded.
 * Returns { subject, html, text, sender_type } with placeholders already rendered.
 */
async function getRenderedTemplate(
  type: EmailType,
  data: Record<string, any>
): Promise<{ subject: string; html: string; text: string; senderType: string }> {
  // Enrich payment-related templates with dynamic payment methods from DB
  const paymentTypes: EmailType[] = ["deposit_requested", "payment_reminder", "payment_overdue", "payment_statement", "move_in_confirmed"];
  if (paymentTypes.includes(type)) {
    const pm = await getPaymentMethodsForEmail();
    data._payment_methods_html = pm.html;
    data._payment_methods_text = pm.text;
    if (!data._payment_methods_raw) {
      data._payment_methods_raw = pm.raw;
    }
  }

  // 1. Try DB template (cached)
  const cached = templateCache.get(type);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    const t = cached.template;
    return {
      subject: renderTemplate(t.subject_template, data),
      html: renderTemplate(t.html_template, data),
      text: renderTemplate(t.text_template, data),
      senderType: t.sender_type || "team",
    };
  }

  // 2. Fetch from DB
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbTemplate, error } = await supabase
      .from("email_templates")
      .select("subject_template, html_template, text_template, sender_type")
      .eq("template_key", type)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (dbTemplate && !error) {
      templateCache.set(type, { template: dbTemplate, fetchedAt: Date.now() });
      return {
        subject: renderTemplate(dbTemplate.subject_template, data),
        html: renderTemplate(dbTemplate.html_template, data),
        text: renderTemplate(dbTemplate.text_template, data),
        senderType: dbTemplate.sender_type || "team",
      };
    }
  } catch (e) {
    console.error(`DB template fetch failed for ${type}, using hardcoded fallback:`, e);
  }

  // 3. Fall back to hardcoded template (evaluated with JS template literals)
  const fallback = getTemplate(type, data);
  return {
    subject: fallback.subject,
    html: fallback.html,
    text: fallback.text,
    senderType: (fallback as any).senderType || "team",
  };
}

// ===== EMAIL APPROVAL SYSTEM =====
const approvalConfigCache = new Map<string, { requiresApproval: boolean; fetchedAt: number }>();
const APPROVAL_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function checkApprovalRequired(emailType: string): Promise<boolean> {
  if (emailType === "email_approval_request") return false; // infinite loop guard
  const cached = approvalConfigCache.get(emailType);
  if (cached && Date.now() - cached.fetchedAt < APPROVAL_CACHE_TTL_MS) return cached.requiresApproval;
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await sb.from("email_type_approval_config").select("requires_approval").eq("email_type", emailType).maybeSingle();
    // Default: require approval unless explicitly set to false (approved template)
    const req = data ? data.requires_approval !== false : true;
    approvalConfigCache.set(emailType, { requiresApproval: req, fetchedAt: Date.now() });
    return req;
  } catch (e) {
    console.warn("Approval config lookup failed:", e);
    // On error, default to requiring approval (safe-by-default)
    approvalConfigCache.set(emailType, { requiresApproval: true, fetchedAt: Date.now() });
    return true;
  }
}

async function holdForApproval(
  emailType: string, toAddresses: string[], fromAddress: string, replyTo: string | undefined,
  ccArr: string[] | undefined, bccArr: string[] | undefined, subject: string,
  finalHtml: string, textContent: string, resendApiKey: string,
): Promise<{ approvalId: string }> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const approvalToken = crypto.randomUUID();
  const { data: approval, error } = await sb.from("pending_email_approvals").insert({
    email_type: emailType, to_addresses: toAddresses, from_address: fromAddress,
    reply_to: replyTo || null, cc: ccArr || null, bcc: bccArr || null,
    subject, html: finalHtml, text_content: textContent, status: "pending", approval_token: approvalToken,
  }).select("id").single();
  if (error) throw new Error(`Failed to store pending approval: ${error.message}`);

  const baseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-email`;
  const approveOneUrl = `${baseUrl}?token=${approvalToken}&action=approve_one`;
  const approveAllUrl = `${baseUrl}?token=${approvalToken}&action=approve_all`;
  const typeLabel = emailType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const recipientList = toAddresses.join(", ");

  const reviewHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#1c1618;padding:20px 24px;">
      <h2 style="color:#d4883a;margin:0;font-size:18px;">Email Approval Required</h2>
    </div>
    <div style="padding:20px 24px;border-bottom:1px solid #eee;">
      <table style="width:100%;font-size:14px;color:#555;">
        <tr><td style="padding:4px 0;font-weight:600;width:80px;">Type:</td><td><span style="background:#d4883a;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${typeLabel}</span></td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">To:</td><td>${recipientList}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600;">Subject:</td><td>${subject}</td></tr>
      </table>
    </div>
    <div style="padding:20px 24px;text-align:center;background:#faf9f6;">
      <a href="${approveOneUrl}" style="display:inline-block;padding:14px 32px;background:#54a326;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 8px 0;">Approve This Email</a>
      <a href="${approveAllUrl}" style="display:inline-block;padding:14px 32px;background:#d4883a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 0 8px 8px;">Approve All "${typeLabel}" Emails</a>
      <p style="color:#888;font-size:12px;margin:12px 0 0;">Approve All permanently disables approval for this email type.</p>
    </div>
    <div style="padding:20px 24px;">
      <p style="font-size:13px;color:#888;margin:0 0 12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Email Preview</p>
      <div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">${finalHtml}</div>
    </div>
    <div style="padding:16px 24px;background:#f4f4f4;text-align:center;">
      <p style="color:#999;font-size:11px;margin:0;">AWKN Team Portal Email Approval System</p>
    </div>
  </div>
</body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "AWKN Team Portal <noreply@awknranch.com>",
      to: ["admin@awknranch.com"],
      reply_to: "team@awknranch.com",
      subject: `[Approval Required] ${typeLabel}: ${subject}`,
      html: reviewHtml,
      text: `Email Approval Required\nType: ${typeLabel}\nTo: ${recipientList}\nSubject: ${subject}\n\nApprove: ${approveOneUrl}\nApprove All: ${approveAllUrl}`,
    }),
  });

  return { approvalId: approval.id };
}
// ===== END EMAIL APPROVAL SYSTEM =====

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const body: EmailRequest = await req.json();
    const { type, to, data, subject: customSubject, from, reply_to, cc, bcc, preview } = body;

    if (!type || !to || !data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, to, data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get rendered template (DB first, then hardcoded fallback)
    const rendered = await getRenderedTemplate(type, data);

    // Determine sender from DB template's sender_type, with fallback
    const sender = SENDER_MAP[rendered.senderType] || SENDER_MAP.team;

    // Templates that already include their own full HTML layout and should NOT be wrapped
    const SKIP_BRAND_WRAP: EmailType[] = [
      "custom",            // raw HTML passthrough
      "staff_invitation",  // has its own full branded layout
      "proposal_sent",     // has its own full branded layout
      "agreement_to_sign", // has its own full branded layout
      "retreat_agreement_to_sign", // has its own full branded layout (Within)
      "welcome_letter",    // Within Center welcome letter — self-contained layout
      "pai_email_reply",   // PAI-branded layout
      "payment_statement", // has its own full layout
    ];

    // Wrap email content in the branded shell (header, footer, consistent styling)
    let finalHtml = rendered.html;
    if (!SKIP_BRAND_WRAP.includes(type)) {
      try {
        finalHtml = await wrapEmailHtml(rendered.html, {
          preheader: rendered.subject,
          emailSubject: rendered.subject,
          extraImages: (rendered as any)._extraImages,
        });
      } catch (wrapErr) {
        console.warn("Brand wrapper failed, sending unwrapped:", wrapErr);
        // Fall through with unwrapped HTML
      }
    }

    // === ALWAYS BCC archive inbox ===
    const ARCHIVE_BCC = "justin@within.center";
    // Type-specific BCC: welcome letter always goes to Within team
    const TYPE_BCC: Partial<Record<EmailType, string[]>> = {
      welcome_letter: [
        "shannon@within.center",
        "william@within.center",
        "leslie@within.center",
        "justin@within.center",
      ],
    };
    const toArray = Array.isArray(to) ? to : [to];
    const ccArray = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;
    const userBcc = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];
    const typeBcc = TYPE_BCC[type] || [];
    // Always include archive BCC plus any type-specific addresses (dedupe)
    const bccSet = new Set([...userBcc, ...typeBcc, ARCHIVE_BCC]);
    // Don't BCC anyone who is already a to-recipient
    for (const addr of toArray) bccSet.delete(addr);
    const bccArray = [...bccSet];

    // === PREVIEW SHORT-CIRCUIT ===
    // When preview=true, return rendered HTML/subject/text/from/to/reply_to without
    // sending, archiving, approval gating, metadata injection, or usage logging.
    // The html returned here is exactly what Resend delivers (minus the trailing
    // ALPACAPPS_META comment, which is an invisible HTML comment added later).
    if (preview) {
      return new Response(
        JSON.stringify({
          success: true,
          preview: true,
          subject: customSubject || rendered.subject,
          html: finalHtml,
          text: rendered.text,
          from: from || sender.from,
          to: Array.isArray(to) ? to : [to],
          reply_to: reply_to || sender.reply_to,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === INJECT HIDDEN METADATA for reply context ===
    // This invisible block lets PAI understand replies: what email type triggered
    // the conversation, who the original recipient was, and routing context.
    const emailId = crypto.randomUUID();
    const metadataBlock = `<!--[ALPACAPPS_META:${JSON.stringify({
      eid: emailId,
      type: type,
      to: toArray,
      from: from || sender.from,
      reply_to: reply_to || sender.reply_to,
      ts: new Date().toISOString(),
      ...(data.space_name ? { space: data.space_name } : {}),
      ...(data.person_id ? { pid: data.person_id } : {}),
      ...(data.assignment_id ? { aid: data.assignment_id } : {}),
    })}:ALPACAPPS_META]-->`;
    finalHtml = finalHtml + metadataBlock;

    // === APPROVAL GATE ===
    const needsApproval = await checkApprovalRequired(type);
    if (needsApproval) {
      const { approvalId } = await holdForApproval(
        type, toArray, from || sender.from, reply_to || sender.reply_to,
        ccArray, bccArray, customSubject || rendered.subject,
        finalHtml, rendered.text, RESEND_API_KEY,
      );
      console.log(`Email held for approval: type=${type}, to=${toArray.join(",")}, id=${approvalId}`);
      return new Response(
        JSON.stringify({ success: true, status: "pending_approval", approval_id: approvalId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Resend
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || sender.from,
        to: toArray,
        ...(ccArray ? { cc: ccArray } : {}),
        ...(bccArray.length > 0 ? { bcc: bccArray } : {}),
        reply_to: reply_to || sender.reply_to,
        subject: customSubject || rendered.subject,
        html: finalHtml,
        text: rendered.text,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", { type, to, id: result.id });

    // Log to api_usage_log (fire-and-forget, don't block response)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);
      const recipientCount = Array.isArray(to) ? to.length : 1;
      sb.from("api_usage_log").insert({
        vendor: "resend",
        category: `email_${type}`,
        endpoint: "POST /emails",
        units: recipientCount,
        unit_type: "emails",
        estimated_cost_usd: recipientCount * 0.00028,
        metadata: { resend_id: result.id, email_type: type, recipient_count: recipientCount },
      }).then(() => {});
    } catch (_) { /* non-critical */ }

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
