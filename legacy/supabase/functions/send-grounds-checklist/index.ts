// Daily Grounds Checklist — public (anon-callable) edge function.
//
// Receives the checklist state from the public /groundskeeper/ page and
// emails it to ownership via Resend. Auto-stamps today's date in
// America/Chicago since the property is in Texas.
//
// Endpoint: POST https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/send-grounds-checklist
//
// Request body:
//   {
//     name: string,                            // person filling out the checklist
//     items: [{ section, label, completed }],  // ordered checklist state
//     notes?: string                           // optional free-text
//   }
//
// Deploy: verify_jwt: false (the page is public — no login required).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = "AWKN Ranch <noreply@within.center>";
const REPLY_TO = "admin@awknranch.com";
const RECIPIENTS = ["justin@within.center", "william@awknranch.com"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChecklistItem {
  section: string;
  label: string;
  completed: boolean;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail(name: string, dateStr: string, items: ChecklistItem[], notes: string) {
  const bySection = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    if (!bySection.has(item.section)) bySection.set(item.section, []);
    bySection.get(item.section)!.push(item);
  }

  const total = items.length;
  const done = items.filter((i) => i.completed).length;
  const skipped = total - done;
  const allDone = done === total;
  const summaryColor = allDone ? "#065f46" : (done >= total / 2 ? "#92400e" : "#991b1b");
  const summaryBg = allDone ? "#ecfdf5" : (done >= total / 2 ? "#fef3c7" : "#fef2f2");

  const sectionsHtml = Array.from(bySection.entries()).map(([section, sectionItems]) => {
    const itemsHtml = sectionItems.map((item) => {
      if (item.completed) {
        return `<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;color:#14532d;font-size:14px;">
          <span style="display:inline-block;width:20px;color:#16a34a;font-weight:700;">✓</span>
          ${escapeHtml(item.label)}
        </div>`;
      }
      return `<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;color:#9ca3af;font-size:14px;">
        <span style="display:inline-block;width:20px;color:#dc2626;font-weight:700;">✗</span>
        <span style="text-decoration:line-through;">${escapeHtml(item.label)}</span>
        <span style="font-size:11px;font-weight:600;color:#dc2626;margin-left:6px;text-transform:uppercase;letter-spacing:0.04em;">not done</span>
      </div>`;
    }).join("");
    return `<div style="margin-bottom:24px;">
      <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#2a1f23;border-bottom:2px solid #d4883a;padding-bottom:6px;margin-bottom:8px;">${escapeHtml(section)}</div>
      ${itemsHtml}
    </div>`;
  }).join("");

  const notesHtml = notes.trim()
    ? `<div style="margin-top:24px;padding:14px 16px;background:#fef3e6;border-left:4px solid #d4883a;border-radius:6px;">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#b45309;margin-bottom:4px;">Notes from ${escapeHtml(name)}</div>
        <div style="font-size:14px;color:#2a1f23;line-height:1.5;white-space:pre-wrap;">${escapeHtml(notes)}</div>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Grounds Checklist — ${escapeHtml(dateStr)}</title>
</head>
<body style="margin:0;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:#f6f5f0;color:#2a1f23;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto;">
  <tr><td style="background:#fff;border-radius:14px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#2a1f23;">Daily Grounds Checklist</h1>
    <div style="color:#6b7280;font-size:14px;margin-bottom:18px;">${escapeHtml(dateStr)} · Completed by <strong style="color:#2a1f23;">${escapeHtml(name)}</strong></div>
    <div style="margin-bottom:24px;padding:12px 16px;background:${summaryBg};border-radius:8px;font-size:14px;color:${summaryColor};font-weight:600;">
      ${done} of ${total} items completed${skipped ? ` · ${skipped} skipped` : ""}
    </div>
    ${sectionsHtml}
    ${notesHtml}
  </td></tr>
  <tr><td style="text-align:center;padding-top:16px;font-size:11px;color:#9ca3af;">
    Submitted from the AWKN Ranch grounds checklist · noreply@within.center
  </td></tr>
</table>
</body>
</html>`;

  // Plain-text version for email clients that don't render HTML.
  const sectionsText = Array.from(bySection.entries()).map(([section, sectionItems]) => {
    const lines = sectionItems.map((i) => `  ${i.completed ? "[X]" : "[ ]"} ${i.label}${i.completed ? "" : " — not done"}`);
    return `${section.toUpperCase()}\n${lines.join("\n")}`;
  }).join("\n\n");
  const text = `Daily Grounds Checklist\n${dateStr}\nCompleted by: ${name}\n\n${done} of ${total} items completed${skipped ? ` (${skipped} skipped)` : ""}\n\n${sectionsText}${notes.trim() ? `\n\nNOTES FROM ${name.toUpperCase()}:\n${notes}` : ""}`;

  return { html, text };
}

Deno.serve(async (req: Request) => {
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
    const rawName  = body?.name;
    const rawItems = body?.items;
    const rawNotes = body?.notes;

    const name = String(rawName ?? "").trim();
    if (!name) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return new Response(JSON.stringify({ error: "Items list is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Texas / Central Time — the property is in Austin, TX.
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Chicago",
    });

    const cleanName  = name.slice(0, 100);
    const cleanNotes = String(rawNotes ?? "").slice(0, 2000);
    const cleanItems: ChecklistItem[] = rawItems.slice(0, 200).map((it: any) => ({
      section:   String(it?.section   ?? "").slice(0, 100),
      label:     String(it?.label     ?? "").slice(0, 200),
      completed: Boolean(it?.completed),
    }));

    const done = cleanItems.filter((i) => i.completed).length;
    const total = cleanItems.length;
    const subject = `Grounds Checklist — ${cleanName} — ${dateStr} (${done}/${total})`;

    const { html, text } = renderEmail(cleanName, dateStr, cleanItems, cleanNotes);

    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: RECIPIENTS,
        subject,
        html,
        text,
      }),
    });

    const resendBody = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend API error", resendBody);
      return new Response(JSON.stringify({ error: "Resend API error", detail: resendBody }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendBody?.id, recipients: RECIPIENTS }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-grounds-checklist error:", err);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
