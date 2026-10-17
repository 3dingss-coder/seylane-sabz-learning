# تحویل نهایی — بازطراحی UI/UX (Stage 10)

> گزارش پایانی بازطراحی `seylane-sabz-learning` از دست‌تحویل `seylaneh-design-handoff-v2` — ۱۰ مرحله، بدون هیچ regression معرفی‌شده توسط بازطراحی. این سند: نتایج گیت‌ها، فایل‌های تغییر یافته به تفکیک مرحله، ماتریس QA بصری روت‌به‌روت، اسکرین‌شات‌های واقعی، فهرست صریح «بدون تغییر»، فهرست زیرساخت دست‌نخورده، و تأیید رسمی حذف‌نشدن هیچ فیچر/روت/دسترسی/قرارداد API.

## 1. تاریخچهٔ کامیت‌های staged (همگی روی `arena/9e53c41a-seylane-sabz-learning`)

| # | کامیت | مرحله |
|---|---|---|
| 0 | `81d7393` | baseline (نقطهٔ شروع) |
| 1 | `6b73489` | S0 — ممیزی فاز صفر (`PHASE-ZERO-AUDIT.md`) |
| 2 | `5fc94df` | S1 — پایه‌ها (توکن‌های معنایی، تایپوگرافی/فاصله/شعاع/ارتفاع، رنگ CTA امن، dark-mode/reduced-motion) |
| 3 | `6a5412e` | S2 — Primitiveهای مشترک (Button/Card/Field/Table/Tabs/StatusBadge/…) |
| 4 | `91a1e00` | S3 — احراز هویت + Onboarding |
| 5 | `c4c3c72` | S4 — مارکتر (خانه با «کار بعدی»، منتور با همهٔ قابلیت‌ها، کارت‌ها/پیام‌ها/آموزش) |
| 6 | `8cd4ffe` | S5 — مدیر (داشبورد تیم، گزارش‌ها، جزئیات عضو، درخواست آزمون مجدد) |
| 7 | `21dd545` | S6 — پوستهٔ ادمین + هسته |
| 8 | `e3c9ef8` | S7 — گردش‌های محتوای ادمین |
| 9 | `8a47a22` | S8 — اعلان‌ها/Push/اتوماسیون‌ها |
| 10 | `52f5078` | S9 — سیاست‌ها/لاگ/آرشیو/پروفایل + حالت‌های edge |
| 11 | (این کامیت) | S10 — regression/a11y/performance + بستهٔ تحویل |

## 2. نتایج گیت‌ها (درخت نهایی)

| گیت | نتیجه |
|---|---|
| `npm run typecheck` (functions + web) | ✅ exit 0 |
| `npm run lint` (functions + web) | ✅ exit 0 |
| `npm run format:check` (کل ریپو) | ✅ «All matched files use Prettier code style!» |
| تست‌های وب (unit/integration/jsdom) | ✅ **380 passed / 50 files** |
| تست‌های functions/Worker (vitest) | ✅ **555 passed / 54 files** |
| **جمع تست‌ها** | ✅ **935 تست سبز** |
| `npm run build` (functions + web) | ✅ (بیلد وب ~40s) |
| **e2e واقعی (Playwright + Chromium واقعی، seed واقعی)** | ✅ **20/20 passed** — a11y (axe) + foundation (گالری RTL/فونت وزیرمتن/48px/focus-trap/404) + journey (مارکتر: خانه→قسمت→آزمون قبولی→باز شدن قسمت بعد، گزارش مدیر + CSV، برندهای ادمین/RBAC) |

## 3. a11y (سه لایه)

1. **ساختاری (jsdom):** `pages/a11y.test.tsx` + `primitives.test.tsx` («keyboard focus-visible»، «form semantics»، «dialog a11y» — focus trap, Escape، aria-live در Toast).
2. **مرورگر واقعی (e2e):** `e2e/a11y.spec.ts` با axe — ۶ صفحه (ورود، ثبت‌نام با انتخابگر استان/شهر، خانه/کاتالوگ/بستهٔ مارکتر، داشبورد مدیر، داشبورد+محتوای ادمین) ✅.
3. **اسکن تکمیلی Stage 10:** axe-core (WCAG 2.0/2.1 A+AA) روی هر ۱۰ اسکرین‌شات — **۱۰/۱۰ CLEAN (صفر نقض)**.

## 4. Performance

| شاخص | مقدار | توضیح |
|---|---|---|
| وابستگی جدید runtime | **صفر** | `git diff baseline..HEAD` روی همهٔ `package.json`ها: **خالی** |
| چانک اصلی (index.js) | 392 KB (119 KB CSS) | React + Router + Query + کیت UI |
| چانک AdminRoutes | 377 KB — **lazy** | مارکترها هرگز کد ادمین را دانلود نمی‌کنند (نظر در کد: «marketers never download admin code») |
| چانک ProfilePage | 11 KB — lazy | مسیرهای مارکتر on-demand |
| تعداد چانک‌های JS | 89 (modern + legacy دوگانه برای مرورگرهای قدیمی) | code-splitting از قبل موجود حفظ شد |
| PWA precache | 1170 KB / 52 فایل | service worker بدون تغییر |
| تغییرات زیرساخت بیلد | هیچ | vite/PWA/legacy pipeline دست‌نخورده |

## 5. ماتریس QA بصری روت‌به‌روت

«پین» = تست regression که قرارداد صفحه را قفل کرده است. «شات» = فایل اسکرین‌شات واقعی (تولید seed-شده، `prefers-reduced-motion`).

### عمومی
| روت | صفحه | پین | شات |
|---|---|---|---|
| `/login` | ورود (شماره/کدملی) | auth.test (۹ سناریو)، flows.test (M1: ذخیرهٔ refresh token، شمارهٔ ۱۱ رقمی، کدملی) | `01-login-mobile.png` |
| `/register` | ثبت‌نام یک‌مرحله‌ای با محل سکونت | auth.test «register»، flows.test (استان→شهر، بدون اقامت‌گاه)، e2e a11y (باز شدن لیست‌ها) | — |
| `/forgot-password` | هدایت به `/login` | pages.test (routing) | — |
| `/gallery` | گالری برندها/محصولات | pages.test + e2e foundation (RTL + لوگوهای واقعی) | — |
| `*` (ناموجود) | 404 فارسی با راه بازگشت | pages.test + e2e foundation | — |

### مارکتر (mobile-first)
| روت | صفحه | پین | شات |
|---|---|---|---|
| `/` | خانه — «کار بعدی تو» (یک اقدام بعدی) + حلقهٔ پیشرفت + امتیاز | marketer.test (Home)، flows.test (کش آفلاین F9، nudge)، e2e journey | `02-marketer-home-mobile.png` |
| `/learn` | آموزش‌های من | marketer.test | `03-marketer-learn-mobile.png` |
| `/packages/:id` | بسته (سرفصل‌ها/پیش‌نیاز) | marketer.test + e2e a11y | — |
| `/sections/:id` | قسمت (پخش + دلیل قفل) | marketer.test، flows.test (کدک native، حفظ عنصر رسانه) | — |
| `/quiz/:sectionId` | آزمون | marketer.test (M7/M8) + flows.test (بدون کلید پاسخ در کلاینت) | — |
| `/messages` | پیام‌ها | marketer.test | — |
| `/cards` | کارت‌ها | marketer.test | — |
| `/mentor` | منتور (چت/میکروفون/تماس صوتی/فایل/لینک/منابع) | marketer.test — **همهٔ قابلیت‌ها حفظ شده** (تثبیت S4) | — |
| `/profile` | پروفایل (نام/رمز/خروج) | profile.test (S9) | `04-marketer-profile-mobile.png` |
| `/onboarding` | Onboarding | auth.test + flows.test (عدم ثبت بدون اقامت‌گاه) | — |

### مدیر (desktop-first)
| روت | صفحه | پین | شات |
|---|---|---|---|
| `/manager` | داشبورد تیم فروش (سلامت تیم + افراد نیازمند اقدام) | manager.test (۶ سناریو) | `05-manager-dashboard-desktop.png` |
| `/manager/reports` | گزارش تکمیل + خروجی CSV | manager.test + e2e journey (CSV) | `06-manager-reports-desktop.png` |
| `/manager/members/:id` | جزئیات عضو + «یادداشت آموزشی»/«ارسال پیام» | manager.test | — |
| `/manager/retakes` | درخواست‌های آزمون مجدد | manager.test | — |
| `/manager/profile` | پروفایل | profile.test (مشترک) | — |

### ادمین (desktop-first، کنسول رسمی/متراکم)
| روت | صفحه | پین | شات |
|---|---|---|---|
| `/admin` | داشبورد + چک‌لیست ۴قدمی | adminCore.test (۴) | `07-admin-dashboard-desktop.png` |
| `/admin/content` | محتوا (برندها/تقسیم‌نشده/آرشیو، sync با `?tab=`) | adminContent.test (۶) + admin.test | `08-admin-content-desktop.png` |
| `/admin/content/brands/:id` | جزئیات برند | admin.test | — |
| `/admin/packages/:id` | ویرایشگر بسته + «مراحل آماده‌سازی» (۵قدم) | adminContent.test + admin.test | — |
| `/admin/quizzes/:id` | سازندهٔ آزمون (MCQ با ۴ گزینه، توضیح، جابه‌جایی، حداقل ۳ سؤال) | adminContent.test | — |
| `/admin/assignments` | انتساب‌ها (مسیرهای پیشنهادی/مستقیم) | adminContent.test | — |
| `/admin/media` | کتابخانه رسانه | admin.test + mentorGuides.test | — |
| `/admin/mentor` | راهنماهای منتور | mentorGuides.test | — |
| `/admin/users`، `/admin/users/:id` | کاربران/جزئیات | admin.test | — |
| `/admin/teams` | تیم‌ها | adminCore.test | — |
| `/admin/reports` | گزارش‌ها | admin.test | — |
| `/admin/notifications` | اعلان‌ها (صندوق/قالب‌ها/ارسال دستی) | notifications.test (۴) | — |
| `/admin/push-campaigns` | کمپین‌های Push | pushCampaigns.test | — |
| `/admin/push-campaigns/automations` | اتوماسیون‌ها (operations console) | pushAutomations.test + lifecycle (۱۶+) | `09-admin-automations-desktop.png` |
| `/admin/push-campaigns/automations/:key` | جزئیات/گام‌ها/تست ارسال/تاریخچه | pushAutomationDetail/Lifecycle/Runs/Model | — |
| `/admin/push-campaigns/automations/runs`، `/trace` | اجراها/رد تصمیم | pushAutomationRuns | — |
| `/admin/push-campaigns/new`، `/:id` | استودیو کمپین | pushCampaigns.test | — |
| `/admin/policies` | سیاست‌ها (A8) | governance.test (۳) | `10-admin-policies-desktop.png` |
| `/admin/audit` | لاگ تغییرات (A10) | governance.test (۲) | — |
| `/admin/archive` | آرشیو/لیست سیاه | governance.test (۵) | — |
| `/admin/profile` | پروفایل | profile.test (مشترک) | — |

**اسکرین‌شات‌های الزامی تحویل:** `screenshots/02-marketer-home-mobile.png` (مارکتر-موبایل)، `screenshots/05-manager-dashboard-desktop.png` (مدیر-دسکتاپ)، `screenshots/07-admin-dashboard-desktop.png` (ادمین-دسکتاپ) + ۷ شات تکمیلی (۰۱–۱۰). همه از **بیلد تولید** روی API واقعی (seed: ۱۷ برند، ۹ بسته) گرفته شده‌اند.

## 6. فهرست صریح «بدون تغییر» (unchanged)

- **منطق کسب‌وکار، اعتبارسنجی‌های سرور، قراردادهای API:** هیچ تغییری در `functions/` (Worker) — `git diff baseline..HEAD -- functions/` خالی است.
- **وضعیت‌ها و semantic status colors** (موفق/هشدار/خطر/اطلاع) — از spec حفظ و در تست‌های StatusBadge پین شد؛ وضعیت‌ها هرگز فقط-رنگی نیستند (آیکون/متن).
- **هویت ماسکات:** `02-mascot/mascot-original.png` با SHA-256 `1bf42cc8…f49562` — بدون regeneration/لباس/کلاه/عینک؛ پرتکرار در مارکتر، نادر در مدیر، تقریباً غایب در ادمین (پین شده در adminCore).
- **فونت وزیرمتن (self-hosted)**، RTL اول فارسی.
- **`prefers-reduced-motion`** (پین‌شده در refresh.test/primitives.test/e2e foundation). **dark-mode:** توکن‌های تم تاریک زیر `:root[data-theme='dark']` کشتی می‌شوند؛ اما هیچ‌جا در برنامه `data-theme` ست نمی‌شود و سیم‌کشی `prefers-color-scheme` وجود ندارد — بنابراین برنامه امروز فقط تم روشن را رندر می‌کند و بلوک تاریک تا معرفی یک toggle غیرفعال (dormant) است (راستی‌آزمایی visual-QA در ۲۰۲۶-۱۰).
- **تمام مسیرها، دکمه‌ها، فیلدها، اعتبارسنجی‌ها، وضعیت‌ها، دسترسی‌ها، خروجی‌ها، آپلودها و حالت‌های خطا** — طبق قاعدهٔ صفر regression؛ مواردی که در spec نبودند (مثلاً «میکروفون/تماس صوتی» منتور، تب‌های سه‌گانهٔ اعلان‌ها، آرشیو ≠ حذف) عمداً حفظ شدند.
- **ادغام دسترسی‌های ادمین و مدیر: انجام نشد** (رابط‌ها و navها مستقل ماندند — پین شده در manager.test/adminCore.test/flows.test «marketer cannot open the admin panel»).

## 7. زیرساخت — صریحاً دست‌نخورده

| مورد | وضعیت |
|---|---|
| Cloudflare Worker `seylane-sabz-learning` (bindings، کد) | بدون تغییر |
| D1 `seylane-sabz-db` / R2 `seylane-sabz-media` / migrations | بدون تغییر |
| Secrets / `APP_ENV=dev` در production (یافتهٔ شناخته‌شده) | **عمداً دست‌نخورده** (خارج از scope) |
| Cron (۵ محرک: قوانین/مهلت‌ها/خلاصهٔ هفتگی/…) | بدون تغییر |
| Deploy workflow (GitHub Actions / Wrangler) | بدون تغییر |
| Pages project بی‌ربط `my-website` (omidadli.site) | لمس نشده |
| PWA/service-worker pipeline، بیلد legacy، ffmpeg/codec prep | بدون تغییر |

**تست production:** هیچ ادعایی دربارهٔ production نمی‌شود — دسترسی مجاز Cloudflare در این محیط وجود نداشت؛ همهٔ شواهد از بیلد تولید + API محلی (seed واقعی) + Chromium واقعی است.

## 8. تأیید رسمی

تأیید می‌شود که در جریان این بازطراحی **هیچ فیچر، روت، دسترسی، قرارداد API، فیلد، اعتبارسنجی، وضعیت، خروجی، جریان آپلود یا حالت خطایی عمداً حذف یا پنهان نشده است**. تغییرات محصول منحصراً: توکن‌ها/تایپوگرافی/فاصله‌گذاری/شعاع/ارتفاع، بازسازی ظاهر primitiveها بدون تغییر قرارداد، بهبود سلسله‌مراتب/خوانایی/لحن نقش‌محور، و اصلاح اهداف لمسی به ≥۴۸px. هر regression مشاهده‌شده در حین مراحل برطرف شده و گیت‌های هر مرحله قبل از ادامه سبز بوده‌اند.

## 9. جمع‌بندی شمارش‌ها

- مراحل: ۱۰/۱۰ تکمیل ✅ (هر مرحله: گزارش + کامیت جدا + پوش)
- تست‌ها: 935 (380 web + 555 functions) + 20 e2e مرورگر واقعی = **955 سبز**
- a11y: 3 لایه، از جمله ۱۰/۱۰ اسکن axe پاک در مرورگر واقعی
- اسکرین‌شات: ۱۰ (شامل سه‌گانهٔ الزامی مارکتر-موبایل/مدیر-دسکتاپ/ادمین-دسکتاپ)

## 10. یادداشت‌های محیط اجرا (برای بازتولید نتایج روی checkout تازه)

- ترتیب لازم روی clone تازه: `npm ci` → `npm run build -w functions` (تولید `functions/lib/seed-snapshot.json` — فایل تولیدشده و gitignored؛ بدون آن typecheck/testهای functions خطا می‌دهند) → سپس گیت‌ها (`typecheck`/`lint`/`test`/`build`).
- پروژهٔ `mobile-webkit` از e2e در این محیط اجرا نشد (باینری WebKit قابل دانلود نبود)؛ در CI اجرا می‌شود. دو پروژهٔ Chromium (دسکتاپ + Pixel 7) اینجا ۲۰/۲۰ سبز اجرا شدند.
- اسکرین‌شات‌ها با Chromium سرور-less (از بستهٔ npm) روی بیلد تولید + API seed-شده گرفته شده‌اند؛ emojiهای سیستمی در این headless ممکن است tofu نشان دهند (محدودیت فونت مرورگر headless، نه باگ محصول).

---

## پیوست A — فایل‌های تغییر یافته به تفکیک مرحله (93 فایل در S0–S9 + S10)

_S10: `Button.tsx` (فقط قالب‌بندی Prettier)، `screenshots/` (۱۰ PNG)، این سند._

== S0 ==
- docs/design-handoff-v2/PHASE-ZERO-AUDIT.md
== S1 ==
- apps/web/index.html
- apps/web/src/components/admin/MediaPicker.tsx
- apps/web/src/components/admin/PublishGuide.tsx
- apps/web/src/components/brand/AppLogo.tsx
- apps/web/src/components/common/Field.tsx
- apps/web/src/components/common/JalaliDateField.tsx
- apps/web/src/components/common/NotificationPrefsCard.tsx
- apps/web/src/components/common/PageHeader.tsx
- apps/web/src/components/common/PushOptIn.tsx
- apps/web/src/components/common/PushOptInBanner.tsx
- apps/web/src/components/common/QueryState.tsx
- apps/web/src/components/common/ResidencePicker.tsx
- apps/web/src/components/layout/BottomNav.tsx
- apps/web/src/components/layout/Breadcrumb.tsx
- apps/web/src/components/layout/Sidebar.tsx
- apps/web/src/components/learning/MentorChat.tsx
- apps/web/src/components/learning/MentorSheet.tsx
- apps/web/src/components/learning/PackageCard.tsx
- apps/web/src/components/learning/VoiceCallSheet.tsx
- apps/web/src/components/reports/RetakeList.tsx
- apps/web/src/components/ui/Button.tsx
- apps/web/src/components/ui/EmptyState.tsx
- apps/web/src/components/ui/KpiCard.tsx
- apps/web/src/components/ui/ProgressRing.tsx
- apps/web/src/components/ui/StatusBadge.tsx
- apps/web/src/components/ui/Toast.tsx
- apps/web/src/components/ui/refresh.test.tsx
- apps/web/src/layouts/MarketerLayout.tsx
- apps/web/src/layouts/PanelLayout.tsx
- apps/web/src/layouts/RequireAuth.tsx
- apps/web/src/lib/excel.ts
- apps/web/src/pages/GalleryPage.tsx
- apps/web/src/pages/NotFoundPage.tsx
- apps/web/src/pages/admin/AssignmentsPage.tsx
- apps/web/src/pages/admin/AuditPage.tsx
- apps/web/src/pages/admin/AutomationRuleLogic.tsx
- apps/web/src/pages/admin/BrandDetailPage.tsx
- apps/web/src/pages/admin/MediaLibraryPage.tsx
- apps/web/src/pages/admin/MentorGuideDialog.tsx
- apps/web/src/pages/admin/MentorGuidesPage.tsx
- apps/web/src/pages/admin/NotificationsPage.tsx
- apps/web/src/pages/admin/PackageEditorPage.tsx
- apps/web/src/pages/admin/PushAutomationDetailPage.tsx
- apps/web/src/pages/admin/PushAutomationRunsPage.tsx
- apps/web/src/pages/admin/PushAutomationTracePage.tsx
- apps/web/src/pages/admin/PushAutomationsPage.tsx
- apps/web/src/pages/admin/PushAutomationsPanel.tsx
- apps/web/src/pages/admin/PushPreview.tsx
- apps/web/src/pages/admin/PushTemplatesTab.tsx
- apps/web/src/pages/admin/QuizBuilderPage.tsx
- apps/web/src/pages/admin/UsersPage.tsx
- apps/web/src/pages/auth/AuthPage.tsx
- apps/web/src/pages/m/CardsPage.tsx
- apps/web/src/pages/m/HomePage.tsx
- apps/web/src/pages/m/LearnPage.tsx
- apps/web/src/pages/m/MentorPage.tsx
- apps/web/src/pages/m/MessagesPage.tsx
- apps/web/src/pages/m/PackagePage.tsx
- apps/web/src/pages/m/QuizPage.tsx
- apps/web/src/pages/m/SectionPage.tsx
- apps/web/src/pages/manager/ManagerDashboard.tsx
- apps/web/src/styles/index.css
- docs/design-handoff-v2/STAGE-1-FOUNDATIONS.md
== S2 ==
- apps/web/src/components/admin/DataTable.tsx
- apps/web/src/components/common/Field.tsx
- apps/web/src/components/ui/Button.tsx
- apps/web/src/components/ui/Card.tsx
- apps/web/src/components/ui/FieldWrap.tsx
- apps/web/src/components/ui/Select.tsx
- apps/web/src/components/ui/StatusBadge.tsx
- apps/web/src/components/ui/Table.tsx
- apps/web/src/components/ui/Tabs.tsx
- apps/web/src/components/ui/Textarea.tsx
- apps/web/src/components/ui/index.ts
- apps/web/src/components/ui/primitives.test.tsx
- docs/design-handoff-v2/STAGE-2-PRIMITIVES.md
== S3 ==
- apps/web/src/components/brand/Mascot.tsx
- apps/web/src/pages/auth/AuthPage.tsx
- apps/web/src/pages/auth/OnboardingPage.tsx
- apps/web/src/pages/auth/StaffLoginPage.tsx
- apps/web/src/pages/auth/auth.test.tsx
- docs/design-handoff-v2/STAGE-3-AUTH-ONBOARDING.md
== S4 ==
- apps/web/src/components/learning/MentorChat.tsx
- apps/web/src/components/ui/EmptyState.tsx
- apps/web/src/pages/m/CardsPage.tsx
- apps/web/src/pages/m/HomePage.tsx
- apps/web/src/pages/m/LearnPage.tsx
- apps/web/src/pages/m/MentorPage.tsx
- apps/web/src/pages/m/MessagesPage.tsx
- apps/web/src/pages/m/marketer.test.tsx
- docs/design-handoff-v2/STAGE-4-MARKETER.md
== S5 ==
- apps/web/src/layouts/PanelLayout.tsx
- apps/web/src/pages/manager/ManagerDashboard.tsx
- apps/web/src/pages/manager/manager.test.tsx
- docs/design-handoff-v2/STAGE-5-MANAGER.md
== S6 ==
- apps/web/src/pages/admin/UsersPage.tsx
- apps/web/src/pages/admin/adminCore.test.tsx
- docs/design-handoff-v2/STAGE-6-ADMIN-CORE.md
== S7 ==
- apps/web/src/pages/admin/QuizBuilderPage.tsx
- apps/web/src/pages/admin/adminContent.test.tsx
- docs/design-handoff-v2/STAGE-7-ADMIN-CONTENT.md
== S8 ==
- apps/web/src/pages/admin/PushAutomationDetailPage.tsx
- apps/web/src/pages/admin/PushTemplatesTab.tsx
- apps/web/src/pages/admin/notifications.test.tsx
- docs/design-handoff-v2/STAGE-8-PUSH-AUTOMATIONS.md
== S9 ==
- apps/web/src/components/common/ResidencePicker.tsx
- apps/web/src/pages/admin/ArchivePage.tsx
- apps/web/src/pages/admin/governance.test.tsx
- apps/web/src/pages/m/profile.test.tsx
- docs/design-handoff-v2/STAGE-9-GOVERNANCE-PROFILE.md
