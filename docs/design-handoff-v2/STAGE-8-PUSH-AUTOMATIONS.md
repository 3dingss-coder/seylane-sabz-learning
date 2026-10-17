# مرحلهٔ ۸ — اعلان‌ها، Push و اتوماسیون‌ها (report)

## 1. شمول و دامنه

- صفحهٔ اعلان‌های ادمین (NotificationsPage): صندوق من / قالب‌ها / ارسال دستی — `pages/admin/NotificationsPage.tsx` (429 خط) + `notifications/PushTemplatesTab.tsx`
- پنل و جزئیات اتوماسیون‌های Push: `PushAutomationsPanel.tsx` (1,002) + `PushAutomationDetailPage.tsx` (2,008) + `pushAutomation/*` (7 ماژول: types، scheduler، channels، catalog، runs، helpers)
- استودیو کمپین: `PushCampaignEditorPage.tsx` (853) + `push/*` (13 ماژول)
- منطق قواعد: `AutomationRuleLogic.tsx` (1,012) + `automations/Automation*` (4 ماژول) + `automationService`/`automationScheduler`/`automationTemplates`
- اطلاع‌رسانی‌های درون‌محصولی: `notifications/NotificationsBell.tsx`, `InAppNotificationCenter.tsx`
- **یافتهٔ کلیدی این مرحله:** پوشش تست موجود این سطح (۱۳ فایل تست شامل `pushAutomationDetail`، `pushAutomationLifecycle`، `pushAutomationRuns`، `pushAutomations`، `pushCampaigns`، `pushTemplates`، `automations`، `automationModels` و…) تقریباً همهٔ قواعد «خوانایی عملیاتی» متن spec را **همین حالا enforce می‌کند**؛ بنابراین این مرحله به‌جای بازنویسی، **ممیزی + تکمیل شکاف** بود.

## 2. قواعد spec که ممیزی تأیید کرد در تست‌های موجود پین هستند (audited-preserved)

| قاعدهٔ spec (05-operations، 02-shell) | پین موجود |
|---|---|
| «dry-run هیچ پیام واقعی نمی‌فرستد؛ تست ارسال باید به‌عنوان تک‌کاربر واقعی علامت بخورد» | `pushAutomationLifecycle` «A dry-run automation passes the full flow without sending any real messages» + «A test push is labeled as a real single-user test send» |
| «خطای موتور نباید پشت UI تزئینی پنهان بماند؛ پیام سرور فارسی و قابل خواندن» | «A blocked system test send surfaces the gate reason»، «An engine refusal shows the Persian server message and re-reads the switch»، «shows error and recovery when the scheduler is missing / when the provider send fails» |
| «تاریخچهٔ اجرا با دلیل/مدت/گیرنده؛ رد هر گام با دلیل skip» | «A late schedule produces a parked run with skip reasons»، «A multi-step run stays readable with reasons, durations and delivery status»، runRows «shows the park reason in the paused-row tooltip» |
| «separate 'سنجیده شد' from 'مشمول شد'» + «skip reasons explained» | «The audience step separates estimated from included recipients with labels and numbers» + «shows explicit skip reasons» |
| «archive نباید delete باشد» | «Restoring an archived rule … never calls delete» |
| «درای ران: سه حقیقت تصمیم، بدون شمارهٔ تماس» | «The dry-run trace shows the three decision facts without a phone number» |
| «seeder/automation engine: قوانین refusals must not be silently swallowed» | `automations.test.tsx` «Persian refusal messages come from the automation engine» |
| «کمپین‌های Push دارای چرخه draft→schedule→…» | `pushCampaigns.test.tsx` (۹ سناریو: draft ویرایش‌پذیر، لغو زمان‌بندی، کپی، آرشیو، تست ارسال + هدایت از صفحهٔ اعلان‌ها، error surface) |
| قالب‌ها: ۱۵ کلید، متن سفارشی، «متن سفارشی را می‌توان به حالت پیش‌فرض برگرداند» | `pushTemplates.test.tsx` (۵ سناریو) |
| تست‌های مدل‌ها (سطوح صفر UI: never swallow/never invent) | `automationModels.test.tsx`, `pushAutomationCatalog.test.ts` (۱۵), `pushAutomationChannel.test.ts` (۱۷), `pushAutomationScheduler.test.ts` (۱۸), `pushAutomationDetail.test.ts` (۸), `pushAutomationRuns.test.ts` (۴) |

## 3. تغییرات محصول (شکاف‌های واقعی)

| فایل | تغییر | چرا |
|---|---|---|
| `PushAutomationDetailPage.tsx` | ردیف چک‌باکس «ارسال به‌صورت Push»: `min-h-11` → `min-h-12` | هدف لمسی ≥۴۸px (spec 02-shell) |
| `PushTemplatesTab.tsx` | قرص تب موبایل: `min-h-11` → `min-h-12` | هدف لمسی ≥۴۸px |
| `notifications.test.tsx` (جدید، ۴ تست) | پین شکاف پوشش NotificationsPage | تنها سطحِ بدون تست اختصاصی در این خوشه |

**بدون تغییر باقی ماند (عمدی):** NotificationsPage (ساختار سه تب هم‌ارز از spec «Keep the three real tabs as equivalent tabs» دقیقاً همان چیزی است که repo دارد)، NotificationsBell، PushAutomationsPanel، PushCampaignEditorPage، AutomationRuleLogic، همهٔ ماژول‌های push/automation — همگی از قبل با spec منطبق و تست‌پین بودند.

## 4. قراردادهای پین‌شده در `notifications.test.tsx` (۴ تست)

- **سه تب واقعی و هم‌ارز** «صندوق من»/«قالب‌ها»/«ارسال دستی» + نام‌های فارسی قالب‌ها + نشان «(سفارشی)» که فقط برای قالب سفارشی‌شده می‌آید
- **ویرایش قالب:** دیالوگ «قالب «X»»، فیلدهای «عنوان»/«متن»، PUT واقعی `admin/notification-templates/:key` با `{title, body}` تایپ‌شده، توست «قالب ذخیره شد.»
- **ارسال دستی — ورودی‌های واقعی:** چهار حالت مخاطب (همه کاربران فعال/یک نقش/یک تیم/یک فرد)، «پیش‌نمایش اعلان» زنده با متن تایپ‌شده، ورودی‌های استودیو کمپین Push
- **ارسال دستی — قرارداد ارسال:** ConfirmDialog «ارسال اعلان؟» → POST `admin/notifications/send` با payload کامل `{audience,targetId,title,body,imageUrl,actionRef}` → شمارش واقعی توست «برای ۳ نفر ارسال شد.» (عدد فارسی از count سرور، نه hard-code)

## 5. نتایج گیت

| گیت | نتیجه |
|---|---|
| `typecheck` | ✅ |
| `lint` | ✅ |
| `prettier --check` (فایل‌های تغییر یافته) | ✅ |
| تست‌های وب | ✅ **367 passed** (۳۶۳ قبلی + ۴ جدید) |
| بیلد وب | ✅ (۳۹.۶ ثانیه) |
| تست‌های Worker | دست‌نخورده (بدون تغییر Worker) — معادل ۱۵۷ قبول |

## 6. تغییرات زیرساخت: **هیچ**

Worker، cron (۵ محرک)، migrations، bindings، deploy — همگی دست‌نخورده.

## 7. خلاصهٔ مسیر

مرحلهٔ ۸ با یک ممیزی گواهی‌محور آغاز شد: از آنجا که spec صراحتاً می‌گوید «خطای موتور نباید پشت UI تزئینی پنهان بماند» و «dry-run هیچ پیام واقعی نمی‌فرستد»، و تست‌های موجود دقیقاً همین قواعد را از قبل enforce می‌کنند، تصمیم درست «تثبیت + تکمیل شکاف» بود نه بازنویسی (قاعدهٔ صفر regression). تنها تغییر محصول: دو هدف لمسی 48px؛ تنها افزوده: ۴ تست صفحهٔ اعلان‌ها. گیت‌ها همگی سبز.
