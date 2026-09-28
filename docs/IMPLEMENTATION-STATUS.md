# Implementation status (live)

| PROMPT | Scope | Status | Notes |
|---|---|---|---|
| 001 | Foundation & Design System | ✅ Done | Monorepo, §16 tokens, self-hosted Vazirmatn, 12 base components + gallery, `GET /v1/health`, security headers, CI/CD workflows, env dev/prod |
| 002 | Auth (F1) | ⛔ Blocked | Needs Firebase project (Auth) — prerequisite 1 |
| 003 | DB + Rules + Seed + Storage upload | ⛔ Blocked | Needs Firebase project + Storage bucket; catalog/asset matching already done (12/12 logos, 238/238 images) |
| 004 | Admin content + sample training packages | ⛔ Blocked | Needs 003 + training-file mapping decisions (docs/RESOURCE-MAP.md §3) |
| 005–015 | — | ⏳ Pending | In order per §32.2 |

## PROMPT 001 — Definition of Done

- [x] Monorepo `apps/web` + `functions` (npm workspaces)
- [x] Tailwind v4 tokens §16.2–16.4 (`src/styles/index.css`)
- [x] Vazirmatn self-hosted (bundled woff2) with system fallback
- [x] Components: Button, Input, Card, Toast, Modal, Skeleton, ProgressRing/ProgressBar, CountdownChip, EmptyState (+ ErrorState, StatusBadge, KpiCard, BottomNav, Sidebar, BrandLogo, AppLogo)
- [x] `GET /v1/health` with the standard `{data}` / `{error:{code,message}}` envelope; Persian errors; CSP/HSTS/X-Frame-Options/Referrer-Policy; strict CORS; 1MB payload limit
- [x] Persian 404 page; Toast standard; Skeleton in data components; EmptyState (icon+text+CTA)
- [x] GitHub Actions: format + lint + typecheck + unit + build + Playwright E2E; deploy workflow (dev auto / prod manual, secrets-gated)
- [x] env dev/prod examples; no secrets in repo
- [x] README (run/build/deploy/structure)
- [x] 0 TS errors, 0 lint errors; 32 unit tests green (6 API + 26 web)
- [ ] Playwright E2E executed locally: browser download is blocked in the build sandbox; runs in CI (`e2e` job)

## Proposed decisions (awaiting approval → Decision Log §36)

| # | Proposal | Why |
|---|---|---|
| P1 | Allow `audio/mp4` (`.m4a`) in the upload whitelist (§21/§24) besides `audio/mpeg`, `wav` | Client podcasts are `.m4a` |
| P2 | Sample `.mp4` training videos: client uploads to YouTube (unlisted) OR spec allows Storage-hosted video | §20.2 requires `youtubeUrl` for video |
| P3 | Work branch: the build agent's session is bound to branch `arena/01a0e829-seylane-sabz-learning` (instead of `dev`); PRs target `main` from it | tooling constraint |
