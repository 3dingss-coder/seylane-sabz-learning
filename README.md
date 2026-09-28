# سیلانه‌سبز لرنینگ — Seylane Sabz Learning

Internal micro-learning / sales-enablement app for Seylane Sabz holding marketers.
The spec is **[`PRODUCT-MASTER-SPEC.md`](./PRODUCT-MASTER-SPEC.md)**, which is the single source of truth. This README covers how to run, build and deploy.

| Build step (§32.2 / §34) | Status |
|---|---|
| PROMPT 001: Foundation & Design System | ✅ done (this branch) |
| PROMPT 002–015 | ⏳ blocked on the prerequisites listed in [`docs/IMPLEMENTATION-STATUS.md`](./docs/IMPLEMENTATION-STATUS.md) |

## Monorepo layout

```text
apps/web/               React 19 + TypeScript + Vite + Tailwind v4 (RTL PWA; Capacitor Android arrives in PROMPT 015)
  src/components/ui/    Design-system components (Button, Input, Card, Toast, Modal, Skeleton, ProgressRing,
                        CountdownChip, EmptyState, ErrorState, StatusBadge, KpiCard)
  src/components/layout BottomNav (marketer), Sidebar (manager/admin)
  src/components/brand/ AppLogo, BrandLogo (real logos only)
  src/styles/index.css  Design tokens from spec §16 (colors, type scale, radius, shadow)
  scripts/sync-assets.mjs  Mirrors the real logos, product images and icons into public/ (git-ignored)
  e2e/                  Playwright specs
functions/              Firebase Cloud Functions: Node 20 + TypeScript + Express, versioned API under /v1
scripts/lib/catalog-source.mjs   Reads the catalog CSVs and matches assets deterministically (shared by sync and seed)
scripts/report-assets.mjs        Regenerates docs/ASSET-MAPPING.md
docs/                   Resource map, asset mapping, implementation status
.github/workflows/      ci.yml (format, lint, typecheck, unit, build, E2E) and deploy.yml (Firebase + Cloudflare Pages)
```

Client-provided folders stay at the repo root exactly as delivered. They are read-only inputs:
`لیست برندها و محصولات سیلانه سبز/`, `لوگو برندها و تصاویر محصولات/`, `کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن/`, plus the sample training media (`*.mp4`, `*.m4a`).

## Requirements

- Node **20+** (`.nvmrc`) and npm 10
- JDK 11+ for the Firebase Emulator Suite (Firestore/Auth/Storage). Needed from PROMPT 002 onward.
- `firebase-tools` (`npx firebase-tools@14 ...`) for the emulators and deploys

## Run locally

```bash
npm install
# API (no emulator needed): http://localhost:5001/v1/health
cd functions && npx tsx src/local.ts
# Web (another terminal): http://localhost:5173 (proxies /v1 to the API)
npm run dev
```

`npm run dev` first runs `sync-assets`, which copies the 12 brand logos, the 238 product images and the app icons into `apps/web/public/{catalog,icons}`.
Once the Firebase project exists you can use the Emulator Suite instead: `npx firebase-tools@14 emulators:start` (config is in `firebase.json`).

## Quality gates

```bash
npm run format:check   # Prettier
npm run lint           # ESLint (strict TS, react-hooks, jsx-a11y, dangerouslySetInnerHTML is banned)
npm run typecheck      # tsc strict + noUncheckedIndexedAccess
npm test               # Vitest: functions (supertest) + web (Testing Library)
npm run build          # functions -> lib/, web -> dist/ (PWA + service worker)
npm run test:e2e -w apps/web   # Playwright (downloads Chromium; runs in CI)
```

## Environments & secrets

- Web config: `apps/web/.env.development.example` and `.env.production.example`. Copy them to `.env.*.local`. The Firebase web config is public, but still stays out of git.
- API: `functions/.env.example`. `ALLOWED_ORIGINS` is the strict CORS allowlist.
- Secrets (service accounts, Cloudflare token, Gemini key) go **only** in GitHub Secrets or Secret Manager. See the header of `.github/workflows/deploy.yml` for the full list.
- Firebase projects: copy `.firebaserc.example` to `.firebaserc` with the dev/prod project IDs.

## Deployment

- **CI** (`ci.yml`) runs on every PR and on pushes to `main`/`dev`.
- **Deploy** (`deploy.yml`) runs after green CI on `main`, targeting **dev**. Prod is a manual `workflow_dispatch`. Functions go to Firebase (Blaze plan required, spec risk R1). The PWA goes to Cloudflare Pages, which picks up `public/_headers` for CSP/HSTS/X-Frame-Options and `_redirects` for SPA routing. The job skips cleanly while the secrets are missing.
- Android APK (Capacitor) and store release: PROMPT 015.

## Catalog data, images & seeding

- Catalog: `brands.csv` (12 brands) and `products.csv` (238 active products). Names are used exactly as delivered.
- Asset matching is deterministic, with no fuzzy guessing. Results: 12/12 logos and 238/238 product images. See [`docs/ASSET-MAPPING.md`](./docs/ASSET-MAPPING.md).
- Storage layout used by the seed script (PROMPT 003): `brands/{brandId}/logo.*` and `products/{productId}/main.*`. The same paths are mirrored locally under `/catalog/...`.
- Sample training media → brand/product mapping, plus open questions: [`docs/RESOURCE-MAP.md`](./docs/RESOURCE-MAP.md) §3.
- The seed command (`scripts/seed-catalog.ts`, emulator + prod) is delivered in PROMPT 003.

## Design system (spec §16)

The tokens live in `apps/web/src/styles/index.css` as Tailwind v4 `@theme`: `primary #1B8A5A`, semantic colors, the 12–30 type scale, line-height 1.8, radius 8/12/16, and soft shadows.
The Vazirmatn variable font is self-hosted and bundled as woff2, with a system-font fallback. The UI is fully RTL, touch targets are at least 48px, and focus rings are 2px `info`.
Directional icons use `.rtl-mirror`. Countdowns and percentages use Latin digits (`.num-latin`); body text uses Persian digits.
To see every component, run the gallery at `/` (and `/gallery`).
