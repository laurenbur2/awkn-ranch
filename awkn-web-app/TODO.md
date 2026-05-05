# TODO

## Critical (blocks production)

_None currently_

## Bugs (broken functionality)

_None currently_

## Tech Debt (code quality)

- [ ] **Port unified `/login` (functional)** — legacy `login/index.html` is the AWKN auth gateway (Supabase Auth, Google OAuth + email/password, post-login redirect to BOS master calendar). Skipped from the verbatim Route Handler ports because it has:
  - JS deps on `login/app.js`, `shared/supabase.js`, `shared/auth.js` (would need to copy ~30 modules from legacy `shared/`)
  - Hardcoded post-login redirect to `/awkn-ranch/spaces/admin/reservations.html?pillar=master` — doesn't exist in new app
  - Auth requires Supabase URL allowlist update for new origins (deploy-time concern)

  Proper port = re-implement using Phase 2.4's already-built shadcn auth primitives (currently powering `/portal/login` and `/bos/login`), unified at `awknranch/login` with role-based post-login routing (team → bos, member → portal). Until then, legacy `/login/` keeps serving from `main` on GH Pages.

## Verify on deployment

Things wired correctly in source but not testable until the new app is live at a public URL.

- [ ] **Investor / Operations OG + canonical URLs** — All 5 ported pages (`/operations`, `/investor`, `/investor-presentation`, `/investor/projections`, `/investor/projections-10y`) declare `canonical` and `og:url` as `https://awknranch.com/<path>`. Until DNS for `awknranch.com` points at the new deploy, share previews (Slack, iMessage, Twitter, LinkedIn) point at a non-resolving URL. Once deployed:
  - [ ] Test share-preview cards via opengraph.xyz / Twitter Card Validator / LinkedIn Post Inspector for each of the 5 routes
  - [ ] Confirm the OG image (`https://lnqxarwqckpmirpmixcw.supabase.co/storage/v1/object/public/investor/hero-ranch.jpg`) renders at 1200×630 in the previews
  - [ ] Re-run favicon check — current `<link rel="icon">` tags use depth-aware relative paths (`../favicon.png`, `../../favicon.png`) so they work in both new app and legacy GH-Pages serve. Verify both contexts still resolve correctly post-deploy.
- [ ] **Supabase URL Configuration update** — when the new app deploys, add the production URL (`https://awknranch.com`) and Vercel preview URLs to Supabase dashboard → Authentication → URL Configuration → Site URL + Redirect URLs allowlist. Without this, Google OAuth + email-link sign-in will reject the new origin. Google credentials themselves are already configured in Supabase (Authentication → Providers → Google) and don't need re-setup.
- [ ] **Vercel team account ownership** — deferred from Phase 2; comes due at first deploy.

## Enhancements (nice to have)

- [ ] Add more shadcn/ui components as needed
- [ ] Set up CI/CD
