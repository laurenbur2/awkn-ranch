// Generates a populated AWKN Ranch rental agreement PDF for a given crm_proposal,
// uploads it to SignWell as an unsigned document with embedded signature + date
// fields for the Client, and stores the resulting signwell_document_id on the row.
//
// Caller supplies { proposal_id }. Returns { signwell_document_id, signing_url }.
//
// Auth: verify_jwt is managed via Management API. The project's ES256 "in_use"
// signing key means the Edge Functions gateway rejects user ES256 tokens when
// verify_jwt: true, so this function self-authenticates via supabase.auth.getUser(token)
// and must be patched to verify_jwt: false after every deploy
// (see memory: project_es256_jwt_gateway_bug).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Req {
  proposal_id: string;
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n || 0);
  return "$" + v.toFixed(2).replace(/\.00$/, "");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "TBD";
  try {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    return dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch { return d || "TBD"; }
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: authError?.message }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: appUser } = await supabase
      .from("app_users").select("role").eq("auth_user_id", user.id).maybeSingle();
    if (!appUser || !["admin", "staff", "oracle"].includes(appUser.role)) {
      return new Response(JSON.stringify({ error: "Admin or staff role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body: Req = await req.json();
    if (!body.proposal_id) {
      return new Response(JSON.stringify({ error: "Missing proposal_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Load the proposal + its lead
    const { data: proposal, error: pErr } = await supabase
      .from("crm_proposals")
      .select("*, items:crm_proposal_items(*)")
      .eq("id", body.proposal_id)
      .single();
    if (pErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found", detail: pErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: lead } = await supabase
      .from("crm_leads")
      .select("id, first_name, last_name, email, phone, business_line")
      .eq("id", proposal.lead_id).single();

    if (!lead?.email) {
      return new Response(JSON.stringify({ error: "Lead is missing an email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (lead.business_line !== "awkn_ranch") {
      return new Response(JSON.stringify({ error: "Contract generation is AWKN Ranch only" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const signwellKey = Deno.env.get("SIGNWELL_API_KEY");
    if (!signwellKey) {
      return new Response(JSON.stringify({ error: "SignWell is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const total = Number(proposal.total || 0);
    const depositPct = Number(proposal.deposit_percent ?? 50);
    const depositAmt = Math.round(total * depositPct) / 100;
    const balanceDue = Math.round((total - depositAmt) * 100) / 100;

    // Idempotency: if a SignWell document already exists for this proposal, reuse it
    // instead of creating a new one. Prevents duplicate docs (and burning SignWell
    // quota) when "Send" is clicked twice or the proposal is re-sent.
    //
    // Only reuse a doc that has a real signer recipient + signing_url. Earlier buggy
    // code created docs where the person ended up in `copied_contacts` (no signer,
    // no signing_url). Reusing those would email a dead button to the client.
    if (proposal.signwell_document_id) {
      const existing = await fetch(
        `https://www.signwell.com/api/v1/documents/${proposal.signwell_document_id}/`,
        { headers: { "X-Api-Key": signwellKey } }
      );
      if (existing.ok) {
        const data = await existing.json();
        const signingUrl =
          data?.recipients?.[0]?.signing_url ||
          data?.recipients?.[0]?.embedded_signing_url ||
          null;
        const recipientCount = Array.isArray(data?.recipients) ? data.recipients.length : 0;
        if (signingUrl && recipientCount > 0) {
          return new Response(JSON.stringify({
            success: true,
            signwell_document_id: proposal.signwell_document_id,
            signing_url: signingUrl,
            deposit_amount: depositAmt,
            balance_due: balanceDue,
            deposit_percent: depositPct,
            reused: true,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // Stored doc is unusable — delete it and recreate. Best-effort delete; ignore failures.
        console.warn("Stored SignWell doc has no valid signer, deleting and recreating:", proposal.signwell_document_id);
        await fetch(
          `https://www.signwell.com/api/v1/documents/${proposal.signwell_document_id}/`,
          { method: "DELETE", headers: { "X-Api-Key": signwellKey } }
        ).catch(() => {});
      } else {
        console.warn("Stored signwell_document_id not found on SignWell, recreating:", proposal.signwell_document_id);
      }
      // Clear the stale id so a fresh doc replaces it cleanly.
      await supabase
        .from("crm_proposals")
        .update({ signwell_document_id: null })
        .eq("id", proposal.id);
    }

    // --- Build the PDF ---
    const clientName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Client";

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 612, PAGE_H = 792;
    const MARGIN = 54;
    const LINE_H = 13;
    const BODY_SIZE = 10;

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
    const ensure = (h: number) => { if (y - h < MARGIN) newPage(); };

    const wrap = (text: string, maxW: number, f = font, size = BODY_SIZE): string[] => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const attempt = cur ? cur + " " + w : w;
        if (f.widthOfTextAtSize(attempt, size) <= maxW) cur = attempt;
        else { if (cur) lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    };

    const drawParagraph = (text: string, opts: { size?: number; font?: any; indent?: number } = {}) => {
      const size = opts.size || BODY_SIZE;
      const f = opts.font || font;
      const indent = opts.indent || 0;
      const maxW = PAGE_W - MARGIN * 2 - indent;
      const lines = wrap(text, maxW, f, size);
      for (const line of lines) {
        ensure(LINE_H);
        page.drawText(line, { x: MARGIN + indent, y, size, font: f, color: rgb(0, 0, 0) });
        y -= LINE_H;
      }
    };

    const drawHeading = (text: string) => {
      y -= 6;
      ensure(LINE_H + 4);
      page.drawText(text, { x: MARGIN, y, size: 12, font: bold, color: rgb(0, 0, 0) });
      y -= LINE_H + 2;
    };

    const drawSpacer = (h = 8) => { y -= h; };

    // --- Title ---
    page.drawText("AWKN RANCH EVENT SPACE RENTAL AGREEMENT", {
      x: MARGIN, y, size: 16, font: bold, color: rgb(0, 0, 0)
    });
    y -= 24;
    page.drawText(`Agreement Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, {
      x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3)
    });
    y -= 20;

    drawParagraph(
      `This Rental Agreement ("Agreement") is made by and between the Revocable Trust of Subhash Sonnad (dba AWKN Ranch) ("Company"), and ${clientName} ("Client" or "Renter").`
    );
    drawSpacer();
    drawParagraph(`Email: ${lead.email}`);
    if (lead.phone) drawParagraph(`Phone: ${lead.phone}`);

    drawHeading("RENTAL VENUE");
    drawParagraph(
      "Company agrees to rent to Client the spaces at 7600 Stillridge Dr (aka the Austin AWKN Ranch) as set forth in the Event Details Summary attached hereto."
    );

    drawHeading("RENTAL PERIOD");
    const eventDate = fmtDate(proposal.event_date);
    const startT = fmtTime(proposal.event_start);
    const endT = fmtTime(proposal.event_end);
    drawParagraph(`The rental period is ${eventDate} from ${startT} to ${endT}.`);
    if (proposal.setup_time || proposal.teardown_time) {
      drawParagraph(`Setup begins ${fmtTime(proposal.setup_time)}; teardown complete by ${fmtTime(proposal.teardown_time)}.`);
    }

    drawHeading("FEES");
    drawParagraph(`Total Rental Fee: ${fmtMoney(total)}.`);
    drawParagraph(`A ${depositPct}% deposit of ${fmtMoney(depositAmt)} is due to confirm the booking. The remaining balance of ${fmtMoney(balanceDue)} is due no later than 30 days before the event date.`);
    drawParagraph("If the event is canceled less than 14 days before the scheduled date, the deposit will not be refunded.");

    drawHeading("GUEST LIMIT");
    const guestCount = proposal.guest_count ? `${proposal.guest_count}` : "the agreed-upon";
    drawParagraph(
      `Client agrees no more than ${guestCount} people including volunteers and paid attendees will attend. Client agrees to pay $15 per additional person over the limit and to candidly report attendance.`
    );

    drawHeading("WARRANTY DISCLAIMER");
    drawParagraph(
      "Client acknowledges that the rental property is of a size, design, and capacity selected by Client, and that Company disclaims all warranties express or implied with respect to the rental property, including any express or implied warranties as to condition, fitness for a particular purpose or durability."
    );

    drawHeading("DAMAGED OR MISSING ITEMS");
    drawParagraph(
      "Damages include chipped, cracked or broken items, stained or dirtied upholstery beyond normal wear, and loss or damage due to theft, misuse, abuse, or Client's failure to care for the Rental Items. Any damages after delivery are the sole responsibility of Client. In the event of rain or inclement conditions, Client is responsible for shielding goods from the elements."
    );

    drawHeading("PHOTOGRAPHY & BRANDING");
    drawParagraph(
      "Client agrees that any photography of their event at the AWKN Ranch will not be publicly posted without permission. The name \"AWKN Ranch\" will only be used in describing the location and not as a host of the event."
    );

    drawHeading("INDEMNIFICATION");
    drawParagraph(
      "Client hereby voluntarily and expressly releases, indemnifies, forever discharges and holds harmless Company from any and all liability, claims, demands, causes or rights of action whether personal to Client, including those allegedly attributed to negligent acts or omissions. Should Company be required to incur attorney fees and costs to enforce this agreement, Client expressly agrees to indemnify and hold harmless Company for all such fees and costs."
    );

    drawHeading("DISPUTE RESOLUTION & APPLICABLE LAW");
    drawParagraph(
      "If a dispute arises under this Agreement, the parties agree to first try to resolve the dispute with the help of a mutually agreed-upon mediator in Travis County, TX. This Agreement shall be governed by the laws of the State of Texas, and any disputes arising from it must be handled exclusively in the federal and state courts located in Travis County, TX."
    );

    drawHeading("ENTIRE AGREEMENT");
    drawParagraph(
      "This Agreement (including attachments) contains the entire agreement of the parties and supersedes any prior written or oral agreements. This Agreement may be modified only in writing, signed by all parties."
    );

    drawHeading("FORCE MAJEURE");
    drawParagraph(
      "Neither party shall be liable for any failure of or delay in performance if such failure or delay is due to unforeseeable causes beyond its reasonable control, including acts of God, war, strikes, embargoes, pandemics, or government orders. A Force Majeure Event cannot be used to excuse Client's payment obligations; however, any amounts paid may be transferred to another event within one year of the originally scheduled date."
    );

    drawHeading("CLIENT OBLIGATIONS");
    const obligations = [
      "Staffing: Pre-event Setup to arrive 90 minutes before start. Post-event cleaners are required. Parking must be managed at all times guests are arriving and during the event to prevent parking on neighbors' property.",
      "Address Privacy: Client agrees NOT to post the venue address in any distributed materials (texts, emails, social media, printed materials). Instead use awknranch.com/visiting. $100 fee if address is posted.",
      "Parking Management: $150 penalty per neighbor complaint regarding parking on their property.",
      "Noise: Outside noise and music levels must be kept low after 9:30pm. $100 fee if neighbors complain about noise after this time. No outdoor PA speakers at high volume after 9:30pm.",
      "Cleaning Timeline: Cleaners arrive at least 90 minutes before event start. All cleaning must be complete by 1:01pm the day after the event. Late cleaning billed at $30 + $30/hour.",
      "Propane Usage: Propane used for heating, display, or hot tubs will be reimbursed from the damage deposit (if applicable).",
      "No Alcohol or Cooking Meat Inside: No alcohol inside the house. No cooking or storing meat in the kitchen. Meat may be cooked on the back patio.",
      "No RVs onsite at any time. $100 fee if this occurs.",
      "Linens & Furniture: Used linens/towels must be washed and returned. Any moved furniture must be returned to its original location.",
      "No Animals indoors or in the backyard. $100 fee per occurrence.",
    ];
    obligations.forEach((o, i) => drawParagraph(`${i + 1}. ${o}`, { indent: 8 }));

    // --- Signature page --- we track page/y here so we can send explicit field
    // coordinates to SignWell. text_tags are unreliable (they failed on our first
    // attempt — recipients ended up with no fields and the doc was unsignable).
    newPage();
    const sigPageNumber = pdf.getPageCount(); // 1-indexed for SignWell
    page.drawText("SIGNATURES", { x: MARGIN, y, size: 14, font: bold });
    y -= 24;
    drawParagraph(
      "By signing below, Client acknowledges that they have read and understood the entire Rental Agreement and agrees to its terms. Electronic signatures shall have the same force and effect as original signatures."
    );
    drawSpacer(20);

    // Client block
    page.drawText("CLIENT:", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 4;
    page.drawText(`Name: ${clientName}`, { x: MARGIN, y, size: 10, font });
    y -= LINE_H + 20;

    // Capture coordinates for the signature field. pdf-lib uses BOTTOM-LEFT
    // origin; SignWell uses TOP-LEFT origin. Convert: top = PAGE_H - y.
    // We only render a signature field — SignWell stamps the signed-at timestamp
    // on the completed PDF automatically and we also record contract_signed_at
    // in the DB via webhook. Adding a separate date field caused SignWell to
    // reject the create with "type can't be blank" on the date_signed field.
    page.drawText("Signature:", { x: MARGIN, y, size: 10, font });
    page.drawLine({
      start: { x: MARGIN + 70, y: y - 2 }, end: { x: MARGIN + 320, y: y - 2 },
      thickness: 0.5, color: rgb(0, 0, 0),
    });
    const sigFieldX = MARGIN + 70;
    const sigFieldY = PAGE_H - y - 18;
    const sigFieldW = 250;
    const sigFieldH = 22;

    y -= LINE_H + 30;

    // Company block (pre-signed text, no field)
    page.drawText("COMPANY: AWKN Ranch (dba Revocable Trust of Subhash Sonnad)", {
      x: MARGIN, y, size: 11, font: bold,
    });
    y -= LINE_H + 4;
    page.drawText("Rahul Sonnad, Administrator — 7600 Stillridge Dr, Austin, TX 78736", {
      x: MARGIN, y, size: 10, font,
    });

    const pdfBytes = await pdf.save();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

    // --- Upload to SignWell ---
    // `embedded_signing: false` + `send_email: false` → SignWell returns a shareable
    // `signing_url` on the recipient that we can email ourselves. embedded_signing URLs
    // only work inside SignWell's JS widget; they 404 when opened directly.
    //
    // Fields are passed explicitly (NOT via text_tags) — text_tags silently failed
    // to create fields on our first attempt, making the doc unsignable.
    // SignWell field coordinates: top-left origin, page is 1-indexed.
    const swBody = {
      test_mode: false,
      name: `${proposal.proposal_number} — ${clientName} — Rental Agreement`,
      subject: `Sign your AWKN Ranch rental agreement — ${proposal.proposal_number}`,
      message: `Hi ${lead.first_name || "there"}, please review and sign your rental agreement for ${eventDate}.`,
      embedded_signing: false,
      draft: false,
      recipients: [
        {
          id: "1",
          placeholder_name: "Client",
          name: clientName,
          email: lead.email,
          send_email: false,
        },
      ],
      files: [
        {
          name: `${proposal.proposal_number}-rental-agreement.pdf`,
          file_base64: pdfBase64,
        },
      ],
      fields: [
        [
          {
            type: "signature",
            x: sigFieldX,
            y: sigFieldY,
            page: sigPageNumber,
            required: true,
            recipient_id: "1",
            api_id: "sig_client",
          },
        ],
      ],
      metadata: {
        source: "crm-proposal",
        proposal_id: proposal.id,
        proposal_number: proposal.proposal_number,
        lead_id: lead.id,
      },
    };

    const swResp = await fetch("https://www.signwell.com/api/v1/documents/", {
      method: "POST",
      headers: {
        "X-Api-Key": signwellKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(swBody),
    });

    const swText = await swResp.text();
    let swData: any;
    try { swData = JSON.parse(swText); } catch { swData = { raw: swText }; }
    if (!swResp.ok) {
      console.error("SignWell create failed:", swResp.status, swData);
      const detailStr = typeof swData === "string" ? swData
        : (swData?.errors ? JSON.stringify(swData.errors)
        : swData?.message || JSON.stringify(swData));
      return new Response(JSON.stringify({
        error: "SignWell document creation failed",
        status: swResp.status,
        detail: detailStr,
      }), { status: swResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const signwellDocumentId = swData.id;
    const signingUrl =
      swData?.recipients?.[0]?.signing_url ||
      swData?.recipients?.[0]?.embedded_signing_url ||
      swData?.signing_url ||
      null;
    console.log("SignWell doc created:", {
      id: signwellDocumentId,
      signing_url: signingUrl,
      recipient_keys: swData?.recipients?.[0] ? Object.keys(swData.recipients[0]) : [],
    });

    // Persist on the proposal row
    await supabase
      .from("crm_proposals")
      .update({ signwell_document_id: signwellDocumentId })
      .eq("id", proposal.id);

    return new Response(JSON.stringify({
      success: true,
      signwell_document_id: signwellDocumentId,
      signing_url: signingUrl,
      deposit_amount: depositAmt,
      balance_due: balanceDue,
      deposit_percent: depositPct,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("create-proposal-contract error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
