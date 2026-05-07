# Phase 6a Codex Audit — Raw Findings

**Audit date:** 2026-05-06
**Auditor:** OpenAI Codex (codex-cli 0.55, default model — `gpt-5` requires org verification)
**Subject:** `docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md` v1
**Result:** 30 issues found — 4 CRITICAL, 23 MAJOR, 3 MINOR

This file is a snapshot of the adversarial review for traceability. The spec v2 incorporates 29 of the 30 issues; one was rejected as factually incorrect (see "Rejections" below).

## Summary table

| # | Severity | Phase | Issue (one-liner) | Disposition |
|---|---|---|---|---|
| 1 | CRITICAL | 6a.5 | Phased rollout strands operators | INCORPORATED — deploy stack concept |
| 2 | MAJOR | 6a.6 | /portal redirect deferred to 6a.8 | INCORPORATED — paired with deploy stack |
| 3 | MAJOR | 6a.6 | /logged-in placement undecided | INCORPORATED — locked decision: move to team |
| 4 | CRITICAL | 6a.2 | Server Action assumes server-readable session | INCORPORATED — bearer token pattern |
| 5 | CRITICAL | 6a.2 | No CSRF protection on privileged mutations | INCORPORATED — bearer is CSRF-immune + Origin check |
| 6 | MAJOR | 6a.2 | params type signature wrong | REJECTED — Codex incorrect; Next 16 uses Promise<params> |
| 7 | MAJOR | 6a.2 | No per-op role matrix | INCORPORATED — explicit allowlist per op |
| 8 | MAJOR | 6a.2 | Inputs minimally validated | INCORPORATED — Zod schemas |
| 9 | MAJOR | 6a.2 | Audit log is just console.log | INCORPORATED — structured console.log via Vercel logs; persistent table deferred to 6b with explicit risk acknowledgment |
| 10 | MAJOR | 6a.2 | No CORS/Origin restriction | INCORPORATED — Origin allowlist per route |
| 11 | MAJOR | 6a.0 | Vercel env vars missing from prereq | INCORPORATED — full env checklist in 6a.0 |
| 12 | MAJOR | 6a.3 | Path traversal bypass | INCORPORATED — normalize + reject `..` and encoded slashes |
| 13 | MAJOR | 6a.3 | No HTTP method restriction | INCORPORATED — GET/HEAD only for auth-flow paths |
| 14 | MAJOR | 6a.3 | domain.authRequired not verified | INCORPORATED — pre-flight check + verification |
| 15 | MAJOR | 6a.5 | Post-login redirect crosses hosts mid-stack | INCORPORATED — covered by deploy stack rule |
| 16 | MAJOR | 6a.7 | Verification doesn't check assets | INCORPORATED — asset audit + DevTools smoke test |
| 17 | MAJOR | 6a.8 | LocalStorage session re-auth not communicated | INCORPORATED — operator runbook |
| 18 | MAJOR | 6a.8 | Redirects miss www / vercel.app | INCORPORATED — explicit www host coverage |
| 19 | MAJOR | 6a.8 | Next 16 doesn't support `has: [{ type: "host" }]` | PARTIALLY — kept `host` matcher but documented fallback to `header` if Next 16 syntax doesn't accept |
| 20 | MAJOR | 6a.8 | Rollback ignores DNS/CDN cache | INCORPORATED — full rollback doc in script + spec |
| 21 | CRITICAL | 6a.7/6a.8 | Reverting 6a.7 alone leaves stuck 301s | INCORPORATED — rollback script with sequenced reversion |
| 22 | MAJOR | 6a.0/6a.2 | "No prod DB writes" conflicts with M3 verification | INCORPORATED — explicit carve-out for one test user |
| 23 | MAJOR | risk reg | SEO/robots not addressed | INCORPORATED — team/robots.txt with Disallow: / |
| 24 | MAJOR | risk reg | Webhook URLs registered against awknranch | INCORPORATED — strategy: keep webhook handlers on awknranch.com (no redirect) |
| 25 | MINOR | risk reg | Browser cache / SW concerns | INCORPORATED — operator runbook hard-refresh, no SW present |
| 26 | MAJOR | 6a.0 | DNS prereq incomplete (proxy mode, TTL) | INCORPORATED — orange cloud OFF, TTL 5min |
| 27 | MAJOR | 6a.8 | TLS issuance not verified pre-deploy | INCORPORATED — `dig` + `curl -v` checks in pre-deploy |
| 28 | MAJOR | 6a.8 | /api/* not in redirects | PARTIAL — /api/team/* redirects added; /api/webhooks/* explicitly excluded with rationale |
| 29 | MINOR | playbook | Pickup guidance unclear about deploy stack | INCORPORATED — explicit deploy gate rules section |
| 30 | MINOR | 6a.8 | Operator cache/credential refresh not documented | INCORPORATED — operator runbook |

## Rejections

### #6 — params signature (Codex incorrect)

Codex claimed:
> Sample handler types `params` as `Promise<{id:string}>`; if copied, `await params` will throw because Next passes a plain object. That would 500 every endpoint.

This is wrong for Next.js 16. As of Next.js 15, dynamic APIs (`params`, `searchParams`, `cookies`, `headers`) became asynchronous. The `Promise<{ id: string }>` signature with `const { id } = await params` is the **correct** pattern for Next 16.

Reference: Next.js 15 release notes — "Async dynamic APIs". Continued in Next 16.

The plan v2 keeps the original signature.

## Process notes

- gpt-5 model required org verification; fell back to default (likely gpt-4.1-class)
- Audit took ~120s end-to-end
- Output was 35KB, persisted to local tool-results
- Codex's environment had read-only access to the repo, so it could ground critiques in actual file contents — visible from the `exec sed -n` calls in the trace

## Lessons for future audits

- gpt-5 access would let us run audits with stronger reasoning. Worth verifying the org if we're going to do this regularly.
- The default model still produced a strong adversarial review — 30 issues is not noise; most were genuinely actionable.
- Adversarial framing ("a hostile auditor is going to find anything you miss") works — it pushes the model into find-everything mode rather than defending the plan.
