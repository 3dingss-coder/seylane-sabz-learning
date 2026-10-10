# موتور اتوماسیون Push — API و قواعد (PR1 + PR2)

این سند رفتار **بک‌اند** اتوماسیون اعلان‌ها را ثبت می‌کند: مجموعه‌ها، قواعد حاکم بر ارسال، و مسیرهای
ادمین. پنل (PR3/PR4) همین قرارداد را مصرف می‌کند. تحلیل و دلیل هر تصمیم در
[`admin-push-automation-analysis.md`](./admin-push-automation-analysis.md) است.

کد: `functions/src/services/push-automation-governor.ts` (قاعده‌ها)، `push-automation-engine.ts`
(اجرا)، `push-automation-catalog.ts` (داده ۲۷ سناریو)، `push-automation-admin.ts` (CRUD/پنل).

## ۱) مجموعه‌ها (بدون migration؛ همان جدول `docs`)

| مجموعه | کلید سند | نقش |
|---|---|---|
| `push_automations/<key>` | کلید اتوماسیون | خودِ قانون (تریگر، مخاطب، متن، نحوه ارسال، آمار) |
| `push_automation_settings/global` | `global` | سقف‌های سراسری + کلید توقف. **کش نمی‌شود** |
| `push_automation_claims/<dayKey>/<hash>` | hash(`key\|userId\|windowKey`) | ضدتکرار اتمی (`store.create`)؛ مثل `push_campaign_claims` |
| `push_automation_counters/user/<userId>` | userId | یک سند غلتان: شمارنده روز/هفته + آخرین ارسال هر اتوماسیون + آخرین پوش |
| `push_automation_decisions/<dayKey>/<userId>` | userId | «چرا ارسال نشد؟» — حداکثر ۲۰ مورد در روز برای هر کاربر |
| `push_automation_queue/<dayKey>/<key>__<userId>` | — | صف اتفاق‌های با تأخیر (`event_delay`) |
| `push_automation_runs/<id>` | id | تاریخچه اجرا (evaluated / sent / skipped به تفکیک دلیل / failed / error) |
| `push_automation_text_revs/<key>/<version>` | — | نسخه‌های متن و نحوه ارسال، برای ویرایش‌های بعدی |
| `notification_prefs/<userId>` | userId | انتخاب کاربر: دسته‌های خاموش‌شده، ساعت دلخواه، opt-inها |

`windowKey` = `YYYY-MM-DD` (یا `YYYY-Www` برای هفتگی) + سطل cooldown؛ یعنی «دقیقاً یک ارسال به ازای
هر قانون، برای هر کاربر، در هر پنجره». سند claim در شاردِ **امروز** نوشته می‌شود تا قاعده پاک‌سازی
یکسان باشد؛ منحصربودن از hash همان windowKey می‌آید.

## ۲) ترتیب قطعیِ مجوزدهی (`gate`)

همه بررسی‌های بی‌عارضه **قبل** از claim انجام می‌شود، چون یک claim پس‌گرفته نمی‌شود:

1. `paused` → 2. `disabled` → 3. `notImplemented` (سناریوی نسخه ۲) → 4. `inactiveUser` →
5. `audience` → 6. `optedOut` (دسته خاموش‌شده توسط کاربر) → 7. `optInOnly` → 8. `missingVariable` →
9. `noDevice` → 10. `priority` → 11. `capDay` → 12. `capWeek` → 13. `cooldown` / `sendOnce` →
14. `gap` (حداقل فاصله؛ `urgent` معاف است) → 15. `duplicate` (claim).

هر رد در `decisions` نوشته می‌شود و برچسب فارسی آن در `SKIP_LABELS` است. ردِ «متن ناقص»
(`missingVariable`) تنها وقتی رخ می‌دهد که متغیر **در همان پیام** استفاده شده و مقدارش در دسترس نباشد؛
پیام نصفه هرگز ارسال نمی‌شود.

## ۳) مسیرها

همه زیر `/v1/admin/push-automations` و پشت نقش **admin/superadmin** (بدون آن: ۴۰۱ / ۴۰۳). نوشتن‌ها
در `audit_logs` با پیشوند `push_automation.` ثبت می‌شوند و ایندکس دانش منتور را بی‌دلیل dirty نمی‌کنند
(`routes/admin.ts`).

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/` | فهرست همه اتوماسیون‌ها + برچسب «الان در پنجره زمانی است» + جمع امروز |
| GET | `/catalog` | داده‌های لازم ویزارد: کاتالوگ، متغیرها، مقصدها، دسته‌ها، داده‌های قابل شرط، اتفاق‌ها |
| GET | `/:key` | جزئیات + متن مؤثر (برای درگاه‌های قالب سیستمی) + `version` + `canDelete` |
| POST | `/` | ساخت اتوماسیون سفارشی (کلید یکتا، همه چیز `enabled: false` شروع می‌شود) |
| PATCH | `/:key` | ویرایش؛ `expectedVersion` فرسوده → ۴۰۹؛ هر ویرایش نسخه متن را می‌افزاید |
| POST | `/:key/enabled` | روشن/خاموش؛ برای `reminder` / `deadline_warning` / `deadline_passed` نیازمند `confirmCritical: true` (وگرنه ۴۰۹) |
| DELETE | `/:key` | فقط سفارشی‌ها؛ سناریوی کاتالوگ ۴۰۹ می‌گیرد (خاموشش کنید) |
| POST | `/:key/dry-run` | برآورد مشمولان با همان کد اجرا، **بدون** claim/شمارنده/فراخوانی سرویس |
| POST | `/:key/test-send` | ارسال آزمایشی به یک کاربر؛ سقف‌ها رد می‌شوند ولی در آمار و شمارنده نمی‌آیند (۱۰ بار در ساعت) |
| GET | `/runs?limit=&key=` | تاریخچه اجرا با دلایل رد |
| GET | `/trace/:userId` | لاگ تصمیمات + اعلان‌های رسیده + ترجیحات و شمارنده‌های کاربر |
| PUT | `/settings` | سقف‌های سراسری (`maxPerUserPerDay`، `maxPerUserPerWeek`، `minGapMs`، TTL، آستانه هشدار) |
| POST | `/pause` | کلید توقف (`{paused:true}`) — در همان isolate فوری اثر می‌کند |
| POST | `/run` | اجرای دستی (`force`)؛ ۶ بار در ساعت. پنجره زمانی claim همچنان جلوی تکرار را می‌گیرد |
| POST | `/seed` | ساخت اسناد کاتالوگ؛ روی سند موجود **ننویسد** |

کاربری (بازاریاب/مدیر): `GET|PUT /v1/me/notification-prefs`. خاموش‌کردن دسته `deadlines` یا `health`
ممنوع است (۴۰۰ با پیام فارسی)؛ بقیه دسته‌ها آزاد.

## ۴) اجرا

- job `push-automations` در گروه `*/15 * * * *` و **قبل از** `flush-push` (تا پوشِ موکول‌شده به پایان
  ساعت سکوت در همان اجرا خارج شود). هم در `services/cron.ts` و هم در `functions/src/index.ts`.
- Tier 1 هر اجرا: تخلیه صفِ رسیده (تا ۶۰ مورد، با بازرسی مجدد «آیا هنوز لازم است؟») + پاک‌سازی شاردها.
- Tier 2 فقط در پنجره Tehran خودِ قانون (بازه ۹۰ دقیقه‌ای از ساعت انتخابی): بارگذاری دسته‌ای **یک‌بار
  برای کل جمعیت** و سپس ارزیابی؛ هیچ کوئریِ به‌ازای‌کاربر وجود ندارد.
- هزینه واقعیِ اندازه‌گیری‌شده روی همین کد (۱۴۱ کاربر، store حافظه‌ای، یک قانونِ زمان‌بندی‌شده فعال،
  ۲۰ نفر مشمول تریگر، ۷ ارسال): **۲۰ کوئری و ۵۲ نوشتن** برای کل اجرا؛ اجرای دوم همان روز (همه
  تکراری) **۱۸ کوئری و ۳۱ نوشتن**. یعنی ~۰٫۵٪ سقف نوشتن روزانه D1 حتی اگر شش قانون در پنجره باشند.
- جمعیت = کاربران `status: 'active'`؛ پس کاربر غیرفعال حتی ارزیابی نمی‌شود (نه فقط رد).
- متن/تصویر و `actionRef` در `notifyUsers` ساخته می‌شود؛ مسیر مقصد **بعد از** جای‌گذاری متغیرها هم
  دوباره با `isSafeAutomationPath` بررسی می‌شود. در `actionRef` فقط متغیرهای شناسه‌ای مجازند
  (`{sectionId}`، `{packageId}`) — نام یا عنوان نمی‌توانند مسیر را عوض کنند.
- سراسری: سقف روزانه ۲، هفتگی ۱۰، حداقل فاصله ۴ ساعت (urgent معاف). اولویت `urgent|high|normal|low`
  به `priority` سرویس نگاشت می‌شود و عبور از ساعت سکوت فقط با `urgent` ممکن است.
- عدد داخل پیام‌ها فارسی است (`۴۵٪`)؛ اگر متغیری قابل پر کردن نباشد ارسال رد می‌شود.

## ۵) کاتالوگ و درگاه‌های سیستمی

`PUSH_AUTOMATION_CATALOG` (`push-automation-catalog.ts`) **۳۸ سند** می‌سازد و ترتیب ۲۷ سند اولش
ردیف‌به‌ردیف جدول §۸ پرامپت است:

| گروه | تعداد | کلیدها |
|---|---|---|
| سناریوهای §۸ | ۲۳ | `inactive_1d/2d/3d/7d`، `never_started_24h`، `evening_nudge`، `preferred_time`، `week_start`، `overdue_daily`، `package_updated`، `quiz_failed_nudge`، `section_ready_quiz`، `stalled_section`، `near_completion`، `two_fails_mentor`، `quiz_abandoned`، `streak_5`، `streak_at_risk`، `team_rank_change`، `first_course_done`، `manager_inactive_7d`، `manager_member_joined`، `manager_score_drop` |
| درگاه روی قالب موجود | ۱۳ | از §۸: `quiz_passed`، `quiz_failed`، `badge_earned`، `weekly_digest` + `welcome`، `new_assignment`، `reminder`، `deadline_warning`، `deadline_passed`، `manager_message`، `retake_request`، `retake_reviewed`، `escalation` |
| هشدار سلامت موتور | ۲ | `push_failure_rate`، `push_cron_stalled` |

انحراف‌های آگاهانه از جدول §۸ (هر دو در کد کامنت‌دارند): `never_started_24h` و `stalled_section` به‌جای
`event_delay` به‌صورت **شرط وضعیتی در پنجره روزانه** پیاده شدند (صفِ رویداد برای «۲۴ ساعت بعد از
ثبت‌نام» هیچ داده‌ای نداشت و هزینه هر heartbeat را بالا می‌برد)؛ لینک آزمون `/quiz/{sectionId}` است نه
`/quiz/{quizId}` (-route واقعی `apps/web` همین است) و در سناریوهای نسخه ۲ به‌جای `{rank}`/`{delta}` از
`{n}` استفاده شده چون آن داده‌ها هنوز محاسبه نمی‌شوند.

- هر سناریوی **جدید** با `enabled: false` seed می‌شود؛ هیچ اعلان تازه‌ای با deploy روشن نمی‌شود.
- یک **درگاه** `enabled: true` متولد می‌شود، چون رفتارِ امروز محصول است؛ خاموش‌کردنش یک اعلان داخل‌اپ
  موجود را حذف می‌کند. درگاه فقط روشن/خاموش + اولویت + آمار را نگه می‌دارد؛ متن همان‌جا نمی‌آید و در
  «اعلان‌ها ← قالب‌ها» ویرایش می‌شود (`DEFAULT_TEMPLATES` دست‌نخورده است).
- `supersedes: ['reminder']`: وقتی «یک روز بی‌فعالیتی» روشن است، `notifyTemplate('reminder')` پوش را
  رد می‌کند ولی کارت داخل‌اپ را می‌سازد — دو یادآوری هم‌زمان برای یک نفر نداریم.
- `requiresFeature` (سناریوهای ۷، ۲۲، ۲۷): ساخته می‌شوند ولی روشن‌شدنشان ۴۰۰ می‌گیرد و موتور هرگز
  اجرایشان نمی‌کند؛ در پنل با برچسب «نیازمند داده — نسخه ۲» دیده می‌شوند.
- `seedCatalog` اگر کاتالوگ خالی باشد اولین بار که پنل باز می‌شود خودکار اجرا می‌شود؛ وگرنه با
  `POST /seed`. هیچ‌وقت سند موجود را بازنویسی نمی‌کند.

## ۶) چه چیزی هنوز انجام نشده

پنل React (PR3)، ویزارد ۴ مرحله‌ای (PR4)، hookهای اتفاق در `learning.ts` / `submitAttempt` /
`rewards.ts` / `users.ts` / `content.ts` (PR5) و مستندات فعال‌سازی تدریجی (PR7). تا پیش از PR5،
سناریوهای `event` تنها با `fireAutomationEvent` (که از موتور در دسترس است) یا اجرای دستی فعال می‌شوند.
