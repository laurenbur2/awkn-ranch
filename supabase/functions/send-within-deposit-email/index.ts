// Within Center — ceremonial ketamine deposit confirmation email.
// Separate from the AWKN Ranch rental `deposit_received` flow in `send-email`.
//
// Called by the browser from within-center/book/schedule/ after a successful
// deposit (currently fires in demo mode, will later fire from the Stripe
// webhook). Uses Resend to send a branded HTML email and returns JSON.
//
// Endpoint: POST https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/send-within-deposit-email
//
// Body:
// {
//   first_name: string,
//   last_name: string,
//   email: string,
//   package_slug: string,              // e.g. "heal"
//   package_name?: string,             // e.g. "The Heal Package"
//   deposit_amount?: string,           // e.g. "$350"
//   balance_amount?: string,           // e.g. "$3,150"
//   stay_at_ranch?: "yes" | "no" | "maybe" | ""
// }
//
// Deploy:
//   verify_jwt: false (public — called directly from the browser)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "Within Center <intake@within.center>";
const REPLY_TO = "intake@within.center";
const APPLICATION_LINK = "https://laurenbur2.github.io/awkn-ranch/within-center/book/schedule/";

// Package catalog — keep in sync with the booking page.
const PACKAGES: Record<string, { name: string; deposit: string; balance: string }> = {
  discover: { name: "The Discover Package", deposit: "$150", balance: "$1,350" },
  heal:     { name: "The Heal Package",     deposit: "$350", balance: "$3,150" },
  awkn:     { name: "The AWKN Package",     deposit: "$550", balance: "$4,950" },
  twin:     { name: "The Twin Flame Package", deposit: "$1,100", balance: "$9,900" },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function renderTemplate(tpl: string, data: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] ?? ""));
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The branded deposit-received HTML, mirrors within-center/emails/deposit-received.html.
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your spot is held — Within Center</title>
</head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1618;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid rgba(28,22,24,0.06);border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:36px 40px 24px 40px;border-bottom:1px solid rgba(201,148,62,0.18);text-align:center;">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;letter-spacing:0.04em;">WITHIN CENTER</div>
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:13px;color:#6b4c3b;margin-top:4px;">at AWKN Ranch · Austin, Texas</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 24px 40px;text-align:center;">
            <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:#c9943e;color:#ffffff;font-size:28px;line-height:56px;font-weight:600;margin-bottom:18px;">✓</div>
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:8px;">Deposit Received</div>
            <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#1c1618;margin:0 0 12px 0;line-height:1.2;">Thank you, {{first_name}} — your spot is held.</h1>
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:17px;color:#6b4c3b;margin:0;line-height:1.5;">We are honored to walk this with you.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5;border-left:3px solid #c9943e;">
              <tr><td style="padding:20px 24px 0 24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:6px;">Package</td>
                    <td style="font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b4c3b;padding-bottom:6px;text-align:right;">Deposit</td>
                  </tr>
                  <tr>
                    <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#1c1618;font-weight:500;">{{package_name}}</td>
                    <td style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#c9943e;font-weight:500;text-align:right;">{{deposit_amount}}</td>
                  </tr>
                </table>
              </td></tr>
              <tr><td style="padding:10px 24px 20px 24px;font-family:'Inter',sans-serif;font-size:12px;color:#6b4c3b;border-top:1px solid rgba(201,148,62,0.18);">Balance of <strong style="color:#1c1618;">{{balance_amount}}</strong> due before your first ceremony.</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 16px 40px;">
            <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;text-align:center;margin-bottom:6px;">Your Next Steps</div>
            <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;color:#1c1618;text-align:center;margin:0 0 28px 0;">Three things to do this week</h2>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 20px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="44" valign="top" style="padding-right:16px;">
                  <div style="width:36px;height:36px;border-radius:50%;background:rgba(201,148,62,0.12);color:#c9943e;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;text-align:center;line-height:36px;">1</div>
                </td>
                <td valign="top">
                  <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500;color:#1c1618;margin-bottom:4px;">Complete your patient application</div>
                  <div style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;line-height:1.6;margin-bottom:10px;">A confidential intake covering personal info, medical history, current medications, and your goals for this work. Please complete it first so our clinician can review before your consultation.</div>
                  <a href="{{application_link}}" style="display:inline-block;background:#c9943e;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:11px 22px;border-radius:3px;">Open Application →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 20px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="44" valign="top" style="padding-right:16px;">
                  <div style="width:36px;height:36px;border-radius:50%;background:rgba(201,148,62,0.12);color:#c9943e;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;text-align:center;line-height:36px;">2</div>
                </td>
                <td valign="top">
                  <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500;color:#1c1618;margin-bottom:4px;">Book your medical consultation</div>
                  <div style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;line-height:1.6;margin-bottom:10px;">Once your application is submitted, schedule a 30-minute video call with our MAPS-trained nurse practitioner. This is required clearance before any ceremony work.</div>
                  <a href="https://calendly.com/lauren-awknranch/30min" style="display:inline-block;background:transparent;color:#c9943e;border:1px solid #c9943e;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:10px 22px;border-radius:3px;">Schedule Consultation →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 36px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="44" valign="top" style="padding-right:16px;">
                  <div style="width:36px;height:36px;border-radius:50%;background:rgba(201,148,62,0.12);color:#c9943e;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;text-align:center;line-height:36px;">3</div>
                </td>
                <td valign="top">
                  <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500;color:#1c1618;margin-bottom:4px;">Once approved, choose your ceremony dates</div>
                  <div style="font-family:'Inter',sans-serif;font-size:14px;color:#6b4c3b;line-height:1.6;">After your consultation and clearance, we'll send you a private link to schedule your ceremonies and integration sessions around your life.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 36px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1c1618;border-radius:4px;">
              <tr>
                <td style="padding:32px 32px 28px 32px;text-align:center;">
                  <div style="font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c9943e;font-weight:600;margin-bottom:10px;">Stay With Us</div>
                  <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#ffffff;margin:0 0 12px 0;line-height:1.2;">Make this a true container — stay onsite at AWKN Ranch</h3>
                  <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:rgba(255,255,255,0.75);line-height:1.6;margin:0 0 18px 0;">Many of our clients choose to stay at AWKN Ranch during their work. Wake up on the land, slip into the sauna or cold plunge between sessions, share meals in community, and let the integration happen in your body — not in traffic on the way home.</p>
                  <p style="font-family:'Inter',sans-serif;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;margin:0 0 22px 0;">Private rooms, shared houses, and seasonal retreat experiences available. We will share options on your consultation call.</p>
                  <a href="https://awknranch.com/membership" style="display:inline-block;background:#c9943e;color:#ffffff;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:12px 26px;border-radius:3px;">Explore Stay Options →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px 40px;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14px;color:#6b4c3b;line-height:1.7;margin:0;text-align:center;border-top:1px solid rgba(201,148,62,0.18);padding-top:24px;">
              <strong style="color:#a67a2e;font-style:normal;font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;display:block;margin-bottom:6px;">Your deposit is fully refundable</strong>
              If our clinician determines you are not a medical fit, your {{deposit_amount}} is refunded in full within 3–5 business days. No questions, no friction.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 40px 40px;text-align:center;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#1c1618;line-height:1.6;margin:0 0 18px 0;">Questions? Reply to this email or reach us directly.</p>
            <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6b4c3b;line-height:1.8;">
              <a href="mailto:intake@within.center" style="color:#c9943e;text-decoration:none;">intake@within.center</a> &nbsp;·&nbsp;
              <a href="tel:5129692399" style="color:#c9943e;text-decoration:none;">512-969-2399</a>
            </div>
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;color:#1c1618;margin:24px 0 0 0;">With care,<br><em style="color:#6b4c3b;">Within Center Team</em></p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin-top:24px;">
        <tr>
          <td style="text-align:center;font-family:'Inter',sans-serif;font-size:11px;color:rgba(28,22,24,0.45);line-height:1.7;padding:0 24px;">
            <strong style="color:rgba(28,22,24,0.6);">MEDICAL DISCLAIMER</strong> · Ketamine therapy is a medical service that requires clearance from our licensed clinician. Your deposit is fully refundable if you do not qualify. This email is for informational purposes only, not medical advice.
            <br><br>
            © 2026 Hearth Space Health, Inc. · 7600 Stillridge Dr, Austin, TX 78736<br>
            Within Center is a sister practice to <a href="https://awknranch.com" style="color:rgba(28,22,24,0.5);text-decoration:underline;">AWKN Ranch</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      first_name,
      last_name,
      email,
      package_slug,
      package_name,
      deposit_amount,
      balance_amount,
    } = body ?? {};

    if (!email || !first_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, first_name" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Fill in package details from catalog if not provided
    const pkg = PACKAGES[String(package_slug ?? "").toLowerCase()] ?? null;
    const resolvedPackageName = package_name || pkg?.name || "Your Package";
    const resolvedDeposit = deposit_amount || pkg?.deposit || "";
    const resolvedBalance = balance_amount || pkg?.balance || "";

    const html = renderTemplate(HTML_TEMPLATE, {
      first_name: escapeHtml(first_name),
      package_name: escapeHtml(resolvedPackageName),
      deposit_amount: escapeHtml(resolvedDeposit),
      balance_amount: escapeHtml(resolvedBalance),
      application_link: APPLICATION_LINK,
    });

    const subject = `Your spot is held, ${first_name} — deposit received`;

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [email],
        subject,
        html,
      }),
    });

    const resendBody = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend API error", resendBody);
      return new Response(
        JSON.stringify({ error: "Resend API error", detail: resendBody }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendBody.id }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-within-deposit-email error", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err?.message ?? err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
