import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LIPS, RADII, TOKEN_SECTION, TOKEN_SWATCHES, TYPE_SCALE } from './galleryTokens';
import {
  BookOpen,
  ChevronLeft,
  LayoutDashboard,
  Phone,
  Settings,
  Users,
  UserX,
  Percent,
  Hourglass,
} from 'lucide-react';
import { AppLogo } from '@/components/brand/AppLogo';
import { Character } from '@/components/character/Character';
import { OBJECTIONS } from '@/components/character/data';
import { ObjectionCreature } from '@/components/character/ObjectionCreature';
import { CHARACTER_NAME, EXPRESSIONS, type CharacterId } from '@/components/character/types';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import {
  Button,
  Card,
  CountdownChip,
  EmptyState,
  ErrorState,
  Input,
  KpiCard,
  LoadingRegion,
  Modal,
  PackageCardSkeleton,
  ProgressBar,
  ProgressRing,
  StatusBadge,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { fetchCatalogManifest, type CatalogManifest } from '@/lib/catalog-manifest';
import { toPersianDigits } from '@/lib/digits';

const HOUR = 3_600_000;

/** PHASE-2 §2.2 — what each character is for (rule C-00: no decorative characters). */
const ROLE_OF: Record<CharacterId, string> = {
  seyla: 'راهنما، جشن و دلگرمی — مسکات رسمی برند',
  raha: 'دانش عمیق محصول؛ کنترل کیفیت ادعا',
  kamran: 'سناریوی فروش و جمله‌بندی میدان',
  simin: 'آزمون/دوئل — مشتری مرددی که قانع می‌شود',
  bahram: 'لیگ و مأموریت تیمی (اختیاری)',
  golnar: 'اعتراض‌های سنتی و احترام به باور مشتری',
};

const EXPRESSION_FA: Record<(typeof EXPRESSIONS)[number], string> = {
  idle: 'آرام',
  happy: 'خوشحال',
  celebrate: 'جشن',
  thinking: 'فکر',
  worried: 'نگران',
  proud: 'سرافراز',
  nudge: 'دعوت',
  empathy: 'همدل',
};

const SCREEN_MAP: Array<[string, string, string]> = [
  ['M1 ورود / M2 آنبوردینگ', 'سیلا', 'خوش‌آمد و توضیح سه کارت، بدون فشار'],
  ['M3 خانه / «کار بعدی»', 'سیلا', 'حالت چهره = وضعیت ددلاین (آرام/هوشیار/فوری)'],
  ['M4 فهرست بسته‌ها', '—', 'عمداً خالی (دانسیته اطلاعاتی بالاست)'],
  ['M5 صفحهٔ بسته', 'رها', '«این بسته ۴ ایستگاه داره»'],
  ['M6 پخش‌کننده', 'رها یا کامران', 'دانش = رها، سناریو = کامران'],
  ['M7 آزمون', 'سیمین', 'هر سؤال یک اعتراض واقعی در حباب گفتار سیمین'],
  ['M7 قبول', 'سیلا + سیمین', 'سیمین: «قانع شدم.» سیلا: جشن'],
  ['M7 رد', 'کامران', '«بذار یه بار دیگه مرور کنیم» — هرگز سیمین'],
  ['M8 کارت‌ها / M11 پروفایل', 'سیلا', 'قفسهٔ نشان‌ها و پَرِ استادی'],
  ['M9 پیام‌ها', 'انسان واقعی', 'آواتار واقعی مدیر (C-05)'],
  ['پنل مدیر/ادمین', '—', 'هیچ کاراکتری مجاز نیست (C-06)'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {children}
    </section>
  );
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: CatalogManifest };

/** Design-system gallery (PROMPT 001 acceptance: "Gallery کامپوننت‌ها در RTL"). */
export function GalleryPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [catalog, setCatalog] = useState<LoadState>({ kind: 'loading' });
  const [now] = useState(() => Date.now());

  const load = useCallback((signal?: AbortSignal) => {
    setCatalog({ kind: 'loading' });
    fetchCatalogManifest(signal)
      .then((data) => setCatalog({ kind: 'ready', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setCatalog({ kind: 'error' });
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <div className="min-h-dvh pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-surface safe-top">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 lg:px-6">
          <AppLogo />
          <span className="text-sm font-medium text-text-secondary">نمایشگاه اجزای طراحی</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1200px]">
        <Sidebar
          title="نمونه منوی پنل"
          items={[
            { to: '/', label: 'نمایشگاه اجزا', icon: LayoutDashboard },
            { to: '/admin/content', label: 'مدیریت محتوا', icon: BookOpen },
            { to: '/admin/users', label: 'کاربران', icon: Users },
            { to: '/admin/settings', label: 'تنظیمات', icon: Settings },
          ]}
        />

        <main className="flex-1 space-y-10 px-4 py-6 lg:px-6">
          {/* PHASE-1 §1.8 DoD — every foundation token, rendered, not described. */}
          <Section title={TOKEN_SECTION.title}>
            <div className="grid gap-3 md:grid-cols-2">
              <Card className="space-y-3">
                <h3 className="text-sm font-bold text-text">{TOKEN_SECTION.colours}</h3>
                <ul className="space-y-1.5">
                  {TOKEN_SWATCHES.map(([label, cls]) => (
                    <li key={label} className="flex items-center gap-2">
                      <span className={`h-7 w-12 rounded-input ${cls}`} aria-hidden="true" />
                      <span className="text-sm font-medium text-text">{label}</span>
                      <span className="ms-auto text-xs text-text-secondary" dir="ltr">
                        {cls}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="space-y-3">
                <h3 className="text-sm font-bold text-text">{TOKEN_SECTION.type}</h3>
                <ul className="space-y-1.5">
                  {TYPE_SCALE.map(([cls, label]) => (
                    <li key={label} className="flex items-baseline gap-2">
                      <span className={`font-bold text-text ${cls}`}>{label}</span>
                      <span className="ms-auto text-xs text-text-secondary" dir="ltr">
                        {cls}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="space-y-3">
                <h3 className="text-sm font-bold text-text">{TOKEN_SECTION.radii}</h3>
                <ul className="flex flex-wrap gap-2">
                  {RADII.map(([cls, label]) => (
                    <li key={label} className="flex flex-col items-center gap-1">
                      <span
                        className={`block h-12 w-12 border-2 border-primary bg-primary-100 ${cls}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-text-secondary">{label}</span>
                      <span className="text-xs text-muted" dir="ltr">
                        {cls}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="space-y-3">
                <h3 className="text-sm font-bold text-text">{TOKEN_SECTION.lips}</h3>
                <ul className="flex flex-wrap items-end gap-3">
                  {LIPS.map(([shadow, label]) => (
                    <li key={label} className="flex flex-col items-center gap-1.5">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-btn bg-primary text-xs font-bold text-on-primary"
                        style={{ boxShadow: shadow }}
                        aria-hidden="true"
                      >
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-secondary">{TOKEN_SECTION.lipNote}</p>
              </Card>
            </div>
          </Section>

          <Section title="برندهای سیلانه‌سبز (لوگوی واقعی)">
            {catalog.kind === 'loading' && (
              <LoadingRegion>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-card bg-border" />
                  ))}
                </div>
              </LoadingRegion>
            )}
            {catalog.kind === 'error' && <ErrorState onRetry={() => load()} />}
            {catalog.kind === 'ready' && catalog.data.brands.length === 0 && (
              <EmptyState
                title="هنوز برندی ثبت نشده"
                description="پس از بارگذاری کاتالوگ، برندها اینجا نمایش داده می‌شوند."
              />
            )}
            {catalog.kind === 'ready' && catalog.data.brands.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {catalog.data.brands.map((b) => (
                  <li key={b.id}>
                    <Card className="flex flex-col items-center gap-2 text-center">
                      <BrandLogo name={b.name} logoUrl={b.logoUrl} size="lg" />
                      <span className="text-sm font-bold text-text">{b.name}</span>
                      <span className="text-xs text-text-secondary">
                        {toPersianDigits(
                          catalog.data.products.filter((p) => p.brandId === b.id).length,
                        )}{' '}
                        محصول
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="دکمه‌ها">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => toast.show({ type: 'success', message: 'ذخیره شد' })}>
                دکمه اصلی
              </Button>
              <Button variant="secondary">دکمه ثانویه</Button>
              <Button variant="ghost">دکمه ساده</Button>
              <Button variant="danger">خروج از حساب</Button>
              <Button disabled>غیرفعال</Button>
              <Button
                loading={loadingBtn}
                onClick={() => {
                  setLoadingBtn(true);
                  window.setTimeout(() => setLoadingBtn(false), 1500);
                }}
              >
                در حال ارسال
              </Button>
            </div>
            <div className="max-w-md">
              <Button block size="lg" icon={<ChevronLeft className="size-5" aria-hidden />}>
                ادامه آموزش
              </Button>
            </div>
          </Section>

          <Section title="فیلدهای ورودی">
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Input label="نام و نام خانوادگی" placeholder="مثلاً علی رضایی" autoComplete="name" />
              <Input
                label="شماره موبایل"
                ltr
                inputMode="numeric"
                placeholder="09123456789"
                icon={<Phone className="size-4" aria-hidden />}
                error="این شماره قبلاً ثبت شده است."
              />
            </div>
          </Section>

          <Section title="کارت، پیشرفت و مهلت">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold">آموزش نمونه</span>
                  <StatusBadge status="in_progress" />
                </div>
                <ProgressBar value={62} label="پیشرفت آموزش" />
                <div className="flex flex-wrap gap-2">
                  <CountdownChip deadline={now + 9 * 24 * HOUR} now={now} />
                  <CountdownChip deadline={now + 50 * HOUR} now={now} />
                  <CountdownChip deadline={now + 5 * HOUR} now={now} />
                  <CountdownChip deadline={now - HOUR} now={now} />
                </div>
              </Card>
              <Card className="flex items-center gap-4">
                <ProgressRing value={45} label="پیشرفت کلی" />
                <ProgressRing value={100} label="بسته تکمیل‌شده" />
              </Card>
              <Card tone="brand" className="space-y-2">
                <p className="font-bold text-primary">آفرین! 🎉</p>
                <p className="text-sm text-text-secondary">کارت با پس‌زمینه برند برای موفقیت‌ها.</p>
              </Card>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  'locked',
                  'open',
                  'in_progress',
                  'completed',
                  'draft',
                  'published',
                  'archived',
                  'active',
                  'inactive',
                ] as const
              ).map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </Section>

          <Section title="کارت‌های شاخص (پنل مدیر)">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard title="درصد تکمیل تیم" value="۷۲٪" icon={Percent} subtitle="هفته جاری" />
              <KpiCard title="عقب‌مانده‌ها" value="۸ نفر" icon={UserX} tone="warning" />
              <KpiCard title="میانگین تأخیر" value="۲ روز" icon={Hourglass} tone="danger" />
            </div>
          </Section>

          <Section title="حالت‌های بارگذاری، خالی و خطا">
            <div className="grid gap-4 lg:grid-cols-3">
              <LoadingRegion>
                <PackageCardSkeleton />
              </LoadingRegion>
              <EmptyState
                title="هنوز آموزشی ندارید"
                description="منتظر آموزش جدید باشید."
                actionText="تازه‌سازی"
                onAction={() => toast.show({ type: 'info', message: 'فهرست تازه شد' })}
              />
              <ErrorState
                onRetry={() =>
                  toast.show({
                    type: 'error',
                    message: 'ارسال نشد',
                    action: { label: 'تلاش مجدد', onClick: () => undefined },
                  })
                }
              />
            </div>
            <LoadingRegion>
              <TableSkeleton rows={3} />
            </LoadingRegion>
          </Section>

          <Section title="پنجره و پیام">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                باز کردن پنجره تأیید
              </Button>
              <Button
                variant="ghost"
                onClick={() => toast.show({ type: 'warning', message: 'مهلت این آموزش نزدیک است' })}
              >
                نمایش هشدار
              </Button>
            </div>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              title="لغو انتساب"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>
                    انصراف
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setModalOpen(false);
                      toast.show({ type: 'success', message: 'انتساب لغو شد' });
                    }}
                  >
                    بله، لغو شود
                  </Button>
                </>
              }
            >
              <p className="text-sm text-text-secondary">
                با لغو انتساب، این آموزش برای افراد جدید نمایش داده نمی‌شود. کسانی که شروع کرده‌اند
                می‌توانند ادامه دهند.
              </p>
            </Modal>
          </Section>

          {/* ── PHASE-2: the cast, every expression, and the screen map (§2.4) ── */}
          <Section title="اهالی سیلانه — ۶ کاراکتر × ۸ حالت (فاز ۲)">
            <div className="flex flex-col gap-4">
              {(['seyla', 'raha', 'kamran', 'simin', 'bahram', 'golnar'] as CharacterId[]).map(
                (id) => (
                  <Card key={id} chunky className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-base font-bold text-text">{CHARACTER_NAME[id]}</h3>
                      <p className="text-xs text-text-secondary">{ROLE_OF[id]}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {EXPRESSIONS.map((e) => (
                        <div key={e} className="flex flex-col items-center gap-1">
                          <Character id={id} expression={e} size="sm" />
                          <span className="text-[10px] text-text-secondary">{EXPRESSION_FA[e]}</span>
                        </div>
                      ))}
                    </div>
                    {id === 'seyla' && (
                      <div className="flex items-end gap-3 border-t border-chunk-border pt-3">
                        {([0, 1, 2, 3] as const).map((m) => (
                          <div key={m} className="flex flex-col items-center gap-1">
                            <Character id="seyla" mastery={m} size="sm" />
                            <span className="text-[10px] text-text-secondary">
                              استادی {toPersianDigits(m)}
                            </span>
                          </div>
                        ))}
                        <p className="text-xs leading-6 text-text-secondary">
                          تاج سیلا با سطح استادی بلندتر می‌شود (C-07) — مسکات، نوار پیشرفت است.
                        </p>
                      </div>
                    )}
                  </Card>
                ),
              )}
            </div>
          </Section>

          <Section title="هیولاهای اعتراض — فعال / آرام‌شده (§۲٫۳)">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {OBJECTIONS.map((o) => (
                <Card key={o.id} chunky className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <ObjectionCreature id={o.id} state="active" size={56} />
                    <ObjectionCreature id={o.id} state="calm" size={44} />
                    <p className="text-sm font-bold text-text">«{o.says}»</p>
                  </div>
                  <p className="text-xs leading-6 text-text-secondary">
                    <b className="text-text">نیاز واقعی:</b> {o.need}
                  </p>
                  <p className="text-xs leading-6 text-text-secondary">
                    <b className="text-text">حرکت برنده:</b> {o.move}
                  </p>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="نقشهٔ کاراکتر → صفحه (§۲٫۴)">
            <Card chunky className="overflow-x-auto p-0">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b-2 border-chunk-border text-text-secondary">
                    <th className="p-3 text-start font-bold">صفحه</th>
                    <th className="p-3 text-start font-bold">کاراکتر</th>
                    <th className="p-3 text-start font-bold">چه می‌کند</th>
                  </tr>
                </thead>
                <tbody>
                  {SCREEN_MAP.map(([screen, who, does]) => (
                    <tr key={screen} className="border-b border-chunk-border/60">
                      <td className="p-3 font-bold text-text">{screen}</td>
                      <td className="p-3 text-text">{who}</td>
                      <td className="p-3 text-text-secondary">{does}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
