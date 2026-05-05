# Key Files Reference

> Loaded on-demand from `CLAUDE.md`. Updated 2026-05-04 (Phase 1 Pass 6).

## Top-level layout

| Path | Purpose |
|---|---|
| `index.html`, `404.html`, `lost.html` | Public landing + error pages |
| `auth/`, `login/` | Auth UI |
| `contact/`, `community/`, `directory/`, `team/`, `orientation/`, `visiting/`, `waiver/` | Public marketing + member-facing static pages |
| `events/`, `schedule/`, `planlist/`, `pricing/`, `retreat/`, `groundskeeper/`, `image-studio/`, `investor/`, `investor-presentation/`, `operations/`, `photos/`, `worktrade/` | Topical AWKN surfaces (mid-Pillar-refactor consolidation) |
| `within/`, `within-center/` | Within Center surfaces |
| `spaces/` | Public space listings + apply flow + verify (`spaces/`, `spaces/apply/`, `spaces/hostevent/`, `spaces/verify.html`, `spaces/w9.html`) |
| `spaces/admin/` | **Admin BOS — primary operating system** |
| `pay/` | Self-service payment page |
| `admin/` | Email approval handler pages (`email-approved.html`, `email-confirm.html`) — paired with `approve-email/` edge function |
| `associates/` | Associate clock-in / project-inquiry / worktracking pages |
| `assets/branding/` | AWKN + Within wordmarks, logos, brand previews |
| `styles/` | Tailwind v4 source + design tokens (`tokens.css`) |
| `scripts/` | Build + ops scripts |
| `shared/` | All client-side shared modules (see below) |
| `supabase/functions/` | Supabase edge functions (see below) |
| `cloudflare/` | Cloudflare Worker / D1 setup for Claude Code session logging |
| `docs/` | Project documentation (this file's home) |

## Shared modules (`shared/`)

### Core infrastructure
- `supabase.js` — Supabase client singleton; supports BOS local toggle (`?local=1` / localStorage / `window.AWKN_LOCAL_DB`)
- `auth.js` — Auth flow + role/permission checks
- `config-loader.js` — Property config loader (`property_config` JSONB)
- `brand-config.js` — Brand config loader (`brand_config` JSONB)
- `feature-registry.js` — Feature flag registry (core vs optional modules)

### Page shells
- `admin-shell.js` — Admin BOS shell (auth, nav, role checks, toast)
- `associate-shell.js` — Associate page shell
- `personal-page-shell.js` — Member-only profile shell (lighter auth than admin)
- `public-shell.js` — Public site nav + footer
- `site-components.js` — Shared header/footer components
- `instant-chrome.js` — First-paint chrome rendering
- `tab-utils.js` — Tab navigation helpers

### Feature services
- `media-service.js` — Media upload, compression, tagging
- `email-service.js` — Resend email API client (40+ branded templates)
- `email-template-service.js` — Email template rendering
- `sms-service.js` — Telnyx SMS client
- `whatsapp-service.js` — Meta WhatsApp client
- `signwell-service.js` — SignWell e-signature integration
- `pdf-service.js` — jsPDF rendering for lease/agreement PDFs
- `lease-template-service.js` / `event-template-service.js` / `worktrade-template-service.js` — Template parsing + placeholder substitution
- `rental-service.js` / `event-service.js` / `booking-service.js` / `booking-widget.js` — Rental and event request workflows
- `hours-service.js` — Associate hour tracking
- `payout-service.js` — PayPal payouts
- `accounting-service.js` — Ledger + Zelle auto-recording
- `square-service.js` — Square payment client (tokenization)
- `stripe-service.js` — Stripe Payment Element loader + PaymentIntent creation
- `identity-service.js` — DL/ID verification (upload tokens + Gemini Vision call)
- `project-service.js` — Project inquiry flow
- `client-stay-modal.js` — Within Center stay modal
- `chat-widget.js` — Floating chat widget
- `visitor-identity.js` — Anonymous visitor tracking
- `demo-redact.js` — Demo-mode PII redaction
- `error-logger.js` — Client-side error capture → `error-report` edge function
- `version-info.js` — Version badge handler
- `timezone.js` — Austin/Chicago timezone helpers
- `supabase-health.js` — Edge function health probe

## Admin BOS pages (`spaces/admin/`)

Per Pass 3 audit, these are the active AWKN admin pages. Many are mid-Pillar-refactor consolidation; some have legacy redirects preserved per Justin's design.

| Cluster | Pages |
|---|---|
| **Dashboard / shell** | `dashboard`, `index`, `manage`, `testdev`, `devcontrol`, `appdev` |
| **CRM + sales** | `crm`, `clients`, `proposals` (live), `releases` |
| **Spaces + media** | `spaces`, `media`, `highlights-order`, `phyprop` (physical property) |
| **Scheduling** | `scheduling`, `reservations`, `within-schedule`, `retreat-house` |
| **Memberships** | `memberships`, `packages` |
| **Venue (events)** | `events`, `venue-events`, `venue-spaces`, `venue-clients` |
| **Rentals** | `rentals` |
| **Payments + accounting** | `accounting`, `purchases` |
| **Communications** | `sms-messages` |
| **Templates + brand** | `templates`, `brand` |
| **Staff** | `staff`, `worktracking`, `job-titles` |
| **People + auth** | `users`, `clients`, `passwords` |
| **Knowledge** | `faq`, `planlist`, `projects` |
| **System** | `settings` |

CRM logic spans `crm.html` / `crm.js` / `crm-actions.js`.

## Self-service payment (`pay/`)

`pay/index.html` — public payment page with Stripe PaymentElement + manual methods (Zelle/Venmo/PayPal).
URL params: `?amount=`, `?description=`, `?person_id=`, `?person_name=`, `?email=`, `?payment_type=`, `?reference_type=`, `?reference_id=`. On Stripe success, `stripe-webhook` records ledger entry + sends confirmation email.

## Consumer space view (`spaces/`)

`spaces/app.js` powers public listings. Filters `is_listed=true AND is_secret=false`. Sorts: available first → highest price → name. Loads assignments for availability without exposing personal info.

## Supabase edge functions (`supabase/functions/`)

Grouped by domain. All deploy via `supabase functions deploy <name>`; functions handling auth internally use `--no-verify-jwt` (table below).

### Centralized API
- `api/` — **central permissioned REST gateway** for entity CRUD across spaces, people, tasks, assignments, vehicles, media, payments, bug_reports, time_entries, events, documents, sms, faq, invitations, password_vault, feature_requests. Role-based access (0=public → 4=oracle), fuzzy name resolution, auto-timestamps, row-level scoping. See `API.md` for full reference.
- `_shared/` — shared helpers: `email-brand-wrapper.ts`, `email-classifier.ts` (Gemini + OpenRouter), `property-config.ts`, `r2-upload.ts`, `receipt-processor.ts`, etc.

### Email + SMS + WhatsApp
- `send-email/` — outbound email via Resend (40+ branded templates)
- `send-sms/` — outbound SMS via Telnyx
- `send-whatsapp/` — outbound WhatsApp via Meta
- `telnyx-webhook/` — inbound SMS receiver
- `whatsapp-webhook/` — inbound WhatsApp receiver
- `resend-inbound-webhook/` — inbound email receiver: routes/forwards, auto-records Zelle, classifies via Gemini
- `approve-email/` — email approval flow (validates token, releases held email)
- `audit-email-compliance/` — outbound compliance audit
- `edit-email-template/` — Gemini-assisted template editing

### Payments
- `process-stripe-payment/` — creates Stripe PaymentIntent (returns clientSecret)
- `stripe-webhook/` — Stripe event receiver (payment, transfer, account)
- `stripe-connect-onboard/` + `stripe-connect-link/` — Express account onboarding
- `stripe-payout/` — outbound ACH transfers
- `within-stripe-webhook/` — Within Center–specific Stripe webhook
- `process-square-payment/` + `square-webhook/` + `refund-square-payment/` — Square processing
- `paypal-checkout/` + `paypal-payout/` + `paypal-webhook/` — PayPal in/out
- `record-payment/` — AI-assisted payment matching (Gemini); accepts manual + OpenClaw payloads
- `resolve-payment/` — manual resolution for pending matches
- `confirm-deposit-payment/` — deposit confirmation workflow
- `create-payment-link/` — Stripe payment link generator
- `event-payment-reminder/` — daily cron: 10-day event payment reminders
- `payment-overdue-check/` — overdue payment scanner
- `send-balance-reminders/` — outstanding balance reminders

### Scheduling + booking
- `scheduling-availability/` / `scheduling-book/` / `scheduling-manage/` — booking flow
- `scheduling-pending-sweeper/` — abandoned-hold cleanup
- `scheduling-send-reminders/` — pre-arrival reminders
- `admin-book-session/` — staff booking
- `airbnb-sync/` + `ical/` + `regenerate-ical/` — Airbnb iCal in/out
- `google-calendar-auth/` + `google-calendar-refresh/` — Google Calendar OAuth

### CRM + agreements + identity
- `create-proposal-contract/` — proposal generation
- `create-retreat-agreement/` — retreat agreement generation
- `create-within-checkout-session/` — Within stay checkout
- `signwell-webhook/` — signature receiver
- `verify-identity/` — DL photo → Gemini Vision → auto-verify
- `w9-submit/` — W-9 form submission

### Within Center clinical
- `analyze-admissions-call/` — admissions call transcript analysis (Gemini)
- `get-admissions-analysis/` — fetch analysis
- `send-within-deposit-email/` — deposit invoice
- `get-ninja-rsvp-status/` — Within RSVP query

### Reports + ops
- `generate-1099-data/` — annual 1099 generation
- `weekly-payroll-summary/` — weekly payroll
- `weekly-schedule-report/` — weekly schedule digest
- `send-grounds-checklist/` — grounds keeper checklist
- `work-photo-reminder/` — staff photo reminder
- `generate-daily-fact/` — daily content (Gemini)
- `gemini-weather/` — weather summary (Gemini + OpenWeatherMap)
- `lesson-nav/` — orientation lesson navigation
- `share-space/` — OG meta + redirect for space share links
- `guestbook-upload/` — guestbook media intake
- `error-report/` — client error capture + daily digest
- `ask-question/` — public Q&A via knowledge base
- `contact-form/` — public contact form

## Edge function deploy flags

Functions handling auth internally must deploy with `--no-verify-jwt`:

```
api, approve-email, paypal-webhook, resend-inbound-webhook, share-space,
signwell-webhook, square-webhook, stripe-webhook, telnyx-webhook,
verify-identity, whatsapp-webhook, within-stripe-webhook
```

All others use the default `supabase functions deploy <name>`.
