# آکادمی سیلانه — Seylane Academy

Internal micro-learning / sales-enablement app for Seylane Sabz holding marketers.
The spec is **[`PRODUCT-MASTER-SPEC.md`](./PRODUCT-MASTER-SPEC.md)**, which is the single source of truth. This README covers how to run, build and deploy.

**Status:** the historical 15-prompt tracker is not live release evidence. Phone-only sign-in is unavailable; fresh staff/admin access requires an owner-approved identity provider. See [`docs/USER-TODO.md`](./docs/USER-TODO.md), [`docs/RELEASE.md`](./docs/RELEASE.md), and the historical caveat in [`docs/IMPLEMENTATION-STATUS.md`](./docs/IMPLEMENTATION-STATUS.md).
**Cloudflare repository configuration:** see [`CLOUDFLARE_CONFIGURATION_REPORT.md`](./CLOUDFLARE_CONFIGURATION_REPORT.md) for values confirmed from source, known resource IDs, unverified dashboard checks and blockers. The older [`docs/CLOUDFLARE-SETUP-FA.md`](./docs/CLOUDFLARE-SETUP-FA.md) is historical guidance, not proof of live Cloudflare settings.
Owner blockers (identity provider, live Cloudflare verification, protected secrets, keystore and real device): [`docs/USER-TODO.md`](./docs/USER-TODO.md).
Release checklist and runbook: [`docs/RELEASE.md`](./docs/RELEASE.md).

| Surface | Path | Who |
|---|---|---|
| Marketer app (PWA + Android APK) | `/`, `/learn`, `/packages/:id`, `/sections/:id`, `/quiz/:id`, `/messages`, `/cards`, `/mentor`, `/profile` | بازاریاب with an already valid session |
| Manager panel | `/manager` (team dashboard, reports + CSV, member timeline, retakes) | مدیر with an already valid session |
| Admin panel | `/admin` (content, quizzes, assignments, users/teams, reports, notifications, policies, audit) | ادمین / مدیر ارشد with an already valid session |

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
functions/              Shared Node 20 + TypeScript API, versioned routes under /v1; Cloudflare Worker is the current Worker entrypoint
  src/routes, services  phone-only account creation, existing-session refresh, me / manager / admin / files; app business logic
  src/store, auth, blob  DocStore (D1 | Firestore | memory), server auth/session adapters, R2/Firebase/local storage
  src/seed              Catalog + sample training data and non-login user fixtures; Worker cron in cloudflare-worker.ts
  test/, test-emulator/ Vitest API tests (memory backend) and Rules/API tests on the Firestore emulator
scripts/lib/catalog-source.mjs   Reads the catalog CSVs and matches assets deterministically (shared by sync and seed)
scripts/report-assets.mjs        Regenerates docs/ASSET-MAPPING.md
docs/                   Resource map, asset mapping, implementation status
.github/workflows/      ci.yml (format, lint, typecheck, unit, Cloudflare dry-run, E2E, public-route Lighthouse), deploy.yml (Cloudflare Worker + D1), android.yml (APK/AAB)
```

Client-provided folders stay at the repo root exactly as delivered. They are read-only inputs:
`لیست برندها و محصولات سیلانه سبز/`, `لوگو برندها و تصاویر محصولات/`, `کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن/`, plus the sample training media (`*.mp4`, `*.m4a`).

## Requirements

- Node **20+** (CI uses Node 22) and npm 10; `package-lock.json` is the npm install lockfile used by GitHub Actions
- JDK 21 + Android SDK only for a local APK build; Firebase tooling is retained for optional legacy emulator workflows

## Run locally

```bash
npm ci
# One command, one port — web app + API together on http://localhost:5173 (best for previews).
# Self-healing: installs dependencies automatically if missing and restarts the server if it crashes.
npm start
# …or run them separately. API with the local in-memory backend, seeded with catalog/sample content + demo data fixtures:
cd functions && npx tsx src/local.ts          # http://localhost:5001/v1/health
# Web (another terminal): http://localhost:5173 (proxies /v1 to the API)
npm run dev
```

**Browser support.** The production build targets engines from ~2023 onward:
Chrome/Edge/Android WebView & Chrome-for-Android 110+, Firefox/Android-Firefox 115+, Safari/iOS 16.4+
and Samsung Internet 22+ (`browserslist` in `apps/web/package.json`); Vite transpiles to that floor —
no separate legacy bundle or polyfill chunk is emitted (performance pass 2026-09-29, see
`docs/CHANGELOG.md`; the old pre-2023 support via `@vitejs/plugin-legacy` + `legacy-css.ts` was
removed — restore both and lower the floor to support older devices again).
The Vite dev server (`npm start`) needs a modern browser — `npm run start:prod` builds and serves
the production bundle on the same port.

Local API env: `PORT` (5001), `RESEED=true` (wipe and re-seed), `LOCAL_PERSIST=false` (don't write `functions/.local-data`).

Local demo seed creates **data fixtures only** (listed below); these phone numbers are not login credentials and cannot authenticate an existing account. Public signup returns the same generic acknowledgement for known and new numbers; a new number may create only an inactive marketer record, with no session or access. Authenticated API tests use an internal test-fixture session helper; the public UI intentionally has no password, OTP, or staff-login shortcut.

| Fixture phone | Role/data |
|---|---|
| 09120000001 | superadmin fixture |
| 09120000002 | admin fixture |
| 09120000003 | manager fixture, تیم تهران |
| 09120000004 | marketer fixture سارا احمدی (تهران) |
| 09120000005 | marketer fixture علی رضایی (تهران, has demo progress) |
| 09120000006 | manager fixture, تیم اصفهان |
| 09120000007 | marketer fixture مریم کریمی (اصفهان, fresh) |

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
npm run test:emulator -w functions   # optional Firestore emulator suite; not part of the current ci.yml quality job
```

CI (`.github/workflows/ci.yml`) runs Playwright E2E (including the public phone-auth boundary and staff notice), axe WCAG 2.1 AA checks (`e2e/a11y.spec.ts`), and a Cloudflare Worker/Assets `wrangler deploy --dry-run`. Lighthouse audits only the public `/login` and `/register` routes (`apps/web/lighthouserc.cjs`: performance / accessibility / best practices ≥ 90, LCP < 3 s); authenticated panels are not auto-signed-in with demo credentials. CI uses `npm ci`/`package-lock.json`; this is separate from Cloudflare Workers Builds.

## Environments & secrets

- Web config: `apps/web/.env.development.example` and `.env.production.example` (`VITE_API_BASE`, `VITE_SENTRY_DSN`, `VITE_PUSH_ENABLED`, and the optional Web Push set `VITE_FIREBASE_API_KEY/PROJECT_ID/MESSAGING_SENDER_ID/APP_ID/VAPID_KEY`). Copy them to `.env.*.local`. Android CI sets `VITE_PUSH_ENABLED` + `VITE_CRASHLYTICS_ENABLED` automatically when the `GOOGLE_SERVICES_JSON_BASE64` secret exists.
- Local/legacy API environment example: root `.env.example`. Cloudflare Worker source variables and bindings are declared in `wrangler.toml`; dashboard state is unverified. `APP_URL` is the public click-through origin used by Web Push. Secrets belong only in GitHub Actions/Cloudflare secret stores; never paste them into docs or commits.
- Local/E2E-only switches (ignored on Firestore): `PLAYBACK_BUDGET=off` (simulate playback faster than real time), `RATE_LIMIT_SCALE=<n>` (many logins from one IP).
- Secrets (service accounts, Cloudflare token, Gemini/Groq API keys) go **only** in protected secret stores, never in Git. The current deploy workflow syncs Gemini + FCM; `GROQ_API_KEY` is supported by code but is not wired through that workflow—see [`docs/USER-TODO.md`](./docs/USER-TODO.md) and the Cloudflare report.
- Firebase projects: copy `.firebaserc.example` to `.firebaserc` with the dev/prod project IDs.

## Deployment

- **CI** (`ci.yml`) runs on every PR and on pushes to `main`/`dev`.
- **Cloudflare deploy** (`deploy.yml`) is triggered by pushes to `main` and `workflow_dispatch` when Cloudflare credentials are present. It verifies the named D1 database against `wrangler.toml`, runs migrations `0001` and `0002`, then deploys the Worker; an optional Pages deploy is also configured. This workflow is not explicitly gated on the separate CI workflow's success and is production-affecting (`APP_ENV=prod`); owner approval and dashboard review are required before any release. No deploy/migration was run for this change.
- **Android** (`android.yml`) builds a debug APK on every PR (artifact `seylane-learning-debug-apk`). When the keystore secrets exist, it also builds a signed release APK + AAB for Cafe Bazaar. Push is enabled only when `GOOGLE_SERVICES_JSON_BASE64` is set (D38).
- Local Android build: `npm run build -w apps/web && cd apps/web && npx cap sync android && cd android && ./gradlew assembleDebug` (JDK 21 + Android SDK). Set `VITE_API_BASE` first: the app runs from `https://localhost` and cannot use relative `/v1` URLs.

## Catalog data, images & seeding

- Catalog: `brands.csv` (12 brands) and `products.csv` (238 active products). Names are used exactly as delivered.
- Asset matching is deterministic, with no fuzzy guessing. Results: 12/12 logos and 238/238 product images. See [`docs/ASSET-MAPPING.md`](./docs/ASSET-MAPPING.md).
- Storage layout used by the seed script (PROMPT 003): `brands/{brandId}/logo.*` and `products/{productId}/main.*`. The same paths are mirrored locally under `/catalog/...`.
- Sample training media → brand/product mapping, plus open questions: [`docs/RESOURCE-MAP.md`](./docs/RESOURCE-MAP.md) §3.
- Seed: `npm run seed -w functions -- [--memory] [--demo] [--force] [--superadmin-phone 09…] [--report docs/SEED-REPORT.md]`. `--superadmin-phone` may create an active superadmin role record for a new phone, but it does **not** verify that phone or create a password/OTP/login/session; an existing record is left unchanged. Use only with explicit owner approval. Demo phones are fixtures, not credentials; never treat them as sign-in shortcuts. Result: [`docs/SEED-REPORT.md`](./docs/SEED-REPORT.md).
- Product quizzes: `data/skincare-products-quiz.json` (70 client questions for 7 skincare products, one correct option each) is exported verbatim from `skincare_products_quiz_v3.csv` with `tools/export_quiz_bank.py`. Each package has exactly ONE quiz: the product's full bank sits on the package's podcast (audio) section (first section if it has no audio); the other sections have `quizRequired: false`. Packages have no deadline. Products without bank coverage keep sample `needsReview` questions (changelog 2026-10-04).
- Helper UI kit → page mapping: [`docs/RESOURCE-MAP.md`](./docs/RESOURCE-MAP.md) §4.

## Analytics & monitoring (spec §25, §22.3)

Server-side domain events (section/package completion, quiz results, points, …) and whitelisted client events (`app_opened`, `next_item_cta_clicked`, `notification_cta_clicked`, `mentor_chat_opened`, `playback_error`, `youtube_blocked_reported`, `report_filtered`, `signup_started`, `client_error`) go to `analytics_events` (TTL). There is no Google Analytics (D22). Uncaught client errors are sent as `client_error`. Sentry is loaded only when `VITE_SENTRY_DSN` is set. On Android, Firebase Crashlytics captures native crashes and forwarded JS errors (only in APKs built with `google-services.json`).

## Design system (spec §16)

The tokens live in `apps/web/src/styles/index.css` as Tailwind v4 `@theme`: `primary #177A50` (D40: darkened from #1B8A5A for WCAG AA) plus text-only `*-fg` tones, semantic colors, the 12–30 type scale, line-height 1.8, radius 8/12/16, and soft shadows.
The Vazirmatn variable font is self-hosted and bundled as woff2, with a system-font fallback. The UI is fully RTL, touch targets are at least 48px, and focus rings are 2px `info`.
Directional icons use `.rtl-mirror`. Countdowns and percentages use Latin digits (`.num-latin`); body text uses Persian digits.
To see every component, open the gallery at `/gallery`.
