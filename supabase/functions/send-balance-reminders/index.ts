// Daily cron: email balance-due reminders for AWKN Ranch venue rentals
// whose event is exactly 30 days out and whose deposit has been received.
//
// Called by pg_cron via net.http_post. Authenticates via x-cron-secret header
// which must match the CRON_SECRET env var (also embedded in the cron job SQL).
//
// Idempotent: stamps balance_reminder_sent_at on each proposal so re-runs skip it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function fmtMoney(n: number): string {
  return "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");
}

function fmtDate(d: string | null): string {
  if (!d) return "your event";
  try {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch { return d; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Target = today + 30 days. Local timezone concerns don't matter here: we're
    // looking for any proposal whose event_date is exactly 30 calendar days from now.
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 30);
    const targetDate = target.toISOString().slice(0, 10); // YYYY-MM-DD

    const { data: candidates, error } = await supabase
      .from("crm_proposals")
      .select("id, proposal_number, lead_id, total, deposit_percent, event_date, paid_amount_cents, payment_link_url, payment_link_card_url")
      .eq("event_date", targetDate)
      .not("contract_signed_at", "is", null)
      .not("paid_at", "is", null)
      .is("balance_reminder_sent_at", null);

    if (error) {
      console.error("Query failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const results: Array<{ proposal_id: string; sent: boolean; reason?: string }> = [];

    for (const p of candidates || []) {
      const total = Number(p.total || 0);
      const depositPct = Number(p.deposit_percent ?? 50);
      const depositAmt = Math.round(total * depositPct) / 100;
      const paidAmt = Number(p.paid_amount_cents || 0) / 100;
      const balance = Math.round((total - Math.max(paidAmt, depositAmt)) * 100) / 100;

      if (balance <= 0) {
        // Nothing owed — stamp so we don't re-evaluate tomorrow.
        await supabase.from("crm_proposals")
          .update({ balance_reminder_sent_at: new Date().toISOString() })
          .eq("id", p.id);
        results.push({ proposal_id: p.id, sent: false, reason: "no_balance" });
        continue;
      }

      const { data: lead } = await supabase
        .from("crm_leads")
        .select("first_name, email")
        .eq("id", p.lead_id)
        .single();
      if (!lead?.email) {
        results.push({ proposal_id: p.id, sent: false, reason: "no_email" });
        continue;
      }

      if (!RESEND_API_KEY) {
        results.push({ proposal_id: p.id, sent: false, reason: "no_resend_key" });
        continue;
      }

      const eventDateText = fmtDate(p.event_date);
      const payButtons = (p.payment_link_url || p.payment_link_card_url) ? `
        <div style="text-align:center;margin:24px 0;">
          ${p.payment_link_url ? `<a href="${p.payment_link_url}" style="display:inline-block;background:#3d8b7a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:6px;">Pay ${fmtMoney(balance)} Balance (ACH)</a>` : ''}
          ${p.payment_link_card_url ? `<a href="${p.payment_link_card_url}" style="display:inline-block;background:#fff;color:#3d8b7a;padding:12px 28px;border:2px solid #3d8b7a;border-radius:8px;text-decoration:none;font-weight:600;margin:6px;">Pay by Card (+3%)</a>` : ''}
        </div>
      ` : '';

      const emailResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "AWKN Ranch <noreply@within.center>",
          to: [lead.email],
          reply_to: "team@awknranch.com",
          bcc: ["justin@within.center"],
          subject: `Balance Due — ${p.proposal_number} — Event on ${eventDateText}`,
          html: `
            <h2>Balance Due in 30 Days</h2>
            <p>Hi ${lead.first_name || "there"},</p>
            <p>Your event at AWKN Ranch is coming up on <strong>${eventDateText}</strong>. Per your signed rental agreement, the remaining balance is due 30 days before your event.</p>
            <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:20px 0;">
              <table style="border-collapse:collapse;width:100%;max-width:400px;">
                <tr><td style="padding:6px 0;">Total:</td><td style="padding:6px 0;text-align:right;">${fmtMoney(total)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Deposit Received:</td><td style="padding:6px 0;text-align:right;color:#666;">${fmtMoney(Math.max(paidAmt, depositAmt))}</td></tr>
                <tr style="border-top:1px solid #ddd;"><td style="padding:8px 0;"><strong>Balance Due:</strong></td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#3d8b7a;font-size:1.2em;">${fmtMoney(balance)}</td></tr>
              </table>
            </div>
            ${payButtons}
            <p>Questions? Reply to this email.</p>
            <p>Best,<br>AWKN Ranch</p>
          `,
          text: `Balance Due in 30 Days

Hi ${lead.first_name || "there"},

Your event at AWKN Ranch is on ${eventDateText}. Per your signed rental agreement, the remaining balance is due 30 days before your event.

Total: ${fmtMoney(total)}
Deposit Received: ${fmtMoney(Math.max(paidAmt, depositAmt))}
Balance Due: ${fmtMoney(balance)}

${p.payment_link_url ? `Pay ${fmtMoney(balance)} (ACH): ${p.payment_link_url}\n` : ''}${p.payment_link_card_url ? `Pay by card (+3%): ${p.payment_link_card_url}\n` : ''}
Questions? Reply to this email.

Best,
AWKN Ranch`,
        }),
      });

      if (emailResp.ok) {
        await supabase.from("crm_proposals")
          .update({ balance_reminder_sent_at: new Date().toISOString() })
          .eq("id", p.id);
        if (p.lead_id) {
          await supabase.from("crm_activities").insert({
            lead_id: p.lead_id,
            activity_type: "email",
            description: `Balance reminder sent (${p.proposal_number}): ${fmtMoney(balance)} due 30 days before ${eventDateText}`,
          });
        }
        results.push({ proposal_id: p.id, sent: true });
      } else {
        const errData = await emailResp.json();
        console.error(`Failed to send reminder for ${p.proposal_number}:`, errData);
        results.push({ proposal_id: p.id, sent: false, reason: "resend_failed" });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      target_date: targetDate,
      candidates: candidates?.length || 0,
      results,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("send-balance-reminders error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
