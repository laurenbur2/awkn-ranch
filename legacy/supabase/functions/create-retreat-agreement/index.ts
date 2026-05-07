// Generates a populated Within Retreat Agreement PDF for a given lead/package,
// uploads it to SignWell as an unsigned document with embedded signature + date
// fields for the Guest, and stores the resulting signwell_document_id on a
// within_retreat_agreements row.
//
// Caller supplies { lead_id, package_id?, accommodation_type?, arrival_date?,
//   departure_date?, total_fee?, deposit_amount?, remaining_balance?,
//   emergency_contact?, preview? }.
// Returns { agreement_id, signwell_document_id, signing_url } on success, or
// { preview: true, pdf_base64, filename } when preview=true.
//
// Mirrors the rental flow in create-proposal-contract: same self-auth pattern
// (verify_jwt: false), same pdf-lib rendering, same SignWell create payload
// shape, same idempotency rule (reuse a usable doc, otherwise recreate).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Req {
  lead_id: string;
  package_id?: string;
  accommodation_type?: string;        // "Private" | "Shared"
  arrival_date?: string;              // YYYY-MM-DD
  departure_date?: string;            // YYYY-MM-DD
  total_fee?: number;                 // dollars
  deposit_amount?: number;            // dollars
  remaining_balance?: number;         // dollars (defaults to total - deposit)
  emergency_contact?: string;         // free text — name, relationship, phone
  preview?: boolean;
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n || 0);
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "TBD";
  try {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    return dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch { return d || "TBD"; }
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
      .from("app_users").select("id, role").eq("auth_user_id", user.id).maybeSingle();
    if (!appUser || !["admin", "staff", "oracle"].includes(appUser.role)) {
      return new Response(JSON.stringify({ error: "Admin or staff role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body: Req = await req.json();
    if (!body.lead_id) {
      return new Response(JSON.stringify({ error: "Missing lead_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Load the lead.
    const { data: lead, error: lErr } = await supabase
      .from("crm_leads")
      .select("id, first_name, last_name, email, phone, business_line")
      .eq("id", body.lead_id).single();
    if (lErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found", detail: lErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!lead.email) {
      return new Response(JSON.stringify({ error: "Lead is missing an email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Optional package — used for downstream auto-fill of accommodation/total
    // when the caller didn't override.
    let pkg: any = null;
    if (body.package_id) {
      const { data } = await supabase
        .from("client_packages")
        .select("id, name, occupancy, price_cents, check_in_at, check_out_at")
        .eq("id", body.package_id).maybeSingle();
      pkg = data;
    }

    const accommodationType = body.accommodation_type
      || (pkg?.occupancy === "shared" ? "Shared" : pkg?.occupancy === "private" ? "Private" : "Private");
    const arrivalDate = body.arrival_date || (pkg?.check_in_at ? String(pkg.check_in_at).slice(0, 10) : "");
    const departureDate = body.departure_date || (pkg?.check_out_at ? String(pkg.check_out_at).slice(0, 10) : "");
    const totalFee = Number(body.total_fee ?? (pkg?.price_cents ? pkg.price_cents / 100 : 0));
    const depositAmount = Number(body.deposit_amount ?? Math.round(totalFee * 0.1 * 100) / 100);
    const remainingBalance = Number(body.remaining_balance ?? Math.round((totalFee - depositAmount) * 100) / 100);
    const emergencyContact = body.emergency_contact || "";

    const isPreview = body.preview === true;
    const signwellKey = Deno.env.get("SIGNWELL_API_KEY");
    if (!signwellKey && !isPreview) {
      return new Response(JSON.stringify({ error: "SignWell is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Find or create the within_retreat_agreements row. Idempotency: reuse a
    // pending/sent row for this lead+package if the SignWell doc is still good.
    let agreement: any = null;
    if (!isPreview) {
      const { data: existing } = await supabase
        .from("within_retreat_agreements")
        .select("*")
        .eq("lead_id", body.lead_id)
        .eq("package_id", body.package_id || null)
        .in("status", ["pending", "sent"])
        .order("created_at", { ascending: false })
        .limit(1);
      agreement = existing?.[0] || null;

      if (agreement?.signwell_document_id) {
        const swResp = await fetch(
          `https://www.signwell.com/api/v1/documents/${agreement.signwell_document_id}/`,
          { headers: { "X-Api-Key": signwellKey! } }
        );
        if (swResp.ok) {
          const data = await swResp.json();
          const signingUrl =
            data?.recipients?.[0]?.signing_url ||
            data?.recipients?.[0]?.embedded_signing_url ||
            null;
          const recipientCount = Array.isArray(data?.recipients) ? data.recipients.length : 0;
          if (signingUrl && recipientCount > 0) {
            return new Response(JSON.stringify({
              success: true,
              reused: true,
              agreement_id: agreement.id,
              signwell_document_id: agreement.signwell_document_id,
              signing_url: signingUrl,
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          // Doc exists but unusable (no signer) — delete it and recreate.
          await fetch(
            `https://www.signwell.com/api/v1/documents/${agreement.signwell_document_id}/`,
            { method: "DELETE", headers: { "X-Api-Key": signwellKey! } }
          ).catch(() => {});
        }
        // Clear the stale id; we'll write a fresh doc into the same row below.
        await supabase
          .from("within_retreat_agreements")
          .update({ signwell_document_id: null })
          .eq("id", agreement.id);
      }
    }

    // --- Build the PDF ---
    const guestName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Guest";
    const agreementDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 612, PAGE_H = 792;
    const MARGIN = 48;
    const LINE_H = 11;
    const BODY_SIZE = 9.5;

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
    const ensure = (h: number) => { if (y - h < MARGIN) newPage(); };

    const wrap = (text: string, maxW: number, f: any = font, size = BODY_SIZE): string[] => {
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

    const drawParagraph = (text: string, opts: { size?: number; font?: any; indent?: number; spaceAfter?: number } = {}) => {
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
      if (opts.spaceAfter) y -= opts.spaceAfter;
    };

    const drawHeading = (text: string) => {
      y -= 4;
      ensure(LINE_H + 4);
      page.drawText(text, { x: MARGIN, y, size: 11, font: bold, color: rgb(0, 0, 0) });
      y -= LINE_H + 2;
    };

    const drawCaps = (text: string) => {
      ensure(LINE_H);
      const lines = wrap(text, PAGE_W - MARGIN * 2, bold, BODY_SIZE);
      for (const line of lines) {
        ensure(LINE_H);
        page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: bold });
        y -= LINE_H;
      }
    };

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
      page.drawText("•", { x: MARGIN, y, size: BODY_SIZE, font });
      lines.forEach((line, i) => {
        if (i > 0) { y -= LINE_H; ensure(LINE_H); }
        page.drawText(line, { x: MARGIN + indent, y, size: BODY_SIZE, font });
      });
      y -= LINE_H;
    };

    const drawSpacer = (h = 4) => { y -= h; };

    // --- Title ---
    const title = "WITHIN RETREAT AGREEMENT";
    const titleW = bold.widthOfTextAtSize(title, 14);
    page.drawText(title, { x: (PAGE_W - titleW) / 2, y, size: 14, font: bold });
    y -= 22;

    drawParagraph(
      `This Retreat Agreement ("Agreement") is made on ${agreementDate} by and between Heart Space Health, Inc., a Texas corporation doing business as Within Center and operating retreats at AWKN Ranch ("Within"), and the guest identified below ("Guest").`
    );
    drawSpacer(6);

    page.drawText("GUEST", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 1;
    drawKV("Name: ", guestName);
    drawKV("Email: ", lead.email || "");
    drawKV("Phone: ", lead.phone || "");
    if (emergencyContact) drawKV("Emergency Contact: ", emergencyContact);

    drawCaps(
      "READ CAREFULLY BEFORE SIGNING. THIS AGREEMENT REQUIRES BINDING INDIVIDUAL ARBITRATION AND WAIVES THE RIGHT TO A JURY TRIAL OR CLASS ACTION. MEDICAL ELIGIBILITY, KETAMINE TREATMENT, AND CLINICAL RISK ARE GOVERNED BY WITHIN'S SEPARATE MEDICAL CONSENT AND INFORMED CONSENT FOR KETAMINE-ASSISTED THERAPY — THOSE DOCUMENTS CONTROL ON ANY CLINICAL MATTER."
    );
    drawSpacer();

    // 1. RETREAT TERMS
    drawHeading("1. RETREAT TERMS");
    drawKV("Accommodation Type: ", accommodationType);
    drawKV("Arrival Date: ", fmtDate(arrivalDate));
    drawKV("Departure Date: ", fmtDate(departureDate));
    drawKV("Check-in Window: ", "4:00 PM – 6:00 PM");
    drawKV("Check-out Time: ", "11:00 AM");
    drawKV("Total Fee: ", fmtMoney(totalFee));
    drawKV("Deposit Paid: ", fmtMoney(depositAmount));
    drawKV("Remaining Balance: ", fmtMoney(remainingBalance));
    drawSpacer();
    drawParagraph(
      "The Total Fee covers lodging, programming, meals, and the ceremonies described in Guest's package. It does NOT cover travel to and from the property, add-on services, medical or hospital costs, or post-retreat integration purchased separately."
    );
    drawParagraph(
      'The "Site" is AWKN Ranch at 7600 Grove Crest Circle, Austin, Texas. "Physical Activities" means non-clinical activities at the Site (walking, swimming, hiking, yoga, breathwork, sauna, cold plunge, hot tub, and similar).'
    );

    // 2. PAYMENT, REFUNDS, AND CANCELLATION
    drawHeading("2. PAYMENT, REFUNDS, AND CANCELLATION");
    drawParagraph("2.1 Payment. The Remaining Balance is due no later than seven (7) days before the Arrival Date. Within may decline check-in if any balance is unpaid.");
    drawParagraph("2.2 Cancellation by Guest:");
    drawBullet("More than 60 days out: refund of all amounts paid less the non-refundable Deposit.");
    drawBullet("31 to 60 days out: 50% refund less the non-refundable Deposit.");
    drawBullet("30 days or fewer: no refund; amounts paid are forfeited.");
    drawParagraph("2.3 Medical Disqualification. If the Within Clinic determines before Arrival that Guest is medically ineligible — for reasons truthfully disclosed and outside Guest's control — Within will refund all amounts paid less a $250 administrative fee, or apply the full amount as a credit toward a future Retreat within twelve (12) months. Does not apply if Guest withheld or misrepresented medical information.");
    drawParagraph("2.4 Force Majeure. If Within cancels or curtails the Retreat for an event beyond its reasonable control (fire, flood, severe weather, pandemic, government order, facility emergency), Guest may elect a refund of the unused portion or a credit toward a future Retreat within twelve (12) months.");
    drawParagraph("2.5 Early Departure / No-Show. No refund is owed for early departure, late arrival, or no-show, except as expressly provided in Sections 2.3 or 2.4.");
    drawParagraph("2.6 Transfer. Guest may not transfer their place to another person without Within's prior written consent. Subject to availability and a $250 transfer fee, paid amounts may be applied to a future Retreat within twelve (12) months.");

    // 3. ELIGIBILITY AND VOLUNTARY PARTICIPATION
    drawHeading("3. ELIGIBILITY AND VOLUNTARY PARTICIPATION");
    drawParagraph("Guest represents they are at least eighteen (18) years of age and have legal capacity to enter into this Agreement. Participation in every aspect of the Retreat is voluntary; Guest may decline or withdraw from any specific activity at any time. Guest acknowledges that Physical Activities involve inherent risks (muscle strain, sprain, fracture, fatigue, dehydration, and injuries arising from Guest's own actions or others'), and accepts those risks — including risks not specifically considered.");

    // 4. SUBSTANCES, DRIVING, AND ON-SITE POLICIES
    drawHeading("4. SUBSTANCES, DRIVING, AND ON-SITE POLICIES");
    drawParagraph("4.1 Drugs and Alcohol. No alcohol, cannabis, or non-prescribed psychoactive substances for forty-eight (48) hours before arrival, during the Retreat, or for the period after a ceremony specified by the Within Clinic. Within may test, search, or remove a Guest in violation without refund.");
    drawParagraph("4.2 No Driving on Ceremony Days. Guest agrees not to drive, operate machinery, or make legally binding decisions for at least twenty-four (24) hours after each ceremony, or longer if specified by the Within Clinic. If Guest is not staying onsite, Guest must arrange a ride in advance. Guest is solely responsible for transportation to and from the Site.");
    drawParagraph("4.3 Smoking, Vaping, Open Flames. Prohibited inside any building and within twenty-five (25) feet of any building. Designated outdoor areas may be made available at Within's discretion.");
    drawParagraph("4.4 Firearms and Weapons. No firearms, ammunition, or weapons of any kind on the Site.");
    drawParagraph("4.5 Pets and Visitors. No pets, additional guests, or outside visitors without Within's prior written consent.");
    drawParagraph("4.6 Quiet Hours. 10:00 PM – 7:00 AM, or as otherwise communicated at check-in.");

    // 5. CONDUCT AND REMOVAL
    drawHeading("5. CONDUCT AND REMOVAL");
    drawParagraph("Guest agrees to treat all other guests, staff, clinicians, contractors, and the property with respect at all times. The following are grounds for immediate removal without refund:");
    drawBullet("physical, verbal, or sexual harassment or assault;");
    drawBullet("threats, intimidation, or harassing behavior;");
    drawBullet("intoxication outside of supervised ceremony;");
    drawBullet("non-consensual recording or sharing of other guests' likeness, voice, or disclosures;");
    drawBullet("repeated or willful violation of Site policies;");
    drawBullet("behavior that, in Within's reasonable judgment, jeopardizes the safety, healing process, or experience of any other person at the Site.");
    drawParagraph("Within may also suspend or remove a Guest for medical-safety reasons. Removal does not entitle Guest to a refund except where covered by Section 2.3.");

    // 6. CONFIDENTIALITY OF OTHER GUESTS
    drawHeading("6. CONFIDENTIALITY OF OTHER GUESTS");
    drawParagraph("The Retreat involves shared circles and informal disclosures of deeply personal information. Guest agrees to keep confidential anything shared by another guest, and will not disclose, repeat, publish, or reproduce any other guest's identity, presence, statements, or experiences without that guest's prior written consent. This obligation survives termination.");

    // 7. PHOTO, VIDEO, AND RECORDING
    drawHeading("7. PHOTO, VIDEO, AND RECORDING");
    drawParagraph("Photographing, filming, or audio-recording any ceremony, group circle, or other guest is strictly prohibited. Within will not use Guest's name, image, voice, or testimonial for marketing without Guest's separate written consent.");

    // 8. PROPERTY, INSURANCE, AND MEDICAL COSTS
    drawHeading("8. PROPERTY, INSURANCE, AND MEDICAL COSTS");
    drawParagraph("Guest is responsible for the condition of Guest's room and any equipment, linens, or property used during the Retreat, and agrees to pay for damage beyond ordinary wear and tear. Within may charge the payment method on file for documented damage.");
    drawParagraph("Ketamine-assisted therapy is generally not covered by health insurance. Within does not provide health, accident, or travel insurance for Guests. Any medical, hospital, ambulance, evacuation, prescription, or specialist costs incurred by Guest are Guest's sole responsibility.");

    // 9. ASSUMPTION OF RISK AND RELEASE OF LIABILITY
    drawHeading("9. ASSUMPTION OF RISK AND RELEASE OF LIABILITY");
    drawCaps(
      "GUEST ACKNOWLEDGES THAT GUEST'S DECISION TO ATTEND THE RETREAT IS MADE WITH FULL KNOWLEDGE OF THE INFORMATION IN THIS AGREEMENT AND IN THE SEPARATE MEDICAL CONSENT AND INFORMED CONSENT, AND IS VOLUNTARY. GUEST AGREES TO BE SOLELY RESPONSIBLE FOR ASSUMPTION OF ALL RISK CONNECTED WITH THE RETREAT — INCLUDING THE PHYSICAL ACTIVITIES, LODGING, AND ON-SITE PROGRAMMING."
    );
    drawSpacer();
    drawCaps(
      "EXPRESS NEGLIGENCE NOTICE. GUEST EXPRESSLY RELEASES WITHIN, ITS PARENTS, SUBSIDIARIES, AFFILIATES, OWNERS, OFFICERS, DIRECTORS, EMPLOYEES, CLINICIANS, AGENTS, CONTRACTORS, AND REPRESENTATIVES (THE \"RELEASED PARTIES\") FROM CLAIMS ARISING OUT OF THE NEGLIGENCE, ACTS, OR OMISSIONS OF ANY OF THE RELEASED PARTIES, IN CONNECTION WITH GUEST'S STAY, USE OF THE SITE, AND PARTICIPATION IN THE PHYSICAL ACTIVITIES. THIS NOTICE IS GIVEN TO COMPLY WITH THE EXPRESS NEGLIGENCE DOCTRINE UNDER TEXAS LAW."
    );
    drawSpacer();
    drawParagraph(
      "To the fullest extent permitted by Texas law, Guest releases, waives, and covenants not to sue the Released Parties from any claim — known or unknown, in law or equity — arising out of or related to Guest's stay, use of the Site, or participation in the Physical Activities, including claims based on the negligence of any Released Party."
    );
    drawParagraph(
      "Carve-outs. This release does NOT apply to: (a) gross negligence, recklessness, or intentional misconduct; (b) medical malpractice claims, which are governed exclusively by the Medical Consent, the Informed Consent, and applicable Texas law including Chapter 74 of the Texas Civil Practice and Remedies Code; or (c) any claim that Texas law or public policy does not permit to be released in advance."
    );

    // 10. INDEMNIFICATION
    drawHeading("10. INDEMNIFICATION");
    drawParagraph("Guest agrees to defend, indemnify, and hold harmless the Released Parties from any claim, demand, loss, damage, cost, or expense (including reasonable attorneys' fees) arising out of (a) Guest's breach of this Agreement, (b) Guest's conduct at the Site, (c) property damage caused by Guest, or (d) any third-party claim arising from Guest's acts or omissions. Within may select its own counsel.");

    // 11. RESTRICTIONS
    drawHeading("11. RESTRICTIONS");
    drawParagraph("Guest agrees not to: (a) sell, resell, or transfer Guest's place except as permitted in Section 2.6; (b) conduct any competing program, training, or commercial activity on the Site; (c) solicit other guests for unrelated services; (d) bring or distribute controlled, illegal, or non-prescribed psychoactive substances; or (e) admit any unauthorized person to the Site.");

    // 12. DISPUTE RESOLUTION
    drawHeading("12. DISPUTE RESOLUTION");
    drawParagraph("12.1 Informal Resolution. Before any formal proceeding, the Parties will attempt in good faith to resolve any dispute directly for at least thirty (30) days.");
    drawParagraph("12.2 Binding Arbitration. Any unresolved dispute will be submitted to binding individual arbitration administered by JAMS or the American Arbitration Association under its consumer rules, in Travis County, Texas, before a single arbitrator bound by Texas law and applicable federal law. The arbitrator may not add parties, vary this Agreement, award punitive damages (except where required by statute), or certify a class. Each Party bears its own fees and costs unless otherwise required by law.");
    drawParagraph("12.3 Carve-out. Either Party may bring a claim for injunctive relief in connection with intellectual property in the federal or state courts in Travis County, Texas. Claims not subject to mandatory arbitration under applicable law are not waived by this Section.");
    drawParagraph("12.4 Limitations. Any claim must be initiated within one (1) year after it accrues, or it is permanently barred, except where a longer period is required by law.");

    // 13. CLASS ACTION + JURY TRIAL WAIVER
    drawHeading("13. CLASS ACTION AND JURY TRIAL WAIVER");
    drawCaps(
      "TO THE FULLEST EXTENT PERMITTED BY LAW, THE PARTIES WAIVE THE RIGHT TO PARTICIPATE IN ANY CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING AND THE RIGHT TO A JURY TRIAL FOR ANY DISPUTE ARISING OUT OF OR RELATED TO THIS AGREEMENT."
    );

    // 14. GOVERNING LAW + 15. MISC
    drawHeading("14. GOVERNING LAW AND VENUE");
    drawParagraph("This Agreement is governed by the internal laws of the State of Texas, without regard to conflict-of-law principles. Subject to Section 12, the Parties submit to the exclusive jurisdiction of the federal and state courts in Travis County, Texas.");

    drawHeading("15. MISCELLANEOUS");
    drawParagraph("15.1 Notices are in writing, delivered to the email addresses on file, with a copy by mail to: Heart Space Health, Inc., 7600 Grove Crest Circle, Austin, Texas, Attn: Executive Director.");
    drawParagraph("15.2 Electronic Signature. This Agreement may be signed electronically (DocuSign, SignWell, or similar) with the same effect as a handwritten signature, in counterparts that together form one instrument.");
    drawParagraph("15.3 Entire Agreement. This Agreement, together with the Medical Consent, the Informed Consent, and any HIPAA Authorization signed by Guest, is the entire agreement and supersedes all prior understandings. In the event of conflict between this Agreement and either of the consents on any clinical or medical matter, the consents control. Amendments must be in writing and signed by both Parties (electronic signatures suffice).");
    drawParagraph("15.4 Severability. If any provision is held invalid or unenforceable, the rest remains in effect, and the invalid provision is replaced with a valid provision that most closely reflects the original intent.");
    drawParagraph("15.5 No Waiver. No failure or delay by Within in exercising any right is a waiver of that right.");
    drawParagraph("15.6 Survival. Sections 6, 8, 9, 10, 11, 12, 13, and 14 survive termination.");

    // SIGNATURES — keep block together (>= 110pt)
    ensure(120);
    y -= 8;
    const sigPageNumber = pdf.getPageCount();
    page.drawText("SIGNATURE", { x: MARGIN, y, size: 12, font: bold });
    y -= LINE_H + 4;
    drawParagraph("By signing below, Guest acknowledges that Guest has read, understood, and agreed to this Agreement, that Guest has had the opportunity to ask questions and consult independent counsel, and that Guest enters into this Agreement freely and voluntarily.");
    y -= 6;

    page.drawText("GUEST", { x: MARGIN, y, size: 10, font: bold });
    y -= LINE_H + 3;
    drawKV("Name: ", guestName);
    y -= 10;

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
    const dateFieldX = MARGIN + 390;
    const dateFieldY = PAGE_H - y - 18;
    const dateFieldW = 110;
    const dateFieldH = 22;

    const pdfBytes = await pdf.save();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

    if (isPreview) {
      return new Response(JSON.stringify({
        preview: true,
        pdf_base64: pdfBase64,
        filename: `${guestName.replace(/\s+/g, "-")}-retreat-agreement.pdf`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- Upload to SignWell ---
    const swBody = {
      test_mode: false,
      name: `Within Retreat Agreement — ${guestName}`,
      subject: `Sign your Within retreat agreement, ${lead.first_name || guestName}`,
      message: `Hi ${lead.first_name || "there"}, please review and sign your Within retreat agreement for ${fmtDate(arrivalDate)}.`,
      embedded_signing: false,
      draft: false,
      recipients: [
        {
          id: "1",
          placeholder_name: "Guest",
          name: guestName,
          email: lead.email,
          send_email: false,
        },
      ],
      files: [
        {
          name: `${guestName.replace(/\s+/g, "-")}-retreat-agreement.pdf`,
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
            api_id: "sig_guest",
          },
          {
            type: "date_signed",
            x: dateFieldX,
            y: dateFieldY,
            page: sigPageNumber,
            required: true,
            recipient_id: "1",
            api_id: "sig_date",
          },
        ],
      ],
      metadata: {
        source: "within-retreat-agreement",
        lead_id: lead.id,
        package_id: body.package_id || "",
      },
    };

    const swResp = await fetch("https://www.signwell.com/api/v1/documents/", {
      method: "POST",
      headers: {
        "X-Api-Key": signwellKey!,
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

    const mergeData = {
      accommodation_type: accommodationType,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      total_fee: totalFee,
      deposit_amount: depositAmount,
      remaining_balance: remainingBalance,
      emergency_contact: emergencyContact,
      guest_name: guestName,
      guest_email: lead.email,
      guest_phone: lead.phone || "",
    };

    // Upsert into within_retreat_agreements: reuse existing pending row if we
    // had one, otherwise insert a new row.
    let agreementRow: any = null;
    if (agreement?.id) {
      const { data, error } = await supabase
        .from("within_retreat_agreements")
        .update({
          signwell_document_id: signwellDocumentId,
          signing_url: signingUrl,
          status: "sent",
          sent_at: new Date().toISOString(),
          merge_data: mergeData,
        })
        .eq("id", agreement.id)
        .select()
        .single();
      if (error) console.error("update within_retreat_agreements failed:", error);
      agreementRow = data;
    } else {
      const { data, error } = await supabase
        .from("within_retreat_agreements")
        .insert({
          lead_id: body.lead_id,
          package_id: body.package_id || null,
          signwell_document_id: signwellDocumentId,
          signing_url: signingUrl,
          status: "sent",
          sent_at: new Date().toISOString(),
          merge_data: mergeData,
          created_by: appUser.id,
        })
        .select()
        .single();
      if (error) console.error("insert within_retreat_agreements failed:", error);
      agreementRow = data;
    }

    // Send the signing-link email from noreply@within.center via Resend, so the
    // guest gets it from the same address as the rest of our Within emails
    // (welcome letter, etc.). SignWell's send_email is intentionally false so
    // this is the only outbound notification.
    let emailSent = false;
    if (signingUrl) {
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({
            type: "retreat_agreement_to_sign",
            to: lead.email,
            data: {
              recipient_first_name: lead.first_name || "",
              accommodation_type: accommodationType,
              arrival_date: arrivalDate,
              signing_url: signingUrl,
            },
          }),
        });
        emailSent = emailResp.ok;
        if (!emailResp.ok) {
          const err = await emailResp.text();
          console.error("retreat_agreement_to_sign send failed:", emailResp.status, err);
        }
      } catch (e) {
        console.error("retreat_agreement_to_sign send threw:", e);
      }
    }

    // Log activity on the lead.
    await supabase.from("crm_activities").insert({
      lead_id: body.lead_id,
      activity_type: "email",
      description: emailSent
        ? `Retreat agreement sent to ${lead.email} for SignWell signature`
        : `Retreat agreement created for ${lead.email}, signing email FAILED to send — link: ${signingUrl || "(none)"}`,
      created_by: appUser.id,
    }).then(() => {}, (e: any) => console.error("activity insert error:", e));

    return new Response(JSON.stringify({
      success: true,
      agreement_id: agreementRow?.id || null,
      signwell_document_id: signwellDocumentId,
      signing_url: signingUrl,
      email_sent: emailSent,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("create-retreat-agreement error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
