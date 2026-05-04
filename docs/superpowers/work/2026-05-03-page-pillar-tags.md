# Page Pillar Tags — Phase 1 Pass 3 deliverable

Running tag of every admin BOS page surveyed during Pass 3 folder-by-folder audit. Input to Phase 6 IA / Pillar-model work.

**Pillar values:** `Ranch` (AWKN Ranch venue), `Within` (Within Center clinical), `Retreat` (AWKN Retreat House), `Venue` (Venue Rental for events), `Cross-cutting` (multi-pillar), `→ Pass 4 wholesale` (delete with Vapi/PAI decommission), `→ Pass 4 surgery` (rip PAI/Vapi guts, keep AWKN parts).

## Chunk 1 — PAI/Vapi cluster (audited 2026-05-03)

| Page | Folder | Pillar / Disposition | Notes |
|---|---|---|---|
| `lifeofpaiadmin.html` | `spaces/admin/` | ✅ Deleted 2026-05-03 | Was a meta-refresh redirect to `/residents/lifeofpaiadmin.html`; target was deleted in Pass 2. Companion `.js` never existed. |
| `ai-admin.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | "AlpaClaw" admin page (chat gateway / OpenClaw configuration). Dies with PAI. Tab `openclaw` in admin-shell.js, `feature: 'pai'`. |
| `pai-imagery.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | PAI image-generation viewer. Dies with PAI. |
| `voice.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | "Concierge" page — Vapi voice management UI. Imports `voice-service.js`. Tab `voice` in admin-shell.js, `feature: 'voice'`. Already on Pass 4 Vapi decommission list. |
| `faq.html` + `.js` | `spaces/admin/` | → Pass 4 surgery | FAQ Management page. Imports `chat-widget.js`, references `voiceAssistant`/`voiceCallStats`. Decision in Pass 4: keep FAQ data (Q&A entries may be AWKN-relevant content) and rip out PAI/Vapi guts, OR wholesale delete if FAQ data is also alpaca residue. |

**Same-commit reference cleanup:**
- `shared/admin-shell.js` — removed `lifeofpai` tab entry + icon
- `shared/associate-shell.js` — removed `admin_pai_settings` from ADMIN_PERMISSION_KEYS
- `shared/resident-shell.js` — removed `admin_pai_settings` from ADMIN_PERMISSION_KEYS, removed broken-link entry pointing to deleted lifeofpaiadmin
- `spaces/admin/users.js` — removed PAI tab entry from user-permissions UI

**Deferred to Pass 4:** all `feature: 'pai'`-gated and `feature: 'voice'`-gated tab entries in `shared/admin-shell.js` (faq, voice, openclaw) — bundled with PAI/Vapi wholesale decommission.
