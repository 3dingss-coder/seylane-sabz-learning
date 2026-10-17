# Stage 1 — Foundations (Report)

> **Status:** Implemented and gated. No feature, route, permission, API contract,
> validation, or backend behaviour was changed. This stage changes design tokens
> and the token-derived visual classes only.

## Baseline (before any Stage 1 change)

`npm ci` was run (1,217 packages). The functions typecheck requires the
gitignored build artifact `functions/lib/seed-snapshot.json`, which was
generated via the repo's own build (`tsc -p tsconfig.build.json` in
`functions/` + `scripts/build-seed-snapshot.mjs`); it is not committed.

Pre-change baseline (HEAD `6b73489`, product code `81d7393`):

| Check | Result |
| --- | --- |
| `npm run typecheck` (functions + web) | ✅ pass |
| `npm run lint` (functions + web) | ✅ pass |
| `npm run test` (functions + web: 41 files, 326 tests in web) | ✅ pass |

## User decision implemented (§8.1 override)

Per the user's explicit 2026-10-16 decision, the repo primary `#177a50`
(decision D40) is fully replaced by the handoff identity green `#059669`, with a
separate CTA token `#047857` for white-text fills. D40 is superseded by this
decision and the stylesheet comment records why.

## Contrast audit (computed WCAG ratios)

| Pair | Ratio | Verdict / use |
| --- | --- | --- |
| white on `#059669` (primary) | 3.77:1 | ❌ never white normal text; identity fills, icons, borders, progress only |
| white on `#047857` (CTA) | 5.48:1 | ✅ solid CTA fills (`bg-cta text-on-cta`) |
| white on `#065f46` (CTA hover) | 7.68:1 | ✅ |
| `#047857` (`primary-fg`) on white | 5.48:1 | ✅ green text |
| `#047857` on `#ecfdf5` (`primary-light`) | 5.21:1 | ✅ green text on brand tints |
| white on `#064E3B` (`brand-deep`) | 9.72:1 | ✅ hero surfaces |
| `#111827` on `#58CC02` (`brand-energy`) | 8.49:1 | ✅ dark text only, never white |
| `#111827` on `#F59E0B` (`accent`) | 8.26:1 | ✅ dark text only (`on-accent`) |
| dark mode: `#04241a` (`on-cta`) on `#34d399` (dark CTA) | ≈8:1 | ✅ |

Method: every `primary` usage in `apps/web/src` was counted and classified
(95 `text-primary`, 25 `bg-primary`, plus border/accent/fill/stroke variants).

## Changes

- `apps/web/src/styles/index.css`
  - `--color-primary: #059669`, `--color-primary-hover: #047857`,
    `--color-primary-light: #ecfdf5`.
  - New tokens: `--color-primary-fg: #047857`, `--color-cta: #047857`,
    `--color-cta-hover: #065f46`, `--color-on-cta: #ffffff`,
    `--color-brand-deep: #064e3b`, `--color-brand-energy: #58cc02`,
    `--color-on-energy: #111827`, `--color-on-accent: #111827`.
  - Brand scale re-derived on the emerald ramp (600 `#059669`, 700 `#047857`,
    800 `#065f46`, 900 `#064e3b`, 950 `#022c22`).
  - `.bg-brand-gradient` is now the CTA gradient (`cta → cta-hover`);
    `.bg-hero` is anchored on `brand-deep`; `shadow-brand` re-hued.
  - Dark mode (`prefers-color-scheme`): primary `#34d399`, `primary-fg`
    `#6ee7b7`, CTA `#34d399` with `on-cta #04241a`, energy/deep tokens remapped.
  - Untouched: Vazirmatn typography scale, radius scale, elevation scale,
    motion tokens, cold-load `html:not([data-motion])` gate, mobile
    no-`backdrop-filter` safeguard, `prefers-reduced-motion` collapse,
    48px `--spacing-touch`.
- Mechanical, presentation-only class migrations (no markup/logic changes):
  - `text-primary` → `text-primary-fg` (incl. `hover:` variants) across 55
    `.tsx` files, so green text/icons are AA-safe now that `primary` is
    `#059669`. Decorative `text-primary/[0.07]` (EmptyState dot texture) and
    `text-primary-800` were intentionally left as-is.
  - The 12 sites that paired `bg-primary` with white/`on-primary` text
    (Button primary variant, Sidebar active pill, PanelLayout active tab,
    NotFound CTA, Field selected chip, Jalali selected day, PublishGuide step
    number, MentorChat bubbles, VoiceCallSheet mic/recording states,
    PackageEditor action, PushTemplatesTab selected tab, QuizPage option
    marker, ProgressRing bar) now use `bg-cta … text-on-cta`
    (`hover:bg-cta-hover` where they had `hover:bg-primary-hover`).
  - This also defines the previously undefined `text-primary-fg` token used at
    `PushAutomationDetailPage.tsx:1514` (pre-existing bug, now fixed by the
    new token).
- `apps/web/index.html`: `theme-color` `#059669`; boot splash gradient
  `#059669 → #047857 → #064e3b` (mascot asset unchanged).
- `apps/web/src/lib/excel.ts`: export brand hexes now CTA `047857`, deep
  `064E3B`, light `ECFDF5` (white header text stays AA at 5.48:1).
- `apps/web/src/components/ui/refresh.test.tsx`: one expectation updated
  (`text-primary` → `text-primary-fg` on the active BottomNav link) — the
  intentional presentation change required by the contrast rule; no assertion
  was removed or weakened in meaning.

## Gates (after the change)

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| `npx prettier --check` (all changed files) | ✅ pass (3 files re-wrapped by Prettier due to longer class names; no logic diff) |
| `npm run test -w apps/web` | ✅ 41 files, 326 tests pass |
| `npm run build -w apps/web` | ✅ pass (pre-existing >500 kB chunk warning unchanged) |

Functions code was untouched, so functions typecheck/lint/tests were not
re-run after the change; their baseline above is green.

## Explicitly unchanged

All routes, role guards and the Manager/Admin permission split, features,
fields, validations, statuses, exports (Excel behaviour; only its brand hexes
moved), notification/push/automation logic, upload flows, error states, the
mascot asset (`public/brand/mascot.webp`), API contracts, schema/migrations,
Worker bindings, D1/R2, cron schedules, secrets, `wrangler.toml`, the deploy
workflow, `APP_ENV=dev` (out of scope, not fixed), and the unrelated
`my-website` Pages project. Dark mode and `prefers-reduced-motion` behaviour
are preserved. No production verification is claimed (no Cloudflare access
used).

## Changed files

62 files: `apps/web/src/styles/index.css`, `apps/web/index.html`,
`apps/web/src/lib/excel.ts`, `apps/web/src/components/ui/{Button,refresh.test}.tsx`,
and the mechanical `text-primary` → `text-primary-fg` /
`bg-primary` → `bg-cta` class updates listed in the commit diff
(55 `.tsx` files under `components/`, `layouts/`, `pages/`).

## Next

Stage 2 — Shared primitives (extend Button/Input/Card/Modal/Toast/Skeleton/
Empty/Error/StatusBadge; map Field/DataTable/Tabs patterns before inventing
Select/Textarea/Tabs/Table). Not started; awaiting go-ahead per stage gating.
