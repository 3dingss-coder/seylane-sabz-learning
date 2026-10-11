# مرحله A — نیازسنجی و طراحی «موتور اتوماسیون پوش‌نوتیفیکیشن + پنل مدیریت»

مخزن: `3dingss-coder/seylane-sabz-learning` · شاخه: `arena/de0335d3-seylane-sabz-learning` (بر پایه `8403816`)
این سند **فقط گزارش است؛ هیچ کدی تغییر نکرده است.** پس از تأیید شما، پیاده‌سازی طبق بخش ۱۰ فایل پرامپت و بخش ۷ همین سند انجام می‌شود.

نمادهای وضعیت: ✅ تأیید شد · ⚠️ درست ولی با تصحیح/قید · ❓ تأیید نشده (دسترسی لازم در این محیط نبود).

---

## ۰. آنچه خوانده شد و آنچه تأیید نشد

خوانده‌شده (کامل): `functions/src/services/notify.ts`, `push-campaigns.ts`, `cron.ts`, `jobs.ts`, `behavior.ts`,
`mentor-rules.ts`, `learning.ts`, `learning-state.ts`, `assignments.ts`, `content.ts`, `rewards.ts`, `reports.ts`,
`users.ts`, `policies.ts`, `knowledge.ts`, `context.ts`, `domain/types.ts`, `domain/policy.ts`, `lib/time.ts`,
`lib/ids.ts`, `push/types.ts`, `push/fcm-http.ts`, `store/types.ts`, `store/helpers.ts`, `store/d1.ts`,
`store/firestore.ts`, `routes/admin.ts`, `routes/auth.ts`, `routes/me.ts`, `app.ts`, `web-handler.ts`,
`cloudflare-worker.ts`, `index.ts`, `migrations/0001_init.sql`, `wrangler.toml`, `firestore.indexes.json`,
`functions/test/cron.test.ts`, `notify.test.ts`, `push-campaigns.test.ts` (سبک)، `test/support/ctx.ts`,
`apps/web/src/App.tsx`, `pages/admin/AdminRoutes.tsx`, `PushCampaignsPage.tsx`, `pushCampaignModel.ts`,
`NotificationsPage.tsx`, `UsersPage.tsx`, `components/common/Field.tsx` (`Tabs`), `PushOptInBanner.tsx`,
`components/admin/DataTable.tsx`, `lib/webPush.ts`, `pages/m/QuizPage.tsx`, `public/push-sw.js`,
`docs/admin-push-campaign-setup.md`, `docs/admin-push-campaign-api.md`.

❓ **تأیید نشده (و عمداً حدس زده نشده):**

1. **عدد داده زنده** (۱۴۱ کاربر، ۱۸ توکن، ۸ کمپین، ۷۶۵ نوتیف). D1 پروداکشن از این محیط قابل خواندن نیست:
   `npx wrangler whoami` → `You are not authenticated`. طراحی طوری انجام شده که این اعداد فقط **روی ترتیب بزرگی
   (O) و هزینه** اثر بگذارند، نه روی درستی منطق.
2. **اینکه Cron Trigger روی Worker زنده واقعاً ثبت شده است** و **اینکه Secret `FCM_SERVICE_ACCOUNT_JSON`
   روی Worker/Preview وجود دارد.** `docs/admin-push-campaign-setup.md` §۴ هم همین را «اقدام دستی انجام‌نشده»
   علامت زده و هنوز تیک نخورده است. ← دقیقاً به همین دلیل «کارت سلامت سیستم» را از یک قابلیت تزئینی به یک
   **الزام فنی** تبدیل می‌کنم (بخش ۳.۲ و ۴.۶).
3. **حد عددی دقیق پلن رایگان Cloudflare/D1** (تعداد request/روز، row-read/روز، سقف subrequest). اعداد
   پلتفرم از این محیط قابل بررسی نبودند؛ در بخش ۵ فقط «کوئری/ردیف در هر اجرا» را دقیق می‌دهم و جمع روزانه را
   به‌صورت ضریب بیان می‌کنم، نه ادعای رعایت سقف مشخص.

محدودیت محیط: `node_modules` نصب نیست (کارکردن Phase B نیازمند `npm ci` است؛ registry در دسترس است).

---

## ۱. راستی‌آزمایی «وضعیت فعلی» و شکاف‌های بخش ۲

| # | ادعا | حکم | مدرک (فایل · تابع/خط) |
|---|---|---|---|
| ۱ | ارسال واقعی فقط با FCM HTTP v1 و Secret؛ بدون Secret چیزی «موفق» ثبت نمی‌شود | ✅ | `web-handler.ts:107-120` `buildPushSender()` → `UnconfiguredPushSender` (`push/types.ts:28-38`)؛ `notify.ts:201-227` `sendPush()` استثنا را می‌گیرد و `pushStatus:'failed'` می‌نویسد (هرگز `sent` नहीं) |
| ۲ | الگوی کمپین: batch ۲۵، ۸ batch در اجرا، claim، budget، `Idempotency-Key`، version، گزارش، آرشیو | ✅ | `push-campaigns.ts:36-41` (`BATCH_USERS`, `MAX_BATCHES_PER_RUN`, `MAX_BATCH_ATTEMPTS`, `STALE_BATCH_MS`), `:526-560` `startCampaign()`, `:562-588` `sendCampaignNow()`, `:428-520` `runBatch()`, `:784-820` `advanceCampaign()`, `:822-853` `runPushCampaigns()`؛ `admin.ts:636-663` روت‌ها و اعتبار `Idempotency-Key` |
| ۳ | «ارسال فوری» عملاً فقط enqueue است | ⚠️ مهم | `push-campaigns.ts:556-560` (توضیح: از FCM درون درخواست HTTP نمی‌خوانیم) + `cloudflare-worker.ts:157-161` `backgroundJob()` که با `ctx.waitUntil` بعد از پاسخ، `runPushCampaigns` را اجرا می‌کند. یعنی **تأخیر واقعی = یا `waitUntil` یا کرون ۱۵ دقیقه‌ای** |
| ۴ | ۴ Cron در `wrangler.toml` هم‌خوان `CRON_JOBS` | ✅ | `wrangler.toml` `[triggers] crons = ["*/15 * * * *","0 * * * *","30 4 * * *","30 6 * * *"]` ↔ `cron.ts:78-83`؛ همگامی را `functions/test/cron.test.ts:19-40` نگهبانی می‌کند |
| ۴ب | همین jobها روی بک‌اند Firebase Functions هم ثبت شده‌اند | ⚠️ **نادرست/ناقص** | `functions/src/index.ts:42-47` فقط ۵ job را `onSchedule` می‌کند (`deadline-sweep, daily-reminders, weekly-digest, mentor-daily, flush-push`)؛ `push-campaigns`, `knowledge-reindex`, `migrate-blobs` آنجا **نیستند**. اگر سرویس‌دهی API از Firebase انجام شود، کمپین زمان‌بندی‌شده هرگز زهکشی نمی‌شود → برای job جدید `push-automations` تصمیم لازم است (بخش ۶، ریسک R4) |
| ۵ | ۱۴ قالب سیستمی با `notifyTemplate` | ⚠️ | `DEFAULT_TEMPLATES` در `notify.ts:18-98` **۱۵** کلید دارد (شما `mentor_nudge` را فهرست نکرده‌اید). ویرایش‌پذیری فقط `title/body` است (`notify.ts:131-163` `templateSchema`/`updateTemplate`)؛ **`push: boolean` هر قالب در کد ثابت است و از پنل تغییر نمی‌کند** |
| ۵ب | quiz_passed / quiz_failed «الان پوش می‌فرستند» | ❌ نادرست | در `DEFAULT_TEMPLATES`: `quiz_passed.push=false`, `quiz_failed.push=false`, `welcome.push=false`, `badge_earned.push=false` (`notify.ts:55-73`, `:79`, `:84-89`). یعنی این چهار «اتوماسیون سیستمی» امروز **فقط داخل اپ** هستند. جملهٔ پرامپت «رفتار فعلی‌شان حفظ شود» با «پوش دارند» در تضاد است → بخش ۶ سؤال ۲ |
| ۶ | ساعت سکوت، timezone، throttle با `throttleKey` روی `notification_log` | ✅ (با قید) | `notify.ts:229-278` `notifyUsers()` (defer + `deliverAfter`)، `:186-200` `throttled()` روی `notification_log/<hash>` با `expireAt=180d`. قید: throttle فقط وقتی اعمال می‌شود که `throttleKey` داده شود؛ و `expireAt` روی D1 **توسط هیچ jobی پاک نمی‌شود** (فقط Firestore TTL) → `store/d1.ts:112,532,859` (فقط parse) |
| ۷ | ذخیره‌سازی D1 با جدول واحد `docs`؛ migration جدید لازم نیست | ✅ (با قید بزرگ) | `migrations/0001_init.sql` و `store/d1.ts:42-65` `D1_SCHEMA_STATEMENTS`. قید مهم ↓ |
| ۷ب | کوئری‌های فیلترشده روی D1 کم‌هزینه‌اند | ⚠️ **نادرست در کل** | `store/d1.ts:611-639` `runQuery()`: فقط `field == 'رشته'` (و `== null`) به SQL منتقل می‌شود (`json_extract`)؛ `LIMIT` و `ORDER BY createdAt` فقط وقتی اعمال می‌شوند که **همه** فیلترها push-down شده باشند. هر `>=`,`<=`,`in`,`array-contains` یا مقایسه عددی → **اسکن کامل مجموعه + فیلتر در JS**. نتیجه: محدودیت ۱۰ پرامپت («اسکن کامل ۱۴۱+ کاربر در هر ۱۵ دقیقه ممنوع») عملاً یعنی «هر فیلتر گران‌قیمت باید با ساختار کلید حل شود، نه با where» |
| ۸ | پنلی برای روشن/خاموش/زمان‌بندی اتوماسیون نیست | ✅ | تنها صفحهٔ تنظیم، `PoliciesPage` با فیلدهای `policies.ts:16-62` است؛ هیچ collection/روت/UI برای «اتوماسیون» وجود ندارد (`grep -rn automation functions/src` → صفر) |
| ۹ | `NotificationType` union بسته است | ✅ | `domain/types.ts:281-296` (۱۵ عضو). توجه: `DEFAULT_TEMPLATES: Record<NotificationType, …>` (notify.ts:19) **پرشده (exhaustive)** است → افزودن `'automation'` همان‌جا کامپایل را می‌شکند (خوب است: نقطهٔ تغییر اجباری). اثر جانبی: `getTemplates()` (notify.ts:111-129) همهٔ کلیدها را به ویرایشگر «اعلان‌ها ← قالب‌ها» می‌دهد → باید `automation` از آن فهرست بیرون بماند |
| ۱۰ | `policy.reminderInactiveDays` فقط یک عدد است | ✅ | `domain/policy.ts` (`reminderInactiveDays`), بازه ۱..۳۰ در `policies.ts:50`؛ مصرف‌کننده‌ها: `jobs.ts:135` (`runDailyReminders`), `mentor-rules.ts:56-90` (R4), `behavior.ts:512` (escalation) |
| ۱۱ | سقف روزانه/هفتگی، حداقل فاصله، ادغام پیام‌ها وجود ندارد | ✅ | تنها مکانیزم، throttle تک‌کلیدی است؛ هیچ شمارندهٔ «تعداد پوش امروز این کاربر» در هیچ مسیری نیست |
| ۱۲ | `notification_prefs` وجود ندارد | ✅ | جست‌وجوی `prefs` در `functions/src` و `apps/web/src` → صفر نتیجه |
| ۱۳ | `users.lastActiveAt` فقط در بعضی مسیرها به‌روز می‌شود | ✅ **بدتر از آن** | به‌روزرسانی‌ها: `users.ts:274` (login با رمز), `routes/auth.ts:67` (phone-login), `learning.ts:534` (`recordProgress` → `step('touch_user')`, best‑effort). **`users.refresh()` (users.ts:279-285) که دقیقاً مسیر «باز شدن اپ با نشست معتبر» است، به‌روزرسانی نمی‌کند**؛ `GET /me/home` هم نه. پس «سایت را باز نکرد» امروز عملاً «روی موبایل ویدیو ندیده» معنی می‌دهد، نه «اپ را باز نکرد» |
| ۱۴ | خطر دوباره‌کاری `runDailyReminders` با `inactive_1d` | ✅ قطعی | `jobs.ts:128-152` با `throttleKey:'daily_reminder'` در `notification_log` و ساعت `30 6 * * *` UTC (= ۱۰:۰۰ تهران) ↔ سناریوی شما هم ۱۰:۰۰. کلیدهای throttle متفاوت‌اند → **هر دو** ارسال می‌شود. `supersedes` الزامی است |
| ۱۵ | سلامت cron/FCM جایی ثبت نشده | ✅ | `cron.ts:100-146` `runCron()` فقط `console` می‌نویسد؛ `cloudflare-worker.ts:196-203` `scheduled()` هم فقط لاگ. **هیچ سند «آخرین اجرای موفق» وجود ندارد** → کارت سلامت بدون تغییر بک‌اند ممکن نیست (بخش ۴.۶) |

### تصحیح‌های لازم در متن پرامپت (قبل از کد، برای اینکه قراردها گنگ نمانند)

| # | متن پرامپت | واقعیت کد | تصمیم پیشنهادی |
|---|---|---|---|
| C1 | `priority: 'urgent'\|'high'\|'normal'\|'low'` روی اتوماسیون | `NotifyOptions.priority` فقط `'high'\|'normal'\|'low'` است و عبور از ساعت سکوت شرطِ `priority==='high' && urgent===true` است (`notify.ts:165-176`, `:236-238`) | `priority:'urgent'` در مدل پنل نگه داشته می‌شود و در مرز ارسال به `{priority:'high', urgent:true}` **نگاشت** می‌شود. `NotifyOptions` دست‌نخورده می‌ماند → رفتار کمپین‌ها و تست‌ها تغییر نمی‌کند |
| C2 | `actionRef` با `isSafeInternalPath` و افزودن `/manager` | allowlist ثابت و مشترک است: `push-campaigns.ts:59-68` (بدون `/manager`) | تابع اعتبارسنجی **پارامترپذیر** می‌شود: `isSafeInternalPath(v, prefixes)` با پیش‌فرض فعلی (کمپین‌ها هیچ تغییری نمی‌کنند) + `AUTOMATION_ROUTE_PREFIXES` جدا که `/manager` را دارد و `/admin` را **ندارد** |
| C3 | لینک‌ها: `/quiz/{quizId}` (سناریوهای ۱۳، ۱۴، ۱۸) | روتر واقعی: `App.tsx:76` → `quiz/:sectionId`؛ `QuizPage.tsx:40` همان `sectionId` را می‌خواند. `behavior.ts:372` امروز همین باگ را دارد (`/quiz/${quizId}`) | کاتالوگ متغیرها فقط متغیرهای قابل‌تولید را می‌دهد؛ برای آزمون، الگو **`/quiz/{sectionId}`** است. (باگ `behavior.ts:372` را در PR جدا و اختیاری گزارش می‌کنم؛ در PR اتوماسیون دست نمی‌زنم تا «تغییر مخرب» نباشد) |
| C4 | «ارسال از طریق همان `notifyUsers`» | `notifyUsers` برای هر کاربر یک `query('device_tokens')` جدا می‌زند (`notify.ts:201-203`) و platform را نمی‌شناسد؛ `push-campaigns` به‌جایش یک `tokenIndex()` یک‌باره می‌سازد (`:246-257`) و `manualSend` «fast path» دارد: یک خواندن توکن + `batchSet` و واگذاری ارسال به `flushDeferredPush` (`notify.ts:417-463`) | مسیر **sweep** (جمعیت‌محور) از الگوی `manualSend` می‌رود: نوشتن انبوه نوتیف با `pushStatus:'deferred'` + `deliverAfter` → زهکشی توسط `flush-push` موجود. مسیر **event** (۱ تا چند کاربر) از `notifyUsers`. هردو در یک تابع واحد `deliver()` پشت engine |
| C5 | بک‌اند Firestore هم زنده است | `store/firestore.ts` وجود دارد و تست‌ها با `TEST_BACKEND=firestore` و `npm run check:indexes` روی آن می‌چرخند (`functions/package.json`) | هر shape کوئری جدید باید در `firestore.indexes.json` ایندکس ترکیبی بگیرد، وگرنه `check:indexes` می‌شکند |

---

## ۲. نقشهٔ نقاط hook برای ۲۷ سناریو

«محل رویداد» = جایی که باید `fireAutomationEvent(d, event, userId, vars)` صدا زده شود (یا داده‌ای که sweep باید بخواند).

| # | key | نوع | محل رویداد / داده (فایل · تابع) | متغیرهای قابل‌تولید | وضعیت |
|---|---|---|---|---|---|
| 1 | `inactive_1d` | inactivity | sweep: `users.lastActiveAt` + `section_progress`؛ داده از `learning-state.ts:313` `loadUserLearning` (در حالت bulk: `loadLearningForUsers`, `:346`) | `name,section,percent,packageId` | ✅ داده هست · hook لازم ندارد · `supersedes: ['daily-reminders:reminder']` |
| 2 | `inactive_2d` | inactivity | مثل ۱ | `name,percent,title` | ✅ |
| 3 | `inactive_3d` | inactivity (B5) | `behavior.ts:386-395` `planInterventions` شاخه B5 → امروز فقط `behavior_interventions`/`mentor_nudges` (`:546-600`) | `days,section` | ✅ سیگنال هست، پوش نیست |
| 4 | `inactive_7d` | inactivity | مثل ۱ (پله ۴) | `name` | ✅ |
| 5 | `never_started_24h` | event_delay | **پیشنهاد: رویداد نزن.** محاسبه در sweep با `users.createdAt ≤ now−24h` و نبود هیچ `section_progress` برای کاربر (داده موجود: `users.ts:217` `lastActiveAt:null`, `progressRows` از `learning-state.ts:318`) | `name` | ✅ بدون hook جدید (ارزان‌تر و مقاوم‌تر در برابر restart) |
| 6 | `evening_nudge` | schedule_daily ۱۸:۰۰ | sweep: «امروز فعالیت ندارد» = `dayKey(lastActiveAt, tz) !== dayKey(now, tz)` (`lib/time.ts:47`) | `name` | ✅ · opt‑in → نیازمند `notification_prefs` |
| 7 | `preferred_time` | schedule_daily (ساعت کاربر) | **رویداد/داده ندارد.** تنها منبع ممکن: هیستوگرام ساعتِ `section_progress.updatedAt` (بسته‌به‌موجود) — نه `analytics_events` (روی D1 هرگز پاک نمی‌شود و حجیم است) | — | ❌ نسخه ۲، پشت فلگ |
| 8 | `week_start` | schedule_weekly | sweep؛ `{n}` = `packages.filter(active).length` از `PackageView` | `name,n,title` | ✅ |
| 9 | `overdue_daily` | condition (B2) | `behavior.ts:333-341` (B2, `channel:'push'` که هرگز ارسال نمی‌شود)؛ همان سیگنال قابل استفاده مجدد است | `title,left` | ✅ سیگنال · push گم‌شده |
| 10 | `package_updated` | event | `content.ts:473-506` `updatePackage` و `:750-770` `refreshPackageSummary` (امضای `sections` اینجا ساخته می‌شود)؛ `publishPackage` `:547-581` امروز فقط `notifyAssignedUsers` را صدا می‌زند | `title,packageId` | ⚠️ نیازمند «اشارهٔ تغییر»: پیشنهاد = `contentHash` روی `Package` از همان `sections`؛ رویداد فقط وقتی hash عوض شد و `status==='published'` |
| 11 | `quiz_passed` | event (سیستمی) | `learning.ts:897-906` `submitAttempt` → `notifyTemplate('quiz_passed')` | `title,score` | ✅ موجود · ⚠️ امروز `push:false` |
| 12 | `quiz_failed` | event (سیستمی) | `learning.ts:946-958` (`createNudge('R2')` + `notifyTemplate('quiz_failed')`) | `title` | ✅ موجود · `push:false` |
| 13 | `quiz_failed_nudge` | event_delay ۲س (B3) | رویداد از همان `submitAttempt`؛ محاسبهٔ B3: `behavior.ts:365-373` | `title` | ⚠️ نیازمند صف تأخیر (بخش ۴.۴) · لینک: `/quiz/{sectionId}` |
| 14 | `section_ready_quiz` | event_delay ۳۰د | **hook آماده:** `learning.ts:555-559` `if (result.justCompleted) step('section_completed', …)` از `applyHeartbeat` (`:237-264`) | `section,title,packageId,quizId` | ✅ رویداد وجود دارد (فقط track می‌شود، پوش نه) |
| 15 | `stalled_section` | event_delay ۲س (B6) | `behavior.ts:400-409` (B6 از `signals.stalledSections`, `:150-158`) | `section,percent,sectionId` | ✅ سیگنال |
| 16 | `near_completion` | condition (B7) | `behavior.ts:417-424` (B7 از `signals.nearCompletion`) | `title,percent,packageId` | ✅ سیگنال |
| 17 | `two_fails_mentor` | event | در `submitAttempt` قابل محاسبه است: آرایهٔ `allowance.attempts` همان‌جا خوانده می‌شود (`learning.ts:885-888`) → «شمارهٔ تلاش ≥ ۲ و رد شده» | `name` | ✅ داده هست، رویداد جدید لازم ندارد |
| 18 | `quiz_abandoned` | event_delay ۳۰د | **تأیید شد: «شروع تلاش» ثبت می‌شود.** `learning.ts:765-782` سند `attempts/<userId_quizId_n>` با `status:'in_progress'`, `startedAt`, `submittedAt:null` (`domain/types.ts:170-185`) | `title,sectionId` | ✅ · پیاده‌سازی به‌صورت sweep (یافتن `in_progress` قدیمی) ارزان‌تر از صف است |
| 19 | `badge_earned` | event (سیستمی) | `rewards.ts:158-183` (`store.create('user_badges/…')` + `notifyTemplate('badge_earned')`) | `title` | ✅ موجود · `push:false` (مطابق خواستهٔ «فقط داخل اپ») |
| 20 | `streak_5` | condition (B8) | `behavior.ts:428-437` + `annotateActivity` `:216-246` (streak از `lastActivityAt/completedAt` بسته‌ها) | `days` | ✅ سیگنال · ⚠️ `annotateActivity` روز را UTC می‌شمارد (`.slice(0,10)`) نه روز تهران |
| 21 | `streak_at_risk` | condition | ترکیب `annotateActivity` + «امروز فعالیت نداره» | `days` | ✅ |
| 22 | `team_rank_change` | schedule_weekly | **منبع داده وجود ندارد:** هیچ لیدربورد/رتبه‌ای در ریپو نیست (`grep -rin leaderboard,rank` فقط `iranLocations.rank` و RRF در `retrieval.ts`). روتر هم مسیر لیدربورد ندارد | `rank` | ❌ نسخه ۲؛ اگر خواستید: رتبه را **خروجی جانبیِ sweep هفتگی** روی همان مجموعه‌ای که یک‌بار خوانده شده محاسبه و در `team_weekly_stats/<teamId>/<weekKey>` بنویس (بدون کوئری اضافه) · لینک موقت: `/manager` |
| 23 | `first_course_done` | event | `learning.ts:905-909` (`packageCompleted` → `onPackageCompleted`)؛ `package_completions` (`learning-state.ts:323`) | `name` | ✅ (sendOnce=true) |
| 24 | `weekly_digest` | schedule_weekly (سیستمی) | `jobs.ts:154-222` `runWeeklyDigest` (ایمیل هم همان‌جا `:203-217` با `d.mail`) | `count` | ✅ موجود |
| 25 | `manager_inactive_7d` | inactivity + aggregate | sweep روی همان داده ۱، گروه‌بندی با `user.teamId` → مدیران از کوئری `role=='manager'` (الگو: `jobs.ts:103-118`) | `count` | ✅ |
| 26 | `manager_member_joined` | event | `users.ts:166-238` `register()` (وقتی `teamId` دارد) و `users.ts:419-476` `adminUpdateUser` (تغییر `teamId`) → امروز هیچ اعلانی به مدیر نمی‌رود | `name` | ⚠️ hook جدید لازم دارد (۲ نقطه) |
| 27 | `manager_score_drop` | schedule_weekly | میانگین نمره تیم از `attempts`؛ خواندن `attempts` فقط به‌صورت کل مجموعه ممکن است (`store/d1.ts:637`) → **باید** در همان sweep هفتگی و با نوشتن `team_weekly_stats` برای هفته قبل انجام شود | `delta` | ⚠️ شدنی ولی گران؛ نسخه ۲ یا با فلگ |

**خلاصه hookها:** ۱۸ سناریو هیچ رویداد جدیدی لازم ندارند (از داده موجود در sweep محاسبه می‌شوند) · ۴ سناریو hook رویدادی روی نقاط موجود دارند (`learning.ts:555`, `content.ts:473/750`, `users.ts:166/419`) · ۵ سناریو سیستمی‌اند و فقط «سوییچ + آمار» می‌خواهند (`auth.ts:26/96`, `jobs.ts:47/78/109/142/188`, `assignments.ts:151/210`, `learning.ts:900/956`, `rewards.ts:177`, `reports.ts:581/715`, `behavior.ts:652`) · ۴ سناریو (۷، ۲۲، ۲۷ و تا حدی ۱۰) به دادهٔ مشتق‌شده نیاز دارند و در نسخه ۲ باقی می‌مانند.

---

## ۳. آنچه برای «مدیریت این سیستم» لازم است (تکمیل بخش ۶)

### ۳.۱ مواردی که خودتان فهرست کردید — همگی لازم‌اند و جای طراحی مشخص دارند

kill‑switch · dry‑run · ارسال آزمایشی · trace کاربر · سقف‌ها · cooldown · ترجیح کاربر · پنجره زمانی/منطقه زمانی · کاتالوگ متغیرها · audit · سلامت FCM/cron · هشدار خرابی · پاکسازی توکن · نسخه‌گذاری متن · جلوگیری از تداخل با jobهای قدیمی · TTL لاگ‌ها · حریم خصوصی.

### ۳.۲ مواردی که در بخش ۶ نبود و باید اضافه شود

1. **ضربان قلب cron (سند، نه لاگ).** `system_health/cron` با `{job, cron, startedAt, finishedAt, ok, error, counts}` که `scheduled()` در `cloudflare-worker.ts:196` و `runCron` می‌نویسند. بدون این، «آخرین اجرای cron چه زمانی بود؟» و «cron بیش از ۳۰ دقیقه نیفتاده؟» **غیرقابل محاسبه** است.
2. **تشخیص پیکربندی Push.** `Deps.push` امروز هیچ راهی برای گفتن «FCM واقعی است یا Unconfigured» ندارد (`push/types.ts`). پیشنهاد: فیلد اختیاری `describe?: () => {provider:'fcm'|'unconfigured'|'recording', configured:boolean}` روی `PushSender` + مقدارخوانی در `/overview`. هیچ Secretی نمایش داده نمی‌شود؛ فقط وضعیت.
3. **عمق صف و کهنگی آن.** `push_automation_queue`: تعداد آیتم معوق + سن قدیمی‌ترین آیتم. اگر >۲۴ ساعت بکند = کرون نمی‌چرخد (به‌جای اینکه ادمین باید بفهمد).
4. **نمایش «چه کسی مالک این پنجره است».** اگر هم‌زمان `inactive_1d` فعال باشد و `daily-reminders` هم، در لحظهٔ ذخیره هشدار داده شود (تعارض `supersedes`) — وگرنه فقط کاربر است که دو پوش می‌گیرد و ادمین نمی‌فهمد چرا.
5. **ساعت سکوت vs ساعت ارسال.** اگر `time` اتوماسیون داخل `policy.quietHours` باشد: هشدار زرد در فرم + توضیح «ارسال به ابتدای بازهٔ مجاز موکول می‌شود» (رفتار `notifyUsers` همین است).
6. **`sendOnce` و پنجره‌ها در یک نگاه.** ستون «آخرین ارسال به این کاربر برای این کلید» در trace؛ وگرنه «چرا نرفت؟» بدون توضیح `claim` معنا ندارد.
7. **Dry‑run باید هزینه‌اش ثابت باشد.** یعنی dry‑run = همان مسیر انتخاب مخاطب، بدون نوشتن و بدون FCM؛ خروجی: `N کاربر` + حداکثر ۲۰ شناسه/نام کوتاه + شمارش دلیل رد (بدون دستگاه، خارج از پنجره، opt‑out…).
8. **ارسال آزمایشی فقط به ادمینِ درخواست‌کننده** و **آمار را آلوده نکند** (نوتیف با `test:true`، خارج از `stats`، rate‑limit جدا، audit جدا).
9. **خودکارخاموش‌شدن در شکست مکرر؟** پیشنهاد من: **نه** — فقط هشدار + دکمهٔ «خاموش کن». (تصمیم ۵، بخش ۶.)
10. **صفحهٔ «متن‌ها» برای اتوماسیون‌های سیستمی.** چون ویرایشگر قالب فعلی (`NotificationsPage` تب «قالب‌ها» + `updateTemplate`) منبع حقیقت متن سیستمی است، ویزارد اتوماسیون نباید متن آن‌ها را کپی کند؛ برای کلیدهای سیستمی فقط «سوییچ/اولویت/سقف» نشان داده شود و لینک ویرایش به همان تب («قالب‌ها»).
11. **Export/Import کاتالوگ (JSON).** تنها راهی که ۷۱ سناریوی بعدی اکسل بدون تغییر کد اضافه شوند؛ و هم‌زمان ابزار نقل و انتقال بین preview/پروداکشن.
12. **دکمهٔ «اجرای الان»** برای یک اتوماسیون (فقط superadmin، مثل `POST /admin/jobs/:name` در `admin.ts:683-695` که `force:true` دارد) تا ادمین منتظر کرون ۱۵ دقیقه‌ای نماند.
13. **حالت «فقط پیش‌نمایش، بدون ذخیره» برای کل فرم** تا «ذخیرهٔ پیش‌نویس» و «فعال‌سازی» دو مسیر مجزا باشند (سخت‌افزار ذهنی مدیر غیرفنی).
14. **ثبت علتِ «رد» برای هر کاربر در dry‑run** (نه فقط شمارش) — همان `push_automation_decisions` که TTL دارد.
15. **مصرف‌کنندهٔ `pushStatus`:** صفحهٔ «اعلان‌ها ← صندوق» و `/me/notifications` (notify.ts:324-343) هیچ‌کدام نشان نمی‌دهند پوش رفت یا نه. یک برچسب کوچک «پوش: ارسال شد / موکول / ناموفق / بدون دستگاه» در trace کافی است (بدون تغییر inbox).
16. **کنتاکت‌پوینت Service Worker.** `push-sw.js:12` لینک ناشناخته را `/notifications` می‌گیرد در حالی که مسیر marketer `‏/messages` است؛ برای اتوماسیون‌ها `data.link` همیشه از allowlist می‌آید، پس فقط مستندسازی می‌خواهد (تغییر رفتاری در PR اتوماسیون نمی‌دهم).
17. **رفع اثر جانبی middleware دانش.** `admin.ts:33-38` روی هر نوشتن غیر GET در `/admin/*`، `knowledge.markKnowledgeDirty()` را صدا می‌زند (`knowledge.ts:75-81`). هر toggle اتوماسیون یک «زباله‌شدن ایندکس» است. باید `/admin/push-automations` از این regex مستثنا شود (مثل `jobs`).
18. **کش سیاست ۳۰ ثانیه‌ای:** `getPolicy` در `context.ts:36-46` نتیجه را ۳۰ ثانیه در هر isolate نگه می‌دارد. اگر kill‑switch روی همان کش بنشیند، «کمتر از ۵ ثانیه» نقض می‌شود → تنظیمات اتوماسیون **کش نمی‌شود** (۱ خواندن در هر اجرا/رویداد) و در نوشتن، همان `invalidatePolicy` الگو اجرا می‌شود.
19. **حفاظ PII:** `audit()` مقادیر `SENSITIVE` را ماسک می‌کند (`context.ts:58-63`) اما این فقط نام کلید است. برای ردیابیِ کاربر در trace باید **شناسه و نامِ کوتاه** برگردد، نه تلفن/ایمیل (قاعده ۷ پرامپت). در trace صفحهٔ «چرا نرفت؟» تلفن/ایمیل **فقط** از جست‌وجوی کاربر ادمین (`UsersPage.tsx:119`) نشان داده می‌شود، نه از payload اتوماسیون.
20. **TTL روی D1 وجود ندارد:** پاکسازی `push_automation_runs|decisions|claims` باید یک قدمِ بودجه‌دار در خودِ job باشد (حداکثر K سند در اجرا) — وگرنه بی‌نهایت رشد می‌کند.
21. **دسترس‌پذیری و RTL:** `DataTable` caption می‌گیرد (`DataTable.tsx:30-36`)، `Tabs` از `Field.tsx:83`؛ سوییچ‌ها `aria-label` فارسی؛ همهٔ اعداد با `toPersianDigits`/`faNumber` (`pushCampaignModel.ts` الگو). تست `apps/web/src/pages/a11y.test.tsx` باید سبز بماند.

---

## ۴. طراحی موتور (تغییرهایم نسبت به §۵، هرکدام با دلیل)

### ۴.۱ مدل داده

همه در همان جدول `docs`، با **قاعدهٔ حیات‌بخش: shard بر اساس پنجره در مسیر collection** — چون تنها چیزی که روی D1 واقعاً cheap است `WHERE col = ?` است (کلید اصلی `(col,id)`) و `json_extract` فقط فیلتر را *کاهش* می‌دهد، اسکن را نه (`store/d1.ts:637`).

| collection | کلید id | چرا |
|---|---|---|
| `push_automations/<key>` | خود key | تعریف؛ `version` برای قفل خوش‌بینانه (الگوی `updateCampaign`) |
| `push_automation_settings/global` | `global` | سقف‌ها، kill‑switch، پیش‌فرض‌ها. **بدون کش** |
| `push_automation_index/enabled` | `<dayKey>` | فهرست فشردهٔ «کلیدهای فعال + نوع» تا sweep بدون اسکن تعریف‌ها بداند چه چیزی را ارزیابی کند |
| `push_automation_claims/<windowKey>/<hash>` | `hash(key\|userId)` | idempotency؛ shard روزانه = هم ارزان، هم حذفِ یک‌روزهٔ قابل پیش‌بینی |
| `push_automation_queue/<dayKey>` | `<hash(key\|userId\|dueBucket)>` | `event_delay`؛ shard روزانه، خواندنِ «امروز» کافی است |
| `push_automation_runs/<id>` | `newId()` | تاریخچه اجرا؛ `expireAt` + پاکسازی بودجه‌دار |
| `push_automation_decisions/<dayKey>` | `<hash(userId)>` | **یک سند در روز به ازای کاربر** با حداکثر ۲۰ تصمیم (نه ۲۰ سند) → حجم و کوئری کنترل‌شده |
| `push_automation_textver/<key>/<n>` | `rev` | ۵ ویرایش آخر پیام + بازگردانی |
| `notification_prefs/<userId>` | userId | دسته‌های خاموش + `preferredHour` + opt‑in‌های بوقی |
| `system_health/cron`, `system_health/push` | `…` | کارت سلامت |

`Notification` فقط یک فیلد اختیاری می‌گیرد: `automationKey?: string \| null` (در `data` پوش هم می‌آید). افزودن `type:'automation'` به union + یک ورودی `DEFAULT_TEMPLATES` (اجبار تایپ) + حذفش از `getTemplates()`.

### ۴.۲ ارزیابی جمعیت‌محور = بازاستفاده از توابع **pure** رفتار، بدون کوئری per‑user

بزرگ‌ترین هزینهٔ امروز: حلقهٔ per‑user (`jobs.ts:136-152`: برای هر کاربر `loadUserLearning` = ۲ کوئری). طراحی: **یک** تابع `loadSweepContext(d)` که دقیقاً مثل `loadLearningForUsers` (`learning-state.ts:346-360`) با تعداد ثابت کوئری، برای *همه* کاربران `PackageView[]` را می‌سازد، و بعد برای هر کاربر `computeSignals` + `annotateActivity` + `planInterventions` (`behavior.ts:96`, `:216`, `:173`) **بدون I/O** صدا زده می‌شود. نتیجه: سناریوهای ۲،۳،۹،۱۵،۱۶،۲۰،۲۱ هیچ منطق جدیدی ندارند — فقط «تحویل پوش» به اتوماسیون منتقل می‌شود و قانون B1–B12 دست‌نخورده می‌ماند (قاعده ۱۲).

### ۴.۳ دو لایهٔ اجرا (برای اینکه «هر ۱۵ دقیقه اسکن ۱۴۱ کاربر» هرگز اتفاق نیفتد)

* **Tier 1 — هر ۱۵ دقیقه (`push-automations`):** فقط (الف) زهکشی `push_automation_queue/<dayKey>` که `dueAt ≤ now` است، (ب) پاکسازی بودجه‌دار، (ج) نوشتن `system_health/cron`. کوئری ثابت، مستقل از تعداد کاربر.
* **Tier 2 — پنجره‌دار:** sweep‌های `inactivity`/`condition`/`schedule_daily` فقط وقتی اجرا می‌شوند که `windowKey` (= `dayKey` تهران + شمارهٔ پنجرهٔ ساعتِ اتوماسیون) تازه باشد؛ `schedule_weekly` با `year-Www`. یعنی عملاً ۱ تا چند اجرا در روز، با **cursor** تا اگر جمعیت بزرگ بود در چند اجرا تمام شود (الگوی `MAX_BATCHES_PER_RUN`).

### ۴.۴ idempotency، پله‌ها و «supersedes»

claim = `store.create` که روی `StoreConflictError` رد می‌شود — عیناً الگوی `tryClaim()` در `push-campaigns.ts:544-551`. برای `ladderGroup`: کلید claim شامل `inactiveEpoch = user.lastActiveAt` است، پس «تا وقتی کاربر برگشته، فقط بالاترین پلهٔ مشمول» و با بازگشت کاربر، دوره ریست می‌شود (بدون نیاز به حذف claim). `supersedes`: قبل از ارسال، `notifyTemplate` معادل قدیمی برای همان کاربر/پنجره skip می‌شود — پیاده‌سازی با یک `isSuperseded(d, templateKey, userId, windowKey)` در ابتدای `notifyTemplate` (افزوده، گاردشده، و فقط وقتی یک اتوماسیونِ فعالِ superseder وجود دارد؛ در غیر این صورت path موجود دست‌نخورده).

### ۴.۵ سقف‌ها و اولویت‌بندی

شمارندهٔ روزانه/هفتگی = یک سند شمارنده در هر دو لایه (`push_automation_counter/<dayKey>/<userId>` با `increment`, `d1.ts:724-729`)؛ فقط وقتی سقف رد نشد، claim نوشته می‌شود. «بالاترین اولویت می‌برد، بقیه فقط داخل اپ یا فردا» → تصمیم‌گیری در **یک نقطه** (engine) و ثبت دلیل در `push_automation_decisions` (`cap`, `cooldown`, `quiet`, `optedOut`, `noDevice`, `inactiveUser`, `duplicate`, `missingVariable`, `superseded`). اگر متغیری پر نشد → **رد ارسال** و درج `missingVariable` (قاعدهٔ کاتالوگ شما)، با متن کامل‌نشده هیچ‌وقت ارسال نمی‌شود.

### ۴.۶ سلامت و هشدار

`system_health/cron` (هر اجرا) + `system_health/push` (آخرین خطای `sendPush` شمارش‌شده) → `/overview`. هشدارها (نرخ شکست > ۲۰٪ در ۲۴س، cron > ۳۰ دقیقه سکوت، صف کهنه) **خودشان** یک اتوماسیون سیستمی‌اند: `push_failure_rate` و `push_cron_stalled`، با `enabled=true` seed نمی‌شوند (قاعده ۱) ولی در پنل «پیشنهاد فعال‌سازی» نشان داده می‌شوند. مخاطب: admin/superadmin، اولویت high، فقط داخل اپ + پوش.

### ۴.۷ seed

بازاستفاده از الگوی موجودِ «افزودنی و idempotent»: `seedMissingMentorGuides()` (`store/d1.ts:377-475`) که با مارکر `knowledge_meta/<version-key>` و `INSERT OR IGNORE` کار می‌کند. اتوماسیون‌ها: تابع `ensureAutomationCatalog(d)` که **در مسیر خواندن پنل و ابتدای هر job** صدا زده می‌شود (نه در cold‑start D1 — تا `functions/` مستقل از snapshot بماند)؛ فقط کلیدهایی که وجود ندارند را با `enabled=false` می‌سازد، هیچ‌وقت روی سند موجود نمی‌نویسد. `PUSH_AUTOMATION_CATALOG` یک آرایهٔ plain در `services/push-automations/catalog.ts` است → افزودن سناریوی ۲۸ = افزودن یک آیتم (بدون migration، بدون تغییر موتور).

### ۴.۸ cron و همگامی

`JobName += 'push-automations'`؛ `CRON_JOBS['*/15 * * * *']` و `wrangler.toml` **بدون تغییر تعداد cron** (روی همان `*/15`) → `cron.test.ts:19-40` سبز می‌ماند. `functions/src/index.ts` هم یک `scheduled('every 15 minutes','push-automations')` می‌گیرد تا دو بک‌اند واگرا نشوند (بخش ۱، ردیف ۴ب).

### ۴.۹ `lastActiveAt` هنگام باز شدن اپ

بدون کد کلاینت جدید: `POST /me/events` با `app_opened` امروز از `App.tsx:44` (`NativeBridge`) زده می‌شود. در همان هندلر (`routes/me.ts:52-64`) یک `touchUserActive(d, userId)` best‑effort با throttle ۱۰ دقیقه‌ای (`_system/active_touch/<userId>`) نوشته می‌شود + همان‌طور که `learning.ts:534` الگوی best‑effort را رعایت می‌کند. **و** در `users.refresh()` (`users.ts:279-285`) که سند کاربر را همین حالا می‌خواند، اگر `lastActiveAt` کهنه بود یک نوشتن اضافه می‌شود. هزینه: ≈۱ خواندن + ۱ نوشتن به ازای هر کاربر هر ۱۰ دقیقه.

---

## ۵. برآورد هزینه (کوئری D1 و درخواست‌های FCM در هر اجرا)

ملاک شمارش: هر `d.store.query/get/set/update` = ۱ فراخوانی D1 که در `enqueue` serialize می‌شود (`store/d1.ts:300+`، «D1 اجازه ۶ اتصال می‌دهد و یک کوئری هم‌زمان»)، و `db.batch` یک round‑trip است. `batchSet` روی D1 تا ۴۰۰ عملیات را دسته می‌کند (`store/types.ts:88-90`).

| مسیر | اجراهای / روز | کوئری در هر اجرا | نوشتن در هر اجرا | جمع کوئری/روز |
|---|---|---|---|---|
| **امروز: `daily-reminders`** | ۱ | ۱ (users) + ۲×M (per‑user learning) | ≈۳ تا ۴× (کاربران واجد) | با M=141 → **≈۲۸۰–۵۵۰** |
| **امروز: `mentor-daily`** (`runMentorDaily` + `runBehaviorSweep`) | ۱ | ۱ + ۳×M (learning + attempts، `behavior.ts:490-499`) | ۱ تا ۳×M | با M=141 → **≈۵۶۰** |
| **پیشنهاد: Tier 1 (هر ۱۵ دقیقه)** | ۹۶ | ۴ (settings + index + queue امروز + پاکسازی) | ≤ بودجه (مثلاً ۸ batch × ۲۵ = ۲۰۰ ارسال) | **≈۳۸۴** |
| **پیشنهاد: Tier 2 sweep روزانه، پنجره‌دار** | ۱ (شروع) + ⌈N/200⌉ ادامه با cursor | ۹ ثابت (`users, section_progress, package_completions, attempts, assignments, packages, brands, learning_paths, device_tokens`) | ۲ batchSet (نوتیف) + ۲ batchSet (claim/counter) + ۱ runs | با ۱۴۱ کاربر: ۱ اجرا → **≈۱۴** · با ۲۰۰۰ کاربر: ۱۰ اجرا → **≈۱۴۰** |
| **پیشنهاد: event (در درخواست کاربر)** | رویدادمحور | ۲–۳ (settings + index) | ۱–۲ (claim + queue/نوتیف) | ناچیز نسبت به `submitAttempt` که خودش ≈۱۰ کوئری دارد |
| **زهکشی پوش (موجود)** | ۹۶ | ۱ (`flushDeferredPush`, `notify.ts:303-322`) | ۱× + FCM | بدون تغییر؛ بهینه‌سازی اختیاری پایین |

ردیف خوانده‌شده (تقریب مرتبه): sweep روزانه ≈ `users(N) + section_progress(~3N) + package_completions(N) + attempts(~2N)` → با ۲۰۰۰ کاربر ≈ ۱۴٬۰۰۰ ردیف **در یک اجرا در روز** (نه ۹۶ بار). همین با الگوی فعلی per‑user ≈ ۱٫۳ میلیون ردیف در روز مقایسه می‌شود.

**درخواست FCM:** هر توکن = ۱ `POST` (`push/fcm-http.ts`، `CONCURRENCY=8`, تایم‌اوت ۱۰s). سقف واقعی را `MAX_BATCHES_PER_RUN` و بودجهٔ `flushDeferredPush` (limit 500 + `deadlineAtMs`, `notify.ts:303-322`) کنترل می‌کنند؛ با ۱۴۱ مخاطب ≈ ۱۴۱ درخواست در یک یا دو اجرا.

**کاهش‌های لحاظ‌شده:** (۱) shard پنجره‌ای در مسیر collection → اسکن کوچک؛ (۲) خواندن یک‌بارهٔ `device_tokens` و ساخت `tokenIndex` (الگوی `push-campaigns.ts:246`) و حذف ۱۴۱ کوئری تکراری `sendPush`؛ (۳) بودجه و deadline در هر دو لایه (الگوی `CRON_BUDGET_MS`, `cron.ts:29`)؛ (۴) cursor روی sweep تا جمعیت‌های بزرگ؛ (۵) کش نکردن تنظیمات به‌جای ۲۷ خواندن؛ (۶) dry‑run = فقط مسیر انتخاب مخاطب.

**بقیه ریسک هزینه (راست‌آزمایی‌نشده):** `flushDeferredPush` هر اجرا کل `notifications` را می‌خواند (چون `deliverAfter <=` push‑down نمی‌شود) → امروز ≈۷۶۵ ردیف × ۹۶ = ≈۷۳k ردیف/روز؛ با رشد نوتیف‌ها خطی بالا می‌رود. راه‌حل اختیاری (PR5): **outbox** با روز‌شرد (`push_outbox/<dayKey>`) که `notifications` همچنان منبع داخل‌اپ می‌ماند. اگر آن را انجام ندهیم، یک `PR-بیشینه` برای افزودن یک ایندکس عبارتـی روی `docs` لازم است (یعنی migration — برخلاف فرض §۵ پرامپت؛ به همین دلیل آن را از نسخه ۱ بیرون گذاشتم).

---

## ۶. ریسک‌ها و ۵ تصمیم که از شما لازم دارم

| # | سؤال | گزینه‌ها | پیشنهاد پیش‌فرض من |
|---|---|---|---|
| **Q1** | اتوماسیون‌های سیستمی که امروز **فقط داخل اپ**‌اند (`quiz_passed`, `quiz_failed`, `welcome`, `badge_earned`) در پنل چه رفتاری داشته باشند؟ | (الف) دقیقاً همان امروز: فقط سوییچ/اولویت/سقف، بدون تغییر پوش · (ب) پنل بتواند `push` را روشن کند (نیازمند override روی `DEFAULT_TEMPLATES.push` → لمس `notify.ts` و ریسک تست‌ها) | **(الف)** در نسخه ۱؛ در لیست، کنارشان برچسب «فقط داخل اپ در وضعیت فعلی» + لینک به تب «قالب‌ها». (ب) به PR اختیاری ۸ موکول شود |
| **Q2** | تأخیر مجاز برای رویدادها (مثلاً «۲ ساعت بعد از رد شدن») و رویداد «فوری» | (الف) فقط کرون: تا ۱۵ دقیقه تأخیر، کمترین هزینه · (ب) کرون + `ctx.waitUntil` (مثل `backgroundJob()` در `cloudflare-worker.ts:157`) برای kind=`event` | **(ب)** با محدودیت: فقط برای `event`های با ≤ ۵۰ مخاطب و فقط در Worker؛ مسیر HTTP هرگز منتظر FCM نمی‌ماند |
| **Q3** | سناریوهای ۷ (`preferred_time`)، ۲۲ (`team_rank_change`)، ۲۷ (`manager_score_drop`) — منبع داده ندارند | (الف) حذف از کاتالوگ نسخه ۱ · (ب) seed با `enabled=false` و برچسب «نیازمند داده — نسخه ۲» · (پ) محاسبهٔ رتبه/میانگین هفتگی به‌عنوان خروجی جانبیِ sweep هفتگی همین نسخه | **(ب)** برای ۷ و ۲۲؛ **(پ)** فقط برای ۲۷ اگر گفتید برایتان مهم است (هزینه: ۱ کوئری اضافه `attempts` در اجرا هفتگی) |
| **Q4** | opt‑out کاربر (خاموش‌کردن دسته‌ها) کجا اعمال شود؟ | (الف) فقط در موتور اتوماسیون (سیستمی‌های قدیمی مثل `deadline_warning` تحت‌الشعاع نمی‌گیرند) · (ب) داخل `notifyUsers` برای همه به‌جز `manual` (رفتار فعلی همه را عوض می‌کند) | **(ب)** با این قید: فقط «پوش» خاموش می‌شود، اعلان داخل‌اپ همیشه ساخته می‌شود (قاعده ۶) و `manual`/کمپین‌ها استثنا هستند. اگر ریسک را بالا می‌دانید، (الف) در نسخه ۱ و (ب) در نسخه ۲ |
| **Q5** | نرخ شکست بالا یا cron خوابیده → چه کاری انجام شود؟ | (الف) فقط هشدار داخل پنل · (ب) هشدار + **خودکارخاموش‌کردن** اتوماسیون مقصر · (پ) هشدار + خودکار «توقف همه» | **(الف)**. خاموش‌کردن خودکار باعث می‌شود ادمین صبح ببیند چیزی بی‌دلیل خاموش بوده؛ kill‑switch دستی باید تنها ابزار باشَد |

**ریسک‌های فنی که بدون سؤال هم مدیریت می‌شوند:**

* **R1 — دو نفر هم‌زمان یک کلید را ویرایش کنند:** `version` + ۴۰۹ (الگوی `updateCampaign:411`).
* **R2 — نوشتن در مسیر HTTP و بلوکه شدن پنل:** هیچ ارسال پوشی از HTTP انجام نمی‌شود؛ فقط enqueue (قاعدهٔ ثابت‌شدهٔ `sendCampaignNow`).
* **R3 — رشد بی‌حد claim/decision/run:** shard روزانه + پاکسازی بودجه‌دار + `expireAt` (بدون اتکا به TTL روی D1).
* **R4 — واگرایی بک‌اند‌ها:** هر job جدید باید در سه جا ثبت شود (`CRON_JOBS`, `wrangler.toml`, `functions/src/index.ts`)؛ یک تست جدید (`cron.test.ts` را گسترش می‌دهم) این سه را همگام نگه می‌دارد — امروز `push-campaigns` در Firebase ثبت نیست.
* **R5 — نشت PII:** همهٔ خطاها از `sanitizeError` (push-campaigns.ts:168)؛ `push_automation_decisions` فقط شناسه نگه می‌دارد؛ هیچ توکنی در `data` پوش جز `notificationId/link/type/automationKey`.
* **R6 — تست‌های موجود:** `notify.test.ts` و `push-campaigns.test.ts` نباید تغییر کنند؛ هر تغییر لازم در `notify.ts` فقط «افزودنی با گارد» است (پارامتر اختیاری در `flushDeferredPush`، `isSafeInternalPath` با آرگومان اختیاری).
* **R7 — باگ پنهان که من دست نمی‌زنم ولی گزارش می‌کنم:** `/quiz/${quizId}` در `behavior.ts:372` (روتر `sectionId` می‌خواهد) — اگر بخواهید، PR مستقل.

---

## ۷. طرح PR (تقسیم، ترتیب، معیار پذیرش)

| PR | محتوا | معیار پذیرش (قابل بررسی) |
|---|---|---|
| **PR0 — زمین‌سازی (کوچک)** | `system_health/cron` + `system_health/push`، `PushSender.describe()`، excluded مسیر از middleware دانش (`admin.ts:33`)، تست سلامت | کارت سلامت با دادهٔ واقعی کار می‌کند؛ `POST /admin/push-automations/*` دیگر ایندکس دانش را زباله نمی‌کند؛ تمام تست‌های فعلی سبز |
| **PR1 — هسته** | تایپ‌ها + collections + `catalog.ts` (۲۷ مورد، همه `enabled=false` مگر سیستمی‌ها) + `settings` + `ensureAutomationCatalog` + claim/window + cooldown + سقف روزانه/هفتگی + `priority→{high,urgent}` mapping + `NotificationType='automation'` + تست واحد | `fireAutomationEvent` روی store حافظه‌ای: تکراری‌فرستادی = ۰؛ رد با دلیل در `decisions`؛ `missingVariable` متن ناقص تولید نمی‌کند؛ seed روی سند موجود چیزی بازنویسی نمی‌کند |
| **PR2 — API ادمین** | ۱۳ مسیر بخش ۷ + audit + rate‑limit + `version`/۴۰۹ | تست نقش (۴۰۱/۴۰۳، الگوی `push-campaigns.test.ts:63-70`)، تست dry‑run (بدون نوشتن)، تست pause‑all که در **همان isolate** بلافاصله اثر می‌کند |
| **PR3 — UI لیست + تب** | تب «کمپین‌ها/اتوماسیون» در `PushCampaignsPage` با `Tabs`، مسیرهای `/admin/push-campaigns/automations[/new\|/:key]` در `AdminRoutes.tsx`، کارت سلامت، kill‑switch با `ConfirmDialog`، جدول گروهی با `DataTable`، سوییچ فعال/غیرفعال با پیش‌نمایش «N نفر مشمول» | تست کامپوننت (الگوی `pushCampaigns.test.tsx`)؛ سوییچ بعد از ذخیره وضعیت سرور را نشان می‌دهد و در خطا rollback می‌کند؛ RTL/فارسی/اعداد فارسی؛ a11y سبز |
| **PR4 — ویزارد ۴ مرحله‌ای** | ۴ مرحله + پیش‌نمایش زنده با `PushNotificationPreview` + انتخاب `actionRef` از فهرست مجاز + جملهٔ خلاصه + اعتبارسنجی کلاینت/سرور + نسخه‌گذاری متن (۵ rev) | «۳ روز بی‌فعالیتی» در ≤۲ دقیقه ساخته می‌شود؛ متغیر ناشناخته در همان لحظه خطای فارسی می‌دهد (الگوی `updateTemplate:143-150`) |
| **PR5 — موتور زمان‌بندی + events** | Tier 1/Tier 2، `loadSweepContext` با توابع pure رفتار، `lastActiveAt` روی `/me/events` + `refresh`، hookها: `learning.ts:555`, `submitAttempt`, `rewards.ts:177`, `users.ts:166/419`, `content.ts:473`، `supersedes` در `notifyTemplate`، همگام `CRON_JOBS`/`wrangler`/`index.ts` | `runPushAutomations` روی ۱۴۱ و ۲۰۰۰ کاربر شبیه‌سازی‌شده: ≤۱۲ کوئری/اجرا؛ `daily-reminders` وقتی `inactive_1d` فعال است سکوت می‌کند (تست `jobs.ts`)؛ `cron.test.ts` سبز |
| **PR6 — عیب‌یابی و کاربر** | trace کاربر، تاریخچه اجرا، test‑send، تنظیمات اعلان در پروفایل (`/me/notification-prefs`) + اعمال opt‑out طبق Q4، هشدارهای خرابی | برای هر «نرفتن» یک دلیل خوانا در پنل؛ کاربر می‌تواند دسته‌ها را خاموش کند و مهلت‌ها همیشه روشن می‌مانند؛ test‑send فقط به دستگاه خود ادمین می‌رود و در آمار نمی‌آید |
| **PR7 — مستندات و رول‌اوت** | `docs/admin-push-automation.md` (+ به‌روزرسانی `admin-push-campaign-*.md`)، راهنمای فعال‌سازی تدریجی (۱ کاربر آزمایشی → ۱ تیم → همه)، Export/Import کاتالوگ، checklist پس از deploy | هیچ Secretی در ریپو نیست؛ checklist دقیقاً همان موارد ❓ بخش ۰ را پوشش می‌دهد |
| **PR8 (اختیاری، پس از تأیید Q1/Q3)** | override `push` برای قالب‌های سیستمی؛ سناریوهای ۲۲/۲۷ با `team_weekly_stats`؛ outbox روز‌شرد برای flush | فقط با بلهٔ صریح شما |

قاعده هر PR (طبق پرامپت، قابل اجرا پس از `npm ci`): `npm run lint`، `npm run typecheck`، `npm test`، `npm run format:check` + `npm run check:indexes -w functions`، و در توضیح PR بخشی به نام «چه چیزی تغییر نکرد».

---

## ۶.۵ تصمیم‌های گرفته‌شده (پاسخ شما — مبنای پیاده‌سازی)

| سؤال | پاسخ تأییدشده | اثر روی کد |
|---|---|---|
| Q1 | **(الف) رفتار سیستمی‌ها دقیقاً حفظ شود** | `DEFAULT_TEMPLATES.push` برای `quiz_passed/quiz_failed/welcome/badge_earned` دست‌نخورده می‌ماند؛ پنل برای کلیدهای سیستمی فقط `enabled`, `priority`, `maxPerUserPerDay`, آمار و «سقف» را ویرایش می‌کند و برچسب «در وضعیت فعلی فقط داخل اپ» + لینک به تب «قالب‌ها» نشان می‌دهد. override پوش به PR8 موکول شد |
| Q2 | **(ب) کرون + kick در پس‌زمینه** | `fireAutomationEvent` فقط enqueue می‌کند؛ `cloudflare-worker.ts` `backgroundJob()` با یک الگوی جدید برای مسیرهای `push-automations/*` زهکشی را بعد از پاسخ اجرا می‌کند (فقط رویدادهای با مخاطب کم). هیچ `await` روی FCM در مسیر HTTP |
| Q3 | **(ب+پ) ساختار seed برای هر سه، موتور در نسخه ۲** | سناریوهای ۷، ۲۲ و ۲۷ با `enabled=false` و `requiresFeature: true` در کاتالوگ seed می‌شوند و در پنل با توضیح «نیازمند داده — نسخه ۲» غیرفعال‌اند؛ سوییچ تلاش برای فعال‌سازی‌شان پیام روشن می‌دهد |
| Q4 | **(ب) اعمال opt‑out داخل `notifyUsers`** | `notifyUsers` قبل از `sendPush` ترجیح کاربر را می‌خواند و **فقط پوش** را خاموش می‌کند (اعلان داخل‌اپ همیشه ساخته می‌شود — قاعده ۶). `manual` و مسیر کمپین‌ها (`push-campaigns.ts`) از این گارد مستثنا هستند تا رفتار استودیوی کمپین تغییر نکند. مهلت‌ها (`deadline_warning`, `deadline_passed`) همیشه مجاز به پوش‌اند و در پنل کاربر «قفل/همیشه روشن» نشان داده می‌شوند |
| Q5 | **(الف) فقط هشدار داخل پنل** | هیچ خودکارخاموش‌کردنی وجود ندارد. `push_failure_rate` و `push_cron_stalled` به‌صورت هشدار (نوتیف ادمین + قرمزی کارت سلامت) و با `enabled=false` seed می‌شوند تا خودتان روشن کنید |

ضمناً تأیید شد: کار روی همین شاخهٔ سشن (`arena/de0335d3-seylane-sabz-learning`) و به‌صورت commitهای مجزا انجام می‌شود (ساخت شاخه/PR موازی در این محیط ممکن نیست)؛ ترتیب و مرز هر commit همان PR۰…PR۷ بخش ۷ است.

---

## ۸. آنچه در این مرحله **انجام نشد**

* هیچ فایل منبعی تغییر نکرد؛ هیچ تستی اجرا نشد (وابستگی‌ها نصب نیستند)؛ هیچ branch/PR/commitsی ساخته نشد.
* هیچ عددی از D1 پروداکشن خوانده نشد و هیچ ادعایی دربارهٔ وضعیت داشبورد Cloudflare/Firebase (تأیید نشده) انجام نشد.
* منتظر پاسخ Q1–Q5 (بخش ۶) هستم؛ پس از تأیید، از PR0 شروع می‌کنم. اگر بخواهید می‌توانم `npm ci` را همین حالا اجرا کنم تا از PR1 به بعد، نتایج lint/typecheck/test واقعی در هر PR گزارش شود.


## ۹. مرور PR #84 (درخواست بازبین) — دو مسیر دورزدن و یک پیداِ سوم

موضوعات P1 همان‌جا اصلاح شدند؛ این بخش شواهد را نگه می‌دارد تا بعداً کسی دوباره آن‌ها را کشف نکند.

| # | ایراد | محل | چه بود | بعد از اصلاح |
| --- | --- | --- | --- | --- |
| P1-1 | کلید توقف با «ارسال آزمایشی» دور زده می‌شد | `push-automation-engine.ts → sendAutomation` | `ctx.test \|\| ctx.dry` تصمیم `gate` را کامل رد می‌کرد و `gate` تنها جایی بود که `settings.paused` را می‌دید؛ `testSend` هم `test: true` می‌فرستد → در حالت توقف، یک `POST …/:key/test-send` اعلان واقعی (و push) می‌ساخت | چک `paused` داخل `sendAutomation` و **پیش از** آن bypass؛ `dry` معاف (چیزی نمی‌فرستد) |
| P1-2 | تنظیم ساعت سکوت، «اضطراری» جعلی می‌ساخت | `sendAutomation` → ساخت `NotifyOptions` | `...(a.delivery.respectQuietHours ? {} : { urgent: true, priority: 'high' })` — یعنی یک یادآوری عادی با `respectQuietHours: false` به `notifyUsers` می‌رسید طوری که انگار مهلت ۲۴ ساعته گذشته است (`bypassQuiet` در `notify.ts:294`) و بی‌درنگ push می‌رفت | آن spread حذف شد؛ جفت `high`+`urgent` فقط از `priority: 'urgent'` می‌آید (§۴.۴ سند: «فقط اولویت urgent مجاز به عبور است»)، و `validateSemantics` ترکیبِ «غیرفوری + عدم رعایت» را در نوشتن و در `import` رد می‌کند |

**سه واقعیت که اصلاح را بی‌خطر می‌کنند (بررسی‌شده در کاتالوگ و تست‌ها):**

- سه سطر کاتالوگ `respectQuietHours: false` داشتند: `deadline_passed` و `push_cron_stalled` که
  `priority: 'urgent'` دارند و مثل قبل از ساعت سکوت رد می‌شوند — از راه درست
  (`{ priority: 'high', urgent: true }`) — و `deadline_warning` با `priority: 'high'` که همان راه را با
  جعلِ جفتِ اضطراری می‌رفت. چون آن سطر دروازه‌ی قالبِ `deadline-sweep` است و `jobs.ts:55` خودش همین
  اعلان را با `urgent: left < 24h` می‌فرستد، **اولویتش در کاتالوگ به `urgent` عوض شد** (نه
  `respectQuietHours: true`): رفتارِ دیده‌شده برای کاربر همان می‌ماند و ادعای «اضطراری» حالا از کانال
  مجاز §۴.۴ می‌آید. یک تست تازه در همان فایل، سازگاری کل کاتالوگ با قاعده‌ی نوشتن را می‌سنجد
  («هیچ سطرِ آماده‌ای بدون `urgent` نخواهد ساعت سکوت را رد کند») — وگرنه هر ویرایشِ بی‌ربطِ آن سطر
  با ۴۰۰ برمی‌گشت. بقیه ۳۵ سطر `respectQuietHours: true` دارند و دست‌نخورده‌اند.
- کمپین‌های دستی اصلاً از `notifyUsers` رد نمی‌شوند (`d.push.send` در `push-campaigns.ts:636` و سطر
  `notifications` خودشان)، پس هیچ‌کدام از این دو اصلاح به رفتار کمپین نمی‌خورد؛ قالب‌های سیستمی از
  `notifyUsers` می‌روند و `urgent` بودنش را خودشان تعیین می‌کنند — `jobs.ts` همان `urgent: true` را برای
  مهلتِ زیر ۲۴ ساعت می‌فرستد. هیچ‌کدام تغییر نکردند.
- ویزارد از قبل درست نوشته بود («فقط «فوری» از ساعت سکوت رد می‌شود»); فقط hintِ همان چک‌باکس
  صریح‌تر شد که چرا برای اولویت عادی خاموش‌کردنش مجاز نیست.

**تست‌ها (۹ تای تازه، رفتار واقعی روی همان `RecordingPushSender` و دیتابیس حافظه‌ای):**
`functions/test/push-automation.test.ts → describe('the kill-switch and the quiet-hours window cannot be
talked around')` (۷): test-send در حالت توقف هیچ `notifications` و هیچ `push.sent` تولید نمی‌کند و ردیف
audit را با `sent: false` و `reason: 'paused'` می‌گذارد؛ بعد از ادامه‌دادن همان درخواست work می‌کند و
چون claim نسوخته، اجرای واقعیِ همان روز هم می‌فرستد؛ `force` + اولویت urgent + `kind: 'manual'` هم
نمی‌رسد؛ dry-run فقط برآورد می‌دهد و `note`اش توقف را اعلام می‌کند؛ قانون عادی با
`respectQuietHours: false` در ۲۳:۰۰ تهران `pushStatus: 'deferred'` با `deliverAfter` معتبر می‌گیرد و
پس از پایان بازه با `flushDeferredPush` **یکی** ارسال می‌شود (موکول، نه حذف); urgent همان لحظه رد می‌شود؛
و `PATCH` با ترکیب نامعتبر ۴۰۰ می‌دهد و سطر و نسخه‌اش دست نمی‌خورد.
`push-automation-export-import.test.ts` (۱): همان سطرِ نامعتبر از فایل import هم در dryRun و هم در نوشتن
رد می‌شود. و `describe('catalogue seeding')` (۱): سازگاری ۳۸ سطر با قاعده تازه‌ی `validateSemantics`.

**پیداِ سوم — ثبت شد و اصلاح نشد (بیرون از دامنه این درخواست):** شمارنده‌های کاربر در مسیر sweep
`persist` نمی‌شوند. `sendAutomation:343` اگر `ctx.counters` باشد فقط همان map را جلو می‌برد
(`if (ctx.counters) ctx.counters.set(...) else await writeCounter(...)`)، و `buildSweepContext` آن map را
از `loadCounterIndex` در ابتدای اجرا می‌سازد؛ هیچ flushی در پایان اجرا وجود ندارد. نتیجه:
سقف روزانه/هفتگی و `minGapMs` عملاً **داخل یک اجرا** نگهبانی می‌کنند، نه بین دو اجرای همان روز
(claimِ پنجره از تکرارِ همان قانون جلوگیری می‌کند، پس دو قانونِ متفاوت در دو اجرای همان روز می‌توانند
سقف ۲/روز را رد کنند) — و `GET …/trace/:userId` هم `daySent` را کم نشان می‌دهد. مسیر event/queue این
مشکل را ندارند (map ندارند → `writeCounter`). اصلاحش یعنی یک نوشتن به‌ازای هر کاربرِ ارسال‌شده در هر
اجرا، که عدد «۵۲ نوشتن در ۱۴۱ کاربر» (§۵ همین سند) و بودجه کران را عوض می‌کند. تصمیم جداگانه می‌خواهد؛
این PR دست نزده و در `docs/USER-TODO.md` §۴ هم علامت‌گذاری شده.

**به‌روزرسانی (لایه D3 همان موتور قاعده، بعد از این مرور): حل شد.** `sendAutomation` حالا **هر دو** کار
را می‌کند — map درون‌حافظه‌ای را برای سازگاری داخل همان اجرا، و `writeCounter` برای اجرای بعدی. پس سقف
روزانه/هفتگی، `minGapMs` و `delivery.cooldownMs` بین دو اجرای همان روز هم نگهبانی می‌کنند و
`traceUser`/کارت «چرا نرفت؟» عدد درست را نشان می‌دهند. با آن، شمارنده‌ی **سطح قاعده**
(`UserCounter.perRule`: روز/هفته/ماه/کل + آخرین ارسال) اضافه شد، چون «این کاربر امروز چند پوش گرفته»
سؤالِ سقف سراسری است و «این قاعده چند بار به این کاربر رسیده» سؤالِ `repeatPolicy` — یکی جای دیگری را
نمی‌خواند. هزینه: یک نوشتن به‌ازای هر کاربرِ ارسال‌شده در هر اجرا (همان اجرائی که claim، کارت اعلان و
لاگ تصمیم را می‌نویسد). اثر جانبیِ دیده‌شده: دلیلِ ردِّ دوم در تست «هر پنجره، یک بار» از `duplicate` به
`cooldown` عوض شد — چون حالا فاصله‌ی خودِ قاعده از اجرای قبلاً آگاه است؛ تست هم به همان شکل بازنویسی شد
(ادعای claim مستقل از ترتیب دلایل، با `isClaimed` نگهبانی می‌شود).
