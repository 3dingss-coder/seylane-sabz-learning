# پرامپت: ساخت سیستم اتوماسیون پوش‌نوتیفیکیشن + پنل مدیریت (سیلانه سبز لرنینگ)

> این متن را کامل در ChatGPT (ترجیحاً Codex / حالت Agent با دسترسی به ریپو) بچسبان.
> اگر ChatGPT به ریپو دسترسی ندارد، فایل‌هایی را که در بخش «۱. اول این فایل‌ها را بخوان» آمده کنارش بفرست.

---

## نقش و روش کار

تو یک مهندس ارشد Full‑Stack (TypeScript، Cloudflare Workers، React) هستی. روی ریپوی
`3dingss-coder/seylane-sabz-learning` کار می‌کنی (monorepo: `functions/` = بک‌اند Worker، `apps/web/` = React/Vite، RTL فارسی).

روش کار اجباری:
1. **مرحله A (بدون هیچ کدی):** ریپو را بخوان و گزارش «نیازسنجی و طراحی» بده (بخش ۹).
2. **مرحله B:** بعد از تأیید من، در PRهای کوچک و مستقل پیاده‌سازی کن (بخش ۱۰).
3. هر ادعایی درباره کد باید با نام فایل و تابع همراه باشد. اگر چیزی را نتوانستی بخوانی، حدس نزن؛ بگو «تأیید نشده».
4. همه متن‌های رابط کاربری و پیام‌ها فارسی، راست‌به‌چپ، و در همان سبک فعلی پنل باشد.

---

## ۱. اول این فایل‌ها را بخوان

| فایل | چرا |
|---|---|
| `functions/src/services/notify.ts` | `notifyUsers`، `notifyTemplate`، `DEFAULT_TEMPLATES`، throttle، ساعت سکوت، `flushDeferredPush`، `registerDevice` |
| `functions/src/services/push-campaigns.ts` | الگوی کامل کمپین دستی: batch، idempotency، claim، budget، `runPushCampaigns`، `sanitizeError`، `isSafeInternalPath`، `isSafeImageUrl` |
| `functions/src/push/fcm-http.ts`, `push/types.ts` | ارسال واقعی با FCM HTTP v1 و `UnconfiguredPushSender` |
| `functions/src/services/cron.ts` + `wrangler.toml` (`crons`) | جدول `JOBS` و `CRON_JOBS`؛ تست `functions/test/cron.test.ts` این دو را همگام نگه می‌دارد |
| `functions/src/services/jobs.ts` | `runDeadlineSweep`، `runDailyReminders`، `runWeeklyDigest` (اتوماسیون‌های فعلی) |
| `functions/src/services/behavior.ts`, `mentor-rules.ts` | قانون‌های B1–B12 و nudgeها |
| `functions/src/domain/types.ts` | `NotificationType`، `Notification`، `DeviceToken`، `Policy`، `PushCampaign*` |
| `functions/src/routes/admin.ts` | روت‌های `/v1/admin/push-campaigns` و الگوی `requireRole`، `audit` |
| `apps/web/src/pages/admin/PushCampaignsPage.tsx`, `PushCampaignEditorPage.tsx`, `pushCampaignModel.ts`, `AdminRoutes.tsx` | UI فعلی و نحوه ثبت مسیرها |
| `apps/web/src/components/admin/PushNotificationPreview.tsx`, `ConfirmDialog.tsx`, `DataTable.tsx` | کامپوننت‌های قابل استفاده مجدد |
| `docs/admin-push-campaign-setup.md`, `docs/admin-push-campaign-api.md` | معماری و قرارداد سیستم کمپین |
| `functions/test/notify.test.ts`, `push-campaigns.test.ts`, `cron.test.ts` | سبک تست‌ها |

---

## ۲. وضعیت فعلی (بررسی‌شده؛ فرض نکن، دوباره راستی‌آزمایی کن)

**آنچه الان وجود دارد**
- ارسال واقعی پوش با **FCM HTTP v1** (Secret با نام `FCM_SERVICE_ACCOUNT_JSON`). اگر Secret نباشد، `UnconfiguredPushSender` خطا می‌دهد و چیزی «موفق» ثبت نمی‌شود.
- **استودیوی کمپین‌های Push** در پنل ادمین: پیش‌نویس، زمان‌بندی، ارسال فوری با `Idempotency-Key`، batch ۲۵ نفره، حداکثر ۸ batch در هر اجرای cron، گزارش (`attempted/accepted/failed/invalid/noDevice`)، آرشیو، قفل خوش‌بینانه با `version`.
- پنل: منوی «کمپین‌های Push» → `/admin/push-campaigns` (لیست)، `/new`، `/:id`.
- ۴ Cron Trigger در `wrangler.toml`: `*/15 * * * *` (flush-push، push-campaigns، knowledge-reindex، migrate-blobs)، `0 * * * *` (deadline-sweep، weekly-digest)، `30 4 * * *` (mentor-daily)، `30 6 * * *` (daily-reminders). UTC است؛ تهران = UTC+3:30.
- نوتیف‌های سیستمی با `notifyTemplate`: welcome، new_assignment، deadline_warning، deadline_passed، reminder، quiz_passed، quiz_failed، retake_request، retake_reviewed، manager_message، weekly_digest، badge_earned، escalation، manual. قالب‌ها قابل ویرایش‌اند.
- ساعت سکوت (`policy.quietHours`)، منطقه زمانی (`policy.timezone`)، throttle با `throttleKey` در `notification_log`.
- ذخیره‌سازی: D1 با یک جدول `docs(col, id, grp, data, updated_at)`؛ **migration جدید SQL لازم نیست**، collectionهای جدید فقط با `col` تازه ساخته می‌شوند.

**داده زنده (D1 پروداکشن در زمان بررسی):** ۱۴۱ کاربر، ۱۸ توکن دستگاه (همه `web`، هیچ `android`)، ۸ کمپین (۵ sent، ۲ sent_with_errors، ۱ failed)، ۷۶۵ نوتیف.
بنابراین: **کانال عملاً Web Push است** و مدیریت خطا و `invalid token` مهم است.

**شکاف‌ها (دقیقاً همین‌ها را باید ببندی)**
1. قانون‌های رفتاری B1–B12 و nudgeهای منتور فقط یک `behavior_interventions` / کارت داخل اپ می‌سازند و **پوش نمی‌فرستند** (فقط `escalation` از `notifyUsers` استفاده می‌کند).
2. هیچ پنلی برای روشن/خاموش کردن، تنظیم زمان‌بندی یا ویرایش اتوماسیون‌ها نیست؛ همه‌چیز در کد ثابت است.
3. `NotificationType` یک union بسته است؛ نوع جدیدی برای اتوماسیون‌ها وجود ندارد.
4. `policy.reminderInactiveDays` فقط یک عدد است؛ پله‌های ۱/۲/۳/۷ روز ندارد.
5. سقف روزانه/هفتگی پوش برای هر کاربر، حداقل فاصله بین دو پوش و ادغام پیام‌ها وجود ندارد.
6. ترجیح کاربر برای خاموش‌کردن دسته‌ها وجود ندارد (`notification_prefs`).
7. `users.lastActiveAt` فقط در بعضی مسیرها به‌روز می‌شود (`users.ts` حوالی خط ۲۷۴ و مسیر یادگیری، best‑effort). برای سناریوهای «سایت را باز نکرد» باید **هنگام باز شدن اپ** هم به‌روز شود.
8. ممکن است برای یک رویداد دو مسیر همزمان پوش بفرستند (مثلاً `runDailyReminders` قدیمی و اتوماسیون جدید `inactive_1d`). باید **جلوی دوباره‌کاری** گرفته شود.
9. تأیید نشده: وجود واقعی Cron Trigger روی Worker زنده، و وجود Secret FCM. پنل جدید باید «سلامت سیستم» را نشان دهد تا من مجبور نباشم داشبورد Cloudflare را باز کنم.

---

## ۳. هدف

یک **موتور اتوماسیون پوش‌نوتیفیکیشن** + یک **پنل مدیریت ساده** بساز، به‌صورت زیرمجموعه تب «کمپین‌های Push» (همان صفحه، با کامپوننت `Tabs` موجود در `@/components/common/Field`):

- تب ۱: «کمپین‌ها» (همان صفحه فعلی، بدون تغییر رفتار)
- تب ۲: **«اتوماسیون»** (جدید)

خواسته‌های من (مدیر سیستم، غیرفنی):
1. بتوانم هر اتوماسیون را با **یک سوییچ** فعال/غیرفعال کنم.
2. با پر کردن **چند فرم ساده** یک اتوماسیون جدید بسازم (بدون دانش فنی).
3. هر چیزی که برای کنترل، پایش و عیب‌یابی لازم است در پنل باشد (بخش ۶).
4. ۲۷ سناریوی بخش ۸ اولین چیزهایی هستند که باید اتومات شوند.

---

## ۴. اصول سخت (Non‑negotiables)

1. **هیچ ارسالی فقط با deploy اتفاق نیفتد.** همه اتوماسیون‌های جدید با `enabled=false` seed می‌شوند. فقط اتوماسیون‌های سیستمی که الان فعالند (مثل `quiz_passed`) رفتار فعلی‌شان را حفظ می‌کنند.
2. **بدون ارسال تکراری.** هر (اتوماسیون، کاربر، پنجره زمانی) یک claim idempotent دارد (الگوی `push_campaign_claims`).
3. **retry فقط وقتی FCM هنوز صدا زده نشده** (همان قاعده کمپین‌ها). نتیجه نامشخص = دوباره ارسال نشود.
4. **رعایت ساعت سکوت** با مکانیزم موجود `deliverAfter`؛ فقط اولویت `urgent` طبق قاعده فعلی مجاز به عبور است.
5. **سقف سراسری**: پیش‌فرض حداکثر ۲ پوش در روز و ۱۰ پوش در هفته برای هر کاربر، و حداقل ۴ ساعت فاصله بین دو پوش؛ اولویت `urgent` از فاصله مستثناست. اولویت‌ها: urgent > high > normal > low. اگر چند اتوماسیون همزمان واجد شرایط بودند، بالاترین اولویت پوش می‌شود و بقیه فقط «داخل اپ» می‌شوند یا به روز بعد می‌روند (دلیل را در log ثبت کن).
6. **اعلان داخل اپ همیشه ساخته می‌شود**؛ پوش، لایه‌ای اضافه است (همان رفتار `notifyUsers`).
7. هیچ PII، توکن FCM، ایمیل یا شماره موبایل در payload، لاگ یا گزارش نیاید (`sanitizeError`).
8. `actionRef` فقط مسیر داخلی امن (همان اعتبارسنجی `isSafeInternalPath`). فهرست مجاز را با مسیرهای واقعی router وب تطبیق بده و در صورت نیاز مسیرهای معتبر مثل `/manager` را به allowlist **اتوماسیون** اضافه کن (نه به شکلی که امنیت کمپین‌ها ضعیف شود).
9. کاربر غیرفعال/معلق (`status ≠ active`) هیچ پوشی نگیرد.
10. **هزینه صفر یا حداقل:** طراحی باید روی پلن رایگان Cloudflare هم کار کند: تعداد subrequest و کوئری D1 در هر اجرای cron محدود و budget‑دار باشد (مثل `MAX_BATCHES_PER_RUN`)، و **اسکن کامل ۱۴۱+ کاربر در هر ۱۵ دقیقه ممنوع** مگر با کوئری فیلترشده و کم‌هزینه.
11. هیچ Secret یا مقدار حساسی در گیت یا مستندات نوشته نشود.
12. هیچ تغییر مخربی در رفتار کمپین‌های دستی فعلی و تست‌های موجود نباشد.

---

## ۵. معماری پیشنهادی (اگر بهتر دیدی، با دلیل تغییر بده)

### ۵.۱ مدل داده (collectionهای جدید در `docs`)

```ts
type AutomationTriggerKind =
  | 'event'          // بلافاصله بعد از یک اتفاق در کد
  | 'event_delay'    // چند دقیقه/ساعت بعد از یک اتفاق
  | 'inactivity'     // N روز بدون فعالیت (پله‌ای)
  | 'schedule_daily' // هر روز در ساعت مشخص (تهران)
  | 'schedule_weekly'// هر هفته در روز و ساعت مشخص
  | 'condition';     // شرط وضعیتی روی هر sweep (مثلاً پیشرفت ≥ ۸۰٪)

interface PushAutomation {
  key: string;                 // یکتا، مثل 'inactive_1d'
  name: string;                // نام فارسی
  description: string;
  category: string;            // دسته‌بندی برای فیلتر
  audienceRole: 'marketer' | 'manager' | 'admin' | 'all';
  enabled: boolean;
  isSystem: boolean;           // seed شده؛ حذف‌شدنی نیست، فقط غیرفعال می‌شود
  supersedes?: string[];       // کلید کدهای قدیمی که باید خاموش شوند تا تکراری نشود
  trigger: {
    kind: AutomationTriggerKind;
    event?: string;            // نام رویداد، مثل 'quiz.failed'
    delayMinutes?: number;
    inactivityDays?: number;
    ladderGroup?: string;      // پله‌های یک گروه: در هر دوره بی‌فعالیتی فقط بالاترین پله مشمول
    time?: string;             // 'HH:mm' تهران
    weekday?: number;          // 0=یکشنبه … 6=شنبه (هماهنگ با Policy)
    conditions?: Array<{ field: string; op: 'gte'|'lte'|'eq'|'neq'; value: number|string|boolean }>;
  };
  audience: { type: 'all'|'team'|'role'|'user'; targetId: string | null; channel: 'any'|'web'|'android' };
  message: { title: string; body: string; actionRef: string; imageUrl: string | null };
  delivery: {
    priority: 'urgent'|'high'|'normal'|'low';
    push: boolean;             // اگر false فقط داخل اپ
    inApp: boolean;
    respectQuietHours: boolean;
    cooldownMs: number;        // حداقل فاصله همین اتوماسیون برای همین کاربر
    maxPerUserPerDay?: number;
    sendOnce?: boolean;        // یک بار در عمر کاربر (مثل first_course_done)
    aggregateForManager?: boolean; // برای مدیر، یک پیام خلاصه به‌جای N پیام
  };
  version: number;             // قفل خوش‌بینانه مثل کمپین‌ها
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string;
  stats?: { lastRunAt: string|null; sent7d: number; accepted7d: number; skipped7d: number };
}
```

collectionها:
- `push_automations/<key>` — تعریف
- `push_automation_settings/global` — قوانین سراسری (سقف روزانه/هفتگی، حداقل فاصله، kill‑switch `paused`، ساعت‌های پیش‌فرض)
- `push_automation_runs/<id>` — هر اجرای sweep: `{key, startedAt, finishedAt, evaluated, matched, sent, skipped:{cap, cooldown, quiet, optedOut, noDevice, inactiveUser, duplicate}, failed, error}`
- `push_automation_claims/<hash(key|userId|windowKey)>` — idempotency + ثبت «آخرین ارسال»
- `push_automation_queue/<id>` — برای `event_delay`: `{key, userId, dueAt, vars, status}`
- `push_automation_decisions/<id>` — لاگ تصمیم برای عیب‌یابی («چرا ارسال نشد؟») با TTL (مثلاً ۳۰ روز)
- `notification_prefs/<userId>` — ترجیح کاربر: دسته‌های خاموش (مهلت‌ها همیشه روشن)

نوع جدید `NotificationType`: `'automation'` (و در data پوش: `automationKey`).

### ۵.۲ موتور

- تابع واحد `fireAutomationEvent(d, event, userId, vars)` برای تریگرهای رویدادی؛ از نقاط واقعی کد فراخوانی شود (آزمون، تکمیل قسمت/بسته، تخصیص، نشان، ثبت‌نام، پیام مدیر…). قبل از ارسال: بررسی `enabled`، kill‑switch، کاربر فعال، ترجیح کاربر، cooldown/sendOnce، سقف‌های سراسری، ساعت سکوت.
- Jobهای زمان‌بندی‌شده با **جدول `JOBS` و `CRON_JOBS` موجود** (و به‌روزرسانی `wrangler.toml` + `cron.test.ts`): یک job جدید `push-automations` روی `*/15 * * * *` که: (۱) صف `event_delay` را می‌خواند، (۲) اتوماسیون‌های `schedule_*`/`inactivity`/`condition` را فقط وقتی «پنجره زمانی»شان رسیده ارزیابی می‌کند (با `windowKey` مثل `2026-10-10` یا `2026-W41`)، (۳) budget و deadline دارد.
- ارسال از طریق همان `notifyUsers` (نه یک مسیر جدید) تا quiet hours، deferral، invalid token cleanup و `pushStatus` یکسان بماند.
- **اتوماسیون‌های سیستمی موجود** (quiz_passed، deadline_warning …): متن همچنان از `DEFAULT_TEMPLATES` / ویرایشگر قالب فعلی می‌آید (دوباره‌کاری نکن)؛ پنل فقط سوییچ فعال/غیرفعال، اولویت، سقف و آمار را روی آن‌ها اضافه می‌کند. `notifyTemplate` قبل از ارسال وضعیت `enabled` همان کلید را بررسی کند.
- قانون‌های B1–B12: همان تولید `behavior_interventions` بماند (کارت داخل اپ)، ولی **تحویل پوش** از طریق اتوماسیون متناظر انجام شود تا سقف و کنترل یکپارچه باشد.
- `supersedes`: وقتی اتوماسیون جدید فعال است، job قدیمی معادل (مثلاً بخش «reminder» در `runDailyReminders`) آن کاربر را دوباره پوش نکند.
- برای `lastActiveAt`: یک ثبت سبک و throttle‌شده (مثلاً حداکثر هر ۱۰ دقیقه برای هر کاربر) هنگام باز شدن اپ/refresh نشست اضافه کن، بدون افزایش محسوس نوشتن D1.

---

## ۶. پنل مدیریت (تب «اتوماسیون»)

مسیرها: `/admin/push-campaigns/automations` ، `/automations/new` ، `/automations/:key` ؛ در `AdminRoutes.tsx` ثبت شود و تب‌ها در `PushCampaignsPage` با `Tabs` ساخته شوند. فقط admin/superadmin.

### ۶.۱ صفحه لیست
- بالای صفحه: **کارت سلامت سیستم** (سبز/قرمز): «سرویس Push پیکربندی است؟»، «آخرین اجرای cron چه زمانی بود؟»، «اتوماسیون فعال: N»، «ارسال ۲۴ ساعت اخیر»، «نرخ پذیرش»، «توکن‌های نامعتبر پاک‌شده».
- **کلید اضطراری «توقف همه اتوماسیون‌ها»** با ConfirmDialog و بازگشت یک‌کلیکی.
- جدول/کارت‌ها گروه‌بندی‌شده بر اساس دسته، ستون‌ها: سوییچ فعال/غیرفعال، نام، مخاطب، «چه زمانی» (جمله‌ی فارسی خوانا)، اولویت، آخرین اجرا، ارسال ۷ روز، نرخ پذیرش.
- فیلتر: دسته، مخاطب، وضعیت (فعال/غیرفعال)، اولویت، سیستمی/دستی؛ جستجو؛ عملیات گروهی (فعال/غیرفعال دسته‌ای).
- هر ردیف: ویرایش، **ارسال آزمایشی به خودم**، **اجرای خشک (Dry‑run)**، تکثیر، تاریخچه اجرا.
- سوییچ فعال‌کردن: قبل از فعال‌سازی نمایش بده «تقریباً N نفر الان مشمول می‌شوند» (از dry‑run). غیرفعال‌کردن اتوماسیون‌های حیاتی (مهلت‌ها) نیاز به تأیید دارد.

### ۶.۲ فرم ساخت (ویزارد ۴ مرحله‌ای، ساده)
1. **چه زمانی؟** — انتخاب از فهرست دوستانه (نه کد): «وقتی کاربر در آزمون رد شد»، «N روز بی‌فعالیتی»، «X ساعت مانده به مهلت»، «هر روز ساعت …»، «هر هفته روز … ساعت …»، «وقتی پیشرفت از …٪ گذشت» و … + تأخیر اختیاری.
2. **به چه کسی؟** — نقش، تیم یا کاربر مشخص، کانال (همه/وب/اندروید)، و شرط‌های ساده (مثلاً «فقط اگر آموزش فعال دارد»). نمایش زنده «حدود N نفر».
3. **چه پیامی؟** — عنوان (۲–۸۰) و متن (۲–۳۰۰)، دکمه‌های متغیر `{name} {title} {section} {percent} {days} {hours} {score} {deadline} …`، انتخاب لینک مقصد از فهرست مجاز، تصویر اختیاری، **پیش‌نمایش زنده** با `PushNotificationPreview`.
4. **قوانین ارسال** — اولویت، «فقط داخل اپ / پوش + داخل اپ»، فاصله تکرار (cooldown)، سقف روزانه، رعایت ساعت سکوت، «فقط یک بار». در انتها یک جمله خلاصه: «وقتی … به … این پیام را بفرست.» و دکمه‌های «ذخیره پیش‌نویس»، «ارسال آزمایشی»، «فعال‌سازی».
- اعتبارسنجی سرور و کلاینت مثل کمپین‌ها، قفل خوش‌بینانه با `version`، دکمه‌های غیرفعال هنگام ذخیره.

### ۶.۳ ابزارهای عیب‌یابی و کنترل (حتماً)
- **تاریخچه اجرا** هر اتوماسیون: چند نفر بررسی، چند نفر مشمول، چند ارسال، و دلیل نشدن‌ها (سقف روزانه، cooldown، ساعت سکوت، خاموش‌کردن توسط کاربر، بدون دستگاه، کاربر غیرفعال، تکراری).
- **«چرا این کاربر پوش نگرفت؟»**: جستجوی کاربر (با نمایش تلفن/ایمیل کنار نام مثل `UsersPage`) → ۳۰ تصمیم اخیر.
- **قوانین سراسری** (دیالوگ): سقف روزانه/هفتگی، حداقل فاصله، ساعت‌های پیش‌فرض ارسال، kill‑switch، لینک به ساعت سکوت در «سیاست‌ها».
- **Dry‑run** و **ارسال آزمایشی** (فقط به دستگاه‌های خود ادمین).
- **ثبت audit** برای ساخت/ویرایش/فعال/غیرفعال/توقف کلی (مثل `audit(d, actor, 'push_automation.enabled', …)`) تا در صفحه Audit دیده شود.
- **هشدار خودکار به ادمین** اگر نرخ شکست پوش > ۲۰٪ شد یا cron بیش از ۳۰ دقیقه اجرا نشد (می‌تواند همان سناریوی `push_failure_rate` باشد).
- **نسخه‌گذاری متن**: نگهداری ۵ ویرایش آخر هر پیام و بازگردانی.

### ۶.۴ بخشی که کاربر نهایی می‌بیند
- در پروفایل: «تنظیمات اعلان» با سوییچ دسته‌ها (یادآوری مهلت‌ها همیشه روشن)، ساعت ترجیحی اختیاری، و نمایش وضعیت اجازه Push مرورگر (بنر opt‑in فعلی را خراب نکن).

---

## ۷. API (الگوی کمپین‌ها؛ زیر `/v1/admin/push-automations`، فقط admin+)

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/overview` | سلامت سیستم، شمارش‌ها، آمار ۲۴ ساعت |
| GET | `/` | فهرست با فیلتر و cursor |
| POST | `/` | ساخت (پیش‌نویس) |
| GET | `/:key` | جزئیات + آمار |
| PATCH | `/:key` | ویرایش با `version` (۴۰۹ در تعارض) |
| POST | `/:key/enable` · `/:key/disable` | فعال/غیرفعال (با audit) |
| POST | `/:key/dry-run` | بدون ارسال: چند نفر و چه کسانی (فقط شناسه/نام کوتاه) |
| POST | `/:key/test-send` | ارسال آزمایشی فقط به دستگاه‌های ادمین |
| GET | `/:key/runs` | تاریخچه اجرا |
| GET · PATCH | `/settings` | قوانین سراسری |
| POST | `/pause-all` · `/resume-all` | kill‑switch |
| GET | `/trace?userId=` | ۳۰ تصمیم اخیر برای یک کاربر |
| GET · PATCH | `/me/notification-prefs` (مسیر کاربر) | ترجیحات کاربر نهایی |

رعایت: `requireRole(admin+)`، rate limit مناسب برای test‑send، خطای استاندارد `{ error: { code, message, details } }` مثل کمپین‌ها.

---

## ۸. کاتالوگ اولیه: ۲۷ سناریوی انتخاب‌شده توسط من

همه با `enabled=false` seed شوند، مگر «سیستمی/موجود» که رفتار فعلی‌شان حفظ می‌شود.
ساعت‌ها به وقت تهران. «hook» یعنی کدام نقطه از کد باید رویداد/نتیجه را بدهد (در مرحله A دقیقاً تأیید کن).

| # | key | مخاطب | تریگر و زمان | متن | لینک | اولویت | Cooldown | وضعیت/hook |
|---|---|---|---|---|---|---|---|---|
| 1 | `inactive_1d` | بازاریاب | inactivity ≥ ۱ روز، آموزش فعال دارد، روزانه ۱۰:۰۰ | سلام {name}، امروز هنوز سر نزده‌ای. فقط ۵ دقیقه از «{section}» را ببین و ادامه بده. | `/sections/{sectionId}` | normal | ۲۴ س | نیمه‌موجود؛ جایگزین بخش reminder در `runDailyReminders` (`supersedes`) |
| 2 | `inactive_2d` | بازاریاب | inactivity ≥ ۲ روز، ۱۰:۰۰ | دو روز گذشت و پیشرفتت روی {percent}٪ مانده. با یک قسمت کوتاه ادامه بده. | `/packages/{packageId}` | normal | ۴۸ س | جدید |
| 3 | `inactive_3d` | بازاریاب | inactivity ≥ ۳ روز (B5)، ۱۰:۰۰ | {days} روز است آموزش‌ها را باز نکرده‌ای. فقط ۵ دقیقه وقت بگذار و «{section}» را ببین. | `/packages/{packageId}` | high | ۷۲ س | فقط کارت؛ hook: `behavior.ts` B5 |
| 4 | `inactive_7d` | بازاریاب | inactivity ≥ ۷ روز، ۱۰:۰۰ | یک هفته است نیستی. مدیرت هم منتظر توست؛ امروز یک قدم کوچک بردار. | `/packages/{packageId}` | high | ۷ روز | جدید |
| 5 | `never_started_24h` | بازاریاب | event_delay: ۲۴ ساعت بعد از ثبت‌نام و progress=۰ | حسابت آماده است. اولین درس فقط ۵ دقیقه طول می‌کشد؛ همین حالا شروع کن. | `/packages/{packageId}` | high | یک‌بار | جدید؛ hook: ثبت‌نام |
| 6 | `evening_nudge` | بازاریاب | schedule_daily ۱۸:۰۰، امروز فعالیت ندارد، آموزش فعال دارد | امروز هنوز آموزشی ندیده‌ای؛ قبل از شب یک قسمت کوتاه ببین. | `/` | low | ۲۴ س | جدید؛ پیش‌فرض خاموش و opt‑in |
| 7 | `preferred_time` | بازاریاب | ساعت پیک فعالیت ۱۴ روز اخیر کاربر | وقت همیشگی یادگیری توست. آماده‌ای؟ | `/` | low | ۲۴ س | جدید، **سخت**؛ در نسخه ۲ یا پشت فلگ |
| 8 | `week_start` | بازاریاب | schedule_weekly شنبه ۰۹:۰۰ | هفته جدید شروع شد. این هفته {n} آموزش داری؛ از «{title}» شروع کن. | `/` | normal | ۶ روز | جدید |
| 9 | `overdue_daily` | بازاریاب | condition: مهلت گذشته و ناتمام (B2)، روزانه ۱۰:۰۰ | مهلت «{title}» گذشته و {left}٪ مانده. همین امروز تمامش کن. | `/packages/{packageId}` | high | ۲۴ س | فقط کارت؛ hook: B2 |
| 10 | `package_updated` | بازاریاب | event: انتشار نسخه جدید بسته | محتوای «{title}» به‌روز شد؛ یک نگاه بینداز. | `/packages/{packageId}` | low | ۲۴ س | جدید؛ hook: ویرایش/انتشار بسته |
| 11 | `quiz_passed` | بازاریاب | event: قبولی در آزمون | آفرین! در آزمون «{title}» با نمره {score} قبول شدی. | `/packages/{packageId}` | normal | — | **موجود/سیستمی** (`learning.ts`) |
| 12 | `quiz_failed` | بازاریاب | event: رد شدن | اشکالی ندارد. «{title}» را یک بار مرور کن و دوباره امتحان بده. | `/packages/{packageId}` | normal | — | **موجود/سیستمی** |
| 13 | `quiz_failed_nudge` | بازاریاب | event_delay ۲ ساعت بعد از رد شدن (B3) | نزدیک بودی. یک بار متن قسمت را مرور کن و دوباره امتحان بده. | `/quiz/{quizId}` | normal | ۴۸ س | فقط کارت؛ hook: B3 |
| 14 | `section_ready_quiz` | بازاریاب | event_delay ۳۰ دقیقه بعد از اتمام محتوای قسمت، آزمون هنوز داده نشده | محتوای «{section}» را تمام کردی. آزمونش آماده است. | `/quiz/{quizId}` | normal | ۲۴ س | جدید |
| 15 | `stalled_section` | بازاریاب | event_delay ۲ ساعت بعد از آخرین فعالیت، پیشرفت < ۲۵٪ (B6) | قسمت «{section}» را نصفه رها کرده‌ای ({percent}٪). از همان‌جا ادامه بده. | `/sections/{sectionId}` | normal | ۴۸ س | فقط کارت؛ hook: B6 |
| 16 | `near_completion` | بازاریاب | condition: پیشرفت ≥ ۸۰٪ (B7)، روزانه ۱۸:۰۰ | «{title}» {percent}٪ پیش رفته؛ یک قدم تا تکمیل مانده. | `/packages/{packageId}` | normal | ۲۴ س | فقط کارت؛ hook: B7 |
| 17 | `two_fails_mentor` | بازاریاب | event: دومین شکست متوالی در یک آزمون | اگر قسمتی گنگ است، با منتور هوشمند تمرینش کن. | `/mentor` | high | ۲۴ س | جدید |
| 18 | `quiz_abandoned` | بازاریاب | event_delay ۳۰ دقیقه: آزمون شروع شد ولی ثبت نهایی نشد | آزمون «{title}» نیمه‌کاره ماند. هنوز می‌توانی ادامه بدهی. | `/quiz/{quizId}` | high | ۲۴ س | جدید؛ نیازمند ثبت «شروع تلاش» (تأیید کن موجود است) |
| 19 | `badge_earned` | بازاریاب | event: نشان جدید | نشان «{title}» را گرفتی. | `/cards` | low | — | **موجود/سیستمی**؛ پیش‌فرض فقط داخل اپ |
| 20 | `streak_5` | بازاریاب | condition: streak ≥ ۵ (B8)، روزانه ۱۹:۰۰ | {days} روز پیوسته یاد گرفته‌ای. امروز هم یک قسمت کوتاه ببین تا رشته قطع نشود. | `/` | low | ۲۴ س | فقط کارت؛ hook: B8 |
| 21 | `streak_at_risk` | بازاریاب | condition: streak ≥ ۳ و امروز فعالیت ندارد، روزانه ۲۰:۳۰ | زنجیره {days} روزه‌ات امشب قطع می‌شود. یک قسمت کوتاه کافی است. | `/` | high | ۲۴ س | جدید |
| 22 | `team_rank_change` | بازاریاب | schedule_weekly شنبه ۰۹:۰۰: ورود به ۳ نفر برتر یا تغییر رتبه ≥ ۲ | رتبه تو در تیم به {rank} رسید. | مسیر واقعی لیدربورد/`/cards` را از router تأیید کن | low | ۷ روز | جدید |
| 23 | `first_course_done` | بازاریاب | event: اولین بسته completed | اولین آموزشت را تمام کردی. شروع عالی‌ای بود! | `/cards` | normal | یک‌بار | جدید |
| 24 | `weekly_digest` | مدیر | schedule_weekly شنبه ۰۹:۰۰ (+ایمیل) | خلاصه هفتگی: {count} نفر از تیم شما عقب هستند. | `/manager` | high | ۶ روز | **موجود/سیستمی** (`runWeeklyDigest`) |
| 25 | `manager_inactive_7d` | مدیر | inactivity ≥ ۷ روز اعضای تیم، روزانه ۱۰:۰۰، **aggregate**: یک پیام برای هر مدیر | {count} نفر از تیم شما ۷ روز است فعالیتی نداشته‌اند. یک پیام کوتاه می‌تواند کمک کند. | `/manager` | high | ۷ روز | جدید |
| 26 | `manager_member_joined` | مدیر | event: عضو جدید به تیم افزوده شد | {name} به تیم شما پیوست. | `/manager` | low | — | جدید؛ پیش‌فرض فقط داخل اپ |
| 27 | `manager_score_drop` | مدیر | schedule_weekly شنبه ۰۹:۰۰: افت میانگین نمره تیم > ۱۰٪ | میانگین نمرات تیم این هفته {delta}٪ کمتر شد. | `/manager` | normal | ۷ روز | جدید |

نکات کاتالوگ:
- پله‌های بی‌فعالیتی (`inactive_1d/2d/3d/7d`) در یک `ladderGroup` هستند: در هر «دوره بی‌فعالیتی» (تا وقتی `lastActiveAt` تغییر نکرده) هر پله حداکثر یک بار و فقط پله‌ی بالاترین مشمول ارسال شود. با ورود دوباره کاربر، دوره ریست می‌شود.
- متغیرهایی مثل `{section}`, `{percent}` باید از داده واقعی (قسمت بعدی پیشنهادی، پیشرفت واقعی) پر شوند؛ اگر متغیری قابل پر شدن نبود، ارسال را رد کن (log: `missingVariable`) نه اینکه متن ناقص برود.
- سناریوهای دیگر فایل اکسل (۷۱ مورد بعدی) در این نسخه نیستند؛ ولی **ساختار seed و موتور باید طوری باشد که اضافه‌کردن آن‌ها فقط افزودن یک آیتم به کاتالوگ/ساخت از فرم باشد.**

---

## ۹. مرحله A: خروجی گزارش نیازسنجی (قبل از هر کد)

گزارش کوتاه و ساخت‌یافته بده:
1. **نقشه نقاط hook:** برای هر رویداد کاتالوگ، دقیقاً کدام تابع/فایل باید `fireAutomationEvent` را صدا بزند، و کدام رویدادها هنوز در کد وجود ندارند (مثل «شروع تلاش آزمون»).
2. **راستی‌آزمایی شکاف‌های بخش ۲** (درست/نادرست، با ارجاع به فایل).
3. **فهرست کامل چیزهایی که برای مدیریت این سیستم لازم است** و در بخش ۶ نیامده؛ حداقل این‌ها را بررسی و با موارد جدید کامل کن: kill‑switch، dry‑run، ارسال آزمایشی، trace کاربر، سقف‌ها، cooldown، ترجیح کاربر، پنجره‌های زمانی/منطقه زمانی، کاتالوگ متغیرها، audit، سلامت FCM/cron، هشدار خرابی، پاکسازی توکن، نسخه‌گذاری متن، جلوگیری از تداخل با jobهای قدیمی، TTL لاگ‌ها، حریم خصوصی.
4. **برآورد هزینه/حد پلن رایگان:** تعداد کوئری D1 و subrequest در هر اجرای cron در بدترین حالت (۱۴۱ کاربر امروز، و ۲٬۰۰۰ کاربر در آینده) و راهکار کاهش (ایندکس‌های منطقی روی `docs`، sweepهای افزایشی، cursor).
5. **ریسک‌ها و تصمیم‌های لازم از من** (حداکثر ۵ سؤال، هر کدام با پیشنهاد پیش‌فرض).
6. **طرح تقسیم به PRها** با ترتیب و معیار پذیرش هر PR.

منتظر تأیید من بمان.

---

## ۱۰. مرحله B: مراحل پیاده‌سازی (هر مورد یک PR کوچک، با تست)

1. **PR1 – هسته:** تایپ‌ها، collectionها، `fireAutomationEvent`، قوانین سراسری، claim/idempotency، کاتالوگ seed (همه خاموش)، `NotificationType='automation'`، تست‌های واحد.
2. **PR2 – API ادمین:** مسیرهای بخش ۷ + audit + تست نقش و `version`.
3. **PR3 – UI پنل:** تب «اتوماسیون»، لیست، سوییچ، ویزارد ۴ مرحله‌ای، پیش‌نمایش، تست کامپوننت (مثل `pushCampaigns.test.tsx`).
4. **PR4 – اتصال رویدادها:** hookهای رویدادی (آزمون، تخصیص، بسته، نشان، ثبت‌نام…) و `supersedes` برای کدهای قدیمی.
5. **PR5 – sweepها:** job `push-automations` (inactivity، daily، weekly، condition، event_delay)، به‌روزرسانی `lastActiveAt` هنگام باز شدن اپ، همگام‌سازی `CRON_JOBS` و `wrangler.toml`.
6. **PR6 – عیب‌یابی و کاربر نهایی:** trace، تاریخچه اجرا، dry‑run، test‑send، تنظیمات اعلان در پروفایل، هشدارهای خرابی.
7. **PR7 – مستندات و رول‌اوت:** `docs/admin-push-automation.md` شامل راهنمای فعال‌سازی تدریجی (اول یک اتوماسیون روی یک کاربر آزمایشی، بعد گسترش).

قواعد هر PR:
- قبل از ارسال PR اجرا کن: `npm run lint`، `npm run typecheck`، `npm test`، `npm run format:check` و نتیجه را گزارش بده.
- شاخه مجزا؛ عنوان و توضیح PR فارسی/انگلیسی روشن، با بخش «چه چیزی تغییر نکرد».
- هیچ merge خودکار؛ من بعد از بررسی merge می‌کنم (Cloudflare بعد از push روی `main` خودش deploy می‌کند).

---

## ۱۱. معیار پذیرش نهایی

- از پنل می‌توانم هر اتوماسیون را فقط با یک سوییچ روشن/خاموش کنم و بلافاصله اثر کند.
- با ویزارد ۴ مرحله‌ای، در کمتر از ۲ دقیقه یک اتوماسیون ساده («۳ روز بی‌فعالیتی» با متن دلخواه) می‌سازم، ارسال آزمایشی می‌گیرم و فعالش می‌کنم.
- هیچ کاربری در یک روز بیشتر از سقف تعیین‌شده پوش نمی‌گیرد؛ تکراری ارسال نمی‌شود؛ ساعت سکوت رعایت می‌شود.
- برای هر کاربر می‌توانم ببینم چرا یک پوش رفت یا نرفت.
- توقف کلی اتوماسیون‌ها در کمتر از ۵ ثانیه اثر می‌کند.
- کمپین‌های دستی و تست‌های فعلی بدون تغییر رفتار کار می‌کنند.
- مستندات به‌روز است و هیچ Secret در ریپو نیست.
