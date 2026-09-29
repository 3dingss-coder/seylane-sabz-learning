# Changelog

## 2026-09-29 — Performance pass: removed legacy-browser machinery (perf, no behavior change on modern browsers)

**Why:** the production build was paying for browsers from ~2017 (browserslist floor: iOS 12 / Chrome 64 /
KaiOS / UC / QQ). Every modern page load fetched an extra 128 KB (48.6 KB gzip) core-js polyfill chunk plus
two no-op legacy bootstrap scripts, the build emitted a second ES5/SystemJS copy of the whole app, and CSS
got a postcss-preset-env fallback pass. The spec never mandated such old engines — the floor was an
implementation choice.

**Changes (7 files):**

| File | Change |
|---|---|
| `apps/web/vite.config.ts` | removed `@vitejs/plugin-legacy` (`modernPolyfills` + `renderLegacyChunks`) and the `legacyCss()` plugin; added `build.target` pinned to the new floor |
| `apps/web/legacy-css.ts` | **deleted** (Tailwind v4 cascade layers are supported by every browser above the new floor) |
| `apps/web/package.json` | `browserslist` floor raised to 2023+ engines (Chrome/Edge/Android-WebView 110+, Firefox 115+, Safari/iOS 16.4+, Samsung 22+); removed devDeps `@vitejs/plugin-legacy`, `terser`, `postcss`, `postcss-preset-env` |
| `functions/package.json` | removed unused devDep `firebase` (client SDK — never imported; emulator tests use `@firebase/rules-unit-testing`) |
| `package-lock.json` | synced (`npm install`); **93 packages removed** from the install tree |
| `README.md` | "Browser support" section rewritten for the new floor + rollback note |
| `scripts/start.mjs` | stale "legacy-browser bundle" comment removed |

**Measured effect (production build, `npm run build` in `apps/web`):**

| Metric | Before | After |
|---|---|---|
| Build time | 42.2 s (vite 27.4 s) | **16.3 s (vite 5.2 s)** |
| Initial JS, modern browser (gzip) | 180.7 KB (132.0 main + 48.6 polyfills) | **128.9 KB** (−29%) |
| Initial CSS (gzip) | 9.8 KB | **7.9 KB** (−20%, fallbacks gone) |
| Total JS in `dist/` | ~1.14 MB raw / ~345 KB gzip | **608 KB raw / 190 KB gzip** (−47% raw) |
| `index.html` scripts | 7 tags (incl. 2 no-op legacy bootstraps) | **1 tag** |
| SW precache | 802.9 KiB | **634.2 KiB** |

**Verified:** `lint`, `typecheck`, `test` (functions 58 + web 101 — same counts), `format:check` all green;
production build served via `vite preview` (page + login + manifest + SW all 200). Heavy deps
(`@sentry/react`, `firebase/*`, Capacitor) were already lazy-imported behind feature guards and are
unchanged.

**What this means:** phones/engines older than ~2023 (iOS < 16.4, Android WebView < 110, KaiOS/UC/QQ
browsers) can no longer load the app. This is an internal training PWA — flag if any sales-rep device
needs the old support.

**Rollback:** restore `apps/web/legacy-css.ts` + the two vite plugins + the 4 devDeps, lower the
`browserslist` floor, and re-sync the lockfile (the old values are in git history, commit before this
change).

**Not changed (checked, already fine):** fonts (3 woff2, ~102 KB total), route code-splitting (Admin/
Manager/Gallery are lazy chunks), workbox runtime caching of the 71 MB local catalog mirror
(`public/catalog`, git-ignored client assets — needed for local dev/offline; excluded from precache),
`sync-assets` (already incremental), API seed (skipped when persisted data exists).
