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

| Training file | Type | Brand (catalog status) | Product (catalog status) | Proposed package / part | Status |
|---|---|---|---|---|---|
| `آموزش کامل ضدآفتاب پیکسل.mp4` | video 42.8MB | پیکسل ✅ active | ❓ 10 sunscreen products — which one? | «ضدآفتاب پیکسل» / part 2 | **needs decision** |
| `معرفی کلی ضدآفتاب استیکی پیکسل.m4a` | audio 12.6MB | پیکسل ✅ active | ❓ «استیکی» — no stick sunscreen in active catalog | «ضدآفتاب پیکسل» / part 1 | **needs decision** |
| `آموزش_فروش_آیس_بال.mp4` | video 42.1MB | آیس بال ✅ active | ❓ 3 products (ماچا / ژل آبرسان / ژل لیفتینگ) | «آیس بال» / part 2 | **needs decision** |
| `معرفی کلی آیس بال.m4a` | audio 13.5MB | آیس بال ✅ active | ❓ as above | «آیس بال» / part 1 | **needs decision** |
| `آموزش کامل محصول فورمی.mp4` | video 41.0MB | فورمی ⛔ brand removed | 310350101 «کیت درمانی فورمی» ⛔ hidden | «فورمی» / part 2 | **needs decision** |
| `معرفی کلی محصول فورمی.m4a` | audio 13.5MB | فورمی ⛔ | as above | «فورمی» / part 1 | **needs decision** |
| `کتابچه_جامع_فروش_BUBBLE.mp4` | video 42.9MB | آیس بابل / بابِل ⛔ brand removed | 370276101 «فوم شستشوی صورت» ⛔ hidden | «بابل» / part 2 | **needs decision** |
| `معرفی کلی بابل.m4a` | audio 10.7MB | آیس بابل / بابِل ⛔ | as above | «بابل» / part 1 | **needs decision** |
| `آموزش_ویدیویی_ATL.mp4` | video 45.1MB | آتل ⛔ brand removed | 220306101 «کرم گرم‌کننده و ضد درد کتف و گردن» ⛔ hidden | «آتل» / part 2 | **needs decision** |
| `ای_تی_ال_پادزهر_دردهای_دیجیتال.m4a` | audio 14.6MB | آتل ⛔ | as above | «آتل» / part 1 | **needs decision** |
| `آموزش_کرم_ترک_پای__WITH_US_.mp4` | video 42.6MB | «WITH US» ≈ ویت آس ⛔ removed — or کامان ✅ (300123101 کرم ترک پا)? | ❓ | «کرم ترک پا» / part 2 | **needs decision** |
| `معرفی کلی ویت آس.m4a` | audio 13.9MB | ویت آس ⛔ brand removed (logo `vitas.webp` exists) | 340122101 «کرم ترک پا ۷۵ میل» ⛔ hidden | «ویت آس» / part 1 | **needs decision** |
| `معرفی کلی‌ دارت.m4a` | audio 11.2MB | ❌ «دارت» not found in brands, products, hidden list or logos | ❌ | — | **needs decision** |

Media notes (affect PROMPT 004/009, spec-level constraints):
- Spec §20.2: `video → youtubeUrl`, `audio → audioUrl (Storage)`. The 6 `.mp4` files are local files, not YouTube links. Options: (a) client uploads them to YouTube (unlisted) and gives links; (b) store in Storage as audio-only/video file — requires a spec change (Decision Log).
- Spec §21/§24 upload whitelist is `audio/mpeg, wav ≤ 50MB`; the podcasts are `.m4a` (audio/mp4). Needs whitelist extension (recorded as a proposed decision) or transcoding to mp3.

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
| اپ بازاریاب/auth/LoginView.tsx, SignupView.tsx | M1 (Auth) | ⏳ PROMPT 002 | will drop demo creds & "pending approval" (spec D18: open signup) |
| پنل مدیر/صفحات/AuthPage.tsx | M1 desktop card | ⏳ PROMPT 002 | |
| اپ بازاریاب/common/Header.tsx, پنل مدیر/common/Header.tsx | Marketer header (avatar), panel header | ⏳ PROMPT 008 / 004 | |
| اپ مشتری/ProductCard.tsx, ProductRowCard.tsx, ProductModal.tsx | M4 package card (brand/product image), product page | ⏳ PROMPT 008 | price/cart removed |
| اپ بازاریاب/catalog/CatalogView.tsx | M4 package list + tabs | ⏳ PROMPT 008 | |
| اپ بازاریاب/notifications/NotificationSheet.tsx, اپ مشتری/NotificationsModal.tsx | M9 messages/notification center | ⏳ PROMPT 011/012 | |
| اپ بازاریاب/profile/ProfileView.tsx | M11 profile | ⏳ PROMPT 008 | |
| اپ بازاریاب/dashboard/StatCards.tsx | M8 cards (points/badges) | ⏳ PROMPT 012 | |
| پنل مدیر/صفحات/DashboardPage.tsx | A1 / G1 | ⏳ PROMPT 004 / 013 | |
| پنل مدیر/صفحات/BrandsPage.tsx, ProductsPage.tsx, modals/BrandModal.tsx, ProductModal.tsx | A2 content management | ⏳ PROMPT 004 | |
| پنل مدیر/صفحات/MarketersPage.tsx, MarketerDetailPage.tsx, modals/MarketerModal.tsx | G3 marketer profile, A3 users | ⏳ PROMPT 007 / 013 | |
| پنل مدیر/صفحات/AdminUsersPage.tsx, modals/ApproveAdminModal.tsx | A3 users & roles | ⏳ PROMPT 007 | |
| پنل مدیر/صفحات/NotificationsPage.tsx | A5 notification center | ⏳ PROMPT 011 | |
| پنل مدیر/صفحات/ReportsPage.tsx | G2 reports | ⏳ PROMPT 013 | |
| پنل مدیر/صفحات/SettingsPage.tsx | A6 policies | ⏳ PROMPT 007 | |
| پنل مدیر/common/RoleGuard.tsx, Breadcrumbs.tsx | RBAC route guard, admin breadcrumbs | ⏳ PROMPT 002 / 004 | |
| اپ مشتری/PersianCalendarPicker.tsx | A2 deadline picker (Jalali display, UTC storage §16.9) | ⏳ PROMPT 004 | |
| اپ مشتری/OfflineOverlay.tsx | M3/M6 offline banner | ⏳ PROMPT 009 | |
| آیکون و اسپلش اندروید/اپ بازاریاب/* | Capacitor Android icons | ⏳ PROMPT 015 | splash images are the default Capacitor splash (not brand) — new splash from logo needed |
| Sales-only (cart, orders, payment, offers, customers, visitor): CartSheet, CartDrawer, NewOrderFlow, Orders*, Payment*, Offer*, WeeklyOffer, RecommendedPackage, PackageModal, Customer*, AddCustomerModal, VisitorView, CustomerSimulatorModal, ApiConfigModal, PendingLockScreen, PendingApprovalModal, SearchBar/SearchOverlay, CategoryGrid, PopularProducts, ProductSection, ProductsView, AddOrderModal, OrderDetailModal, CustomersPage, CustomerDetailPage, OrdersPage, OffersPage, category images | — | ⛔ out of MVP scope | kept in place, not ported (search = V1 per §38) |
