# موتور اتوماسیون Push — API، قواعد و پنل (PR1 تا PR6)

این سند رفتار اتوماسیون اعلان‌ها را ثبت می‌کند: مجموعه‌ها، قواعد حاکم بر ارسال، مسیرهای ادمین و
پنل «اتوماسیون اعلان». ویزارد/جزئیات (PR4) هنوز ساخته نشده و همان قرارداد را مصرف می‌کند. تحلیل و دلیل هر تصمیم در
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
| `push_automation_events/<dayKey>/<hash>` | hash(`event\|userId`) | باکس خروجیِ اتفاق‌ها (PR5)؛ بعد از زهکشی پاک می‌شود و TTL شش‌ساعته دارد |
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
| GET | `/:key` | جزئیات + متن مؤثر (برای درگاه‌های قالب سیستمی) + `version` + `canDelete` + `audienceRole` (تا ویزارد بتواند همان جمعیت را حفظ کند) |
| GET | `/:key/revisions` | نسخه‌های متنِ همین کلید، از تازه به کهنه (بیشینه ۲۰) با یادداشت «ویرایش: …» |
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
- `imageUrl` همان قاعده کمپین‌ها را دارد: فقط HTTPS عمومی (`isSafeImageUrl` در `push-campaigns.ts`)؛
  خالی یعنی «بدون تصویر» و به `null` تبدیل می‌شود (`automationMessageSchema` در governor). پیش از
  این، طولِ رشته تنها بررسی می‌شد.
- **کلید توقف**: `paused` در `push_automation_settings/global` خوانده‌شده و نوشته‌شده بدون کش، پس از
  همان لحظه اثر می‌کند. این کلید **قابل دورزدن نیست**: `force` (دکمه «اجرای الان» و تست‌ها) فقط پنجره
  زمانی را رد می‌کند و اگر سامانه متوقف باشد هیچ ارسالی انجام نمی‌شود. صفِ موکول‌شده هم در حالت توقف
  دست‌نخورده می‌ماند — `drainQueue` بیرون می‌زند و آیتم‌ها `pending` می‌مانند تا بعد از ادامه‌دادن
  ارسال شوند؛ یعنی یک توقف موقت، یادآوری‌های صف‌شده را حذف نمی‌کند
  (`push-automation-engine.ts` → `runPushAutomations` / `drainQueue`).

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

## ۶) پنل وب (PR3)

مسیر `/admin/push-campaigns/automations`؛ تب دومِ همان «کمپین‌های Push» (`PushSectionTabs.tsx`)، پس
آیتم سایدبار عوض نمی‌شود و با تطبیق پیشوند، روشن می‌ماند. کد:

| فایل | نقش |
| --- | --- |
| `apps/web/src/pages/admin/pushAutomationModel.ts` | مدل خالص (بدون React/شبکه): گروه‌بندی، چیپ‌ها، فرمت اعداد، اعتبارسنجی سقف‌ها، آیتم‌های کارت سلامت |
| `apps/web/src/pages/admin/PushAutomationsPanel.tsx` | کارت سلامت، کلید توقف، جدول گروهی با سوییچ‌ها، برآورد (dry-run)، فرم سقف‌ها |
| `apps/web/src/pages/admin/PushAutomationsPage.tsx` | پوسته صفحه (هدر + تب‌ها + پنل) |

**پنل تصمیم نمی‌گیرد.** تنها منبع داده `GET /v1/admin/push-automations` (فیلدهای همان `listAutomations`)
و `GET /v1/admin/system-health` است؛ هیچ قاعده‌ای در کلاینت بازتولید نمی‌شود. دو استثنا که فقط برای
**پیش‌گیری از درخواست بی‌مورد**‌اند و سرور همان را یک‌بار دیگر بررسی می‌کند:

- `needsCriticalConfirm` — آینه `CRITICAL_AUTOMATION_KEYS`؛ دیالوگ تأیید **قبل** از ۴۰۹ نشان داده می‌شود
  (`ConfirmDialog`، متن «این اتوماسیون بخشی از زنجیره پیگیری مهلت است»).
- `validateCaps` — آینه `settingsSchema`؛ خطای فارسی قبل از ۴۰۰. عدد خالی «صفر» تلقی نمی‌شود،
  چون معنایش «هیچ پوش خودکاری نرود» است و باید صریح نوشته شود.

کنش‌ها و مسیرها:

| کنش UI | مسیر | قاعده |
| --- | --- | --- |
| سوییچ روشن/خاموش هر ردیف | `POST /admin/push-automations/:key/enabled` | فقط همان ردیف spinner می‌خورد؛ در خطا list دوباره خوانده می‌شود (حقیقت، سرور است نه کلیک) |
| توقف/ادامه همه | `POST /admin/push-automations/pause` | با دیالوگ تأیید و توضیح «اعلان‌های دستی و کمپین‌های زمان‌بندی‌شده کار می‌کنند» |
| سقف‌های سراسری | `PUT /admin/push-automations/settings` | دقیقه در UI، `minGapMs` در API |
| «چند نفر مشمول؟» | `POST /admin/push-automations/:key/dry-run` | فقط‌خواندنی؛ متن نمونه با داده واقعی، دلیل رد هر گروه، و یادآوری اینکه «هیچ اعلانی ساخته نشد» |
| «اجرای الان» | `POST /admin/push-automations/run` | `force`؛ سقف ۶ بار در ساعت (پیام فارسی از سرور) و سقف‌ها/فاصله/ساعت سکوت را دور نمی‌زند |

رسانایی: سوییچ‌ها `role="switch"` با `aria-checked` و `aria-label` «وضعیت «…»» هستند، گروه‌ها
`<section aria-label="گروه …">`، جدول `caption` دارد، و ردیف‌های «نسخه ۲» به‌جای پنهان‌شدن
`disabled` می‌شوند (با چیپ قفل) تا معلوم باشد چه چیزی و چرا وجود ندارد. همه اعداد با رقم فارسی و
متن‌ها RTL‌اند. `DataTable` هم جدول و هم کارت موبایل را در DOM نگه می‌دارد؛ تست‌ها همین را می‌دانند و
از «اولین» هر نقش استفاده می‌کنند.

تست‌ها: `pushAutomationModel.test.ts` (۱۵ مورد، مدل خالص) و `pushAutomations.test.tsx` (۱۱ مورد،
رندر مسیر واقعی با `mockApi`) — شامل «برآورد هیچ درخواستی به مسیر enabled نمی‌فرستد»، «۴۰۹ سرور
پیام فارسی‌اش را نشان می‌دهد و سوییچ به حالت سرور برمی‌گردد»، و «اعتبارسنجی سقف‌ها قبل از PUT».

## ۷) صفحه جزئیات و ویزارد (PR4)

مسیر `/admin/push-campaigns/automations/:key` (و `/…/automations/new` برای ساخت). نام هر ردیف در لیست
لینک همین صفحه است. فایل‌ها: `automationWizardModel.ts` (مدل خالص) و `PushAutomationDetailPage.tsx`
(صفحه جزئیات + ویزارد ۴ مرحله‌ای + ساخت).

**چهار مرحله = چهار پرسش**: چیست (کلید/نام/توضیح/دسته) · چه‌زمانی (تریگر و شرط‌ها) · برای چه‌کسی
(جمعیت، هدف، کانال، opt-in) · متن و ارسال (عنوان، متن، مقصد، تصویر، اولویت، سقف‌ها).

- `patchFromDraft` همیشه هر چهار شیء فرعی (`trigger`, `audience`, `message`, `delivery`) را کامل
  می‌فرستد؛ `updateAutomation` آن‌ها را *جایگزین* می‌کند، پس فرستادن ناقص یعنی پاک‌کردن. فیلدهایی که
  برای نوع تریگر بی‌معنی‌اند `null` می‌روند (مثلاً `weekday` در یک قاعده `inactivity`).
- `enabled` هرگز از ویزارد نوشته نمی‌شود؛ روشن/خاموش فقط سوییچ است (با `confirmCritical` برای سه کلید
  حساس). برای همین «ذخیره» نمی‌تواند بی‌خبر اعلانی را فعال کند.
- ساخت اتوماسیون تازه با `enabled: false` ارسال می‌شود (§۴.1 در پرامپت) و پیامش هم همین را می‌گوید.
- اعتبارسنجی کلاینت آینه `automationSchema` + `validateSemantics` است (همان message‌های فارسی)، و در
  طرف مقابل `ApiError.fields` (خطاهای zod سرور) روی همان اینپوت می‌نشیند؛ ۴۰۹ هم بنر «بازخوانی نسخه
  ذخیره‌شده» می‌آورد نه بازنویسی بی‌صدا.
- **فیلدها نه بر اساس سلیقه، بر اساس آنچه سرور می‌خواند**: `TRIGGER_FIELDS` مشخص می‌کند هر نوع تریگر
  چه ورودی‌هایی دارد؛ `conditions` فقط از `FACT_FIELDS` انتخاب می‌شود (عدد/بولی بر حسب kind)،
  `event` فقط از `EVENT_LABELS`، و `actionRef` فقط از `AUTOMATION_DESTINATIONS` — پس نمی‌توان مسیر
  دلخواه نوشت؛ `isSafePathTemplate` همان چیزی است که این فهرست را می‌سازد.
- درگاه‌های قالب (`templateKey`) ویزارد ندارند: متن و مقصدشان را ویرایشگر قالب می‌نویسد؛ صفحه این را
  با کارت آبی و `effectiveMessage` توضیح می‌دهد و «ارسال آزمایشی» برایشان خاموش است.
- کارت‌های پایین صفحه: «اجراهای این قانون» از `GET /runs?key=…` و «نسخه‌های متن» از
  `GET /:key/revisions` (فقط‌خواندنی؛ هیچ‌وقت بازنگشت‌دادن را پیشنهاد نمی‌کند، چون متنِ کهنه ممکن است
  متغیرش دیگر معتبر نباشد).
- پیش‌نمایش زنده با `previewOf` ساخته می‌شود؛ متغیری که با داده نمونه پر نشود به شکل `⟨name⟩` می‌ماند
  و هشدار «موتور در این حالت ارسال نمی‌کند» نشان می‌دهد — همان `missingVariable` در `gate()`.

تست‌ها: `automationWizardModel.test.ts` (۱۹ مورد: رفت‌وبرگشت draft ⇄ payload، آینه اعتبارسنجی،
جملات تریگر، پیش‌نمایش) و `pushAutomationDetail.test.tsx` (۱۱ مورد: خواندن، ذخیره با
`expectedVersion`، بلوک گام نامعتبر، ۴۰۹، خطای فیلد سرور روی input، dry-run، test-send، درگاه
فقط‌خواندنی، حذف با تأیید، ساخت خاموش).

## ۸) رویدادها و باکس خروجی (PR5)

تنها مسیر اتصال کد کسب‌وکار به موتور، `functions/src/services/push-automation-events.ts` است؛ هیچ
سرویسی مستقیم `fireAutomationEvent` را صدا نمی‌زند. چرخه: ثبت اتفاق → یک سطر کوچک در
`push_automation_events/<روزِ تهران>/<hash(event|userId)>` (`emitAutomationEvent`) → زهکشی یا بلافاصله
بعد از پاسخ (`cloudflare-worker.ts` → `backgroundJob`) یا در کران ۱۵ دقیقه‌ای (`cron.ts` → شغل
`push-automations`، پیش از `drainQueue`) → `fireAutomationEvent`.

| ویژگی | رفتار | کجا |
| --- | --- | --- |
| هزینه در وضعیت پیش‌فرض | اگر برای آن اتفاق قاعده‌ی روشنی وجود نداشته باشد، ثبت اتفاق **هیچ** نوشتنی ندارد: `listeningEvents` مجموعه شنونده‌ها را از `loadRunnable` می‌خواند و ۳۰ ثانیه به‌ازای `Deps` کش می‌کند. موتورِ متوقف‌شده هم «شنونده‌ای نیست» برمی‌گرداند، پس در دوران توقف چیزی صف نمی‌شود. | `push-automation-events.ts → listeningEvents` |
| ایدمپوتنسی (§4.2) | کلید سطر `hash(event|userId)` داخل شارد روز است و با `store.create` نوشته می‌شود؛ تکرارِ همان کاربر و همان اتفاق در همان روز با `StoreConflictError` بی‌صدا رد می‌شود (اولین مقدار متغیرها برنده است، مثل کلید idempotency). | `emitAutomationEvent` |
| مصرف یک‌بار | سطر چه به ارسال برسد چه به یک ردّ مستند، پاک می‌شود؛ «cap» یا «سکوت شب» نباید ساعت بعد همان یادآوری را برگرداند. | `drainAutomationEvents` |
| سقف‌ها | هر زهکشی حداکثر `EVENTS_PER_RUN = 30` سطر جلو می‌برد و برای هر کاربر `EVENTS_PER_USER_RUN = 4` تا؛ باقی‌مانده به تیک بعدی می‌ماند (کران تکرار می‌کند، پس چیزی گم نمی‌شود). | `drainAutomationEvents` |
| انقضا | یک اتفاق بعد از شش ساعت تاریخ می‌خورد؛ یادآوریِ سه‌ساعته‌ای که کسی لازم نداشت، دیگر نباید برود. | `EVENT_TTL_MS` |
| بدون استثنا | نه `emitAutomationEvent` و نه `drainAutomationEvents` به فراخوان خطا نمی‌دهند؛ خرابی در `automation_event_failed` ثبت می‌شود. | همان فایل |
| متغرها | `fireAutomationEvent` یک‌بار برای هر اتفاق `eventVars` را اجرا می‌کند (فقط اگر متن یکی از قواعد واقعاً `{…}` داشته باشد) و مقدارهای ارسالی فراخوان روی آن سوار می‌شود؛ به همین دلیل جای hook لازم نیست `learning-state` را import کند. این مقدارها داخل سطر صفِ `event_delay` منجمد می‌شوند، چون `drainQueue` همان‌ها را می‌خواند. | `push-automation-engine.ts → eventVars` |

اتفاق‌هایی که حالا ثبت می‌شوند:

| اتفاق | کجا ثبت می‌شود | قواعد مصرف‌کننده |
| --- | --- | --- |
| `attempt.started` | `learning.ts → startAttempt`، فقط برای تلاش تازه (resume تایمر را عقب نمی‌اندازد) | `quiz_abandoned` (تأخیر ۳۰ دقیقه) |
| `quiz.passed` | `learning.ts → submitAttempt`، شاخه قبولی و فقط `outcome.fresh` | — (قالب `quiz_passed` دروازه است) |
| `quiz.failed` / `quiz.failed_twice` | همان‌جا در شاخه ردّ؛ `twice` وقتی `attempt.attemptNumber >= 2` | `quiz_failed_nudge` (تأخیر ۱۲۰ دقیقه) / `two_fails_mentor` |
| `section.completed` | `learning.ts → recordProgressInner` داخل `step('section_completed_event')`؛ `sectionId` هم می‌رود چون `stillValid()` پیش از ارسال دوباره چک می‌کند | `section_ready_quiz` (تأخیر ۳۰ دقیقه) |
| `package.completed` | `learning.ts → onPackageCompleted`، درست بعد از ساخته‌شدن رکورد تکمیل (پس یک‌بار به‌ازای هر بسته) | `first_course_done` (`sendOnce` + ۳۶۵ روز) |
| `package.updated` | `content.ts → updatePackage` وقتی بسته منتشرشده است و `title`/`description` عوض شده (نه هر بار ذخیره فرم) | `package_updated` — فقط برای کسانی که در همان بسته پیشرفت دارند (`packageLearnerIds`)؛ مخاطب سطر `role: marketer` است که در این محصول همان «کارآموز» است |

عمداً hook نشده‌اند: `user.registered`، `assignment.created`، `badge.earned`، `retake.*`،
`manager.message`، `deadline.*` و `escalation` — این‌ها دروازه‌ی `templateKey` هستند (متن در تب
«قالب‌های اعلان» می‌ماند و `fireAutomationEvent` دروازه‌ها را اصلاً بررسی نمی‌کند)، پس ثبت‌شان فقط
سطر بی‌مصرف تولید می‌کرد. `team.member_joined` هم تا تعیین تکلیف متنش نوشته نمی‌شود: `{name}` در پیام
آن به مدیر باید اسم عضو تازه باشد، ولی `resolveVars` اسم خودِ گیرنده را می‌دهد.

`supersedes` از قبل وصل بود (`push-automation-governor.ts → templateGate` و
`notify.ts → notifyTemplate`؛ حالت `superseded` فقط `push: false` می‌کند و پیام داخل‌اپ نگه داشته
می‌شود — §4.5). بررسی `DEFAULT_TEMPLATES` نشان می‌دهد تنها قالبِ `push: true` که یک سناریوی غیردروازه
جای آن را می‌گیرد `reminder` است و هر چهار سطر `inactive_*` همان را اعلام کرده‌اند؛ برای بقیه (مثل
`quiz_failed`) خودِ قالب `push: false` دارد، پس mapping تازه‌ای اضافه نشد.

`AUTOMATION_EVENT_PATH` سه مسیر `POST /v1/me/…` را می‌شناسد. ویرایش بسته (`PATCH`) عمداً بیرون فهرست
است: `backgroundJob` فقط POST را اجرا می‌کند و یک یادآوری «محتوا به‌روز شد» با حداکثر پانزده دقیقه
تأخیر فرقی نمی‌کند. تست `the routes that emit are the routes the Worker drains after` روی منبع چک
می‌کند این دو فهرست از هم جدا نشوند.

تست‌ها: `functions/test/push-automation-events.test.ts` (۱۸ تست: شنونده‌ها، صف‌نشدن در حالت خاموش یا
متوقف، ایدمپوتنسی، مصرف یک‌باره، انقضا، سقف‌ها، resolve متغرها، و یک submit واقعی که سطر
`quiz_failed_nudge` را در صف همان روز می‌اندازد).

## ۹) تاریخچه اجرا و ردیابی کاربر (PR6)

دو صفحه فقط‌خواندنی در همان بخش «کمپین‌های Push» اضافه شد؛ هیچ مسیر HTTP تازه‌ای لازم نشد، چون
API‌ها از PR2 آماده بودند:

| صفحه | مسیر | داده |
| --- | --- | --- |
| تاریخچه اجراها | `/admin/push-campaigns/automations/runs` | `GET /v1/admin/push-automations/runs?key=&limit=` → `recentRuns()` |
| ردیابی کاربر | `/admin/push-campaigns/automations/trace` | `GET /v1/admin/push-automations/trace/:userId` → `traceUser()` |

ورودی‌شان نوار ابزار پنل است (لینک‌های «تاریخچه اجراها» و «ردیابی کاربر») و هدر کارت «اجراهای این
قانون» در صفحه جزئیات هم «تاریخچه کامل» را با `?key=<key>` deep-link می‌کند. فیلتر و تعداد سطر در
`searchParams` می‌نشینند، پس لینک کپی‌شدنی است و دکمه back مرورگر کار می‌کند (همان اصل
`PushSectionTabs`).

**متن دلایل روی سرور ساخته می‌شود.** `recentRuns()` هر سطر را با `skippedLabels` برمی‌گرداند — همان
`Array<{reason,count,label}>` که `dryRun()` می‌دهد — و مقدارش از `skipLabel()` در
`push-automation-governor.ts` می‌آید؛ بنابراین `SKIP_LABELS` تنها جای ترجمه است و اگر دلیلی تازه
به موتور اضافه شود، در این جدول هم فارسی نمایش داده می‌شود بدون تغییر در web. در تایپ وب
`skippedLabels` اختیاری است، چون سطرهای نوشته‌شده پیش از PR6 این فیلد را ندارند و آن‌ها با شمارش
خالص (`رد: ۴`) نمایش داده می‌شوند.

**ردیابی = همان سه چیزی که خودِ موتور دید:** انتخاب کاربر (`notification_prefs`)، سهم او از سقف‌ها
(`push_automation_counters`، همان‌طور که `readCounter()` روز/هفته را تنظیم کرده) و ردّهای ساعات اخیر
(`push_automation_decisions`). نام قانون از `catalog` می‌آید، نه از یک جدول محلی. کارت سوم فهرست
قوانینی است که برای این کاربر «قبلاً ارسال شده» (`counter.keys`) — همان چیزی که برای فهمیدن
cooldown/sendOnce لازم است.

**چرا هیچ دکمه‌ای روی این دو صفحه نیست:** یک اجرا یک واقعیت گذشته است؛ هیچ «بازگردانی»، «حذف» یا
«دوباره پردازش» ارائه نمی‌شود و retry واقعی همان «ارسال آزمایشی» است (`POST …/test-send`، §۳) که
خارج از سقف‌ها کار می‌کند و در تاریخچه به‌عنوان «دستی» ثبت می‌شود.

**حریم (§4.6):** صفحه ردیابی شماره تماس را فقط به‌عنوان *ورودی* جست‌وجو استفاده می‌کند و هیچ‌گاه
چاپ نمی‌کند (تست: `document.body.textContent` نباید شماره یا id کاربر را داشته باشد). جست‌وجو با
ارقام فارسی یا لاتین هر دو کار می‌کند (`filterUsers`). `limit` حداکثر ۲۰۰ است — همان سقف
`runsQuery` در سرور.

تست‌ها: `apps/web/src/pages/admin/pushAutomationRunModel.test.ts` (۱۴ تستِ متن و محاسبه: مدت
ثانیه‌ای، جمله tally، بریدن دلایل به ۳ + «+۱ دلیل دیگر»، ترجمه وضعیت پوش، جمله سقف‌ها و
ترجیحات) و `pushAutomationRuns.test.tsx` (۱۰ تست UI، از جمله اینکه تا کاربری انتخاب نشده هیچ
استعلام ردیابی‌ای زده نمی‌شود و فیلتر عملاً همان `?key=` را به سرور می‌فرستد). سمت سرور هم
تست `the run history records one row per window with the skip reasons` حالا متن برچسب را هم قفل
می‌کند.

## ۱۰) چه چیزی هنوز انجام نشده


مستندات فعال‌سازی تدریجی (PR7): ترتیب پیشنهادی روشن‌کردن سناریوها، اندازه‌گیری اثر با کارت سلامت و
`/runs`، و عقب‌نشینی با kill-switch. بقیه موارد باز: hook نشدن `team.member_joined` (متن سطر کاتالوگ
باید اسم عضو تازه را بگیرد، نه گیرنده را)، و سه سناریوی `requiresFeature` که تا محاسبه
`team_weekly_stats` / داده‌ی هزینه آموزش روشن نمی‌شوند. سناریوهای `event` از PR5 عادی کار می‌کنند؛
برای فعال‌سازی کلیدشان را یک‌بار در پنل روشن کنید و اگر خواستید همان لحظه بررسی شود، «ارسال آزمایشی»
(`POST …/test-send`) را به‌کار بگیرید — اجرای دستیِ «اجرای الان» عمداً باکس خروجی را خالی نمی‌کند،
چون فقط قواعد زمان‌بندی‌شده را مربوط می‌داند.
