# Changelog

## 2026-10-10 — موتور قاعده‌ی پویا: لایه‌های D1 تا D3 (هسته‌ی ارزیابی، اتصال به موتور، سیاست تکرار)

- سه ماژول تازه در `functions/src/services/automation/`: `fields.ts` (رجیستری فیلدها — ۱۳ فکت
  یادگیری، ۱۲ فیلد خودِ کاربر، ۳ فیلد رویداد؛ هر فیلد یک `kind` و دو پرچم `sweep`/`audience` دارد که
  هزینه و جای مجاز استفاده را تعیین می‌کند)، `operators.ts` (۲۱ عملگر type-aware با `evaluate` +
  `explain` + `validate`)، و `expr.ts` (`RuleNode`: گروه‌های `and`/`or`/`not` روی برگه‌های type-checked،
  بودجه‌های `RULE_LIMITS`، `validateRuleExpr`، `evaluateRuleExpr` که `truncated` و ردپای «چرا» برمی‌گرداند).
  افزودن فیلد/عملگر تنها با `registerField`/`registerOperator` ممکن است؛ موتور هیچ فهرست خصوصی‌ای از
  سناریوها ندارد و هیچ‌جا `eval` یا کدِ ذخیره‌شده‌ای اجرا نمی‌شود.
- **سقف «۶ شرط» رفت**: قاعده‌ی v2 درختش را در `when` می‌آورد و تنها محدودیتش بودجه‌ی ارزیابی است
  (۶۴ گره / ۶ سطح / ۴۸ شرط). `.max(6)` روی `trigger.conditions` مانده و فقط نگهبانِ شکلِ قدیمی است.
- `repeat.ts`: `RepeatPolicy` (فاصله، سقف روز/هفته/ماه، «یک‌بار برای همین رخداد»، «چندبار در روز»،
  «یک‌بار در عمر»، override هر قاعده و هر گام) + `decideRepeat` خالص +
  `policyFromLegacySettings`/`legacyParity` برای مهاجرت.
- موتور (D2): `ruleMatch` = ماشینه‌ی روشن‌کننده ∧ درخت `when` ∧ فیلتر مخاطب، با `why`/`lines`/`truncated`.
  `evaluateSweep` در حالت preview برای هر کاربر رد/قبول را گزارش می‌کند و `reviewed` را از `evaluated`
  جدا نگه می‌دارد. `sendAutomation` فیلتر مخاطب را **لحظه‌ی تحویل** دوباره می‌سنجد (تست: کاربر بین
  صف‌شدن و تحویل از تیم می‌رود ⇒ ارسال نمی‌شود) و جمله‌ی سیاست را در لاگ ردّ می‌نویسد.
- API: `POST`/`PATCH` حالا `when`، `audience.filter` و `repeatPolicy` را می‌پذیرند و هر درخت را پیش از
  ذخیره مقابل رجیستری می‌سنجند (۴۰۰ با مسیرِ گره‌ی بد). `GET …/catalog` رجیستری‌ها، بودجه‌ها و
  `eventProducers`/`unproducedEvents` را می‌دهد؛ `detail` هم `when`، `policySource`، `whenSummary` و
  `deadConditions`. فرمت فایل export به `seylane.push-automation/2` رفت تا سه فیلد موتور قاعده در فایل
  بمانند (یک قاعده بی‌شرط‌هایش در مقصد قاعده‌ی دیگری می‌شد).
- D3: `gate` برای قاعده‌ای که `repeatPolicy` دارد سه عدد سراسری را **نمی‌خواند**؛ شمارنده‌ی سطح قاعده
  (`UserCounter.perRule`: روز/هفته/ماه/کل/آخرین ارسال) اضافه شد و شمارنده در مسیر sweep هم نوشتن می‌شود —
  همان «پیداِ سومِ مرور PR #84» که باز مانده بود. دست‌نخورده و تست‌شده: کلید توقف، `enabled`،
  `requiresFeature`، وضعیت حساب، انتخاب خودِ کاربر (mute/opt-in)، متغیر ناتمام، نبودِ دستگاه معتبر،
  ساعت سکوت و ضدتکرار هر پنجره. `PRODUCED_EVENTS` + تستِ پیمایش src هم تضمین می‌کند هیچ اتفاقی که
  تولیدکننده ندارد «در اجرا پشتیبانی‌شده» اعلام نشود.
- تست: `rule-eval.test.ts` (۳۲) و `automation-rule-engine.test.ts` (۲۱، روی مسیر واقعی HTTP → فروشگاه →
  sweep → نوتیفیکیشن، با «۱۲ ارسال در روز برای یک کاربر» و «سیاست ≠ اجازه‌ی تکرارِ همان ارسال»).
  functions ۴۷ فایل / ۴۷۰ تست و web ۳۴ / ۲۳۱ ✓؛ lint/typecheck/format/build/`check:indexes` (۱۰۲ شکل،
  ۰ کمبود) ✓. یک ادعای قدیمی در `push-automation.test.ts` («دلیلِ ردّ دوم duplicate است») با دلیل
  `cooldown` بازنویسی شد — چون فاصله‌ی خودِ قاعده از اجرای قبلی آگاه شده است — و ادعای claim مستقل و
  قوی‌تر نگه داشته شد (`isClaimed`).
- **انجام‌نشده، صریح:** گام‌های چندمرحله‌ای (`steps` با wait/branch/cancel و لغو گام‌های معلق)،
  ویرایشگرهای پنل (`RuleTreeEditor`/`AudienceFilterEditor`/`StepsEditor`/`RepeatPolicyEditor`)،
  «تکثیر/بایگانی/بازگردانی نسخه» و endpoint های `validate`/`pending-steps`/`migrate`. تا ساخته‌شدن
  آن‌ها ساختن درخت از UI ممکن نیست و فقط API آن را می‌پذیرد؛ هیچ قاعده‌ای هم در پروداکشن روشن نشده است.

## 2026-10-10 — مرور PR #84: کلید توقف و ساعت سکوت، بستن دو مسیر دورزدن (PR8.1)

- **`sendAutomation`** (push-automation-engine.ts): `settings.paused` حالا **پیش از** bypassهای
  `test`/`dry` چک می‌شود. قبلاً «ارسال آزمایشی» تنها راهِ فرار از کلید توقف بود: `gate` که تنها
  نگهبانِ `paused` بود با `test: true` دور زده می‌شد و یک `POST …/:key/test-send` در حالت توقف اعلان و
  push واقعی می‌ساخت. پاسخ `reason: 'paused'` با برچسب فارسی است، تلاش در audit ثبت می‌شود، و چون
  claim و شمارنده‌ای مصرف نمی‌شود، اجرای واقعیِ همان روز بعد از ادامه‌دادن سرِ جایش می‌ماند. `dry-run`
  عمداً معاف است و `note`ش در همان حالت می‌گوید «زیر کلید توقف کلی … نه قولِ ارسال».
- **`sendAutomation`** (همان فایل): `respectQuietHours: false` دیگر جفت `priority: 'high'` + `urgent`
  را نمی‌سازد. طبق §۴.۴ سند، فقط اولویت `urgent` از ساعت سکوت رد می‌شود؛ یک یادآوری عادی حالا حتی با
  آن تنظیم، `pushStatus: 'deferred'` با `deliverAfter` می‌گیرد و در `flushDeferredPush` تحویل می‌شود.
  سه سطر کاتالوگ این گزینه را خاموش داشتند: دو سطرِ `urgent` (`deadline_passed`، `push_cron_stalled`)
  مثل قبل رد می‌شوند، و `deadline_warning` که `high` بود — اولویتش در کاتالوگ به `urgent` رسید تا همان
  رفتاری که `jobs.ts:55` برای مهلتِ زیر ۲۴ ساعت دارد از راه مجاز §۴.۴ ادامه پیدا کند (نه با جعل).
  کمپین‌های دستی اصلاً از این مسیر نمی‌روند (`d.push.send`) — یعنی هیچ رفتارِ دیگری عوض نشد.
- **`validateSemantics`** (push-automation-admin.ts): ترکیب «اولویت غیرفوری + عدم رعایت ساعت سکوت» در
  `POST`/`PATCH` و در `POST …/import` (و dryRunش) رد می‌شود، تا ویزارد کلیدی را نشان ندهد که موتور
  اجرا نمی‌کند. یک hint هم در همان گام صریح‌تر شد.
- تست: ۹ تای تازه (۷ + یک تست سازگاری کاتالوگ در `push-automation.test.ts`، ۱ در
  `push-automation-export-import.test.ts`) روی store حافظه‌ای و `RecordingPushSender` — نه snapshot.
  functions ۴۵ فایل / ۴۱۷ تست، web ۳۴ / ۲۳۱ ✓
- **پیداِ سوم، ثبت‌شده و اصلاح‌نشده:** شمارنده کاربر در مسیر sweep نوشتن نمی‌شود
  (`sendAutomation:343` فقط map را جلو می‌برد؛ flushی وجود ندارد)، پس سقف روزانه/هفتگی و `minGapMs`
  داخل یک اجرا نگهبانی می‌کنند نه بین دو اجرای همان روز. تحلیل و گزینه‌ها: §۹ سند تحلیل و یک بند در
  `docs/USER-TODO.md` §۴.

## 2026-10-10 — موتور اتوماسیون اعلان (PR0 تا PR8)

- پنل «کمپین‌های Push ← اتوماسیون اعلان» حالا یک موتور واقعی پشت دارد: ۳۸ سطر کاتالوگ (۲۵ سناریو + ۱۳ درگاه روی قالب‌های موجود + ۲ هشدار سلامت خودِ موتور)، ویزارد ۴ مرحله‌ای با پیش‌نمایش زنده، «ارسال آزمایشی»، تاریخچه اجرا (`/runs`) و صفحه «ردیابی کاربر» برای سؤال «چرا به این نفر نرسید؟».
- هیچ اعلانی با deploy روشن نمی‌شود: هر سناریو با `enabled: false` seed می‌شود و روشن‌کردن فقط یک سوییچ است. کلید «توقف همه اتوماسیون‌ها» کش نمی‌شود، پس از اولین درخواست/اجرای بعدی اثر می‌کند.
- قواعد حاکم بر ارسال: سقف ۲ پوش در روز و ۱۰ در هفته برای هر کاربر، حداقل ۴ ساعت فاصله، ساعت سکوت Tehran، ضدتکرار اتمی به‌ازای هر پنجره زمانی، «یک بار برای همیشه» (`sendOnce`) و پله بی‌فعالیتی (داخل یک دوره فقط بالاترین پله می‌فرستد). هر ردّ یک دلیل فارسی دارد و در لاگ تصمیم می‌نشیند.
- رویدادها از باکس خروجی (`push_automation_events`) می‌آیند: آزمون، تکمیل قسمت/بسته، به‌روزرسانی بسته، و «عضو تازه به تیم اضافه شد» (`{memberName}`)؛ نوشتن در باکس فقط وقتی اتفاق می‌افتد که واقعاً قانونی گوش می‌دهد (یک read کش‌شده، وگرنه صفر نوشتن).
- `supersedes`: وقتی «یک/دو/سه/هفت روز بی‌فعالیتی» روشن باشد، پوشِ قالب `reminder` حذف می‌شود و کارت داخل‌اپ می‌ماند — دو یادآوری هم‌زمان برای یک نفر نداریم.
- `GET /v1/admin/push-automations/export` و `POST …/import` برای بردن تنظیمات بین Preview و پروداکشن (با `dryRun`، سقف ۱۰۰ سطر، و revision برای هر سطرِ بازنویسی‌شده).
- سند: [`admin-push-automation-api.md`](./admin-push-automation-api.md) (قرارداد) و [`admin-push-automation.md`](./admin-push-automation.md) (فعال‌سازی تدریجی، اندازه‌گیری، عقب‌نشینی). رفتار کمپین‌های دستی، `DEFAULT_TEMPLATES` و مسیرهای `/v1/me/*` تغییر نکردند.
- پیش‌تر: کمپین‌های Push (استودیو + `push-campaigns`) هم ورودی CHANGELOG نداشتند؛ مستندشان در [`admin-push-campaign-api.md`](./admin-push-campaign-api.md) و [`admin-push-campaign-setup.md`](./admin-push-campaign-setup.md) است.


## 2026-10-06 (2) — Fix: D1 -> R2 migration stalled on the smallest files

- With `R2_MIGRATE_PURGE = "off"` the `migrate-blobs` job re-checked the same smallest files every run and never reached the larger ones (already-copied files used up the batch). Files already verified in R2 no longer count against the batch limits.
- New D1 table `blob_migration_log` (14 days kept): one row per copied/failed/purged file and one `run` summary per cron run, so progress can be read with a plain SQL query.

## 2026-10-06 — Media storage moves from D1 to R2 (faster image/audio/video loading)

- New R2 bucket `seylane-sabz-media`, bound as `MEDIA_BUCKET` in `wrangler.toml`. New uploads of images/audio/video are written to R2; reads prefer R2 and fall back to the D1 copy, so nothing breaks while files are still being moved.
- Seeks in audio/video read only the requested byte window from R2 (before: 256 KB chunks decoded from base64 in D1).
- New cron job `migrate-blobs` (every 15 min, a few files per run): copies each file D1 → R2 (big files as 8 MiB multipart parts), verifies the size, and only deletes the D1 copy when `R2_MIGRATE_PURGE = "on"` (default `"off"`). Staging parts of resumable uploads (`uploads/…`) stay in D1 and are moved after they are assembled.
- Public brand/product images are served with `Cache-Control: public, max-age=86400`.
- At the time of the change D1 held 24 files (~118 MB: 19 audio/video, 5 images). Tests: `functions/test/r2-migration.test.ts`.

## 2026-10-05 — اصلاح املای «کلامین» و نام برند «بابل»

- «کالمین» همه‌جا به «کلامین» و «آیس بابل» به «بابل» اصلاح شد. بابل برندی جداست و آموزش‌های خودش را دارد (با برند آیس بال ادغام نمی‌شود).

## 2026-10-04 — ثبت‌نام: «انتخاب محل سکونت» (استان → شهر) و رسیدن آن به پنل ادمین و منیجر

- یک آزمون برای هر محصول: ویدیو و پادکست دو راه دیدن یک محتوا هستند؛ آزمون از همان اول باز است و دیدن/شنیدن اجباری نیست. زیر ۸۰٪ → قبل از تلاش بعدی باید یک بار ویدیو را دید یا پادکست را شنید (پیشرفت بسته بعد از مردودی صفر می‌شود).

**چرا:** فرم ثبت‌نام بازاریاب فقط نام، نام خانوادگی و شماره موبایل را می‌گرفت و ادمین/مدیر تیم نمی‌دانست هر بازاریاب کجاست. طبق درخواست، فیلد سوم فرم «انتخاب محل سکونت» شد: با زدن روی آن، پنجره‌ای باز می‌شود که بالای لیستش نوشته «لطفا استان خود را وارد کنید» و هر ۳۱ استان ایران را — با جستجو و اسکرول — نشان می‌دهد؛ به‌محض انتخاب استان، فیلد «شهر» زیر آن ظاهر می‌شود (قبل از پر شدن استان نمایش داده نمی‌شود) و فقط شهرهای همان استان را با جستجو/اسکرول می‌دهد. با انتخاب شهر، لیست بسته می‌شود و «ثبت‌نام و ورود» کار می‌کند.

**داده‌ی استان/شهر (تولیدشده):** `tools/build-iran-locations.mjs` داده‌ی `masterking32/iran-states-cities-districts` (دریافت‌شده از سایت اداره پست، لایسنس MIT) را به ۳۱ استان و ۱۵۴۷ شهر تبدیل می‌کند (تجمیع/مرتب‌سازی فارسی، اصلاح فاصله‌ی سه استان مثل «سیستان و بلوچستان») و **دو فایل یکسان** می‌نویسد: `apps/web/src/lib/iranLocations.ts` (لیست پویا در فرم) و `functions/src/domain/iranLocations.ts` (اعتبارسنجی سمت API). اجرای دوباره: `node tools/build-iran-locations.mjs`؛ حالت `--check` برای CI. جستجو و ذخیره با یک نرمال‌سازی فارسی انجام می‌شود: ي/ك، آ/ا، اعراب، نیم‌فاصله و «و» چسبیده («سیستان وبلوچستان» ≡ «سیستان و بلوچستان»)، ولی «نور آباد» ≠ «نورآباد».

**فرم و کامپوننت:** `apps/web/src/components/common/ResidencePicker.tsx` بر اساس الگوی combobox+listbox استاندارد ARIA APG: پنل با سربرگ راهنما، جستجوی زنده (تطابق اولْ‌پیشوند)، لیست مستقل و روان (max-h-64 + overscroll-contain، ~۱۰۰ شهر یک استان بدون لگ)، انتخاب/حرکت با کیبورد (↑↓/Enter/Esc/Home/End)، بستن با لمس بیرون، و شمارش تغییر استان → پاک شدن شهر. فایل ۲۶ کیلوبایتی داده فقط وقتی لیست برای اولین بار باز شود به‌صورت chunk جدا (۸٫۵ کیلوبایت gzip) لود می‌شود؛ صفحه‌ی «ورود» سنگین نمی‌شود.

**API و دیتابیس:** `phoneRegisterSchema` حالا استان و شهر را اجباری می‌گیرد و با دایرکتوری معتبر می‌سنجد (شهرِ استان دیگر با پیام ««مشهد» در استان یزد نیست.» رد می‌شود)؛ نام‌ها به شکل استاندارد ذخیره می‌شوند و در `User` به‌صورت `province`/`city` (نال‌پذیر، برای حساب‌های قدیمی) نگه داشته و با `publicUser` به کلاینت می‌روند. `PATCH /v1/admin/users/:id` هم می‌تواند محل سکونت را تصحیح یا با `null` پاک کند.

**پنل ادمین و منیجر:** جدول کاربران ستون «محل سکونت» و جستجوی آن («مشهد»/«خراسان») را دارد، دیالوگ ویرایش کاربر امکان اصلاح محل سکونت را می‌دهد، و کارت عضو در پنل منیجر (و جزئیات کاربر در ادمین) محل سکونت را نشان می‌دهد («ثبت نشده» برای حساب‌های قدیمی). کاربران دموی seed هم محل سکونت دارند.

**تست‌ها:** ۶ تست کامپوننت (نمایش‌نیافتن فیلد شهر قبل از استان، ۳۱ استان در لیست بازشو، جستجو/نرمال‌سازی، فیلتر شهرهای همان استان، پاک شدن شهر با تغییر استان، کیبورد، بستن با بیرون)، تست‌های دایرکتوری در هر دو ورک‌اسپیس (+ تست یکسان‌بودن بایت‌به‌بایت دو فایل تولیدشده)، ۳ تست جریان ثبت‌نام در `flows.test.tsx` (بدنه‌ی درخواست شامل استان/شهر، جلوگیری از ثبت‌نام بدون محل سکونت)، تست‌های Axe با لیست استان/شهر باز، اسپک Axe پلی‌رایت برای صفحه‌ی `/register` — جمعاً ۱۲۲ تست وب + ۲۱۴ تست functions سبز.

## 2026-10-04 — یک آزمون برای هر بسته (روی پادکست)، حذف مهلت، بانک سؤال نسخه‌ی ۳

**چرا:** مالک محصول فایل جدید `skincare_products_quiz_v3.csv` (۷۰ سؤال، ۷ محصول با دارت) را داد و خواست: هر سؤال فقط یک گزینه‌ی درست داشته باشد، برای ویدئو آزمون جدا نباشد و یک آزمون برای کل بسته (روی پادکست) باشد، و مهلت دیدن آموزش‌ها کلاً برداشته شود.

- `tools/export_quiz_bank.py` حالا از CSV می‌خواند؛ بانک ۷ محصول × ۱۰ سؤال است.
- هر بسته یک آزمون دارد: بانک کامل محصول روی بخش صوتی (پادکست) بسته، و اگر صوتی نداشت روی بخش اول. بخش‌های دیگر `quizRequired: false` دارند و با دیدن/شنیدن کامل، تمام‌شده حساب می‌شوند (`learning-state.ts`، `content.ts`، `seed.ts`، صفحه‌های بخش و بسته).
- مهلت از فرم بسته، چک‌لیست انتشار و گام‌های مسیر برداشته شد؛ انتشار بدون مهلت مجاز است و seed هیچ مهلتی نمی‌گذارد.
- دیتابیس زنده: آزمون ۶ بسته‌ی منتشرشده/پیش‌نویس با بانک جدید جایگزین و مهلت همه‌ی بسته‌ها خالی شد؛ هیچ بسته‌ای پیش‌نویس یا حذف نشد. پیکسل و کلامین (در فایل نیستند) همچنان سؤال سمپل دارند.

## 2026-10-03 — آزمون‌های واقعی محصولات از فایل‌های تست مشتری (جایگزین سؤالات سمپل)

**چرا:** تا پیش از این، seed برای هر قسمت آموزشی ۵ سؤال «سمپل» خودکار می‌ساخت (فقط از واقعیت‌های کاتالوگ) و آن‌ها را `needsReview=true` علامت می‌زد تا ادمین جایگزین کند. مشتری حالا فایل رسمی سؤالات را داده است: `skincare_products_quiz.docx` / `skincare_products_quiz.xlsx` — ۶۰ سؤال چهارگزینه‌ای (سؤال، گزینه‌ها، کلید صحیح، استدلال علمی) برای ۶ محصول پوستی. درخواست: آزمون همه‌ی برندها/محصولات سایت طبق همین داده باشد و جایگزین سمپل قبلی شود.

**بانک سؤال:** `tools/export_quiz_bank.py` شیت «SkinCare Products Quiz» اکسل راverbatim به `data/skincare-products-quiz.json` تبدیل می‌کند (۶ محصول × ۱۰ سؤال: ICE BALL، 4ME HYDRATION THERAPY، ATL QUICK FIX، ICE BUBBLE، WITH US، ZEN BODY OIL). با تغییر فایل مشتری، همان اسکریپت بانک را بازتولید می‌کند.

**اتصال به seed (`functions/src/seed/seed.ts`):** هر بسته‌ی آموزشی در `data/catalog-supplement.json` یک `quizKey` دارد؛ بانک بین قسمت‌های همان کلید به‌صورت پیوسته و قطعی تقسیم می‌شود — بسته‌های دوقسمتی ۵+۵ سؤال، تک‌قسمتی هر ۱۰ سؤال، و WITH US بین دو بسته‌ی «ویت آس» (صوتی) و «WITH US» (ویدیویی) ۵/۵. آزمون‌های دارای داده‌ی مشتری `needsReview=false` می‌شوند؛ محصولاتی که در فایل نیستند (ضدآفتاب پیکسل، دارت) همان سؤالات سمپل با `needsReview=true` را نگه می‌دارند.

**برند «زِن»:** برای میزبانی آزمون ZEN BODY OIL، برند زِن (لوگوی `zen.jpg`) و محصول پنهان `sb-290252101` (روغن نرم‌کننده پوست بدن، تصویر موجود در تصاویر محصولات) reactivated شدند و بسته‌ی منتشرشده‌ی «آموزش روغن بدن زِن (Zen)» اضافه شد.

**تست‌ها و گزارش:** تست جدید در `functions/test/seed.test.ts` برابری متن سؤال/گزینه/کلید/توضیح با بانک، تقسیم WITH US، ۱۰ سؤالی بودن زِن و سمپل ماندن پیکسل را چک می‌کند (جمعاً 178 تست functions + 96 وب سبز). `docs/SEED-REPORT.md` بازتولید شد و ستون Quiz (client-quiz-bank / sample / none) گرفت.

**نکته‌ی استقرار:** seed بسته‌های موجود را بازنویسی نمی‌کند (ویرایش ادمین اولویت دارد)؛ برای جایگزینی آزمون‌های سمپل قبلی در محیط‌های موجود، seed با `--force` اجرا شود.

## 2026-10-03 — منتور: دسترسی کامل به آزمون‌ها و کاتالوگ + «جعبه‌ی رفتار» برای هر برند و محصول

**چرا:** سه نیازِ مالکِ محصول: (۱) منتور به *همه‌ی* آزمون‌ها و پاسخ‌ها دسترسی داشته باشد، (۲) بر
اطلاعات *تمامی* محصولات اشراف داشته باشد نه فقط برندهای منتسب، (۳) برای هر برند و هر محصول یک
«جعبه‌ی رفتار» تعریف شود که منتور درباره‌ی آن برند/محصول کاملاً طبق آن رفتار کند. راهنمای کاربر:
[`docs/MENTOR-BEHAVIOR-BOXES.md`](./MENTOR-BEHAVIOR-BOXES.md).

**جعبه‌ی رفتار منتور (جدید)** — `functions/src/services/mentor-guides.ts`

| بخش | کار |
|---|---|
| مدل | `MentorGuide` در `domain/types.ts`: لحن، نقش، خلاصه، نکات کلیدی، مزیت‌ها، اعتراض↔پاسخ، FAQ، بایدها/نبایدها، کلمات کلیدی، اولویت، قانونِ پاسخِ آزمون |
| ذخیره | کلکسیون `mentor_guides` با کلیدهای `global` / `brand:<id>` / `product:<id>` |
| دانش | هر جعبه‌ی فعال یک آیتم `guide` در دانشنامه می‌شود (ایندکس + ایمبدینگ + ارجاع + گاردریل عدد) |
| رفتار | `selectGuides` موضوع را از سه سیگنال تشخیص می‌دهد (بسته، محدوده‌ی منابع، نامِ ذکر‌شده در سؤال) و متن جعبه را هم به اولِ `<context>` و هم به دستور سیستم تزریق می‌کند |
| API | `GET/PUT/DELETE /v1/admin/mentor/guides[/global|/brand/:id|/product/:id]` با ثبت کامل در `audit_logs` |
| UI | صفحه‌ی جدید `/admin/mentor` (فهرست همه‌ی برندها/محصولات با نشانِ «تعریف‌شده/پیش‌فرض»، جست‌وجو، فیلتر) + فرمِ کامل با **پیش‌نمایش متنی که به منتور داده می‌شود**؛ همچنین دکمه‌ی «تعریف رفتار منتور» در صفحه‌ی برند و روی هر محصول |

**آزمون‌ها و پاسخ‌ها** — آیتم `quiz` حالا صورت سؤال + گزینه‌ها + **کلید پاسخ** را دارد
(`Policy.mentorQuizAnswerAccess`، پیش‌فرض `true`)؛ قاعده‌ی پرامپت از `quizRule(allow)` می‌آید و
هر برند/محصول می‌تواند با `quizAnswers:'hide'` استثنا بگذارد. `PROMPT_VERSION` → `2026-10-mentor-3`.
(درخواستِ مستقیمِ کلید پاسخ قبلاً در گاردریل ورودی مسدود بود؛ حالا منتور آموزش می‌دهد، پروکتوری نمی‌کند.)

**اشراف بر کاتالوگ** — `Policy.mentorCatalogScope` (پیش‌فرض `all`) فیلترِ برند را در بازیابی
بی‌اثر می‌کند: منتور درباره‌ی هر برند و محصولی پاسخ می‌دهد، حتی منتسب‌نشده. بسته‌ها/قسمت‌ها همچنان
بر اساس انتساب محدودند. مقدار `assigned` رفتار قدیم را برمی‌گرداند.

**صفحه‌ی منتور فقط چت است** — سه تب (تحلیل عملکرد / پیشنهادها / چت) به یک صفحه‌ی چتِ تمام‌قد
تبدیل شد؛ `MentorBriefCard` (که فقط همین‌جا استفاده می‌شد) حذف شد. وضعیت مسیر و ناج‌ها همچنان در
صفحه‌ی اصلی هستند و `/me/mentor/behavior` و `/me/mentor/nudges` بی‌تغییر مانده‌اند.

**رفعِ یک خطای پنهان** — `MentorChat` دیگر در محیط‌های بدون `scrollIntoView` (jsdom، WebView قدیمی)
 crash نمی‌کند.

**تست و گیت** — `functions/test/mentor-guides.test.ts` (۱۵ تست) و
`apps/web/src/pages/admin/mentorGuides.test.tsx` (۵ تست)؛ دو تستِ قدیمیِ آزمون‌محور بازنویسی شدند تا
رفتارِ تازه را قفل کنند. جمع: functions ۲۰۰ و web ۱۰۱ تست؛ lint/typecheck سبز.

**Cloudflare D1:** هیچ مایگریشن جدیدی لازم نیست — `D1Store` روی یک جدولِ سندِ عمومی
(`docs(col, id, grp, data, updated_at)`) سوار است و `mentor_guides` فقط یک مقدارِ جدید برای `col` است.

## 2026-09-30 — منتور هوشمند: دانش‌نامه‌ی چندوجهی، تماس صوتی و موتور رفتاری (F14-V)

**چرا:** منتور نسخه‌ی MVP فقط روی متنِ تأییدشده جست‌وجو می‌کرد و یک مدل داشت. نیاز واقعی تیم فروش سه چیز است: پاسخ به «هر» سؤالی از «هر» نوع محتوایی (متن، تصویر، صدا، ویدیو، PDF)، گفت‌وگوی صوتی طبیعی، و راهنمایی روزانه‌ی «الان چه کار کنم؟». سند کامل: [`docs/MENTOR-AI.md`](./MENTOR-AI.md) — فهرست کلیدها: [`docs/USER-TODO.md`](./USER-TODO.md) §۳.۵.

**لایه‌ی چندمدلی (`functions/src/ai/`)**

| جزء | کار |
|---|---|
| `hub.ts` | مسیریابی بر اساس «کار» (chat/classify/vision/transcribe/synthesize/embed/realtime) با failover، تله‌متری هر فراخوانی و رد صریح قابلیت‌های پشتیبانی‌نشده |
| `gemini.ts` | چت، درک تصویر/PDF/ویدیو، TTS فارسی (PCM 24k)، ایمبدینگ دسته‌ای، توکن موقت Live برای تماس دوطرفه |
| `groq.ts` | Whisper فارسی برای گفتار→متن + لِین سریع مدل کوچک؛ TTS را عمداً رد می‌کند (صدای فارسی ندارد) |
| `local.ts` | ایمبدینگ آفلاین ۱۲۸بُعدی به‌عنوان پشتیبان اضطراری (بدون کلید) |
| `handoff.ts` | «پاکت» مهرشده‌ی زمینه بین مرحله‌ها؛ مدل‌ها آزادانه با هم چت نمی‌کنند، ارجاع‌ها قابل اثبات‌اند |
| `prompts.ts` | کتابخانه‌ی پرامپت با `PROMPT_VERSION` (پاسخ، استخراج رسانه، دسته‌بندی، لحن صوتی، مربی، قاضی، پیام رفتاری) |

**دانش و بازیابی** — `services/knowledge.ts` همه‌ی برندها/محصولات/بسته‌ها/قسمت‌ها (با متن آموزش)/آزمون‌ها (بدون کلید پاسخ)/سیاست‌ها/پلی‌های فروش/FAQ/استخراج رسانه‌ها را در یک ایندکس افزایشی جمع می‌کند (فقط تغییر‌یافته‌ها بازنویسی و دوباره ایمبد می‌شوند). `services/retrieval.ts` بازیابی ترکیبی BM25 + کسینوس با گسترش مترادف فارسی، تنوع بین بسته‌ها و **آستانه‌ی اطمینان روی سیگنال خام** دارد؛ زیر آستانه، پاسخ «نمی‌دانم + نزدیک‌ترین مطلب» است و هیچ مدلی صدا زده نمی‌شود.

**درک چندوجهی** — `services/media-ingest.ts`: ویدیو/صدای آپلودی (Whisper، و برای فایل‌های کوچک درک تصویری Gemini)، تصویر محصول (بسته‌بندی/ادعاها)، PDF و YouTube (مستقیم با URL). خروجی به‌صورت دانش ساخت‌یافته در `media_extractions` و کلیدش به `EXTRACTOR_VERSION` گره خورده؛ فایل سالمِ خوانده‌شده دوباره خوانده نمی‌شود. کرون `knowledge-reindex` روزانه همین کار + بازسازی افزایشی را انجام می‌دهد.

**تماس صوتی** — `services/voice.ts`: مسیر turn (MediaRecorder → Whisper با پرامپت واژگان برند/محصول → همان خط تولید مستند → Gemini TTS که PCM خامش با `wrapPcmAsWav` به WAV قابل پخش در مرورگر تبدیل می‌شود) و مسیر Live دوطرفه با توکن موقت (کلید اصلی هرگز به کلاینت نمی‌رسد، فکت‌ها از ابزار `voice/ground` می‌آید). سهمیه‌ی دوگانه‌ی دقیقه‌ای از سیاست‌ها؛ پایان تماس = ثبت خلاصه (با رضایت) + استخراج «کارهای گفته‌شده».

**موتور رفتاری** — `services/behavior.ts`: سیگنال → وضعیت (`momentum`/`pressure`/`health`/`risk` + دلیل متنی) → قواعد B1–B12 با اولویت و کانال (کارت/چت/صدا/Push/نقش مدیر)، dedupe روزانه و حداکثر ۲ مداخله در روز؛ بحرانی‌ها با رعایت ساعت سکوت به مدیر escalated می‌شوند. جمله‌بندی پیام با مدل انجام می‌شود، **تصمیم با قاعده**.

**کیفیت و پاسخ‌دهی** — عدد/درصد/تومان/ساعت در پاسخ باید در منابع باشد، وگرنه قاضی بازنویسی می‌کند و در نهایت پاسخ استخراجی («طبق محتوای آموزش: …») جایگزین می‌شود. داشبورد `GET /admin/reports/mentor-quality` نرخ «نمی‌دانم»، تأخیر هر مرحله، failover هر ارائه‌دهنده، دقیقه‌های صوتی و رضایت 👍/👎 را نشان می‌دهد.

**رابط‌ها** — نقاط پایانی بازاریاب: `/me/mentor/ask`, `/me/mentor/behavior`, `/me/mentor/voice/{session,turn,ground,transcript}`, `/me/mentor/coach/{start,turn,debrief}`. ادمین: گزارش کیفیت، `GET /admin/knowledge`، `POST /admin/knowledge/{extract,rebuild}`. وب: کارت «وضعیت مسیر» + برگه‌ی تماس صوتی + دکمه‌ی تماس در چت + فیلدهای سیاست صوتی در `/admin/policies`. کارهای زمان‌بندی: `mentor-daily` (ناج‌ها + سوئیپ رفتاری) و `knowledge-reindex`.

**خودترمیمی و پنل:** اگر اولین سؤال قبل از اجرای کرون برسد و ایندکس خالی باشد، همان درخواست ایندکس را یک‌بار می‌سازد (بدون همزمانی، حداکثر یک بار در ده دقیقه) تا استقرار تازه از دقیقه‌ی اول جواب بدهد. در پنل ادمین، تب «گزارش‌ها → کیفیت منتور» حالا نرخ «نمی‌دانم»، تأخیر، ارائه‌دهنده‌ها/تغییر مسیر، دقیقه‌های صوتی، رضایت و کارت «دانش‌نامه‌ی منتور» (پوشش رسانه‌ای + دکمه‌های خواندن فایل‌های جدید و بازسازی ایندکس) را نشان می‌دهد.

**تست و گیت:** `functions/test/mentor-ai.test.ts` با ۲۸ تست جدید (گاردریل‌ها، «نمی‌دانم» با صفر فراخوانی مدل، رد ادعای عددی بی‌منبع، افزایشی بودن ایندکس، جداسازی دسترسی، سقف صوتی، مسیر STT→پاسخ→TTS، قواعد B1–B12، همه‌ی نقاط پایانی) — جمع functions 146 و web 64 تست؛ lint/typecheck/format سبز.

**کلیدها:** `GEMINI_API_KEY` و `GROQ_API_KEY` (هر دو رایگان). بدون آن‌ها منتور خاموش نمی‌شود، فقط به حالت قاعده‌محور/متن برمی‌گردد.

## 2026-09-30 — Admin panel audit: 30 bugs found, all fixed (admin → marketer sync)

**Ops note:** `[triggers] crons` in `wrangler.toml` is commented out until the plan is confirmed (see `docs/USER-TODO.md` §4). The `Workers Builds` check that fails instantly on this PR is unrelated: Cloudflare posts it in the same second it starts for every PR (it never builds pull requests on this project). Separately, `npm run typecheck` is red on `main` for a pre-existing reason: CI typechecks before `npm run build`, which is what generates `functions/lib/seed-snapshot.json`; the one-line `ci.yml` reorder is recorded as a patch in `docs/USER-TODO.md` §1 because workflow files could not be pushed from this environment. `deploy.yml` untouched.

**Why:** the admin section had accumulated behaviour that either did nothing on the deployed target
or said "done" when it wasn't. Full pass over every admin screen + its API, verified against a live
seeded instance and against the marketer panel. Details: [`docs/AUDIT-ADMIN-FA.md`](./AUDIT-ADMIN-FA.md).

**Headline fixes:**

| Area | Fix |
|---|---|
| Scheduled jobs | `scheduled()` entrypoint + one job table in `functions/src/services/cron.ts` — on Cloudflare/Netlify **no** reminder/deadline/digest job ever ran, so every policy setting was inert; Firebase `onSchedule` and `POST /admin/jobs/:name` now dispatch through the same table. The `[triggers] crons` block ships **commented out**: Cloudflare validates cron plans at deploy time (a local `deploy --dry-run` accepts it), and a rejected deploy pins the live site to the previous version — re-enable it after confirming the plan and that the schedules show up in the console |
| Reminders | `runDailyReminders` honours `policy.reminderInactiveDays` (was a hard-coded 20 h) |
| Path deadlines | step deadline = 23:59 of the target day in the policy timezone, skipped past deadlines are reported as Persian warnings, path edits validate before writing (no half-applied path), an empty path is rejected, `recipients` is returned so a 0-audience target warns instead of lying |
| Content | section reorder works with archived sections, restoring a section appends it, `POST /admin/packages/:id/unarchive` + a «بایگانی» tab (archived packages used to be unreachable forever), publish returns the fresh doc + `notified/recipients`, `needsReview` clears when a question is edited |
| Users/teams | team↔manager relations are fixed on both sides (clearing, moving, demoting, archiving) and the API's `warnings` are shown in the dialogs |
| Notifications | push/message `actionRef` now points at `/messages` (`/notifications` had no route → marketer 404); admin panel got a «صندوق من» inbox; seeded demo notes use the valid `note` type |
| Web (time zones) | date/time fields read and write the Asia/Tehran wall clock (`toZonedInput`/`fromZonedInput`) instead of the browser's zone — an admin outside Iran no longer shifts deadlines by hours on every save |
| Web (components) | Modal Esc stack (nested confirm no longer closes the parent dialog and discards a one-time password), `StatusBadge` fallback for unknown statuses, `SectionEditor` no longer round-trips seconds through a minutes field, `PoliciesPage` keeps unsaved edits and re-syncs after save |
| Reports | audit `from`/`to` validated (bad date → 400 instead of 500) with a real upper bound; completion-report range uses Tehran days |

**Tests:** `functions/test/admin-sync.test.ts` (11) + `functions/test/cron.test.ts` (2) +
`apps/web/src/lib/dates.test.ts` (4) added; `functions/test/assignments.test.ts` deadline expectation
updated to the documented end-of-day rule. Gate green: format, lint, build, typecheck, 118 functions +
64 web tests, `check:indexes` (67 query shapes, 0 missing indexes).

**Needs an owner action:** Cloudflare Cron Triggers are not on the free plan — see `docs/USER-TODO.md` §1/§4 for the external-scheduler fallback.

---

## 2026-10-05 — Fix: site not opening / slow for some users (restore old-browser support, shrink catalog images, cache headers)

- **Root cause of "can't open":** the 2026-09-29 perf pass removed the legacy build and raised the floor to 2023+ engines. Older Android phones / WebViews / Samsung Internet then get a blank or unstyled page (no polyfills, Tailwind v4 CSS without `@layer` fallbacks). Restored `@vitejs/plugin-legacy` + `legacy-css.ts`, the old `browserslist`, and dropped the pinned `build.target`.
- **Slowness:** catalog PNGs were 600-1500 px / up to 1 MB but displayed at 40-130 px (70.8 MB total). New `scripts/optimize-catalog.mjs` (sharp, runs after `sync-assets`) resizes the mirrored copies to max 480 px → 8.9 MB. File names are unchanged, originals untouched.
- `public/_headers`: `/assets/*` immutable 1-year cache, `/icons/*` 7 days, `/catalog/*` 1 day + stale-while-revalidate (previously every file was re-validated on each visit).
- Trade-off: modern browsers download the polyfill chunk again (~+50 KB gzip) — see the 2026-09-29 numbers.

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
