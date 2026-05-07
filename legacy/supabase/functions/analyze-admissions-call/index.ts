/**
 * Analyze Admissions Call Edge Function (async job pattern)
 *
 * Accepts an audio file of an admissions call. Inserts a row into
 * public.admissions_analyses with status='processing', kicks off the
 * Gemini pipeline in the background via EdgeRuntime.waitUntil, and
 * returns a job_id immediately. The client polls
 * get-admissions-analysis for the result.
 *
 * This avoids 504 gateway timeouts on long (>60s) Gemini runs.
 *
 * Deploy with: supabase functions deploy analyze-admissions-call --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const GEMINI_FILES_URL = 'https://generativelanguage.googleapis.com/v1beta';

const MAX_BYTES = 30 * 1024 * 1024;
const INLINE_MAX_BYTES = 15 * 1024 * 1024;

const SUPPORTED_AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/mp4': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/flac': 'audio/flac',
};

const GUIDELINES = `
YOU ARE EVALUATING AN ADMISSIONS CALL FOR WITHIN CENTER / AWKN RANCH.

Within Center is a ceremonial ketamine therapy practice at AWKN Ranch in Austin.
Callers are almost always in a tender emotional place — depression, grief, burnout,
trauma, addiction, a life crisis. The tone of the call is therapeutic, not
transactional.

═══════════════════════════════════════════════════════════════════
THE THREE NON-NEGOTIABLE TONE RULES
═══════════════════════════════════════════════════════════════════

1. SLOW DOWN — speak at ~70% of normal pace. Let sentences land.
2. LEAVE SPACE — after asking a question, count to three before saying
   anything else. Silence is the container.
3. MATCH, THEN LEAD — start at their energy, then gently bring it down.

═══════════════════════════════════════════════════════════════════
THE "NEVER" LIST
═══════════════════════════════════════════════════════════════════

• Never interrupt the caller, even when you know where their sentence is going.
• Never use sales words: "awesome", "perfect", "absolutely", "no worries",
  "boom", "100%", "totally". They break the therapeutic spell.
• Never laugh to fill space.
• Never read the script in a robotic way.

═══════════════════════════════════════════════════════════════════
EXPECTED CALL STRUCTURE
═══════════════════════════════════════════════════════════════════

1. OPENING — warm greeting: "Hi, thank you for calling Within Center. This is
   [Name]… how can I support you today?" Then pause.

2. DISCOVERY — should ask most of these, ONE AT A TIME, with silence between:
   - "What's been going on in your life that brought you to pick up the phone?"
   - "Thank you for sharing that with me." (reflective acknowledgment)
   - "Have you done any ketamine or psychedelic work before?"
   - "Are you currently working with a therapist or coach?"
   - "Are you picturing a single visit, or stepping out of your life for a few days?"
   - "On your own, or with a partner/friend?"
   - "Anything medically I should know — heart, blood pressure, meds, pregnancy?"
   - "What's your timeline — weeks, or more like a season?"

3. MATCHING — offer ONE path first, not all six. Packages:
   - 6 Days / 5 Nights immersive retreat — $3,999 private / $3,499 shared
   - 3 Days / 2 Nights immersive retreat — $1,699 private / $1,499 shared
   - DISCOVER day package — $799 (April special, normally $1,250)
   - HEAL day package — $3,300 (most popular)
   - AWKN day package — $5,500
   - Journey for Two — $1,650 (couples)

4. DIFFERENTIATION (if asked "what makes you different"):
   Reference: 12 acres in Austin, 1,500+ sessions, perfect safety record,
   "the medicine opens the door, the land and integration change your life."

5. TENDER-MOMENT HANDLING — when caller cries, expresses fear, mentions cost,
   brings up partner/therapist, etc. Responses should be soft and unhurried.
   NEVER push.

6. THE CLOSE — next step is ALWAYS sending intake forms. Must:
   - Frame intake as sharing their story with the clinical team, not paperwork
   - Take 15–20 minutes, medical history + what they're looking for + consent
   - Read the caller's email back to confirm
   - Offer to put a soft hold on retreat dates AFTER intake agreement

7. FINAL QUESTION — "Before we hang up — is there anything you didn't tell me
   that you want our clinical team to know when they read your intake?"
   This is the most important line of the call. It surfaces the real reason.

═══════════════════════════════════════════════════════════════════
WHAT TO EVALUATE
═══════════════════════════════════════════════════════════════════

Listen to the audio and assess:

• TONE — Was the pace slow enough? Were there real pauses after questions?
  Did the rep match then lead the caller's energy? Any sales words or
  interruptions?

• STRUCTURE — Which sections of the expected structure were covered? Which
  were skipped? Were discovery questions asked one at a time or stacked?

• MATCHING — Did the rep recommend ONE package first, or dump all options?
  Was the recommendation aligned with what the caller described?

• CLOSE — Was intake mentioned? Was it framed as "sharing their story" rather
  than "filling out forms"? Was the email read back? Was a soft-hold offered?

• FINAL QUESTION — Did the rep ask the closing reflective question?

Return strict JSON. Use direct quotes from the call whenever possible.
Be honest but compassionate — this is feedback to help someone grow.

For the transcript, keep it concise — 6–10 of the most important exchanges,
not the full verbatim call. Focus on moments that matter for feedback.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overall_score: { type: 'NUMBER' },
    letter_grade: { type: 'STRING' },
    one_line_summary: { type: 'STRING' },
    duration_estimate: { type: 'STRING' },
    caller_context: {
      type: 'OBJECT',
      properties: {
        presenting_concern: { type: 'STRING' },
        emotional_state: { type: 'STRING' },
        experience_level: { type: 'STRING' },
      },
      required: ['presenting_concern', 'emotional_state', 'experience_level'],
    },
    tone_scores: {
      type: 'OBJECT',
      properties: {
        pace: { type: 'NUMBER' },
        silence: { type: 'NUMBER' },
        warmth: { type: 'NUMBER' },
        matching: { type: 'NUMBER' },
        notes: { type: 'STRING' },
      },
      required: ['pace', 'silence', 'warmth', 'matching', 'notes'],
    },
    violations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rule: { type: 'STRING' },
          quote: { type: 'STRING' },
          approx_timestamp: { type: 'STRING' },
        },
        required: ['rule', 'quote'],
      },
    },
    sections_covered: {
      type: 'OBJECT',
      properties: {
        opening: { type: 'BOOLEAN' },
        discovery_questions_asked: { type: 'NUMBER' },
        discovery_notes: { type: 'STRING' },
        matching_offered_single_path: { type: 'BOOLEAN' },
        recommended_package: { type: 'STRING' },
        tender_moments_handled_well: { type: 'BOOLEAN' },
        close_intake_framed_correctly: { type: 'BOOLEAN' },
        close_email_read_back: { type: 'BOOLEAN' },
        close_soft_hold_offered: { type: 'BOOLEAN' },
        final_reflective_question_asked: { type: 'BOOLEAN' },
      },
      required: [
        'opening', 'discovery_questions_asked', 'discovery_notes',
        'matching_offered_single_path', 'recommended_package',
        'close_intake_framed_correctly', 'close_email_read_back',
        'close_soft_hold_offered', 'final_reflective_question_asked',
      ],
    },
    strong_moments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          moment: { type: 'STRING' },
          quote: { type: 'STRING' },
        },
        required: ['moment', 'quote'],
      },
    },
    missed_opportunities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          moment: { type: 'STRING' },
          what_happened: { type: 'STRING' },
          what_to_try: { type: 'STRING' },
        },
        required: ['moment', 'what_happened', 'what_to_try'],
      },
    },
    top_three_improvements: { type: 'ARRAY', items: { type: 'STRING' } },
    transcript: { type: 'STRING' },
  },
  required: [
    'overall_score', 'letter_grade', 'one_line_summary',
    'caller_context', 'tone_scores', 'violations', 'sections_covered',
    'strong_moments', 'missed_opportunities', 'top_three_improvements', 'transcript',
  ],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!GEMINI_API_KEY) {
    return json({ error: 'GEMINI_API_KEY not configured on server' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return json({ error: 'No audio file provided. Attach it as the "file" field.' }, 400);

    const mimeType = SUPPORTED_AUDIO_TYPES[file.type] || null;
    if (!mimeType) {
      return json({
        error: `Unsupported audio format: ${file.type || 'unknown'}. Use MP3, WAV, M4A, OGG, or WebM.`,
      }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 30 MB.`,
      }, 413);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const fileName = file.name || 'admissions-call';

    // Create the job row
    const { data: row, error: insErr } = await supabase
      .from('admissions_analyses')
      .insert({
        status: 'processing',
        model: GEMINI_MODEL,
        file_name: fileName,
        file_size_bytes: file.size,
      })
      .select('id')
      .single();

    if (insErr || !row?.id) {
      console.error('insert failed:', insErr);
      return json({ error: 'Failed to create job' }, 500);
    }

    const jobId = row.id as string;

    // Kick off the analysis in the background — do NOT await.
    // The response returns immediately; client polls get-admissions-analysis.
    // @ts-ignore EdgeRuntime is Supabase-runtime-global
    EdgeRuntime.waitUntil(runAnalysis(supabase, jobId, bytes, mimeType, fileName, file.size));

    return json({ job_id: jobId, status: 'processing' });
  } catch (err) {
    console.error('unexpected error:', err);
    return json({ error: 'Server error', detail: (err as Error).message }, 500);
  }
});

async function runAnalysis(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
  fileSize: number,
): Promise<void> {
  try {
    let audioPart: Record<string, unknown>;
    if (fileSize <= INLINE_MAX_BYTES) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      audioPart = { inlineData: { mimeType, data: base64 } };
    } else {
      const uploaded = await uploadToGeminiFilesApi(bytes, mimeType, fileName);
      audioPart = { fileData: { mimeType: uploaded.mimeType || mimeType, fileUri: uploaded.uri } };
    }

    const geminiBody = {
      contents: [{
        role: 'user',
        parts: [
          { text: GUIDELINES },
          audioPart,
          { text: 'Evaluate the audio above against the guidelines. Return the structured JSON per the schema. Be specific — quote the call directly whenever you can.' },
        ],
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    // Retry on transient Gemini errors (503 overloaded, 429 rate-limit, 500).
    const maxAttempts = 5;
    let gResp: Response | undefined;
    let lastErrBody = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      gResp = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      if (gResp.ok) break;
      lastErrBody = await gResp.text();
      const transient = gResp.status === 503 || gResp.status === 429 || gResp.status === 500;
      if (!transient || attempt === maxAttempts) {
        throw new Error(`Gemini error (${gResp.status}): ${lastErrBody.slice(0, 400)}`);
      }
      const delayMs = Math.min(30000, 2000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1000);
      console.log(`Gemini ${gResp.status} (attempt ${attempt}/${maxAttempts}) — retrying in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    if (!gResp || !gResp.ok) {
      throw new Error(`Gemini unavailable after ${maxAttempts} attempts: ${lastErrBody.slice(0, 400)}`);
    }

    const gResult = await gResp.json();
    const candidate = gResult.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error(`Empty response from Gemini (finishReason: ${finishReason || 'unknown'})`);
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      const hint = finishReason === 'MAX_TOKENS'
        ? 'Analysis was truncated — try a shorter call.'
        : `Could not parse analysis (finishReason: ${finishReason || 'unknown'})`;
      throw new Error(hint);
    }

    await supabase
      .from('admissions_analyses')
      .update({ status: 'done', result: analysis, completed_at: new Date().toISOString() })
      .eq('id', jobId);
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error';
    console.error(`job ${jobId} failed:`, msg);
    await supabase
      .from('admissions_analyses')
      .update({ status: 'error', error: msg, completed_at: new Date().toISOString() })
      .eq('id', jobId);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadToGeminiFilesApi(
  bytes: Uint8Array,
  mimeType: string,
  displayName: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  const startResp = await fetch(`${GEMINI_UPLOAD_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startResp.ok) {
    throw new Error(`Files API start failed: ${(await startResp.text()).slice(0, 300)}`);
  }
  const uploadUrl = startResp.headers.get('X-Goog-Upload-URL') || startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Files API: no upload URL returned.');

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });
  if (!uploadResp.ok) {
    throw new Error(`Files API upload failed: ${(await uploadResp.text()).slice(0, 300)}`);
  }
  const uploadResult = await uploadResp.json();
  const fileMeta = uploadResult.file;
  if (!fileMeta?.name || !fileMeta?.uri) {
    throw new Error('Files API: malformed upload response.');
  }

  let state: string = fileMeta.state || 'PROCESSING';
  let currentMime: string = fileMeta.mimeType || mimeType;
  let currentUri: string = fileMeta.uri;
  const maxPolls = 60; // up to ~2 min of processing
  const pollInterval = 2000;
  for (let i = 0; i < maxPolls && state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusResp = await fetch(`${GEMINI_FILES_URL}/${fileMeta.name}?key=${GEMINI_API_KEY}`);
    if (!statusResp.ok) {
      throw new Error(`Files API status check failed: ${(await statusResp.text()).slice(0, 300)}`);
    }
    const statusResult = await statusResp.json();
    state = statusResult.state || state;
    currentMime = statusResult.mimeType || currentMime;
    currentUri = statusResult.uri || currentUri;
  }
  if (state !== 'ACTIVE') {
    throw new Error(`Files API: file did not become ACTIVE (state=${state}). Try a shorter clip.`);
  }
  return { name: fileMeta.name, uri: currentUri, mimeType: currentMime };
}
