# سیلانه‌سبز لرنینگ — Seylane Sabz Learning

Internal micro-learning / sales-enablement app for Seylane Sabz holding marketers.
The spec is **[`PRODUCT-MASTER-SPEC.md`](./PRODUCT-MASTER-SPEC.md)**, which is the single source of truth. This README covers how to run, build and deploy.

**Status:** all 15 build prompts are implemented. See [`docs/IMPLEMENTATION-STATUS.md`](./docs/IMPLEMENTATION-STATUS.md) for tests and the §37 checklists.
What still needs the owner (Firebase/Cloudflare accounts, keys, keystore, real device): [`docs/USER-TODO.md`](./docs/USER-TODO.md).
Release checklist and runbook: [`docs/RELEASE.md`](./docs/RELEASE.md).

| Surface | Path | Who |
|---|---|---|
| Marketer app (PWA + Android APK) | `/`, `/learn`, `/packages/:id`, `/sections/:id`, `/quiz/:id`, `/messages`, `/cards`, `/mentor`, `/profile` | بازاریاب |
| Manager panel | `/manager` (team dashboard, reports + CSV, member timeline, retakes) | مدیر |
| Admin panel | `/admin` (content, quizzes, assignments, users/teams, reports, notifications, policies, audit) | ادمین / مدیر ارشد |

## Monorepo layout

```text
apps/web/               React 19 + TypeScript + Vite + Tailwind v4 (RTL PWA) + Capacitor 7 Android shell
  android/              Capacitor Android project (icons/splash from the holding logo; built in CI)
  src/pages/{m,manager,admin,auth}  Marketer app, manager panel, admin panel, auth/onboarding
  src/lib/              API client, session (D36), tracker (anti-cheat heartbeats), offline queue, telemetry, native (push/back)
  src/components/ui/    Design-system components (Button, Input, Card, Toast, Modal, Skeleton, ProgressRing,
                        CountdownChip, EmptyState, ErrorState, StatusBadge, KpiCard)
  src/components/layout BottomNav (marketer), Sidebar (manager/admin)
  src/components/brand/ AppLogo, BrandLogo (real logos only)
  src/styles/index.css  Design tokens from spec §16 (colors, type scale, radius, shadow)
  scripts/sync-assets.mjs  Mirrors the real logos, product images and icons into public/ (git-ignored)
  e2e/                  Playwright specs
functions/              Firebase Cloud Functions: Node 20 + TypeScript + Express, versioned API under /v1
  src/routes, services  auth / me / manager / admin / files; business logic (grading, progress, points, escalation)
  src/store, auth, blob DocStore (Firestore | memory), auth provider (Firebase | memory), storage (Firebase | local)
  src/seed              Catalog + sample training packages + demo users; scheduled jobs in src/index.ts
  test/, test-emulator/ Vitest API tests (memory backend) and Rules/API tests on the Firestore emulator
scripts/lib/catalog-source.mjs   Reads the catalog CSVs and matches assets deterministically (shared by sync and seed)
scripts/report-assets.mjs        Regenerates docs/ASSET-MAPPING.md
docs/                   Resource map, asset mapping, implementation status
.github/workflows/      ci.yml (format, lint, typecheck, unit, emulator, E2E), deploy.yml (Firebase + Cloudflare Pages), android.yml (APK/AAB)
```

Client-provided folders stay at the repo root exactly as delivered. They are read-only inputs:
`لیست برندها و محصولات سیلانه سبز/`, `لوگو برندها و تصاویر محصولات/`, `کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن/`, plus the sample training media (`*.mp4`, `*.m4a`).

## Requirements

- Node **20+** (`.nvmrc`) and npm 10
- JDK 21 only if you want to run the Firebase Emulator Suite or build the APK locally (both run in CI)
- `firebase-tools` (`npx firebase-tools@14 ...`) for the emulators and deploys

## Run locally

```bash
npm install
# API with the in-memory backend, seeded with the real catalog + sample packages + demo users:
cd functions && npx tsx src/local.ts          # http://localhost:5001/v1/health
# Web (another terminal): http://localhost:5173 (proxies /v1 to the API)
npm run dev
```

Local API env: `PORT` (5001), `RESEED=true` (wipe and re-seed), `LOCAL_PERSIST=false` (don't write `functions/.local-data`).

Demo accounts (local/emulator only, password `demo1234`):

| Phone | Role |
|---|---|
| 09120000001 | superadmin |
| 09120000002 | admin |
| 09120000003 | manager, تیم تهران |
| 09120000004 | marketer سارا احمدی (تهران) |
| 09120000005 | marketer علی رضایی (تهران, has demo progress) |
| 09120000006 | manager, تیم اصفهان |
| 09120000007 | marketer مریم کریمی (اصفهان, fresh) |

`npm run dev` first runs `sync-assets`, which copies the 12 brand logos, the 238 product images and the app icons into `apps/web/public/{catalog,icons}`.
Once the Firebase project exists you can use the Emulator Suite instead: `npx firebase-tools@14 emulators:start` (config is in `firebase.json`).

## Quality gates

```bash
npm run format:check   # Prettier
npm run lint           # ESLint (strict TS, react-hooks, jsx-a11y, dangerouslySetInnerHTML is banned)
npm run typecheck      # tsc strict + noUncheckedIndexedAccess
npm test               # Vitest: functions (supertest) + web (Testing Library)
npm run build          # functions -> lib/, web -> dist/ (PWA + service worker)
npm run test:e2e -w apps/web   # Playwright: starts the local API + vite preview itself (runs in CI)
npm run test:emulator -w functions   # inside `firebase emulators:exec` (see ci.yml)
```

CI (`.github/workflows/ci.yml`) also runs: Playwright on Chromium (desktop + Pixel 7) and WebKit (iPhone 13, foundation suite), axe WCAG 2.1 AA checks (`e2e/a11y.spec.ts`), and Lighthouse CI on `/login` and the signed-in Home (`apps/web/lighthouserc.cjs`: performance / accessibility / best practices ≥ 90, LCP < 3 s).

## Environments & secrets

- Web config: `apps/web/.env.development.example` and `.env.production.example` (`VITE_API_BASE`, `VITE_SENTRY_DSN`, `VITE_PUSH_ENABLED`, and the optional Web Push set `VITE_FIREBASE_API_KEY/PROJECT_ID/MESSAGING_SENDER_ID/APP_ID/VAPID_KEY`). Copy them to `.env.*.local`. Android CI sets `VITE_PUSH_ENABLED` + `VITE_CRASHLYTICS_ENABLED` automatically when the `GOOGLE_SERVICES_JSON_BASE64` secret exists.
- API: `functions/.env.example`. `ALLOWED_ORIGINS` is the strict CORS allowlist. `APP_URL` = public web URL (email + Web Push links). `SMTP_URL` / `MAIL_FROM` (optional) enable the weekly manager email. `TRUST_PROXY_HOPS` (default 1) controls which `X-Forwarded-For` entry is used for per-IP rate limits — never trust the whole header.
- Local/E2E-only switches (ignored on Firestore): `PLAYBACK_BUDGET=off` (simulate playback faster than real time), `RATE_LIMIT_SCALE=<n>` (many logins from one IP).
- Secrets (service accounts, Cloudflare token, Gemini key) go **only** in GitHub Secrets or Secret Manager. See the header of `.github/workflows/deploy.yml` for the full list.
- Firebase projects: copy `.firebaserc.example` to `.firebaserc` with the dev/prod project IDs.

## Deployment

- **CI** (`ci.yml`) runs on every PR and on pushes to `main`/`dev`.
- **Deploy** (`deploy.yml`) runs after green CI on `main`, targeting **dev**. Prod is a manual `workflow_dispatch`. Functions go to Firebase (Blaze plan required, spec risk R1). The PWA goes to Cloudflare Pages, which picks up `public/_headers` for CSP/HSTS/X-Frame-Options and `_redirects` for SPA routing. The job skips cleanly while the secrets are missing.
- **Android** (`android.yml`) builds a debug APK on every PR (artifact `seylane-learning-debug-apk`). When the keystore secrets exist, it also builds a signed release APK + AAB for Cafe Bazaar. Push is enabled only when `GOOGLE_SERVICES_JSON_BASE64` is set (D38).
- Local Android build: `npm run build -w apps/web && cd apps/web && npx cap sync android && cd android && ./gradlew assembleDebug` (JDK 21 + Android SDK). Set `VITE_API_BASE` first: the app runs from `https://localhost` and cannot use relative `/v1` URLs.

## Catalog data, images & seeding

- Catalog: `brands.csv` (12 brands) and `products.csv` (238 active products). Names are used exactly as delivered.
- Asset matching is deterministic, with no fuzzy guessing. Results: 12/12 logos and 238/238 product images. See [`docs/ASSET-MAPPING.md`](./docs/ASSET-MAPPING.md).
- Storage layout used by the seed script (PROMPT 003): `brands/{brandId}/logo.*` and `products/{productId}/main.*`. The same paths are mirrored locally under `/catalog/...`.
- Sample training media → brand/product mapping, plus open questions: [`docs/RESOURCE-MAP.md`](./docs/RESOURCE-MAP.md) §3.
- Seed: `npm run seed -w functions -- [--memory] [--demo] [--force] [--report docs/SEED-REPORT.md]`. It is idempotent and targets memory, the emulator or a real project (see the header of `scripts/seed-catalog.ts` and `docs/RELEASE.md`). Result: [`docs/SEED-REPORT.md`](./docs/SEED-REPORT.md).
- Helper UI kit → page mapping: [`docs/RESOURCE-MAP.md`](./docs/RESOURCE-MAP.md) §4.

## Analytics & monitoring (spec §25, §22.3)

Server-side domain events (section/package completion, quiz results, points, …) and whitelisted client events (`app_opened`, `next_item_cta_clicked`, `notification_cta_clicked`, `mentor_chat_opened`, `playback_error`, `youtube_blocked_reported`, `report_filtered`, `signup_started`, `client_error`) go to `analytics_events` (TTL). There is no Google Analytics (D22). Uncaught client errors are sent as `client_error`. Sentry is loaded only when `VITE_SENTRY_DSN` is set. On Android, Firebase Crashlytics captures native crashes and forwarded JS errors (only in APKs built with `google-services.json`).

## Design system (spec §16)

The tokens live in `apps/web/src/styles/index.css` as Tailwind v4 `@theme`: `primary #177A50` (D40: darkened from #1B8A5A for WCAG AA) plus text-only `*-fg` tones, semantic colors, the 12–30 type scale, line-height 1.8, radius 8/12/16, and soft shadows.
The Vazirmatn variable font is self-hosted and bundled as woff2, with a system-font fallback. The UI is fully RTL, touch targets are at least 48px, and focus rings are 2px `info`.
Directional icons use `.rtl-mirror`. Countdowns and percentages use Latin digits (`.num-latin`); body text uses Persian digits.
To see every component, open the gallery at `/gallery`.
