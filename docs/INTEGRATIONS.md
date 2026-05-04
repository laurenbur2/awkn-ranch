# External Systems & API Cost Accounting

> Reference document extracted from CLAUDE.md. Loaded on-demand, not auto-loaded into context.
> Updated 2026-05-04 (Phase 1 Pass 6) — IoT/Vapi/PAI integrations removed.

## API Cost Accounting (REQUIRED)

**Every feature that makes external API calls MUST log usage to the `api_usage_log` table for cost tracking.**

This is non-negotiable. When building or modifying any feature that calls a paid API, you must instrument it to log each API call with its cost data. This lets us track spending by vendor and by feature category.

### The `api_usage_log` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Auto-generated |
| `vendor` | text NOT NULL | API provider (see vendor list below) |
| `category` | text NOT NULL | Granular feature category (see category list below) |
| `endpoint` | text | API endpoint or operation name |
| `input_tokens` | integer | Input/request tokens (for LLM APIs) |
| `output_tokens` | integer | Output/response tokens (for LLM APIs) |
| `units` | numeric | Non-token usage units (SMS segments, emails, minutes, etc.) |
| `unit_type` | text | What the units represent (e.g., "sms_segments", "emails", "call_minutes", "documents", "api_calls") |
| `estimated_cost_usd` | numeric | Calculated cost for this call |
| `metadata` | jsonb | Additional context (model name, prompt snippet, error info, etc.) |
| `app_user_id` | uuid FK→app_users | User who triggered the call (if applicable) |
| `created_at` | timestamptz | When the API call was made |

### Vendors

Use these exact vendor strings:

| Vendor | Services |
|--------|----------|
| `gemini` | Gemini API (image gen, payment matching, weather summaries, email classification, daily content) |
| `openrouter` | OpenRouter multi-model gateway (used in email classification + as Gemini alternative) |
| `telnyx` | SMS sending/receiving |
| `resend` | Email sending |
| `signwell` | E-signature documents |
| `square` | Payment processing |
| `stripe` | Payment processing (ACH, card, Connect payouts) |
| `paypal` | Associate payouts + checkout |
| `meta_whatsapp` | WhatsApp Business messaging |
| `openweathermap` | Weather API |
| `supabase` | Supabase platform (storage, edge function invocations) |
| `cloudflare_r2` | Cloudflare R2 object storage |

### Categories (Granular)

Use descriptive, granular categories that identify the specific feature. Examples:

| Category | Description |
|----------|-------------|
| `spaces_image_gen` | AI-generated space/marketing images (Gemini) |
| `identity_verification` | DL photo verification via Gemini Vision |
| `payment_matching` | AI-assisted payment matching (Gemini) |
| `email_classification` | Inbound email routing classification (Gemini + OpenRouter) |
| `email_template_edit` | Gemini-assisted email template editing |
| `weather_forecast` | Weather API calls (Gemini-summarized) |
| `daily_fact` | Daily content generation (Gemini) |
| `admissions_call_analysis` | Within Center admissions call transcript analysis (Gemini) |
| `bug_analysis` | Bug Scout automated bug analysis |
| `feature_building` | Feature Builder automated implementation |
| `sms_tenant_notification` | SMS notifications to tenants |
| `sms_bulk_announcement` | Bulk SMS announcements |
| `email_tenant_notification` | Email notifications to tenants |
| `email_system_alert` | System alert emails (errors, digests) |
| `email_payment_receipt` | Payment receipt/confirmation emails |
| `whatsapp_message` | WhatsApp outbound message |
| `square_payment_processing` | Square payment transactions |
| `stripe_payment_processing` | Stripe inbound payment transactions (ACH, card) |
| `stripe_associate_payout` | Stripe Connect outbound transfers to associates |
| `square_webhook` | Square webhook event receipt |
| `paypal_associate_payout` | PayPal associate payouts |
| `airbnb_ical_sync` | Airbnb calendar sync |
| `r2_document_upload` | Document upload to Cloudflare R2 |

**When adding a new feature that uses an API, add a new category to this list.** Categories should be specific enough to answer "how much does X feature cost us per month?"

### How to Log (Edge Functions)

In Supabase edge functions, log after each API call:

```typescript
// After making an API call, log the usage
await supabaseAdmin.from('api_usage_log').insert({
  vendor: 'gemini',
  category: 'pai_chat',
  endpoint: 'generateContent',
  input_tokens: response.usageMetadata?.promptTokenCount,
  output_tokens: response.usageMetadata?.candidatesTokenCount,
  estimated_cost_usd: calculateGeminiCost(inputTokens, outputTokens),
  metadata: { model: 'gemini-2.0-flash', conversation_id: '...' },
  app_user_id: userId
});
```

### How to Log (DO Droplet Workers)

Workers should log via direct Supabase insert (they already have service role keys):

```javascript
await supabase.from('api_usage_log').insert({
  vendor: 'tesla',
  category: 'tesla_vehicle_poll',
  endpoint: 'vehicle_data',
  units: vehicleCount,
  unit_type: 'api_calls',
  estimated_cost_usd: 0, // Free tier / included
  metadata: { vehicles_polled: vehicleNames }
});
```

### Cost Aggregation

The accounting admin page (`spaces/admin/accounting.html`) should show:
- **By vendor**: Total spend per vendor per month
- **By category**: Total spend per category per month
- **Drill-down**: Click vendor → see category breakdown

### Pricing Reference (for cost calculation)

| Vendor | Pricing |
|--------|---------|
| Gemini 2.5 Pro | Input: $1.25/1M tokens, Output: $10.00/1M tokens |
| Gemini 2.5 Flash | Input: $0.15/1M tokens, Output: $3.50/1M tokens (under 200k context) |
| Gemini 2.0 Flash | Input: $0.10/1M tokens, Output: $0.40/1M tokens |
| OpenRouter | Pass-through pricing per model — see https://openrouter.ai/models |
| Telnyx SMS | ~$0.004/segment outbound, ~$0.001/segment inbound |
| Resend Email | Free tier: 100/day, then $0.00028/email |
| Meta WhatsApp | First 1,000 conversations/month free, then per-conversation by category |
| SignWell | Included in plan (25 docs/month free) |
| Square | 2.6% + $0.10 per transaction |
| Stripe | ACH: 0.8% capped at $5; Cards: 2.9% + $0.30; Connect transfers: $0.25/payout |
| PayPal Payouts | $0.25/payout (US) |


## External Systems

### SignWell (E-Signatures)
- API Key: Stored in `signwell_config` table (not hardcoded)
- API Base: `https://www.signwell.com/api/v1`
- Used for rental agreement e-signatures

**Workflow:**
1. Admin generates PDF from lease template (Documents tab)
2. Admin clicks "Send for Signature" → SignWell API creates document
3. Tenant receives email, signs in SignWell
4. Webhook notifies system → downloads signed PDF → stores in Supabase
5. `agreement_status` updated to "signed"

### Resend (Email)
- **Domain**: `awknranch.com` (verified, sending + receiving)
- **Account**: wingsiebird@gmail.com
- **API Key**: Stored as Supabase secret `RESEND_API_KEY`
- **Webhook Secret**: Stored as Supabase secret `RESEND_WEBHOOK_SECRET` (SVIX-based)
- **Outbound**: `send-email` Edge Function sends via Resend API (43 templates)
  - From: `notifications@awknranch.com` (forwarded emails) or `noreply@awknranch.com` (system emails)
  - Client service: `shared/email-service.js`
- **Inbound**: `resend-inbound-webhook` Edge Function (deployed with `--no-verify-jwt`)
  - Webhook URL: `https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/resend-inbound-webhook`
  - Event: `email.received`
  - All inbound emails logged to `inbound_emails` table
  - Webhook payload doesn't include body — fetched separately via Resend API

**DNS Records** (GoDaddy, domain: `awknranch.com`):
- MX `@` → `inbound-smtp.us-east-1.amazonaws.com` (priority 10) — inbound receiving
- MX `send` → `feedback-smtp.us-east-1.amazonses.com` (priority 10) — SPF for outbound
- TXT `send` → SPF record for outbound
- TXT `resend._domainkey` → DKIM record

**Inbound Email Routing** (`*@awknranch.com`):
| Prefix | Action | Destination |
|--------|--------|-------------|
| `haydn@` | Forward | `hUSERNAME@gmail.com` |
| `rahulio@` | Forward | `rahulioson@gmail.com` |
| `sonia@` | Forward | `sonia245g@gmail.com` |
| `team@` | Forward | `admin@awknranch.com` |
| `herd@` | Special logic | (stub — future AI processing) |
| `auto@` | Special logic | Bug report replies → new bug report; others → admin |
| `pai@` | Special logic | Gemini classifies → questions/commands get PAI reply; documents uploaded to R2; other forwarded to admin |
| Everything else | Forward | `admin@awknranch.com` |

### Telnyx (SMS)
- Config stored in `telnyx_config` table (api_key, messaging_profile_id, phone_number, test_mode)
- Outbound: `send-sms` Edge Function calls Telnyx Messages API
- Inbound: `telnyx-webhook` Edge Function receives SMS, stores in `sms_messages` table
- Client service: `shared/sms-service.js` (mirrors email-service.js pattern)
- Admin UI: Settings tab has test mode toggle, compose SMS, bulk SMS, inbound SMS view

### Meta WhatsApp (Messaging)
- **API**: WhatsApp Business Cloud API (Meta Graph API)
- **Outbound**: `send-whatsapp` edge function
- **Inbound**: `whatsapp-webhook` edge function (deployed `--no-verify-jwt`)
- **Client service**: `shared/whatsapp-service.js`
- **Pricing**: First 1,000 user-initiated conversations/month free, then per-conversation by category (utility/marketing/authentication/service)

### DigitalOcean Droplet
- Hosts Bug Scout (`bug_scout.js`) and Feature Builder agentic workers
- Bug Scout: polls `bug_reports` for pending bugs → runs Claude Code to fix → commits to `bugfix/` branch → merges to main
- Feature Builder: `feature-builder/feature_builder.js` — polls feature requests → runs Claude Code to implement
- Bug fixer repo is a clone of this repo, used for verification screenshots
- Image Gen worker (`/opt/image-gen/worker.js`, systemd: `image-gen.service`) — generates marketing/space images via Gemini
- Queries Supabase directly via service role key
- **NOTE:** Auto-merge agentic systems push directly to `main` and need to be paused/repointed before Phase 6 BOS migration (cross-cutting tech-debt item in TODO.md)

### OpenWeatherMap (Weather)
- **API**: One Call API 3.0 (with 2.5 free tier fallback)
- **Used by**: `gemini-weather` edge function (Gemini-summarized forecast)
- **Location**: Austin, TX
- **Pricing**: Free tier: 1,000 calls/day

### OpenRouter (Multi-Model LLM Gateway)
- **API**: OpenAI-compatible REST API (`https://openrouter.ai/api/v1`)
- **Auth**: `Authorization: Bearer sk-or-v1-...` header
- **Used by**: `_shared/email-classifier.ts` (live in `resend-inbound-webhook`) — drop-in alternative to Gemini for classification
- **Supabase Secret**: `OPENROUTER_API_KEY`
- **Pricing**: Pass-through per model — see https://openrouter.ai/models

### AI Image Generation (Gemini)
- **Worker:** `/opt/image-gen/worker.js` on DO droplet (systemd: `image-gen.service`)
- **API:** Gemini 2.5 Flash Image (`generateContent` with `responseModalities: ["TEXT","IMAGE"]`)
- **Cost:** ~$0.039/image (1290 output tokens × $30/1M tokens)
- **Storage:** Supabase Storage (cost tracked in `accounting.html`)
- **DB:** `image_gen_jobs` table (job queue), results link to `media` table
- **Trigger:** Insert rows into `image_gen_jobs` — worker polls every 10s
- **Batch:** Set `batch_id` + `batch_label` for grouped jobs
- **Cost tracking:** API response includes `usageMetadata` token counts, stored per-job

### Stripe (Inbound Payments + Associate Payouts)
- **API**: Stripe PaymentIntents (inbound ACH/card) + Stripe Connect Transfers (outbound payouts)
- **Auth**: Secret key for server-side, publishable key for client-side Stripe.js
- **Edge functions**: `process-stripe-payment` (create PaymentIntent), `stripe-webhook` (HMAC-SHA256 verified), `stripe-connect-onboard` (Express accounts), `stripe-payout` (transfers)
- **Config**: `stripe_config` table (publishable/secret keys for sandbox + production, webhook secrets, is_active, test_mode, connect_enabled)
- **DB**: `stripe_payments` (PaymentIntent tracking), `payment_methods` (display methods on pay page)
- **Payment page**: `/pay/index.html` — self-service payment with URL params for pre-filling
- **Client service**: `shared/stripe-service.js` (config loader, PaymentIntent creation, Stripe.js v3 loader)
- **Confirmation email**: Rich receipt with payment history, outstanding balance, "Pay Now" link
- **Webhook events**: `payment_intent.succeeded/failed`, `transfer.paid/failed/reversed`, `account.updated`
- **Connect**: Associates onboard Express accounts for direct ACH payouts, gated on identity verification
- **Pricing**: 0.8% capped at $5 per ACH transaction (displayed on pay page)

### PayPal (Inbound + Associate Payouts)
- **API**: PayPal Payouts API (batch payments) + Checkout (inbound)
- **Auth**: OAuth client credentials flow
- **Edge functions**: `paypal-checkout` (inbound) + `paypal-payout` (outbound) + `paypal-webhook` (status updates, `--no-verify-jwt`)
- **Config**: `paypal_config` table (client_id, client_secret, sandbox variants, test_mode)
- **DB**: `payouts` table (amount, status, time_entry_ids linkage)
- **Supports**: Sandbox + production environments
- **Gated on**: Associate identity verification status

### Square (Inbound Payments)
- **API**: Square Payments API
- **Edge functions**: `process-square-payment` + `refund-square-payment` + `square-webhook` (`--no-verify-jwt`)
- **Client service**: `shared/square-service.js` (tokenization)
- **Pricing**: 2.6% + $0.10 per transaction

### Google Calendar (Staff Scheduling)
- **API**: Google Calendar API v3 (OAuth 2.0)
- **Edge functions**: `google-calendar-auth` (initial OAuth), `google-calendar-refresh` (token refresh)
- **Use**: Staff schedule integration with personal Google calendars

### Airbnb (iCal Sync)
- **Edge functions**: `airbnb-sync` (fetch iCal), `ical` (export iCal), `regenerate-ical` (on changes)
- **Inbound**: Fetches Airbnb iCal feeds from `spaces.airbnb_ical_url`
- **Outbound**: Exports assignments per space as iCal (GET `/functions/v1/ical?space={slug}`)
- **Parent cascade**: Blocking parent space blocks all child spaces
- **DB columns on spaces**: `airbnb_ical_url`, `airbnb_link`, `airbnb_rate`, `airbnb_blocked_dates`

### Cloudflare R2 (Object Storage)
- **Account**: Cloudflare AWKN Ranch (founder's personal Google account — bus-factor risk; cross-cutting TODO)
- **Bucket**: `your-app` — **TODO: rename to AWKN-branded bucket**. Hardcoded in `shared/config-loader.js`, `supabase/functions/_shared/api-helpers.ts`, `supabase/functions/_shared/property-config.ts`
- **S3 API**: `https://<account_id>.r2.cloudflarestorage.com`
- **Auth**: S3-compatible API with AWS Signature V4
- **Supabase Secrets**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- **DB config**: `r2_config` table (single row, id=1)
- **Shared helper**: `supabase/functions/_shared/r2-upload.ts` — `uploadToR2()`, `deleteFromR2()`, `getR2PublicUrl()`
- **Document tracking**: `document_index` table maps files to R2 URLs
- **Pricing**: 10 GB free, $0.015/GB-mo beyond that, zero egress fees

### Google Drive (Legacy)
- Rental agreements stored in a shared folder (legacy)
- Not programmatically accessed

