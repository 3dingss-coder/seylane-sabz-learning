import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur safe-top">
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
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
