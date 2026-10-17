# Golden Reference Redesign V3 — Execution Contract

This branch is a direct ChatGPT takeover of the visual implementation.

## Baseline

- Base branch: `arena/9e53c41a-seylane-sabz-learning`
- Baseline commit: `3c42835eb50f41401b7a0dabe3747b95a030eb8d`
- Baseline was verified green for CI, Android and Cloudflare Preview before visual work starts.

## Non-negotiable source-of-truth order

1. **Repository = functional truth**
   - routes
   - fields
   - validations
   - permissions
   - API contracts
   - business logic
   - loading/error/empty states
2. **User-approved reference boards = visual truth**
   - composition
   - hierarchy
   - spacing
   - typography hierarchy
   - card construction
   - surface treatment
   - mascot placement
   - role-specific tone
3. Existing implementation is not visual truth when it conflicts with an approved reference.

## Working rule

A page is not complete merely because tests are green.
It must also visually match its approved reference family.

## Safety gates

For every page family:

1. inspect current repository behavior;
2. implement only visual/layout changes needed for the approved reference;
3. preserve every existing feature/state;
4. run format/lint/build/typecheck/tests;
5. wait for a Cloudflare Preview from the exact HEAD;
6. compare the running page with its golden reference before moving on.

No broad multi-family batch is allowed.

## Role tone

### Marketer
- mobile-first
- warm light premium surfaces
- emerald + controlled amber
- app-like, not dashboard-like
- mascot integrated intentionally into composition
- rich progress / learning storytelling

### Manager
- more formal and operational
- lower mascot usage
- team-management density
- no Admin permissions or tools

### Admin
- formal operations console
- dense but clear
- mascot essentially absent
- strong tables, filters, modals and destructive-action clarity

## Mascot

The approved purple rooster identity is locked.
Do not regenerate, stretch, squash, recolor or fake states by arbitrary CSS rotation.
If a state asset is not available, use the canonical mascot conservatively instead of inventing a new character.

## Theme

The approved marketer direction is light-first.
Automatic OS dark mode must not replace the approved visual composition.

## Definition of done

A page family is complete only when:
- functional behavior is preserved;
- CI is green;
- Preview corresponds to the exact branch HEAD;
- visual comparison against the approved board is acceptable;
- no later page-family work has started before those gates pass.
