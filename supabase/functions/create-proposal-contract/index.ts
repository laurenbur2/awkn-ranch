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

    // Helper to render a labeled "Label: Value" line.
    const drawKV = (label: string, value: string) => {
      ensure(LINE_H);
      page.drawText(label, { x: MARGIN, y, size: BODY_SIZE, font: bold });
      const labelW = bold.widthOfTextAtSize(label, BODY_SIZE) + 4;
      const maxW = PAGE_W - MARGIN * 2 - labelW;
      const lines = wrap(value || "", maxW);
      if (lines.length === 0) { y -= LINE_H; return; }
      page.drawText(lines[0], { x: MARGIN + labelW, y, size: BODY_SIZE, font });
      y -= LINE_H;
      for (let i = 1; i < lines.length; i++) {
        ensure(LINE_H);
        page.drawText(lines[i], { x: MARGIN + labelW, y, size: BODY_SIZE, font });
        y -= LINE_H;
      }
    };

    const drawBullet = (text: string) => {
      ensure(LINE_H);
      const indent = 14;
      const maxW = PAGE_W - MARGIN * 2 - indent;
      const lines = wrap(text, maxW);
      page.drawText("\u2022", { x: MARGIN, y, size: BODY_SIZE, font });
      lines.forEach((line, i) => {
        if (i > 0) { y -= LINE_H; ensure(LINE_H); }
        page.drawText(line, { x: MARGIN + indent, y, size: BODY_SIZE, font });
      });
      y -= LINE_H;
    };

    const eventDate = fmtDate(proposal.event_date);
    const startT = fmtTime(proposal.event_start);
    const endT = fmtTime(proposal.event_end);
    const guestCountStr = proposal.guest_count ? `${proposal.guest_count}` : "";

    // Derive Event Space description from proposal line items (venue category first).
    const items: any[] = Array.isArray(proposal.items) ? proposal.items : [];
    const venueItems = items.filter(i => (i.category || "").toLowerCase() === "venue");
    const spaceItems = venueItems.length ? venueItems : items;
    const eventSpaceStr = spaceItems.map(i => i.description || "").filter(Boolean).join("; ");

    // Cleaning fee: any line item with "clean" in the description (default $0).
    const cleaningFee = items
      .filter(i => /clean/i.test(i.description || ""))
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const rentalFee = total - cleaningFee;
    const agreementDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // --- Title ---
    const title = "AWKN EVENT SPACE RENTAL AGREEMENT";
    const titleW = bold.widthOfTextAtSize(title, 16);
    page.drawText(title, { x: (PAGE_W - titleW) / 2, y, size: 16, font: bold });
    y -= 28;

    drawParagraph(
      `This Event Space Rental Agreement ("Agreement") is made and entered into on this ${agreementDate}, by and between:`
    );
    drawSpacer();

    // OWNER block
    page.drawText("OWNER:", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 2;
    drawParagraph("AWKN Ranch", { indent: 8 });
    drawParagraph("Address: 7600 Stillridge Dr, Austin, TX 78736", { indent: 8 });
    drawParagraph("Phone: 831-713-7698", { indent: 8 });
    drawParagraph("Email: jeri@within.center", { indent: 8 });
    drawSpacer();

    // RENTER block
    page.drawText("RENTER:", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 2;
    drawKV("Name/Organization: ", clientName);
    drawKV("Phone: ", lead.phone || "");
    drawKV("Email: ", lead.email || "");

    // 1. EVENT DETAILS
    drawHeading("1. EVENT DETAILS");
    drawParagraph("Renter agrees to rent the event space owned by AWKN Ranch under the following terms:");
    drawKV("Event Name/Type: ", proposal.title || proposal.event_type || "");
    drawKV("Event Date(s): ", eventDate);
    drawKV("Event Start Time: ", `${startT}    |   End Time: ${endT}`);
    drawKV("Expected Number of Guests: ", guestCountStr);
    drawKV("Event Space: ", eventSpaceStr);

    // 2. RENTAL FEES & PAYMENT SCHEDULE
    drawHeading("2. RENTAL FEES & PAYMENT SCHEDULE");
    drawKV("Rental Fee: ", fmtMoney(rentalFee));
    drawKV("Cleaning Fee: ", cleaningFee > 0 ? fmtMoney(cleaningFee) : "Included");
    drawKV("Deposit: ", fmtMoney(depositAmt));
    drawParagraph(`${depositPct}% of Rental Fee to Secure the Space`, { indent: 8 });
    drawKV("Total Due at Signing: ", fmtMoney(depositAmt));
    drawKV(`Remaining ${100 - depositPct}% Due 30 Days before event date: `, fmtMoney(balanceDue));
    drawSpacer();
    drawParagraph("Payment Methods:", { font: bold });
    drawParagraph("Payments may be made via Check, Credit Card, or Bank Transfer via Quickbooks", { indent: 8 });
    drawParagraph("All fees are non-refundable unless otherwise stated in this Agreement.");

    // 3. CANCELLATION POLICY
    drawHeading("3. CANCELLATION POLICY");
    drawBullet("75+ Days Before Event: 100% of deposit refundable.");
    drawBullet("30–59 Days Before Event: 50% of deposit refundable.");
    drawBullet("Less Than 30 Days Before Event: Deposit is non-refundable, and the full balance remains due.");

    // 4. RULES AND REGULATIONS
    drawHeading("4. RULES AND REGULATIONS");
    drawParagraph("Renter agrees to comply with the following rules:");
    drawBullet("Event Capacity: Shall not exceed 50 people.");
    drawBullet("Smoking/Substance Use: No smoking or illegal substances are allowed on the premises.");
    drawBullet("Decorations: Must not damage walls, floors, or fixtures. Use of nails, staples, or adhesives is prohibited.");
    drawBullet("Noise Ordinance: Noise levels must comply with City of Austin local noise laws.");
    drawBullet("Event End Time: Guests must vacate the premises by the designated end time.");
    drawBullet("Alcohol: Alcohol is not permitted.");

    // 5. LIABILITY & INSURANCE
    drawHeading("5. LIABILITY & INSURANCE");
    drawParagraph("Renter assumes full responsibility for all damages, injuries, or losses caused by themselves, guests, vendors, or third parties.");
    drawParagraph("AWKN Ranch shall not be liable for loss, theft, or damage to personal property.");

    // 6. CLEANUP & DAMAGE POLICY
    drawHeading("6. CLEANUP & DAMAGE POLICY");
    drawParagraph("Renter agrees to leave the event space in its original condition.");
    drawParagraph("All decorations, trash, and personal belongings must be removed by the agreed breakdown time.");
    drawParagraph("Renter agrees to enforce respect for the land, our staff, and the space to all attendees.");
    drawParagraph("Damages beyond normal wear and tear will be deducted from the Security Deposit. If damages exceed the deposit, Renter is liable for the balance.");

    // 7. INDEMNIFICATION
    drawHeading("7. INDEMNIFICATION");
    drawParagraph("Renter agrees to indemnify, defend, and hold harmless AWKN Ranch, its owners, employees, and agents from any claims, losses, damages, or expenses arising from:");
    drawBullet("Renter's use of the premises.");
    drawBullet("Any negligence or misconduct by Renter, guests, or vendors.");
    drawBullet("Any violation of this Agreement or applicable laws.");

    // 8. FORCE MAJEURE
    drawHeading("8. FORCE MAJEURE");
    drawParagraph("Neither party shall be held liable for failure to perform due to circumstances beyond their control, including:");
    drawBullet("Acts of God (e.g., floods, hurricanes, wildfires).");
    drawBullet("Government mandates or regulations.");
    drawBullet("Other unforeseen circumstances rendering the event impossible.");
    drawParagraph("If such events occur, both parties agree to reschedule the event where possible or negotiate partial refunds.");

    // 9. MISCELLANEOUS
    drawHeading("9. MISCELLANEOUS");
    drawParagraph("Entire Agreement: This Agreement constitutes the full understanding between both parties.");
    drawParagraph("Amendments: Any amendments must be made in writing and signed by both parties.");
    drawParagraph("Governing Law: This Agreement shall be governed by and interpreted in accordance with the laws of the State of Texas.");
    drawParagraph("Severability: If any provision of this Agreement is deemed unenforceable, the remaining provisions remain in full effect.");
    drawParagraph("Rule of Threes: The enforceability of this contract is ensured by:");
    drawBullet("Clear written obligations.");
    drawBullet("Written signatures of both parties.");
    drawBullet("Exchange of consideration (deposit and rental fees).");

    // 10. SIGNATURES — on a fresh page so the signature field is easy to find.
    newPage();
    const sigPageNumber = pdf.getPageCount(); // 1-indexed for SignWell
    page.drawText("10. SIGNATURES", { x: MARGIN, y, size: 14, font: bold });
    y -= 22;

    page.drawText("RENTER", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 6;
    drawKV("Name: ", clientName);
    y -= 14;

    // Signature field. pdf-lib uses BOTTOM-LEFT origin; SignWell uses TOP-LEFT.
    page.drawText("Signature:", { x: MARGIN, y, size: 10, font });
    page.drawLine({
      start: { x: MARGIN + 70, y: y - 2 }, end: { x: MARGIN + 340, y: y - 2 },
      thickness: 0.5, color: rgb(0, 0, 0),
    });
    const sigFieldX = MARGIN + 70;
    const sigFieldY = PAGE_H - y - 18;
    const sigFieldW = 270;
    const sigFieldH = 22;

    page.drawText("Date:", { x: MARGIN + 360, y, size: 10, font });
    page.drawLine({
      start: { x: MARGIN + 390, y: y - 2 }, end: { x: MARGIN + 500, y: y - 2 },
      thickness: 0.5, color: rgb(0, 0, 0),
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
