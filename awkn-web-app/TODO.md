# TODO

## Critical (blocks production)

_None currently_

## Bugs (broken functionality)

_None currently_

## Tech Debt (code quality)

_None currently_

## Verify on deployment

Things wired correctly in source but not testable until the new app is live at a public URL.

- [ ] **Investor / Operations OG + canonical URLs** — All 5 ported pages (`/operations`, `/investor`, `/investor-presentation`, `/investor/projections`, `/investor/projections-10y`) declare `canonical` and `og:url` as `https://awknranch.com/<path>`. Until DNS for `awknranch.com` points at the new deploy, share previews (Slack, iMessage, Twitter, LinkedIn) point at a non-resolving URL. Once deployed:
  - [ ] Test share-preview cards via opengraph.xyz / Twitter Card Validator / LinkedIn Post Inspector for each of the 5 routes
  - [ ] Confirm the OG image (`https://lnqxarwqckpmirpmixcw.supabase.co/storage/v1/object/public/investor/hero-ranch.jpg`) renders at 1200×630 in the previews
  - [ ] Re-run favicon check — current `<link rel="icon">` tags use depth-aware relative paths (`../favicon.png`, `../../favicon.png`) so they work in both new app and legacy GH-Pages serve. Verify both contexts still resolve correctly post-deploy.
- [ ] **Vercel team account ownership** — deferred from Phase 2; comes due at first deploy.

## Enhancements (nice to have)

- [ ] Add more shadcn/ui components as needed
- [ ] Set up CI/CD
