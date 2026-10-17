# Stage 3 — Auth + Onboarding (Report)

> **Status:** Implemented and gated. The registration/login/onboarding flows,
> fields, validations, and role behaviour are byte-for-byte unchanged in
> logic; only the presentation layer was redesigned per the handoff auth spec
> ("Luxury-minimal, mobile-first, modern emerald brand, controlled amber,
> friendly mascot presence").

## Handoff rules applied (`04-page-specs/auth-onboarding.md`)

- Registration keeps its real fields: name/family name → activity location →
  province→city → province-dependent identity (national code vs mobile),
  existing CTA and validations. Not simplified.
- Login keeps the phone-or-national-code model; no OTP/password steps were
  added for marketers (staff username+password at /admin and /manager is the
  repo's existing staff model and is untouched).
- Onboarding keeps the real three-slide content and next/skip/start controls.
- Mascot: supportive and secondary to the form, from the approved state
  vocabulary (welcome, guide, curious/thinking, success).

## Mascot asset decision (important)

The handoff `02-mascot` folder contains only `mascot-original.png` and two
1.8MB composite **reference** state sheets — there are no separate
transparent-background state files (the mascot guide: "Assets should
*ultimately* exist as separate transparent-background files"). Per the source
order (repo #1, handoff design rules #2, reference images #3) and the mascot
guide ("Do not regenerate… use provided assets"), states are expressed as CSS
framing of the single shipped, identity-verified asset
`apps/web/public/brand/mascot.webp` (tilt, halo, amber sparkle/dot
decorations). No new binary asset was added, no art was generated, no
costume/prop appears.

- `components/brand/Mascot.tsx` (new): `MascotMood = welcome | guide |
  thinking | success`, decorative (aria-hidden), always `alt=""`.
  `success` is in the approved vocabulary but has no screen in this flow
  (completion moments belong to Stage 4 marketer screens).

## Changes (presentation only)

- `pages/auth/AuthPage.tsx` — hero: mascot (welcome on login / guide on
  register) standing beside the white brand plate, controlled amber accent
  bar under the title. Form, fields, texts, validation, error/info states,
  mode switching, unknown-identifier conversion: untouched.
- `pages/auth/OnboardingPage.tsx` — the icon-in-circle is replaced by the
  mascot in per-slide states (welcome → guide → thinking) with a small
  slide-icon badge and brand halo; slide copy, dots, «بعدی»/«شروع»/«رد شدن»
  and the `/me/onboarding` finish call are untouched.
- `pages/auth/StaffLoginPage.tsx` — same hero language (amber bar) but **no
  mascot**, per the mascot guide (Admin: no decorative mascot; Manager:
  rare) and the formal staff tone. Username+password fields untouched.
- Responsive: mascot sized `w-14 sm:w-16` (auth) / `h-28` (onboarding card),
  all decorative elements inside `overflow-hidden` shells with the existing
  `max-w-[400px]` form column — no horizontal overflow at 360–430px.
  All interactive targets remain ≥48px (`min-h-12`).

## Regression pinning (new tests)

`pages/auth/auth.test.tsx` (7 tests) pins the must-preserve flow:

1. login is phone-or-national-code only — **no password field**;
2. unknown identifier converts to registration, keeps the typed identifier
   (asserted after completing province→city: the phone province reveals
   «شماره موبایل» carrying `09123456789`);
3. register mode keeps name + residence + CTA «ثبت‌نام و ورود» + mode switch;
4. the provided mascot asset is present, decorative;
5. onboarding walks the three real slides with next → next → «شروع», skip
   finishes immediately, both call `POST /me/onboarding`;
6. staff login keeps username+password for panels.

## Gates

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 43 files, 342 tests (335 baseline + 7 new) |
| `npm run build -w apps/web` | ✅ pass |

## Explicitly unchanged

All auth API contracts (`login`, `register`, `staffLogin`, `/me/onboarding`),
session handling, `lib/nationalCode.ts` province logic, ResidencePicker
behaviour, validations and Persian error/info texts, route guards, the
gallery sr-only link, PWA/preload of `mascot.webp`, dark mode, reduced
motion. No Cloudflare/production verification is claimed.

## Next

Stage 4 — Marketer (mobile-first, mascot frequent but task-supporting,
"one next action" home). Not started.
