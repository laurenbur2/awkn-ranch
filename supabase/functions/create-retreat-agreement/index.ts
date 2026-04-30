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
      `This Retreat Agreement ("Agreement") is made and entered into on ${agreementDate}, by and between Heart Space Health, Inc., a Texas corporation doing business as Within Center and operating retreats at AWKN Ranch ("Within"), and the person identified below as a guest of the Retreat ("Guest").`
    );
    drawSpacer(6);

    page.drawText("GUEST", { x: MARGIN, y, size: 11, font: bold });
    y -= LINE_H + 1;
    drawKV("Name: ", guestName);
    drawKV("Email: ", lead.email || "");
    drawKV("Phone: ", lead.phone || "");
    if (emergencyContact) drawKV("Emergency Contact: ", emergencyContact);

    drawCaps(
      "READ THIS AGREEMENT CAREFULLY BEFORE SIGNING. BY SIGNING, GUEST ACKNOWLEDGES AND AGREES TO BE BOUND. THIS AGREEMENT MAY AFFECT GUEST'S LEGAL RIGHTS, INCLUDING BY REQUIRING BINDING INDIVIDUAL ARBITRATION AND BY LIMITING THE RIGHT TO BRING A LAWSUIT OR CLASS ACTION."
    );
    drawSpacer();

    // 1. DEFINITIONS
    drawHeading("1. DEFINITIONS");
    drawParagraph('"Retreat" means the lodging, programming, and on-site services provided by Within for the dates in Section 2.');
    drawParagraph('"Site" means the AWKN Ranch property at 7600 Grove Crest Circle, Austin, Texas, including all buildings, grounds, and amenities operated by Within or its affiliates.');
    drawParagraph('"Within Clinic" means the medical clinic operated by Heart Space Health, Inc., including any ketamine-assisted therapy or other medical services.');
    drawParagraph('"Ceremony" means any guided ketamine-assisted therapy session conducted under the medical supervision of the Within Clinic.');
    drawParagraph('"Physical Activities" means non-clinical activities at the Retreat, including walking, swimming, hiking, biking, yoga, breathwork, sauna, cold plunge, hot tub, fitness, and similar activities.');
    drawParagraph('"Total Fee" means the total amount payable by Guest for the Retreat, as set out in Section 2.');
    drawParagraph('"Medical Consent" and "Informed Consent" mean Within\'s separate Medical Consent and Informed Consent for Ketamine-Assisted Therapy, signed by Guest as a condition of participation.');

    // 2. RETREAT TERMS
    drawHeading("2. RETREAT TERMS");
    drawKV("Accommodation Type: ", accommodationType);
    drawKV("Arrival Date: ", fmtDate(arrivalDate));
    drawKV("Departure Date: ", fmtDate(departureDate));
    drawKV("Check-in Window: ", "4:00 PM – 6:00 PM on the Arrival Date");
    drawKV("Check-out Time: ", "11:00 AM on the Departure Date");
    drawKV("Total Fee: ", fmtMoney(totalFee));
    drawKV("Deposit Paid: ", fmtMoney(depositAmount));
    drawKV("Remaining Balance: ", fmtMoney(remainingBalance));
    drawSpacer();
    drawParagraph(
      "The Total Fee includes lodging, programming, meals, and the Ceremonies expressly described in Guest's package. It does NOT include travel to and from the Site, add-on services purchased separately, medical or hospital costs incurred during the Retreat, or post-Retreat integration packages purchased separately."
    );

    // 3. PAYMENT, REFUNDS, AND CANCELLATION
    drawHeading("3. PAYMENT, REFUNDS, AND CANCELLATION");
    drawParagraph("3.1 Payment. Payment in full of the Remaining Balance is due no later than seven (7) days prior to the Arrival Date. Within may decline check-in to any Guest whose balance is unpaid as of the Arrival Date.");
    drawParagraph("3.2 Cancellation by Guest:");
    drawBullet("More than 60 days before Arrival: refund of all amounts paid less the non-refundable Deposit.");
    drawBullet("31 to 60 days before Arrival: refund of fifty percent (50%) of amounts paid less the non-refundable Deposit.");
    drawBullet("30 days or fewer before Arrival: no refund; amounts paid are forfeited.");
    drawParagraph("3.3 Medical Disqualification. If, prior to the Arrival Date, Guest is determined by the Within Clinic to be medically ineligible for any Ceremony for reasons disclosed truthfully on Guest's intake forms and outside Guest's control, Within will refund all amounts paid (including the Deposit) less a $250 administrative fee, OR, at Guest's option, apply the full amount paid as a credit toward a future Retreat within twelve (12) months. This Section does not apply where Guest withheld, omitted, or misrepresented medical information.");
    drawParagraph("3.4 Force Majeure. If the Retreat is canceled or curtailed by Within due to an event beyond Within's reasonable control (fire, flood, severe weather, pandemic, government order, facility emergency), Within will, at Guest's option, refund the unused portion or apply it as a credit toward a future Retreat within twelve (12) months.");
    drawParagraph("3.5 Early Departure or No-Show. No refund is owed for early departure, late arrival, or no-show, except as expressly provided in Sections 3.3 or 3.4.");
    drawParagraph("3.6 Transfer. Guest may not transfer Guest's place at the Retreat to another person without Within's prior written consent. Subject to availability and a $250 transfer fee, Guest may apply paid amounts to a future Retreat within twelve (12) months.");

    // 4. MEDICAL TREATMENT GOVERNED BY SEPARATE CONSENTS
    drawHeading("4. MEDICAL TREATMENT GOVERNED BY SEPARATE CONSENTS");
    drawParagraph(
      "Guest acknowledges that medical eligibility, treatment, and participation in any Ceremony at the Retreat are governed by Within's separate Medical Consent and Informed Consent for Ketamine-Assisted Therapy, both of which Guest has read, signed, and continues to be bound by. Those documents are incorporated into this Agreement by reference. In the event of conflict between this Agreement and either of those consents on matters of medical treatment or eligibility, the Medical Consent and the Informed Consent control."
    );
    drawParagraph("Guest agrees to: (a) complete all intake, medical screening, and consent forms truthfully and completely; (b) notify Within promptly of any change in Guest's health, medications, or circumstances between signing those forms and the Arrival Date, and again upon arrival at the Site; (c) notify Within of any pain, discomfort, distress, or change in condition during the Retreat; and (d) follow all medical instructions given by the Within Clinic before, during, and after each Ceremony.");

    // 5. ELIGIBILITY AND VOLUNTARY PARTICIPATION
    drawHeading("5. ELIGIBILITY AND VOLUNTARY PARTICIPATION");
    drawParagraph("5.1 Age and Capacity. Guest represents that Guest is at least eighteen (18) years of age and has full legal capacity to enter into this Agreement.");
    drawParagraph("5.2 Voluntary Participation. Guest's participation in every aspect of the Retreat is voluntary. Guest may decline or withdraw from any specific activity at any time, without forfeiting Guest's place at the Retreat, by notifying Within. Withdrawal from medical treatment is governed by the Medical Consent and Informed Consent.");
    drawParagraph("5.3 Voluntary Physical Participation. Guest acknowledges that Physical Activities involve inherent risks, including but not limited to muscle strain, sprain, fracture, fatigue, dehydration, and injuries arising from Guest's own actions or the actions of others. With knowledge of those risks, Guest chooses voluntarily to participate.");

    // 6. SUBSTANCES, DRIVING, AND ON-SITE POLICIES
    drawHeading("6. SUBSTANCES, DRIVING, AND ON-SITE POLICIES");
    drawParagraph("6.1 Drugs and Alcohol. No alcohol, cannabis, or non-prescribed psychoactive substances may be consumed for forty-eight (48) hours prior to arrival, at any time during the Retreat, or for the period after a Ceremony specified by the Within Clinic. Within reserves the right to test, search, or remove a Guest in violation of this Section without refund.");
    drawParagraph("6.2 Driving After a Ceremony. Guest agrees not to drive, operate machinery, or make legally binding decisions for at least twenty-four (24) hours after each Ceremony, or for any longer period specified by the Within Clinic. Guest is solely responsible for arranging their own transportation to and from the Site.");
    drawParagraph("6.3 Smoking, Vaping, and Open Flames. Smoking, vaping, and open flames are prohibited inside any building on the Site and within twenty-five (25) feet of any building.");
    drawParagraph("6.4 Firearms and Weapons. No firearms, ammunition, or weapons of any kind are permitted on the Site.");
    drawParagraph("6.5 Pets and Visitors. Guest may not bring pets, additional guests, or outside visitors to the Site without Within's prior written consent.");
    drawParagraph("6.6 Quiet Hours. Quiet hours are observed across the Site between 10:00 PM and 7:00 AM, or as otherwise communicated by Within at check-in.");

    // 7. CODE OF CONDUCT
    drawHeading("7. CODE OF CONDUCT");
    drawParagraph("Guest agrees to treat all other guests, staff, clinicians, contractors, and the property itself with respect at all times. The following are grounds for immediate removal without refund:");
    drawBullet("physical, verbal, or sexual harassment or assault;");
    drawBullet("threats, intimidation, or harassing behavior;");
    drawBullet("intoxication outside of supervised Ceremony;");
    drawBullet("non-consensual recording or sharing of other guests' likeness, voice, or disclosures;");
    drawBullet("repeated or willful violation of the Site's policies;");
    drawBullet("behavior that, in Within's reasonable judgment, jeopardizes the safety, healing process, or experience of any other person at the Site.");

    // 8. CONFIDENTIALITY OF OTHER GUESTS
    drawHeading("8. CONFIDENTIALITY OF OTHER GUESTS");
    drawParagraph("Guest acknowledges that the Retreat involves shared circles, group practices, and informal disclosures of deeply personal information. Guest agrees to keep confidential anything shared by another guest during the Retreat, and will not disclose, repeat, publish, or reproduce any other guest's identity, presence, statements, or experiences without that guest's prior written consent. This obligation survives termination.");

    // 9. PHOTO, VIDEO, AND RECORDING
    drawHeading("9. PHOTO, VIDEO, AND RECORDING");
    drawParagraph("Photographing, filming, or audio-recording any Ceremony, group circle, or other guest is strictly prohibited. Within may, at its discretion, designate areas of the Site where personal photography is acceptable for Guest's own use. Within will not use Guest's name, image, voice, or testimonial for marketing without Guest's separate written consent.");

    // 10. WITHIN'S RIGHT TO REMOVE OR SUSPEND
    drawHeading("10. WITHIN'S RIGHT TO REMOVE OR SUSPEND");
    drawParagraph("Within may suspend Guest's participation in any specific activity, or remove Guest from the Retreat altogether, if Within determines in its reasonable judgment that Guest's continued participation poses a risk to Guest, to other guests, to staff, or to the Site, including for medical safety, behavioral, or substance-use reasons. Removal under this Section does not entitle Guest to a refund, except where the removal is due to a medical issue covered by Section 3.3.");

    // 11. PROPERTY AND DAMAGE
    drawHeading("11. PROPERTY AND DAMAGE");
    drawParagraph("Guest is responsible for the condition of Guest's room and any equipment, linens, or property of the Site used during the Retreat. Guest agrees to pay for any damage beyond ordinary wear and tear. Within may charge the payment method on file for documented damage costs.");

    // 12. INSURANCE AND MEDICAL COSTS
    drawHeading("12. INSURANCE AND MEDICAL COSTS");
    drawParagraph("Guest acknowledges that ketamine-assisted therapy and other services provided at the Retreat are generally not covered by health insurance, and that Within does not provide health, accident, or travel insurance for Guests. Any medical, hospital, ambulance, evacuation, prescription, or specialist costs incurred by Guest before, during, or after the Retreat are Guest's sole responsibility.");

    // 13. HIPAA AND MEDICAL RECORDS
    drawHeading("13. HIPAA AND MEDICAL RECORDS");
    drawParagraph("Guest acknowledges receipt of Within's Notice of Privacy Practices. Guest authorizes Within and the Within Clinic to use and disclose Guest's protected health information as permitted by HIPAA and applicable state law for treatment, payment, and healthcare operations, and as further described in any separate HIPAA Authorization signed by Guest.");

    // 14. GENERAL ASSUMPTION OF RISK
    drawHeading("14. GENERAL ASSUMPTION OF RISK");
    drawCaps(
      "GUEST ACKNOWLEDGES THAT GUEST'S DECISION TO ATTEND THE RETREAT IS MADE WITH FULL KNOWLEDGE OF THE INFORMATION DESCRIBED IN THIS AGREEMENT AND THE SEPARATE MEDICAL CONSENT AND INFORMED CONSENT, AND THAT GUEST IS ATTENDING OF GUEST'S OWN WILL AND VOLITION. GUEST AGREES TO BE SOLELY RESPONSIBLE FOR THE ASSUMPTION OF ALL RISK INVOLVED IN CONNECTION WITH THE RETREAT, INCLUDING THE PHYSICAL ACTIVITIES, THE LODGING, AND ANY ON-SITE PROGRAMMING."
    );

    // 15. RELEASE OF LIABILITY
    drawHeading("15. RELEASE OF LIABILITY");
    drawCaps(
      "EXPRESS NEGLIGENCE NOTICE. GUEST EXPRESSLY ACKNOWLEDGES AND AGREES THAT THIS RELEASE IS INTENDED TO RELEASE WITHIN, ITS PARENTS, SUBSIDIARIES, AFFILIATES, OWNERS, OFFICERS, DIRECTORS, EMPLOYEES, CLINICIANS, AGENTS, CONTRACTORS, AND REPRESENTATIVES (THE \"RELEASED PARTIES\") FROM CLAIMS ARISING OUT OF THE NEGLIGENCE, ACTS, OR OMISSIONS OF ANY OF THE RELEASED PARTIES, IN CONNECTION WITH GUEST'S STAY AT THE RETREAT, GUEST'S USE OF THE SITE, AND GUEST'S PARTICIPATION IN THE PHYSICAL ACTIVITIES. THIS NOTICE IS GIVEN TO COMPLY WITH THE EXPRESS NEGLIGENCE DOCTRINE UNDER TEXAS LAW."
    );
    drawSpacer();
    drawParagraph(
      "To the fullest extent permitted by Texas law, Guest hereby releases, waives, discharges, and covenants not to sue the Released Parties from and for any and all claims, demands, actions, causes of action, costs, damages, expenses, and liabilities of any kind — whether known or unknown, anticipated or unanticipated, in law or equity — that arise out of or relate to Guest's stay at the Retreat, Guest's use of the Site, or Guest's participation in the Physical Activities, including claims arising from the negligence of any Released Party."
    );
    drawParagraph(
      "Carve-outs. This release does NOT apply to: (a) claims for gross negligence, recklessness, or intentional misconduct; (b) claims for medical malpractice, which are governed exclusively by the Medical Consent, the Informed Consent, and applicable Texas law including Chapter 74 of the Texas Civil Practice and Remedies Code; or (c) any other claim that, as a matter of Texas law or public policy, may not be released in advance."
    );

    // 16. INDEMNIFICATION
    drawHeading("16. INDEMNIFICATION");
    drawParagraph("Guest agrees to defend, indemnify, and hold harmless the Released Parties from and against any claim, demand, loss, damage, cost, expense, or liability (including reasonable attorneys' fees) arising out of or related to (a) Guest's breach of this Agreement, (b) Guest's conduct or actions at the Site, (c) any property damage caused by Guest, or (d) any third-party claim arising out of Guest's acts or omissions at the Retreat. Within may select its own counsel and participate in its own defense.");

    // 17. INTELLECTUAL PROPERTY
    drawHeading("17. INTELLECTUAL PROPERTY");
    drawParagraph("Within's name, marks, services, logos, designs, text, graphics, software, content, and any other intellectual property of Within are owned by Within or its affiliates, licensors, or suppliers. Nothing in this Agreement grants Guest any right, title, license, or interest in any of Within's intellectual property by implication, estoppel, or otherwise.");

    // 18. RESTRICTIONS
    drawHeading("18. RESTRICTIONS");
    drawParagraph("Guest agrees not to: (a) sell, resell, or transfer Guest's place at the Retreat except as expressly permitted in Section 3.6; (b) conduct any competing program, training, session, or commercial activity on the Site; (c) solicit other guests for unrelated services; (d) bring or distribute any controlled, illegal, or non-prescribed psychoactive substances at the Site; or (e) admit any unauthorized person to the Site.");

    // 19. TERMINATION
    drawHeading("19. TERMINATION");
    drawParagraph("This Agreement remains in effect until the earlier of (a) Guest's completion of the Retreat, (b) Within's removal of Guest under Section 10, (c) Guest's withdrawal from the Retreat, or (d) cancellation by either Party in accordance with Section 3. Termination does not relieve either Party of obligations that, by their nature, are intended to survive termination, including Sections 8, 11, 12, 14, 15, 16, 17, 20, 21, and 22.");

    // 20. DISPUTE RESOLUTION
    drawHeading("20. DISPUTE RESOLUTION AND BINDING ARBITRATION");
    drawParagraph("20.1 Informal Resolution. Before initiating any formal proceeding, the Parties agree to attempt in good faith to resolve any dispute personally and directly for at least thirty (30) days.");
    drawParagraph("20.2 Binding Arbitration. Any dispute arising out of or relating to this Agreement that is not resolved under Section 20.1 shall be submitted to binding individual arbitration administered by JAMS or the American Arbitration Association under its applicable consumer rules, and conducted by a single arbitrator in Travis County, Texas. The arbitrator shall be bound by the substantive law of the State of Texas and applicable federal law. The arbitrator has no authority to add parties, vary the provisions of this Agreement, award punitive damages (except where required by statute), or certify a class. Each Party shall bear its own attorneys' fees and costs except as otherwise required by law.");
    drawParagraph("20.3 Carve-out. Either Party may bring a claim for injunctive relief in connection with intellectual property in the federal or state courts located in Travis County, Texas. Claims not subject to mandatory arbitration under applicable law are not waived by this Section.");
    drawParagraph("20.4 Limitations Period. Any claim arising out of or related to this Agreement must be initiated within one (1) year after the claim accrues, or it is permanently barred, except where a longer period is required by applicable law.");

    // 21. CLASS ACTION + JURY TRIAL WAIVER
    drawHeading("21. CLASS ACTION AND JURY TRIAL WAIVER");
    drawCaps(
      "TO THE FULLEST EXTENT PERMITTED BY LAW, THE PARTIES WAIVE THE RIGHT TO PARTICIPATE IN ANY CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING AND THE RIGHT TO A JURY TRIAL FOR ANY DISPUTE ARISING OUT OF OR RELATED TO THIS AGREEMENT."
    );

    // 22. GOVERNING LAW + 23–27 boilerplate
    drawHeading("22. GOVERNING LAW AND VENUE");
    drawParagraph("This Agreement is governed by and construed in accordance with the internal laws of the State of Texas, without regard to its conflict-of-law principles. Subject to Section 20, each Party irrevocably submits to the exclusive jurisdiction and venue of the federal and state courts located in Travis County, Texas.");

    drawHeading("23. NOTICES");
    drawParagraph("All notices under this Agreement shall be in writing and delivered to the email addresses on file for the Parties, with a copy by mail or courier to: Heart Space Health, Inc., 7600 Grove Crest Circle, Austin, Texas, Attn: Executive Director.");

    drawHeading("24. ELECTRONIC SIGNATURE AND COUNTERPARTS");
    drawParagraph("This Agreement may be executed electronically (including via SignWell or DocuSign), and any electronic signature has the same legal effect as a handwritten signature. This Agreement may be executed in counterparts, each of which is deemed an original and together constitute one and the same instrument.");

    drawHeading("25. ENTIRE AGREEMENT, AMENDMENT, AND WAIVER");
    drawParagraph("This Agreement, together with the Medical Consent, the Informed Consent, and any HIPAA Authorization signed by Guest, constitutes the entire agreement between the Parties regarding the Retreat and supersedes all prior or contemporaneous understandings. No amendment is effective unless in writing and signed by both Parties (electronic signatures suffice). No failure or delay by Within in exercising any right constitutes a waiver of that right.");

    drawHeading("26. SEVERABILITY");
    drawParagraph("If any provision of this Agreement is held invalid or unenforceable, the remaining provisions remain in full force and effect, and the invalid provision shall be replaced with a valid and enforceable provision that most closely reflects the original intent.");

    drawHeading("27. HEADINGS");
    drawParagraph("Headings are for convenience only and do not affect the interpretation of this Agreement. The words \"include,\" \"includes,\" and \"including\" mean \"include without limitation.\"");

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

    // Log activity on the lead.
    await supabase.from("crm_activities").insert({
      lead_id: body.lead_id,
      activity_type: "note",
      description: `Retreat agreement sent to ${lead.email} for SignWell signature`,
      created_by: appUser.id,
    }).then(() => {}, (e: any) => console.error("activity insert error:", e));

    return new Response(JSON.stringify({
      success: true,
      agreement_id: agreementRow?.id || null,
      signwell_document_id: signwellDocumentId,
      signing_url: signingUrl,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("create-retreat-agreement error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
