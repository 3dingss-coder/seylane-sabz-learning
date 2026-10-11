# موتور قاعده‌ی پویا (Dynamic Rule Engine) — طرح فنی ارتقای اتوماسیون پوش

> این سند **طرح** است، نه گزارش کارِ انجام‌شده. وضعیت هر بند پس از پیاده‌سازی در §۱۰ همین سند و
> `docs/admin-push-automation-api.md` §۱۰ علامت‌گذاری می‌شود. هیچ عددی اینجا «قرار است» نیست اگر
> کد آن را نداشته باشد؛ §۱۰ فقط چیزهای **اثبات‌شده** را می‌نویسد.
>
> مبنای درخواست: پنل فعلی مجموعه‌ای از تریگرها/فیلدها/عملگرهای **ثابت** است (۶ شرط، ۴ عملگر،
> `conditions` فقط روی `kind:'condition'`، سقف سراسری ۲/۱۰/۴ ساعت). هدف: مدیریت کامل و منعطف
> قوانین از پنل.

---

## ۱) خط قرمزهایی که در کل طرح حفظ می‌شوند

۱. **هیچ `eval`، هیچ Function، هیچ کد ذخیره‌شده‌ای اجرا نمی‌شود.** یک قاعده *داده* است، نه برنامه؛
   مفسر، درخت را با تابع‌های از‌پیش‌نوشته‌ی رجیستری ارزیابی می‌کند.
۲. **کلید توقف، خاموش‌بودن قاعده، غیرفعال‌بودن حساب، ترجیح/لغو اشتراک کاربر، ایمنی مقصد و
   محدودیت فنی سرویس غیرقابل‌دورزدن‌اند** — این‌ها «سقف سراسری» نیستند، امنیت/رضایت‌اند.
۳. **dry-run هیچ اثری نمی‌گذارد**: نه `notifications`، نه claim، نه شمارنده، نه صف. (تست مستقل دارد.)
۴. **هیچ قاعده‌ای با مهاجرت روشن نمی‌شود**؛ مهاجرت فقط مدل را بازنویسی می‌کند و `enabled` را
   دست‌نخورده می‌گذارد؛ در محیط واقعی اصلاً نوشتن نمی‌کند مگر ادمین خودش بزند.
۵. رفتار ۳۸ سطر کاتالوگ فعلی باید بیت‌به‌bit حفظ شود → تست طلایی (§۹).

---

## ۲) مدل داده نسخه ۲

در همان `push_automation/<key>` (بدون SQL migration؛ فروشگاه اسناد عمومی است) و با
`schemaVersion` تا خواننده بداند با کدام شکل طرف است:

```ts
schemaVersion: 1 | 2;                    // نبودش = ۱
when?: RuleExpr | null;                  // شرطِ اعمال‌شده روی هر محرک (نه فقط kind:'condition')
audience: { … فعلی …, filter?: RuleExpr | null };  // فیلتر مخاطب، با AND/OR
steps?: AutomationStep[] | null;         // نبودش = یک «اقدام» ضمنی از message فعلی
repeatPolicy?: RepeatPolicy | null;      // سیاست تکرارِ خود قاعده (جایگزین سقف تحمیلی)
```

### ۲.۱) بیان شرط (`RuleNode` / `RuleExpr`)

نامِ type در کد `RuleNode` است و `RuleExpr` نامِ مستعارِ همان type برای پنل و همین سند است
(`export type RuleExpr = RuleNode;`).

```ts
type RuleNode = RuleLeaf | RuleGroup;

interface RuleGroup {
  type: 'group';
  op: 'and' | 'or' | 'not';
  children: RuleNode[];   // تو‌در‌تو؛ سقف فقط «بودجه» است، نه ۶
}

interface RuleLeaf {
  type: 'leaf';
  field: string;          // شناسه‌ی رجیستری فیلد: 'progress'، 'streakDays'، 'user.city'، 'event.score'
  operator: string;       // شناسه‌ی رجیستری عملگر:
                          // gte / gt / lte / lt / between / eq / neq / contains / startsWith /
                          // in / notIn / isTrue / isFalse / isEmpty / isNotEmpty / before / after /
                          // daysAgoGte / daysAgoLte / exists / missing
  value: number | string | boolean | null;   // داده، هرگز کد
  value2?: number | string | boolean | null; // فقط برای between
}
```

«۳ روز پیش به بعد» یک فیلد `days` جدا نمی‌خواهد؛ با `daysAgoGte` و `value = 3` نوشته می‌شود، چون
مبنای آن ساعتِ همان اجرای sweeping است — `now` به `evaluateRuleExpr` پاس داده می‌شود و هیچ عملگری
داخل خودش `Date.now()` صدا نمی‌زند (تست‌ها clock را inject می‌کنند، برای همین تاریخ‌ها قابل باورند).

بودجه‌ی ساختار (`RULE_LIMITS` در `expr.ts`): `maxNodes = 64`، `maxDepth = 6`، `maxLeaves = 48`،
`maxChildren = 48`، و برای گام‌ها `maxSteps = 8` (§۲.۲). اگر درخت از بودجه بزرگ‌تر باشد
**هنگام ذخیره** رد می‌شود (با پیام فارسی و عددِ مجاز). اگر با این حال درختِ بزرگ‌تری در فروشگاه بماند،
ارزیابی همان‌جا متوقف و `truncated: true` گزارش می‌شود و قاعده **ارسال نمی‌کند** — truncation فقط می‌تواند
یک ارسال را خاموش کند، هرگز نمی‌تواند یکی بسازد. این سقف‌ها برای بودجه‌ی ارزیابی در Worker است، نه برای
«۶ شرط».

### ۲.۲) گام‌های گردش‌کار (`AutomationStep`)

```ts
type AutomationStep =
  | { type: 'notify'; id: string; stepKey?: string | null; message: PushAutomationMessage;
      channel: 'any' | 'web' | 'android'; when?: RuleExpr | null }        // شاخه: ادامه نده اگر
  | { type: 'wait'; id: string; minutes: number; recheckWhen?: RuleExpr | null }
  | { type: 'stop'; id: string; when: RuleExpr; reason: string };
```

حداکثر ۸ گام به‌ازای قاعده (`MAX_STEPS`)؛ `notify` انتهایی الزاماً یکی است (بقیه اختیاری).
گام `wait` یک سطر در **همان** `push_automation_queue/<day>` می‌نویسد با `stepId`، و هنگام drain
ابتدا `recheckWhen` (و `when` قاعده و `audience.filter`) دوباره ارزیابی می‌شود؛ برقرارنبودن =
`status: 'cancelled'`، نه ارسال. لغوِ قاعده (خاموش/آرشیو/توقف) هم همان سطرهای `pending` را می‌بندد.

### ۲.۳) سیاست تکرار (`RepeatPolicy`) — همان‌جا که سقف‌های تحمیلی می‌نشینند

```ts
interface RepeatPolicy {
  minIntervalMs: number;              // ۰ = بدون فاصله؛ کف فنی ۶۰۰۰۰ (یک دقیقه)
  perDay: number;                     // ۰ = نامحدود؛ سقف فنی ۹۶
  perWeek: number;                    // ۰ = نامحدود؛ سقف فنی ۳۶۶
  perMonth: number;                   // ۰ = نامحدود؛ سقف فنی ۹۹۹
  oncePerEventInstance: boolean;      // برای «همین رخداد» فقط یک ارسال (retry ≠ ارسال تازه)
  allowSameDayMultiple: boolean;      // false ⇒ روزی حداکثر یک ارسال، حتی اگر perDay بیشتر باشد
  onceInLivespan: boolean;            // یک‌بار برای همیشه — شکلِ «خوش‌آمد»
  perRule?: { maxPerDay?: number; minIntervalMs?: number };
  perStep?: Record<string, { minIntervalMs?: number; maxPerDay?: number }>;
  respectQuietHoursAlways?: boolean;  // quiet hours حتی برای priority: 'urgent'
}
```

سطح idempotency جایی در `dedupeKey` نگه نداشته می‌شود: کلیدِ claim (`queueId`) در موتور ساخته می‌شود و
`oncePerEventInstance` فقط می‌گوید همان رخدادِ رویداد نباید دوباره ارسال شود — دو مفهوم، دو مکان.

`push_automation_settings` همان سه عدد (`maxPerUserPerDay`، `maxPerUserPerWeek`، `minGapMs`) را نگه
می‌دارد ولی معناش عوض می‌شود: **پیش‌فرضِ پیشنهادی پنل**، نه گیت اجباریِ `gate()`. `gate` این سه را فقط
وقتی اعمال می‌کند که `repeatPolicy` قاعده آن‌ها را خواسته باشد (و قاعده‌های v1 که سیاست ندارند، از
`policyFromLegacySettings(...)` مقدار می‌گیرند تا رفتارشان عوض نشود
— این نکته در §۹ تست دارد). کنترل‌های §۱ هیچ‌گاه از این مسیر حذف نمی‌شوند.

---

## ۳) رجیستری‌ها (تنها راه افزودن داده/عملگر/محرک/اقدام)

سه فایل جدید در `functions/src/services/automation/`:

| فایل | چه دارد | افزودن قابلیت جدید یعنی |
| --- | --- | --- |
| `fields.ts` | `FIELD_REGISTRY: FieldDef[]` با `id,label,kind,unit?,group,source,load?` | یک شیء در فهرست + (اگر داده‌ی تازه می‌خواهد) یک `load` کوچک؛ `resolveFact` همان را صدا می‌زند |
| `operators.ts` | `OPERATOR_REGISTRY: Map<id, { kinds, label, arity, evaluate, explain }>` | یک ورودی با `evaluate(actual, node)` خالص؛ هیچ مسیر نوشتن/فراخوانی ندارد |
| `steps.ts` | `STEP_REGISTRY` (اقدام‌های مجاز) + `EVENT_REGISTRY` (اتفاق‌های پشتیبانی‌شده با `producer`) | اقدام: یک تابع `run(d, ctx, step)`؛ اتفاق: یک فراخوانی `emitAutomationEvent` در منبعش + یک تست |

قاعده‌ی «فیلد از کجا می‌آید» (هزینه): هر `FieldDef` اعلام می‌کند `source: 'user' | 'facts' |
'learning' | 'health' | 'prefs' | 'device'` و `sweep: boolean` (یعنی در sweep دسته‌جمعی با داده‌ی
همان `SweepContext` محاسبه می‌شود، یا فقط برای یک کاربرِ خاص در مسیر event/trace). یک فیلدِ
`source:'learning'` که `sweep:true` ندارد **نمی‌تواند** در شرطِ یک قانون `schedule_daily` استفاده شود؛
`validateExpr` این را رد می‌کند («این داده در اجرای زمان‌بندی‌شده در دسترس نیست») تا هزینه‌ی
اجرا ناگهان ۵ کوئری به‌ازای‌کاربر نشود. این همان جایی است که «انعطاف» و «بودجه» با هم آشتی می‌کنند.

`kind` روی `evaluate` تحمیل می‌کند چه عملگرهایی مجازند: `number, text, boolean, date, duration,
enum, presence`. اعتبارسنجی نوع **هنگام ذخیره** است (`value` باید با `kind` بخواند: عددِ واقعی،
`HH:mm` یا ISO برای date، عضو بودن در `options` برای enum) و `explain()` برای هر عملگر یک جمله‌ی
فارسی می‌سازد که همان ردپای «چرا برقرار شد/نشد» است.

---

## ۴) ارزیابی و ردپا (`explain`)

```
evaluateRule(expr, facts, now) → { ok: boolean; nodes: TraceNode[] }
TraceNode = { path: string; label: string; ok: boolean; actual?: string; detail?: string }
```

مفسر: یک پیمایش بازگشتی روی `and/or/not` با بودجه‌ی گره؛ هیچ اثر جانبی ندارد. `not` فقط روی
group/leaf. خروجی `nodes` (سقف ۴۰ سطر) در همان `push_automation_decisions/<day>/<userId>` می‌نشیند
تا صفحه‌ی «چرا به این نفر نرسید» و `dry-run` بگویند کدام برگه به چه عددی خورد، نه فقط «رد شد».

مسیرهای نوشتن: `noteSkip` یک `detail` می‌گیرد؛ `explainSummary(nodes)` همان را پر می‌کند (مثلاً
`progress=۴۰ < ۸۰`). برای `sent` هم خلاصه‌ی گره‌های برقرار ثبت می‌شود (بدون نوشتن اضافه: همان یک
سطر تصمیمِ هر کاربر در هر روز).

---

## ۵) API (همه زیر `/v1/admin/push-automations`، همان احراز نقش‌ها)

| متد | مسیر | تازه/تغییر |
| --- | --- | --- |
| GET | `/meta` | علاوه بر `facts`: `fields` (با `runtime`/`sweep`)، `operators`، `stepKinds`، `events` با `implemented`، `repeatPolicyDefaults` |
| POST | `/` | بدنه v2؛ اعتبارسنجی درخت + گام‌ها + نوع مقادیر؛ پیش‌نمایشِ «چه اتفاقی می‌افتد» در پاسخ نیست (فایل جدا) |
| PATCH | `/:key` | همان، با `expectedVersion` |
| POST | `/:key/duplicate` | می‌سازد با `key` تازه، `enabled:false`، نام «… (کپی)» |
| POST | `/:key/archive` | `{archived:boolean}`؛ آرشیو از فهرست پیش‌فرض بیرون می‌رود، قابل برگشت، و اگر روشن باشد نمی‌توان آرشیو کرد (اول خاموش) |
| POST | `/:key/revisions/:version/rollback` | متن/تنظیمات آن نسخه را **به‌عنوان ویرایش تازه** می‌نویسد (نسخه‌ها خطی می‌مانند؛ چیزی پاک نمی‌شود) |
| POST | `/:key/validate` | بدون نوشتن: خطاهای ساختار/نوع/داده‌ی در دسترس، هشدارها (مثلاً «هیچ گام انتهایی ندارد») |
| POST | `/:key/dry-run` | `{userId?, limit?}`: ارزیابی واقعی روی کاربر/گروه، با `trace[]` به‌ازای کاربر؛ **صفر نوشتن** |
| POST | `/:key/test-send` | بدون تغییر (و مثل قبل زیر کلید توقف اجرا نمی‌شود) |
| GET | `/:key/pending-steps` | شمارش سطرهای `pending` این قاعده + نزدیک‌ترین `dueAt` (برای «اقدامات معوق») |
| POST | `/:key/pending-steps/cancel` | بستن سطرهای معوق یک قاعده (مثلاً بعد از ویرایشِ متن؛ وگرنه پیامِ قدیمی می‌رسد) |

خروجی‌ها همان `data` envelope فعلی؛ هیچ مسیر عمومی جدیدی برای اجرای کد باز نمی‌شود.

---

## ۶) UI (`apps/web/src/pages/admin`)

- `RuleTreeEditor` (جدید): درخت شرط — افزودن گروه AND/OR/NOT، افزودن شرط، جابه‌جایی، حذف،
  کشوی «فیلدهای قابل استفاده» گروه‌بندی‌شده، مقدار متناسب با `kind` (number با unit، date با
  `HH:mm`/تاریخ، enum با `<Select>`، presence بدون مقدار). خلاصه‌ی فارسیِ همان درخت زیرش نوشته
  می‌شود (مثل `conditionSentence` فعلی، اما بازگشتی).
- `AudienceFilterEditor`: همان کامپوننت با `scope:'audience'` تا فقط فیلدهای کاربر مجاز باشند.
- `StepsEditor`: فهرست گام‌ها (کشیدن/انداختن لازم نیست؛ دکمه بالا/پایین)، نوع گام، `when` هر گام با
  `RuleTreeEditor` جمع‌شده، هشدار «این قاعده گام انتهایی ندارد».
- `RepeatPolicyEditor`: فاصله، سقف روزانه/هفتگی/ماهانه، «یک‌بار برای همیشه»، «چند ارسال در روز»،
  override هر گام + «بدون محدودیت» با تأیید (چون عمداً سقف را برمی‌داریم، پنل باید بگوید کدام قاعده
  بی‌سقف است؛ ردیفِ فهرست برچسب «بی‌سقف» می‌گیرد).
- **برچسب ظرفیت** همه‌جا: کنار هر فیلد/اتفاق/اقدام یا `✓ در اجرا پشتیبانی می‌شود` یا `⚠ فقط در
  پنل قابل انتخاب است (داده‌اش محاسبه نمی‌شود)` — و گزینه‌ی دوم برای انتخاب **قفل** است با توضیح.
  این پاسخِ مستقیم خواستهٔ «تفاوت انتخاب‌پذیری و پشتیبانی واقعی» است.
- `PushAutomationTracePage`: ردپای هر گره (tree با ✓/✗ و مقدار واقعی) + لینک «اقدامات معوق این قاعده».
- `PushAutomationDetailPage`: تب‌های «شرط‌ها»، «گام‌ها»، «تکرار»، ویرایشگرهای تازه، دکمه‌های
  «تکثیر»، «بایگانی»، «بازگردانی به نسخه…» با ConfirmDialog.

---

## ۷) مهاجرت (بدون روشن‌کردن چیزی، بدون نوشتن اجباری)

۱. **سازگار در خواندن**: `withDefaults(a)` در `loadAutomations`، سطر v1 را به v2 می‌برد —
   `when = conditionsToExpr(trigger.conditions)` (فقط برای `kind:'condition'` مثل قبل)،
   `audience.filter = null`، `steps = [notify(message)]`،
   `repeatPolicy = { scope:'window', maxPerDay: a.delivery.maxPerUserPerDay ?? settings.maxPerUserPerDay,
   minGapMs: settings.minGapMs, dedupeKey:'rule' }`. یعنی همان رفتار، با مدل تازه؛ هیچ سطر جدیدی
   نوشته نمی‌شود.
۲. `POST /migrate {dryRun:true}`: گزارش می‌دهد کدام کلیدها بازنویسی می‌شوند و چه چیزی در مدل‌شان
   عوض می‌شود (و اینکه هیچ `enabled` ای تغییر نمی‌کند). `dryRun:false` فقط با سوپرادمین.
۳. **هیچ migration SQL لازم نیست** و هیچ کلیدی حذف/ریست نمی‌شود؛ claim/شمارنده/audit/decisions
   همان‌ها می‌مانند (کلیدهای id تغییر نمی‌کنند، پس claim های امروز هم بازنشانی نمی‌شوند).
۴. Export/Import (PR8) فیلدهای v2 را می‌برد؛ سطر v1 هم خوانده می‌شود (`schemaVersion` اختیاری).

---

## ۸) اجرا در Worker: بودجه، صف، retry، idempotency، هم‌زمانی

- **بودجه**: هر sweep درِ `CRON_BUDGET_MS` را بین گام‌ها چک می‌کند (مثل امروز) و یک بودجه‌ی
  *گره* هم دارد: اگر ارزیابی درختِ یک کاربر از `MAX_NODES` گذشت، همان کاربر `skipped:'error'`
  می‌شود و اجرا ادامه می‌یابد (نه انفجار CPU در یک isolate).
- **صف**: سطرهای `pending` با `dueAt`؛ drain سقف `QUEUE_ITEMS_PER_RUN` دارد و بقیه تیک بعدی.
  یک `wait` ۳ روزه فقط یک سطر است، نه hold کردن isolate.
- **idempotency**: `queueId(key, userId, dueBucket)` و `claimPath(key,userId,windowKey,shard)`
  با `store.create` + `StoreConflictError` (تکرارِ retry یا درخواست هم‌زمان → یک نوشتن). برای گام‌ها
  `stepId` در hash می‌آید (`dedupeKey:'rule+step'`)، پس دو گامِ یک قاعده همدیگر را نمی‌خورند.
- **تفاوت «تکرار مجاز» با «تکرارِ retry»**: تکرارِ retry از روی **کلید** خنثی می‌شود (id یکی است →
  create به تعارض می‌خورد)، ولی تکرارِ مجازِ سیاست قاعده **کلیدش عوض می‌شود** (پنجره بعدی/
  `dueBucket` بعدی) و پس از `minGapMs` و `maxPerDay` قاعده رد می‌شود، نه از سقف سراسری. دو تست
  مجزا دقیقاً همین را ثابت می‌کند (§۱۰).
- **هم‌زمانی**: `expectedVersion` روی نوشتن (به‌علاوه‌ی `StoreConflictError`)؛ drain آیتم را با
  `status: 'claimed'` **بستنِ اتمی** می‌کند (`update` شرطی + read-back) تا دو isolate یک گام را دو
  بار نفرستند؛ اگر نوشتنِ نهایی (`sent`) بعد از crash نرسد، آیتم `claimed` می‌ماند و بعد از
  `CLAIM_STALE_MS` یک‌بار دوباره تلاش می‌شود (`attempts ≤ 2`) — پس crash هم پیام را تکرار نمی‌کند و
  گم هم نمی‌کند.
- **مهاجرت/ویرایش وسط اجرا**: تغییر متن/شرط یک قاعده، `pending` های همان قاعده را `cancelled`
  می‌کند (گزینه‌ی صریح در پنل؛ پیش‌فرض روشن) — وگرنه «شرط جدید» روی پیامِ قدیمی اجرا می‌شد.

---

## ۹) تست‌های پذیرش (نقشه‌ی تست→خواسته)

| خواسته | تست |
| --- | --- |
| AND/OR/NOT و گروه تو‌در‌تو | `rule-eval.test.ts`: درخت ۳ لایه با اعداد واقعی، `ok` و `nodes` |
| نامحدود بودن تعداد شرط (بدون ۶) | ساخت ۲۰ برگه → ذخیره ۲۰۰ و ارزیابی درست؛ ۷۰ برگه → ۴۰۰ با پیام بودجه |
| فیلد/عملگر تازه بدون دست‌زدن به موتور | در تست، یک `FieldDef` و یک `OperatorDef` به رجیستری اضافه می‌شود (`registerField/registerOperator`) و درختِ ساخته‌شده با آن ارزیابی می‌شود — موتور import نشده |
| بیش از ۱۰ ارسال در روز مجاز | قاعده با `repeatPolicy.maxPerDay: 15` در یک روز ۱۵ ارسال می‌کند (۱۲ کاربر × …؛ و سقف ۲ سراسری دیگر وسط نمی‌آید) |
| تکرار مجاز ≠ تکرار retry | دو نوشتنِ یک claim (retry) → یک ارسال؛ دو پنجره/`dueBucket` → دو ارسال با فاصله‌ی مجاز |
| لغو گام معوق | `wait` در صف → خاموش‌کردن قاعده → سطر `cancelled` و drain چیزی نمی‌فرستد؛ همچنین «شرط دیگر برقرار نیست» |
| dry-run بی‌اثر | صفر `notifications`، صفر claim، صفر شمارنده، صفر `push.sent` + ردپا برگردانده می‌شود |
| کلید توقف/ترجیحات کاربر | pause → هیچ مسیری (از جمله test-send و گام‌ها) نمی‌فرستد؛ mute/opt-in همچنان رد می‌شوند |
| حفظ رفتار قوانین فعلی | تست طلایی: روی هر ۳۸ سطر، خروجی `evaluateSweep` قبل/بعد از مهاجرت برابر است (تعداد ارسال و دلیل ردّ هر کاربر) |
| نوع/امنیت عبارت | مقدار رشته‌ای روی فیلد عددی → ۴۰۰؛ `field` ناشناخته → ۴۰۰؛ رشته‌ی ۴۰۰ کاراکتری در `value` → ۴۰۰؛ هیچ `eval` در کد (تست گارد موجود) |

---

## ۱۰) تقسیم کار (هر مرحله: کد + تست + سند، چهار چک ریشه سبز، کامیت و پوش روی همین شاخه)

| مرحله | محتوا | تحویل |
| --- | --- | --- |
| D1 | `RuleExpr` + `evaluate` + رجیستری فیلد/عملگر + `validateExpr` + ردپا (ماژول خالص، بدون route) | `automation/{expr,fields,operators}.ts` + `rule-eval.test.ts` |
| D2 | سیم‌کشی در موتور: `when` روی همه‌ی محرک‌ها، `audience.filter`، ردپا در decisions، `withDefaults` (v1→v2 در خواندن)، `/meta` با رجیستری‌ها | تست‌های موتوری + تست سازگاری v1 |
| D3 | `RepeatPolicy` و برداشتن سقف تحمیلی از `gate` (settings → پیش‌فرض)، ادعای «تکرار مجاز ≠ retry» | تست ۱۵ ارسال/روز + دو تست تکرار |
| D4 | `steps`: notify/wait/stop، صف گام‌ها، `recheckWhen`، لغو، claim سطح گام، stale-retry | تست چرخه‌ی کامل لغو/ادامه |
| D5 | پنل: RuleTreeEditor، AudienceFilterEditor، StepsEditor، RepeatPolicyEditor، برچسب ظرفیت، duplicate/archive/rollback، dry-run با ردپا | تست‌های کامپوننت (render + تعامل) |
| D6 | API تکمیلی (`validate`, `pending-steps`, cancel, `migrate`), سند API/runbook، migration واقعی با dryRun | به‌روزرسانی §۳/§۱۰ سند API |

**خارج از این طرح (عمداً، و در گزارش پایانی هم «انجام‌نشده» اعلام می‌شود):** اقدام‌های غیرازاعلان
(ساخت تسک، تغییر پکیج، نمره)، تقویم چندتایی، و «هر داده‌ای که فروشگاه ندارد» — رجیستری باز است،
اما منبع داده‌ی آن‌ها باید جدا ساخته شود؛ یک فیلد بی‌منبع فقط در UI ظاهر می‌شد و آن همان چیزی است که
درخواست صریحاً هشدار داده.

---

## ۱۱) ریسک‌ها و تصمیم‌ها

| ریسک | تصمیم |
| --- | --- |
| درخت بزرگ → هزینه‌ی ارزیابی و اندازه‌ی سند | بودجه‌ی ۶۴ گره + ۴۰ سطر ردپا؛ درخت در `when` یک‌بار به‌ازای کاربر ارزیابی می‌شود، نه به‌ازای قاعده×کاربر (کشِ درون‌اجرای `facts`) |
| فیلدی که داده‌اش نیست و پنل نشان می‌دهد | `sweep`/`runtime` در رجیستری + `validateExpr` + قفل در UI |
| برداشتن سقف → اسپم واقعی | `repeatPolicy` در **هر** قاعده ویرایش‌شدنی است و فهرست پنل «بی‌سقف» را برچسب می‌زند؛ هشدار سلامت `push_failure_rate` و `sent7d` ردپای سوءاستفاده را نشان می‌دهد. kill-switch و ترجیح کاربر همچنان بالای همه‌چیز |
| دو drain هم‌زمان روی یک سطر | `status:'claimed'` اتمی + `attempts` + `CLAIM_STALE_MS` |
| تغییر مدل = تغییر رفتار ۳۸ سطر | تست طلایی §۹ + مهاجرت در **خواندن**، نه نوشتن |
| ریسک نوشتن در D1 (بودجه) | گام‌های `wait` تنها نوشتن تازه‌اند (یک سطر به‌ازای ارسالِ موکول)؛ ردپا در همان سطر تصمیم‌های موجود می‌نشیند، نه سند جدید |
| `push_automations/<key>` با `version` optimistic | rollback نسخه، «ویرایشِ تازه» است نه بازنویسی تاریخچه؛ پس `version` همیشه می‌رود جلو و ۴۰۹ کهنه همچنان کار می‌کند |
