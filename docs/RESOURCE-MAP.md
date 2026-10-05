# Resource map — client assets in this repo

> Audit date: 2026-09-28 · Owner: PROMPT 001 (Foundation). Source of truth for product decisions: `PRODUCT-MASTER-SPEC.md`.

## 1. Catalog — «لیست برندها و محصولات سیلانه سبز»

| File | Content | Used for |
|---|---|---|
| `brands.csv` | 12 active brands (id `brand-sb-N`, Persian/Latin name, categories, logo path) | `brands` collection (§20.1) — seed in PROMPT 003 |
| `products.csv` | 238 active products (id `sb-<code>`, brand, code, barcode, name, category, description, image link) | `products` collection (§20.1) — seed in PROMPT 003 |
| `hidden-products.csv` | 42 inactive products + reason (no image / removed brand / legacy demo) | **not seeded** (reported only) |
| `brand-category-matrix.csv`, `.xlsx` | Derived views of the same data | reference only |

- Parsed by `scripts/lib/catalog-source.mjs` (one reader for web asset sync + future seed script).
- Names are used verbatim (no translation / edits). Price columns are **not** part of the learning schema (§20) and are not imported.

## 2. Brand logos & product images — «لوگو برندها و تصاویر محصولات»

Deterministic match result (full table: [`ASSET-MAPPING.md`](./ASSET-MAPPING.md), regenerate with `node scripts/report-assets.mjs`):

| Item | Matched | Unmatched |
|---|---|---|
| Brand logos (12 active brands) | **12 / 12** | 0 |
| Product images (238 active products) | **238 / 238** | 0 |
| Logo files without an active brand | — | `vitas.webp` (ویت آس), `zen.jpg` (زِن), `zenon.png` (زنون) — brands removed from catalog |
| Image files without an active product | — | 69 (variants `-1/-2`, hidden/removed brands e.g. فورمی/بابِل/ویت آس/زِن, legacy demo `*.jpg`) |

Local dev/PWA serves a mirror at `/catalog/brands/{brandId}/logo.*` and `/catalog/products/{productId}/main.*` (`apps/web/scripts/sync-assets.mjs`, git-ignored output). In deployed envs the seed script (PROMPT 003) uploads the same files to Firebase Storage at the same paths and writes `logoUrl` / `imageUrl`.

## 3. Sample training files (repo root) — mapping status

Decisions applied: **D27** (reactivate فورمی / آتل / آیس بال / ویت آس in the learning catalog), **D28** (video = YouTube link **or** uploaded file in any common format; m4a allowed), **D30** (WITH US → کامان).

| Training file | Type | Brand | Product | Package / Part | Status |
|---|---|---|---|---|---|
| `آموزش کامل محصول فورمی.mp4` | video file (D28) | فورمی (D27) | sb-310350101 «کیت درمانی فورمی» | «فورمی» / part 2 | ✅ resolved |
| `معرفی کلی محصول فورمی.m4a` | audio | فورمی (D27) | sb-310350101 | «فورمی» / part 1 | ✅ resolved |
| `کتابچه_جامع_فروش_BUBBLE.mp4` | video file | آیس بال (D27) | sb-370276101 «فوم شستشوی صورت آیس بال» | «آیس بال» / part 2 | ✅ resolved |
| `معرفی کلی آیس بال.m4a` | audio | آیس بال (D27) | sb-370276101 | «آیس بال» / part 1 | ✅ resolved |
| `آموزش_ویدیویی_ATL.mp4` | video file | آتل (D27) | sb-220306101 «کرم گرم کننده و ضد درد کتف و گردن آتل» | «آتل» / part 2 | ✅ resolved |
| `ای_تی_ال_پادزهر_دردهای_دیجیتال.m4a` | audio | آتل (D27) | sb-220306101 | «آتل» / part 1 | ✅ resolved |
| `معرفی کلی ویت آس.m4a` | audio | ویت آس (D27, logo `vitas.webp`) | sb-340122101 «کرم ترک پا 75 میل ویت آس» | «ویت آس» / part 1 | ✅ resolved |
| `آموزش_کرم_ترک_پای__WITH_US_.mp4` | video file | کامان ✅ | sb-300123101 «کرم ترک پا کامان» (D30) | «کرم ترک پا کامان» / part 1 | ✅ resolved |
| `آموزش کامل ضدآفتاب پیکسل.mp4` | video file | پیکسل ✅ | ❓ 10 sunscreen SKUs — which product? | «ضدآفتاب پیکسل» / part 2 | ⏳ needs product |
| `معرفی کلی ضدآفتاب استیکی پیکسل.m4a` | audio | پیکسل ✅ | ❓ «استیکی» — no stick SKU in catalog | «ضدآفتاب پیکسل» / part 1 | ⏳ needs product |
| `آموزش_فروش_آیس_بال.mp4` | video file | آیس بال ✅ | ❓ 3 SKUs (ماچا / ژل آبرسان / ژل لیفتینگ) | «آیس بال» / part 2 | ⏳ needs product |
| `معرفی کلی آیس بال.m4a` | audio | آیس بال ✅ | ❓ as above | «آیس بال» / part 1 | ⏳ needs product |
| `معرفی کلی‌ دارت.m4a` | audio | ❌ «دارت» not in brands / products / hidden list / logos | ❌ | — | ⏳ needs brand + product |

Missing logos for reactivated brands (D27): **فورمی, آتل, آیس بال**. The client will provide them. Until then, the UI shows the brand name as text (no placeholder image).

## 4. Helper UI kit — «کامپوننت های کمکی برای تکمیل UI UX اپلیکیشن»

The kit comes from a **different product** (Silaneh Sabz Plus — B2B ordering app). Reuse = visual patterns and layout, not business logic. Originals are kept untouched in place.

| Helper component | Target spec page / feature | Status | Changes applied |
|---|---|---|---|
| اپ بازاریاب/common/EmptyState.tsx + پنل مدیر/common/EmptyState.tsx | All pages — Empty states | ✅ ported → `components/ui/EmptyState.tsx` | emerald→`primary` tokens, 48px CTA via `Button`, radius 12 |
| اپ بازاریاب/common/Skeleton.tsx | M3/M4/M5, G1/G2 loading | ✅ ported → `components/ui/Skeleton.tsx` | order/customer skeletons → `PackageCardSkeleton`, `TableSkeleton`, `LoadingRegion` (aria-busy) |
| اپ بازاریاب/common/Toast.tsx | Global toasts (§16.5) | ✅ ported → `components/ui/Toast.tsx` | decoupled from AppContext → `ToastProvider`/`useToast`; 3s success / 6s error + action; 48px close |
| اپ بازاریاب/common/BottomNav.tsx | Marketer bottom nav (§16.5) | ✅ ported → `components/layout/BottomNav.tsx` | 5 sales tabs → 4 spec tabs (خانه/آموزش‌ها/پیام‌ها/کارت‌ها); `NavLink`; unread badge |
| پنل مدیر/common/Sidebar.tsx | G1–G5, A1–A6 desktop sidebar | ✅ ported → `components/layout/Sidebar.tsx` | sales menu removed (menus supplied per role in 004/013); tokens; 48px rows |
| پنل مدیر/common/KPICard.tsx | G1 manager KPIs, A1 admin stats | ✅ ported → `components/ui/KpiCard.tsx` | `#006c4a`→tokens; tone variants; no fake trend text |
| پنل مدیر/common/StatusBadge.tsx | M5 section status, A2 publish status, A3 user status | ✅ ported → `components/ui/StatusBadge.tsx` | order/business statuses → locked/open/in_progress/completed, draft/published/archived, active/inactive; icon+text |
| اپ مشتری/BrandsGrid.tsx | Brand tiles (M4 filter, A2 tree, gallery) | ✅ ported → `components/brand/BrandLogo.tsx` | material-symbols removed; real logo URL; text fallback (no placeholder image) |
| اپ مشتری/لوگو و آیکون/* | App logo, PWA icons, header | ✅ used → `AppLogo`, PWA manifest icons | mirrored by `sync-assets` (not duplicated in git) |
| اپ بازاریاب/auth/LoginView.tsx, SignupView.tsx | M1 (Auth) | ✅ adapted → `pages/auth/AuthPage.tsx` | login/register/forgot in one page; phone-or-email; demo creds and "pending approval" removed (D18 open signup); Persian digits normalized |
| پنل مدیر/صفحات/AuthPage.tsx | M1 desktop card | ✅ merged into `AuthPage.tsx` | centered card layout on desktop; single login for all roles (role-based redirect) |
| اپ بازاریاب/common/Header.tsx, پنل مدیر/common/Header.tsx | Marketer header (avatar), panel header | ✅ adapted → `layouts/MarketerLayout.tsx`, `layouts/PanelLayout.tsx`, `components/common/PageHeader.tsx` | sales actions removed; AppLogo + unread badge; back button (rtl-mirror) |
| اپ مشتری/ProductCard.tsx, ProductRowCard.tsx, ProductModal.tsx | M4 package card (brand/product image), product page | ✅ adapted → `components/learning/PackageCard.tsx`, `components/common/ProductImage.tsx` | price/cart removed; real product image → brand logo fallback (D34); progress bar + CountdownChip |
| اپ بازاریاب/catalog/CatalogView.tsx | M4 package list + tabs | ✅ adapted → `pages/m/LearnPage.tsx` | tabs در حال انجام/جدید/تکمیل‌شده + brand filter; Loading/Empty/Error |
| اپ بازاریاب/notifications/NotificationSheet.tsx, اپ مشتری/NotificationsModal.tsx | M9 messages/notification center | ✅ adapted → `pages/m/MessagesPage.tsx` | full page (not sheet) with notifications + manager messages tabs; read/read-all; actionRef deep links |
| اپ بازاریاب/profile/ProfileView.tsx | M11 profile | ✅ adapted → `pages/m/ProfilePage.tsx` | sales stats removed; name edit, password change, logout |
| اپ بازاریاب/dashboard/StatCards.tsx | M8 cards (points/badges) | ✅ adapted → `pages/m/CardsPage.tsx` | points ledger + earned/locked badges instead of sales stats |
| پنل مدیر/صفحات/DashboardPage.tsx | A1 / G1 | ✅ adapted → `pages/admin/AdminDashboard.tsx`, `pages/manager/ManagerDashboard.tsx` | KpiCard grid; sales charts replaced by completion/laggard lists |
| پنل مدیر/صفحات/BrandsPage.tsx, ProductsPage.tsx, modals/BrandModal.tsx, ProductModal.tsx | A2 content management | ✅ adapted → `pages/admin/ContentPage.tsx`, `BrandDetailPage.tsx`, `PackageFormDialog.tsx`, `components/admin/Uploader.tsx` | logo/image upload to Storage; archive; unassigned tab (D33); packages/sections per brand/product |
| پنل مدیر/صفحات/MarketersPage.tsx, MarketerDetailPage.tsx, modals/MarketerModal.tsx | G3 marketer profile, A3 users | ✅ adapted → `pages/manager/ManagerMember.tsx`, `components/reports/MemberTimeline.tsx`, `pages/admin/UsersPage.tsx` | sales KPIs → learning timeline, attempts, messages/notes |
| پنل مدیر/صفحات/AdminUsersPage.tsx, modals/ApproveAdminModal.tsx | A3 users & roles | ✅ adapted → `pages/admin/UsersPage.tsx`, `TeamsPage.tsx`, `components/admin/DataTable.tsx` | approval flow dropped (D18); role/team/status edit + password reset |
| پنل مدیر/صفحات/NotificationsPage.tsx | A5 notification center | ✅ adapted → `pages/admin/NotificationsPage.tsx` | templates editor + manual send (rate-limited) |
| پنل مدیر/صفحات/ReportsPage.tsx | G2 reports | ✅ adapted → `components/reports/CompletionReport.tsx` (manager + admin), `pages/admin/ReportsPage.tsx` | brand/product/user/date filters, CSV export, retakes, mentor aggregates |
| پنل مدیر/صفحات/SettingsPage.tsx | A6 policies | ✅ adapted → `pages/admin/PoliciesPage.tsx` | completion threshold, attempts, warning hours, points (audited) |
| پنل مدیر/common/RoleGuard.tsx, Breadcrumbs.tsx | RBAC route guard, admin breadcrumbs | ✅ RoleGuard → `layouts/RequireAuth.tsx`; Breadcrumbs → `PageHeader` back link | server-side RBAC remains authoritative |
| اپ مشتری/PersianCalendarPicker.tsx | A2 deadline picker (Jalali display, UTC storage §16.9) | ⚠️ not ported → native `datetime-local` + Jalali preview (`lib/dates.ts`, `faDate`) | picker depends on the sales app's styling/state; reported, kept in place |
| اپ مشتری/OfflineOverlay.tsx | M3/M6 offline banner | ✅ adapted → offline banner in `layouts/MarketerLayout.tsx` + `lib/offline-queue.ts` | non-blocking banner (heartbeats are queued, D7 no offline playback) |
| آیکون و اسپلش اندروید/اپ بازاریاب/* | Capacitor Android icons | ⛔ not used (verified: default Capacitor placeholder icon + splash, package `com.silaneh.sabzplus.marketer`) | real icons/splash generated from the holding icon (`public/icons/icon-512.png`) into `apps/web/android/app/src/main/res` (all densities, adaptive + round, background #0F5338) |
| Sales-only (cart, orders, payment, offers, customers, visitor): CartSheet, CartDrawer, NewOrderFlow, Orders*, Payment*, Offer*, WeeklyOffer, RecommendedPackage, PackageModal, Customer*, AddCustomerModal, VisitorView, CustomerSimulatorModal, ApiConfigModal, PendingLockScreen, PendingApprovalModal, SearchBar/SearchOverlay, CategoryGrid, PopularProducts, ProductSection, ProductsView, AddOrderModal, OrderDetailModal, CustomersPage, CustomerDetailPage, OrdersPage, OffersPage, category images | — | ⛔ out of MVP scope | kept in place, not ported (search = V1 per §38) |
