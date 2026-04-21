/**
 * Analyze Admissions Call Edge Function
 *
 * Accepts an audio file of an admissions call, sends it to Gemini 2.5 with
 * the Within Center admissions guidelines, and returns a structured analysis
 * of how the call went — tone adherence, sections covered, what went well,
 * what to improve.
 *
 * Deploy with: supabase functions deploy analyze-admissions-call --no-verify-jwt
 * (verify_jwt:false because this project uses ES256 JWT and the gateway
 *  rejects user tokens — see project_es256_jwt_gateway_bug memory)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

const MAX_BYTES = 30 * 1024 * 1024; // 30 MB, uploaded via Files API
const INLINE_MAX_BYTES = 15 * 1024 * 1024; // below this, skip Files API and send inline (faster, no processing wait)

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
`.trim();

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overall_score: { type: 'NUMBER', description: '0-100 score for the call overall' },
    letter_grade: { type: 'STRING', description: 'A+, A, A-, B+, B, B-, C+, C, C-, D, F' },
    one_line_summary: { type: 'STRING', description: 'Under 30 words.' },
    duration_estimate: { type: 'STRING', description: "Estimated call duration e.g. '12 minutes'" },
    caller_context: {
      type: 'OBJECT',
      properties: {
        presenting_concern: { type: 'STRING', description: 'Why the caller said they called, in their own words.' },
        emotional_state: { type: 'STRING', description: 'e.g. tender, grieving, curious, skeptical, anxious' },
        experience_level: { type: 'STRING', description: 'first-timer / some experience / experienced' },
      },
      required: ['presenting_concern', 'emotional_state', 'experience_level'],
    },
    tone_scores: {
      type: 'OBJECT',
      properties: {
        pace: { type: 'NUMBER', description: '0-100, was the rep speaking slowly enough' },
        silence: { type: 'NUMBER', description: '0-100, did the rep leave space after questions' },
        warmth: { type: 'NUMBER', description: '0-100, overall warmth and softness' },
        matching: { type: 'NUMBER', description: '0-100, did the rep match then lead energy' },
        notes: { type: 'STRING', description: '1-2 sentences on tone overall.' },
      },
      required: ['pace', 'silence', 'warmth', 'matching', 'notes'],
    },
    violations: {
      type: 'ARRAY',
      description: 'Specific moments where a rule was broken — interruptions, sales words, rushing, etc.',
      items: {
        type: 'OBJECT',
        properties: {
          rule: { type: 'STRING', description: 'Which rule was broken' },
          quote: { type: 'STRING', description: 'The exact words the rep said' },
          approx_timestamp: { type: 'STRING', description: 'e.g. 03:42' },
        },
        required: ['rule', 'quote'],
      },
    },
    sections_covered: {
      type: 'OBJECT',
      properties: {
        opening: { type: 'BOOLEAN' },
        discovery_questions_asked: { type: 'NUMBER', description: 'Out of 8 expected' },
        discovery_notes: { type: 'STRING', description: 'Which were missed, which were done well.' },
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
      description: '2-4 moments where the rep held space well, asked a great question, or matched tone.',
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
      description: '2-5 specific missed opportunities with what the rep could have said instead.',
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
    top_three_improvements: {
      type: 'ARRAY',
      description: 'Top 3 things to focus on for the next call, ordered by importance.',
      items: { type: 'STRING' },
    },
    transcript: { type: 'STRING', description: 'Full transcript with speaker labels (REP / CALLER) and approximate timestamps.' },
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

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return json({ error: 'No audio file provided. Attach it as the "file" field.' }, 400);
    }

    const mimeType = SUPPORTED_AUDIO_TYPES[file.type] || null;
    if (!mimeType) {
      return json({
        error: `Unsupported audio format: ${file.type || 'unknown'}. Use MP3, WAV, M4A, OGG, or WebM.`,
      }, 400);
    }

    if (file.size > MAX_BYTES) {
      return json({
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 30 MB. Try trimming or compressing the recording.`,
      }, 413);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Decide path: small files go inline (no upload/polling round-trip);
    // larger files use the Files API (up to 2 GB / 2 hrs of audio supported).
    let audioPart: Record<string, unknown>;
    if (file.size <= INLINE_MAX_BYTES) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      audioPart = { inlineData: { mimeType, data: base64 } };
    } else {
      const uploaded = await uploadToGeminiFilesApi(bytes, mimeType, file.name || 'admissions-call');
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
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const gResp = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!gResp.ok) {
      const errBody = await gResp.text();
      console.error('Gemini API error:', errBody);
      return json({ error: 'Gemini analysis failed', detail: errBody.slice(0, 500) }, 502);
    }

    const gResult = await gResp.json();
    const candidate = gResult.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('Empty Gemini response:', JSON.stringify(gResult).slice(0, 500));
      return json({ error: 'Empty response from Gemini.' }, 502);
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      console.error('JSON parse error:', e, 'text:', text.slice(0, 500));
      return json({ error: 'Gemini returned non-JSON output.' }, 502);
    }

    const usage = gResult.usageMetadata || {};

    return json({
      analysis,
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
      },
      model: GEMINI_MODEL,
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Server error', detail: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Upload an audio file to Gemini's Files API via the resumable protocol,
 * then poll until the file is ACTIVE (audio needs a few seconds of processing).
 * Returns { name, uri, mimeType } when ready.
 */
async function uploadToGeminiFilesApi(
  bytes: Uint8Array,
  mimeType: string,
  displayName: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  // Step 1 — start a resumable upload session and get the upload URL.
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
    const err = await startResp.text();
    throw new Error(`Files API start failed: ${err.slice(0, 300)}`);
  }
  const uploadUrl = startResp.headers.get('X-Goog-Upload-URL') || startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Files API: no upload URL returned.');
  }

  // Step 2 — upload bytes and finalize.
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
    const err = await uploadResp.text();
    throw new Error(`Files API upload failed: ${err.slice(0, 300)}`);
  }
  const uploadResult = await uploadResp.json();
  const fileMeta = uploadResult.file;
  if (!fileMeta?.name || !fileMeta?.uri) {
    throw new Error('Files API: malformed upload response.');
  }

  // Step 3 — poll until state is ACTIVE (audio requires processing).
  let state: string = fileMeta.state || 'PROCESSING';
  let currentMime: string = fileMeta.mimeType || mimeType;
  let currentUri: string = fileMeta.uri;
  const maxPolls = 30; // ~60s total
  const pollInterval = 2000;
  for (let i = 0; i < maxPolls && state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusResp = await fetch(`${GEMINI_FILES_URL}/${fileMeta.name}?key=${GEMINI_API_KEY}`);
    if (!statusResp.ok) {
      const err = await statusResp.text();
      throw new Error(`Files API status check failed: ${err.slice(0, 300)}`);
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
