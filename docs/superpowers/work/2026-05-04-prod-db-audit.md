# Prod DB Audit — Phase 1 Pass 5 — 2026-05-04

**Method:** read-only `supabase db query --linked` introspection + `supabase functions list`. **Zero writes.**

**Project:** `lnqxarwqckpmirpmixcw` (AWKNRanch) — West US (Oregon)

## TL;DR

The prod DB is **already clean** of Alpaca/IoT/PAI/Vapi residue at the schema layer. The actual cleanup target is **5 deployed edge functions** that need undeployment at end-of-program cutover (Task 2.11). No DDL migration required — `Task 5.5` becomes trivial.

| Layer | Total | Alpaca residue | Action |
|---|---|---|---|
| Public tables | 70 | 0 | None |
| DB functions (public) | 4 | 0 | None |
| RLS policies | ~120 | 0 | None |
| Deployed edge functions | 51 | **5** | Undeploy at cutover |

## Tables (70 total)

All 70 tables fall into clear AWKN/Within Center buckets. No matches for any of the suspect patterns from Pass 1 inventory:

**Searched (zero hits):** `vehicles`, `tesla_*`, `nest_*`, `govee_*`, `sonos_*`, `lg_*`, `anova_*`, `glowforge_*`, `printer_*`, `camera_*`, `blink_*`, `iot_*`, `device_*`, `tenant_*`, `pai_*`, `voice_*`, `vapi_*`, `whisper_*`, `signwell_*`, `lease_*`, `rental_*`, `event_hosting_*`

**Confirmed-AWKN clusters:**
- **CRM:** `crm_activities`, `crm_ad_spend`, `crm_invoice_line_items`, `crm_invoices`, `crm_lead_sources`, `crm_leads`, `crm_number_sequences`, `crm_pipeline_stages`, `crm_proposal_items`, `crm_proposals`, `crm_service_package_items`, `crm_service_packages`, `crm_venue_catalog`
- **Within Center:** `within_appointments`, `within_assessments`, `within_audit_log`, `within_consents`, `within_inventory`, `within_invoices`, `within_notes`, `within_patients`, `within_retreat_agreements`, `within_sessions`, `within_staff`
- **WC (Within Center scheduling adjacents):** `wc_bookings`, `wc_contact_submissions`, `wc_newsletter_subscribers`, `wc_posts`, `wc_provider_schedules`, `wc_providers`, `wc_services`, `wc_team_members`
- **Memberships/clients:** `client_integration_notes`, `client_package_sessions`, `client_packages`, `client_stays`, `member_memberships`, `membership_plans`
- **Spaces/scheduling:** `activity_bookings`, `activity_types`, `beds`, `booking_rooms`, `booking_spaces`, `event_space_reservations`, `scheduling_booking_attendees`, `scheduling_bookings`, `scheduling_event_types`, `scheduling_profiles`, `services`, `spaces`
- **Auth/permissions:** `app_users`, `investor_access`, `job_title_permissions`, `job_titles`, `permissions`, `property_config`, `role_permissions`, `staff_activity_types`, `staff_members`, `user_invitations`, `user_permissions`
- **Operations:** `admissions_analyses`, `email_type_approval_config`, `facilitator_services`, `facilitators`, `house_meals`, `image_library`, `org_chart_state`, `stripe_config`, `stripe_payments`, `todo_categories`, `todo_items`

**Notable confirmations of prior empirical findings:**
- `signwell_config`, `rental_applications`, `lease_templates`, `event_hosting_requests` — **confirmed missing**. SignWell webhook code references tables that don't exist in prod (open COO question still valid).
- `voice_assistants`, `voice_calls` — **confirmed missing**. faq.js's deleted `loadVoiceAssistant()` was querying tables that never existed in prod (or were dropped previously). Pass 4 surgery was correct.
- `vehicles` — **confirmed missing**. Earlier resolved CTO decision (drop) — already done outside this program.

## DB functions (4 total in `public`)

All AWKN/Within-relevant:
- `generate_crm_number` (CRM number sequencing)
- `get_effective_permissions` (RBAC resolver)
- `is_within_authorized` (Within auth helper)
- `within_retreat_agreements_set_updated_at` (trigger fn)

Zero suspect functions.

## RLS policies (~120 total)

Spot-checked first 100 — all reference confirmed-AWKN tables. No policies on any IoT/PAI/Vapi tables (because those tables don't exist).

## Edge functions deployed in prod (51 total)

### 🔴 To undeploy at end-of-program cutover (Task 2.11 — 5 functions)

| Function | Source status | Pass | Notes |
|---|---|---|---|
| `vapi-server` | ✅ source deleted | Pass 4 Batch A | Vapi voice assistant runtime |
| `property-ai` | ✅ source deleted | Pass 4 Batch A | 4019-line PAI/Gemini chat backend |
| `generate-whispers` | ✅ source deleted | Pass 4 Batch A | Vapi voice synthesis |
| `nest-control` | ✅ source deleted | Pass 2 | Nest thermostat IoT |
| `tesla-command` | ✅ source deleted | Pass 2 | Tesla Fleet API IoT |

### ✅ Vapi/PAI functions NOT deployed in prod (good news)

These had source files that Pass 4 deleted, but were never deployed to prod (or undeployed previously):
- `vapi-webhook` (source deleted Pass 4)
- `reprocess-pai-email` (source deleted Pass 4)

### ✅ IoT functions NOT deployed (Pass 2 source-deletes that were already prod-clean)

- `alexa-room-control`
- `anova-control`
- `glowforge-control`
- `govee-control`
- `home-assistant-control`
- `lg-control`
- `nest-token-refresh`
- `printer-control`
- `sonos-control`

(Pass 1 inventory listed 11 IoT functions for undeploy in Task 2.11 — turns out 9 of those 11 were already absent. Only `nest-control` and `tesla-command` remain.)

### ✅ Confirmed-AWKN edge functions (46)

Payments, Within Center, scheduling, email, ical, w9, payroll, etc. — all kept.

## Conclusion

- **Total tables:** 70 — all AWKN
- **Suspected residue tables:** 0
- **DB functions to drop:** 0
- **RLS policies to drop:** 0
- **Edge functions to undeploy (Task 2.11):** 5 (`vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`)
- **User's hunch validation:** Correct. Prod was substantially cleaner than the codebase. Most Alpaca tables/functions were either never deployed or dropped previously without doc trail. The codebase carried the residue, not the database.

## Implication for Task 5.5 (deferred prod cleanup migration)

Originally scoped as a SQL migration to drop tables/functions. **Becomes trivial** — no DDL needed. Replaced by a 5-line `supabase functions delete` runbook for end-of-program cutover.
