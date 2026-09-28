# Implementation status (live)

| PROMPT | Scope | Status | Notes |
|---|---|---|---|
| 001 | Foundation & Design System | ✅ Done | Monorepo, §16 tokens, self-hosted Vazirmatn, 12 base components + gallery, `GET /v1/health`, security headers, CI/CD workflows, env dev/prod |
| 002 | Auth (F1) | ⏳ Next | Emulator-first (D29); sandbox needs a JDK for the Emulator Suite |
| 003 | DB + Rules + Seed + Storage upload | ⏳ Pending | Emulator target (D29); catalog/asset matching done (12/12 logos, 238/238 images) + D27 reactivated brands |
| 004 | Admin content + sample training packages | ⏳ Pending | 8/13 files resolved; پیکسل/آیس بال product + «دارت» still open (RESOURCE-MAP §3); video upload per D28 |
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

## Decisions recorded (§36)

- D27 reactivate فورمی / آتل / آیس بابل / ویت آس in the learning catalog
- D28 video = YouTube link or uploaded file (any common format); audio incl. m4a — §20.2/§21/§24 updated
- D29 Emulator-first until the Firebase project exists
- D30 «کرم ترک پای WITH US» → کامان «کرم ترک پا» (sb-300123101)

## Open

- Working branch is `arena/01a0e829-seylane-sabz-learning` (session-bound) instead of `dev`; PRs go to `main`.
- Cloudflare account/domain access (deploy job is secrets-gated).
