# Stage 2 — Shared Primitives (Report)

> **Status:** Implemented and gated. No feature, route, permission, API,
> validation, or page behaviour was changed. Existing patterns were mapped
> first; new primitives wrap current behaviour only.

## Pattern map (before inventing anything)

| Need | Existing pattern found | Decision |
| --- | --- | --- |
| Select / Textarea / Tabs | `components/common/Field.tsx` (used by 31 files) | Promoted verbatim to `ui/`; old path is now a re-export shim |
| Table | `components/admin/DataTable.tsx` (used by reports, Manager, Admin) | Promoted verbatim to `ui/Table.tsx`; old path re-exports it |
| Push sub-navigation | `pages/admin/PushSectionTabs.tsx` (router links in disguise) | Untouched — it already composes `Tabs`; Stage 8 handles its surface |
| Button/Input/Card/Modal/Toast/Skeleton/Empty/Error/StatusBadge | `components/ui/*` | Extended additively only (see below) |

## Changes

- **New canonical primitives** in `apps/web/src/components/ui/`:
  - `Select.tsx`, `Textarea.tsx` — behaviour copied 1:1 from `Field.tsx`
    (48px, label/hint/error + `aria-live`, `aria-invalid`); additive
    improvements: optional `id` prop and `aria-describedby` wired to the
    hint/error ids (same pattern `Input` already used).
  - `Tabs.tsx` — same API/rendering; one accessibility fix: tab height
    `min-h-11` (44px) → `min-h-12` (48px touch target). Selected tab already
    used the CTA token from Stage 1.
  - `Table.tsx` — `DataTable` implementation moved verbatim (sorting,
    mobile sort select, stacked-card mobile view, sr-only caption) and
    exported also as `Table`.
  - `FieldWrap.tsx` — the shared label/hint/error shell extracted from
    `Field.tsx` so Select/Textarea keep identical markup.
- **Back-compat shims (no consumer file touched):**
  - `components/common/Field.tsx` re-exports `Select/Textarea/Tabs` from `ui/`.
  - `components/admin/DataTable.tsx` re-exports `DataTable/Table/Column` from `ui/`.
  - Tests assert the legacy and canonical imports are the *same* component.
- **Additive extensions to existing primitives:**
  - `Button`: new variants `energy` (`bg-brand-energy text-on-energy`, dark
    text on #58CC02, 8.49:1) and `accent` (`bg-accent text-on-accent`, 8.26:1).
    No existing variant changed.
  - `Card`: new tone `energy` (same dark-on-energy rule). Existing tones
    unchanged.
  - `StatusBadge`: `blacklisted` text token `text-danger` → `text-danger-fg`
    (AA text tone on the danger tint; icon+label already prevented
    color-only status).
  - `ui/index.ts` exports `Select`, `Textarea`, `Tabs`, `Table`/`DataTable`.
- **New tests:** `components/ui/primitives.test.tsx` (9 tests) covering
  Select/Textarea a11y wiring, Tabs selection/fa-IR count/48px, Table
  caption+rendering, shim identity, and the new Button/Card variants.

## Deliberately unchanged

Button/Input/Card/Modal/Toast/Skeleton/EmptyState/ErrorState/KpiCard/
ProgressRing/Spinner behaviour and APIs, `PushSectionTabs`, all pages,
form validations, upload/media logic, DataTable sorting semantics, dark
mode, reduced-motion behaviour, and every route/permission/API contract.
No page was restyled in this stage.

## Gates

| Check | Result |
| --- | --- |
| `npm run typecheck -w apps/web` | ✅ pass |
| `npm run lint -w apps/web` | ✅ pass |
| prettier (changed files) | ✅ pass |
| `npm run test -w apps/web` | ✅ 42 files, 335 tests pass (326 baseline + 9 new) |
| `npm run build -w apps/web` | ✅ pass (PWA precache 52 entries; chunk-size warning pre-existing) |

Functions workspace untouched (Stage 1 baseline remains valid).

## Next

Stage 3 — Auth + Onboarding (real fields/logic per audit §5.1, approved
mascot states, 360–430px responsive check). Not started pending go-ahead.
