// Shared CRM send flows (proposal + rental agreement). Used by crm.js and
// clients.js so the two callers stay in lockstep. sendProposalEmail handles
// Stripe links + branded proposal email; sendAgreementEmail is a separate
// flow that creates a SignWell rental agreement and emails the signing link
// standalone. Stage-advance / toasts stay with the caller via onAfterSend.

import { supabase } from '../../shared/supabase.js';

const SUPABASE_URL = 'https://lnqxarwqckpmirpmixcw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxucXhhcndxY2twbWlycG1peGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjAyMDIsImV4cCI6MjA4NzY5NjIwMn0.bw8b5XUcEFExlfTrR78Bu4Vdl7Oe_RtjlgvWA7SlQfo';

export async function logCrmActivity(leadId, type, description, createdBy = null) {
  const { error } = await supabase.from('crm_activities').insert({
    lead_id: leadId,
    activity_type: type,
    description,
    created_by: createdBy,
  });
  if (error) throw error;
}

// Refresh the Supabase session and return a fresh access token. Used for
// edge-function calls where user-auth is required.
async function getFreshToken() {
  let token = null;
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed?.session?.access_token || null;
  } catch (_) { /* fall through */ }
  if (!token) {
    const { data: sessionWrap } = await supabase.auth.getSession();
    token = sessionWrap?.session?.access_token || null;
  }
  if (!token) throw new Error('Not signed in — reload and sign in again.');
  return token;
}

// Send a proposal: Stripe payment links (ACH + card +3%), stamp proposal with
// sent state, send branded email, log activity. No SignWell contract here —
// the rental agreement is sent separately via sendAgreementEmail so each step
// has its own recipient-facing email. The caller supplies onAfterSend({
// proposal, lead }) to do any caller-specific follow-up (e.g. advance
// pipeline stage, refresh local state).
export async function sendProposalEmail(proposalId, { authState = null, onAfterSend = null } = {}) {
  const { data: proposal, error: pErr } = await supabase
    .from('crm_proposals')
    .select('*, items:crm_proposal_items(*)')
    .eq('id', proposalId)
    .single();
  if (pErr || !proposal) throw new Error('Proposal not found');
  if (!proposal.lead_id) throw new Error('Proposal has no lead — cannot send');

  const { data: lead, error: lErr } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, business_line')
    .eq('id', proposal.lead_id)
    .single();
  if (lErr || !lead?.email) throw new Error('Lead is missing an email address');

  const token = await getFreshToken();

  // AWKN Ranch collects a deposit upfront (balance due 30 days pre-event);
  // Within invoices the full total.
  const isAwkn = lead.business_line === 'awkn_ranch';
  const depositPct = isAwkn ? (proposal.deposit_percent ?? 50) : 100;
  const depositAmt = isAwkn
    ? Math.round(Number(proposal.total) * depositPct) / 100
    : Number(proposal.total);

  // Stripe payment links — ACH (deposit) + card (+3% surcharge disclosed in email).
  const baseTotal = isAwkn ? depositAmt : Number(proposal.total);
  const cardTotal = Math.round(baseTotal * 1.03 * 100) / 100;

  async function makeLink(amount, method, labelSuffix) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/create-payment-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({
        amount,
        description: `${proposal.proposal_number} — ${proposal.title}${labelSuffix}`,
        person_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        person_email: lead.email,
        category: 'crm_proposal',
        payment_method: method,
        metadata: {
          source: 'crm-proposal',
          proposal_id: proposal.id,
          proposal_number: proposal.proposal_number,
          lead_id: lead.id,
          payment_method: method,
        },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) {
      const msg = [d.error, d.detail, d.message, d.code].filter(Boolean).join(' — ') || r.status;
      throw new Error(`Payment link (${method}) failed: ${msg}`);
    }
    return d;
  }

  const linkData = await makeLink(baseTotal, 'ach', '');
  const cardLinkData = await makeLink(cardTotal, 'card', ' (card)');

  // Stamp proposal before email so the row reflects the send even if email fails transiently.
  await supabase.from('crm_proposals').update({
    payment_link_id: linkData.payment_link_id,
    payment_link_url: linkData.url,
    payment_link_card_id: cardLinkData.payment_link_id,
    payment_link_card_url: cardLinkData.url,
    sent_at: new Date().toISOString(),
    sent_to_email: lead.email,
    status: 'sent',
  }).eq('id', proposal.id);

  // Send the branded email. Uses anon key in Authorization (send-email self-authenticates
  // and the ES256 user token trips the Supabase gateway bug).
  const items = (proposal.items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const emailResp = await fetch(SUPABASE_URL + '/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ANON_KEY,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({
      type: 'proposal_sent',
      to: lead.email,
      data: {
        recipient_first_name: lead.first_name || '',
        business_line: lead.business_line || null,
        proposal_number: proposal.proposal_number,
        title: proposal.title,
        event_type: proposal.event_type,
        event_date: proposal.event_date,
        guest_count: proposal.guest_count,
        subtotal: proposal.subtotal,
        discount_amount: proposal.discount_amount,
        tax_amount: proposal.tax_amount,
        total: proposal.total,
        valid_until: proposal.valid_until,
        notes: proposal.notes,
        terms: proposal.terms,
        payment_link_url: linkData.url,
        payment_link_card_url: cardLinkData.url,
        card_total: cardTotal,
        deposit_percent: isAwkn ? depositPct : null,
        deposit_amount: isAwkn ? depositAmt : null,
        balance_due: isAwkn ? Math.round((Number(proposal.total) - depositAmt) * 100) / 100 : null,
        line_items: items.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          total: li.total,
        })),
      },
    }),
  });
  if (!emailResp.ok) {
    const err = await emailResp.json().catch(() => ({}));
    throw new Error('Email send failed: ' + (err.error || emailResp.status));
  }

  await logCrmActivity(
    lead.id,
    'email',
    `Proposal ${proposal.proposal_number} sent to ${lead.email}`,
    authState?.user?.id || null,
  );

  if (typeof onAfterSend === 'function') {
    await onAfterSend({ proposal, lead });
  }

  return { proposal, lead };
}

// Send an AWKN Ranch rental agreement for e-signature. Creates (or reuses, via
// idempotency in create-proposal-contract) a SignWell document and emails the
// lead a standalone signing link — no payment info, no proposal summary.
// Separate from sendProposalEmail so the contract and the payment request are
// two distinct emails the client can act on independently.
export async function sendAgreementEmail(proposalId, { authState = null } = {}) {
  const { data: proposal, error: pErr } = await supabase
    .from('crm_proposals')
    .select('id, title, event_date, lead_id, signwell_document_id')
    .eq('id', proposalId)
    .single();
  if (pErr || !proposal) throw new Error('Proposal not found');
  if (!proposal.lead_id) throw new Error('Proposal has no lead — cannot send');

  const { data: lead, error: lErr } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, email, business_line')
    .eq('id', proposal.lead_id)
    .single();
  if (lErr || !lead?.email) throw new Error('Lead is missing an email address');
  if (lead.business_line !== 'awkn_ranch') {
    throw new Error('Rental agreements are only available for AWKN Ranch leads');
  }

  const token = await getFreshToken();

  // Create or reuse the SignWell rental agreement (idempotent server-side).
  const contractResp = await fetch(SUPABASE_URL + '/functions/v1/create-proposal-contract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ proposal_id: proposal.id }),
  });
  const c = await contractResp.json().catch(() => ({}));
  if (!contractResp.ok) {
    const stringify = (v) => typeof v === 'string' ? v : (v != null ? JSON.stringify(v) : '');
    const msg = [c.error, stringify(c.detail), c.message, c.code].filter(Boolean).join(' — ') || contractResp.status;
    throw new Error(`Contract creation failed: ${msg}`);
  }
  const signingUrl = c.signing_url;
  if (!signingUrl) throw new Error('Contract created but no signing URL returned');

  const emailResp = await fetch(SUPABASE_URL + '/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ANON_KEY,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({
      type: 'agreement_to_sign',
      to: lead.email,
      data: {
        recipient_first_name: lead.first_name || '',
        title: proposal.title,
        event_date: proposal.event_date,
        signing_url: signingUrl,
      },
    }),
  });
  if (!emailResp.ok) {
    const err = await emailResp.json().catch(() => ({}));
    throw new Error('Email send failed: ' + (err.error || emailResp.status));
  }

  await logCrmActivity(
    lead.id,
    'email',
    `Rental agreement sent to ${lead.email} for signature`,
    authState?.user?.id || null,
  );

  return { proposal, lead, signing_url: signingUrl };
}
