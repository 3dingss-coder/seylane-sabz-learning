import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FilterX } from 'lucide-react';
import { Button, Card, EmptyState, ProgressBar } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { Select } from '@/components/common/Field';
import { downloadCsv, toCsv } from '@/lib/csv';
import { exportExcel } from '@/lib/excel';
import { fromZonedInput } from '@/lib/dates';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { track } from '@/lib/telemetry';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faPercent, faRelative } from '@/lib/format';
import type { CompletionRow } from '@/lib/types';

const STATUS_LABEL = { new: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل' } as const;
type Filter =
  'brand' | 'product' | 'user' | 'status' | 'team' | 'province' | 'city' | 'from' | 'to';

/** W2 / A-reports — completion report with filters (URL-synced), city filter and professional Excel export. */
export function CompletionReport({
  rows,
  memberLink,
  teams,
}: {
  rows: CompletionRow[];
  memberLink: (userId: string) => string;
  teams?: Array<{ id: string; name: string }>;
}) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const f = (k: Filter) => sp.get(k) ?? '';
  const provinceFilter = f('province');
  const set = (k: Filter, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'brand') next.delete('product');
    if (k === 'province') next.delete('city');
    if (v) track('report_filtered', { filter: k });
    setSp(next, { replace: true });
  };
  const opts = useMemo(() => {
    const brands = new Map<string, string>();
    const products = new Map<string, { name: string; brandId: string | null }>();
    const users = new Map<string, string>();
    const provinces = new Set<string>();
    const citiesByProvince = new Map<string, Set<string>>();
    for (const r of rows) {
      if (r.brandId && r.brandName) brands.set(r.brandId, r.brandName);
      if (r.productId && r.productName)
        products.set(r.productId, { name: r.productName, brandId: r.brandId });
      users.set(r.userId, r.userName);
      if (r.province) {
        provinces.add(r.province);
        const citySet = citiesByProvince.get(r.province) ?? new Set<string>();
        if (!citiesByProvince.has(r.province)) citiesByProvince.set(r.province, citySet);
        if (r.city) citySet.add(r.city);
      }
    }
    return {
      brands: [...brands],
      products: [...products],
      users: [...users],
      provinces: [...provinces].sort(),
      cities: provinceFilter ? [...(citiesByProvince.get(provinceFilter) ?? [])].sort() : [],
    };
  }, [rows, provinceFilter]);

  const filtered = useMemo(() => {
    const fromStart = fromZonedInput(f('from'));
    const toStart = fromZonedInput(f('to'));
    const from = fromStart ? Date.parse(fromStart) : null;
    const to = toStart ? Date.parse(toStart) + 86_400_000 - 1 : null;
    return rows.filter((r) => {
      if (f('brand') && r.brandId !== f('brand')) return false;
      if (f('product') && r.productId !== f('product')) return false;
      if (f('user') && r.userId !== f('user')) return false;
      if (f('team') && r.teamId !== f('team')) return false;
      if (f('province') && r.province !== f('province')) return false;
      if (f('city') && r.city !== f('city')) return false;
      const st = f('status');
      if (st === 'overdue' ? !r.overdue : st && r.status !== st) return false;
      if (from && (!r.deadlineAt || Date.parse(r.deadlineAt) < from)) return false;
      if (to && (!r.deadlineAt || Date.parse(r.deadlineAt) > to)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sp]);

  const exportCsv = () => {
    const csv = toCsv(
      [
        'نام',
        'استان',
        'شهر',
        'آموزش',
        'برند',
        'محصول',
        'پیشرفت٪',
        'وضعیت',
        'دیرکرد',
        'مهلت',
        'تاریخ تکمیل',
        'به‌موقع',
        'آخرین فعالیت',
        'گیر کرده در',
      ],
      filtered.map((r) => [
        r.userName,
        r.province ?? '',
        r.city ?? '',
        r.packageTitle,
        r.brandName,
        r.productName,
        r.percent,
        STATUS_LABEL[r.status],
        r.overdue ? 'بله' : 'خیر',
        r.deadlineAt ? faDate(r.deadlineAt) : '',
        r.completedAt ? faDate(r.completedAt) : '',
        r.onTime === null ? '' : r.onTime ? 'بله' : 'خیر',
        r.lastActivityAt ? faDate(r.lastActivityAt) : '',
        r.stuckAt,
      ]),
    );
    downloadCsv(`completion-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportXlsx = () => {
    void exportExcel({
      sheetName: 'گزارش تکمیل',
      title: 'گزارش تکمیل آموزشی',
      subtitle: 'آکادمی سیلانه',
      fileName: `completion-report-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: 'نام بازاریاب', key: 'userName', width: 22 },
        { header: 'استان', key: 'province', width: 16 },
        { header: 'شهر', key: 'city', width: 16 },
        { header: 'آموزش', key: 'packageTitle', width: 28 },
        { header: 'برند', key: 'brandName', width: 18 },
        { header: 'محصول', key: 'productName', width: 22 },
        { header: 'پیشرفت (٪)', key: 'percent', width: 12, isNumber: true, align: 'center' },
        { header: 'وضعیت', key: 'status', width: 14, align: 'center' },
        { header: 'دیرکرد', key: 'overdue', width: 10, align: 'center' },
        { header: 'مهلت', key: 'deadline', width: 14 },
        { header: 'تاریخ تکمیل', key: 'completed', width: 14 },
        { header: 'تکمیل به‌موقع', key: 'onTime', width: 14, align: 'center' },
        { header: 'آخرین فعالیت', key: 'lastActivity', width: 14 },
        { header: 'گیر کرده در', key: 'stuck', width: 22 },
      ],
      rows: filtered.map((r) => ({
        userName: r.userName,
        province: r.province ?? '—',
        city: r.city ?? '—',
        packageTitle: r.packageTitle,
        brandName: r.brandName ?? '—',
        productName: r.productName ?? '—',
        percent: r.percent,
        status: r.overdue ? 'دیرکرد' : r.lagging ? 'عقب' : STATUS_LABEL[r.status],
        overdue: r.overdue ? 'بله' : 'خیر',
        deadline: r.deadlineAt ? faDate(r.deadlineAt) : '—',
        completed: r.completedAt ? faDate(r.completedAt) : '—',
        onTime: r.onTime === null ? '—' : r.onTime ? 'بله' : 'خیر',
        lastActivity: r.lastActivityAt ? faDate(r.lastActivityAt) : '—',
        stuck: r.stuckAt ?? '—',
      })),
    });
  };

  const any = [...sp.keys()].length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
        {teams && (
          <Select label="تیم" value={f('team')} onChange={(e) => set('team', e.target.value)}>
            <option value="">همه</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="استان"
          value={f('province')}
          onChange={(e) => set('province', e.target.value)}
        >
          <option value="">همه</option>
          {opts.provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select label="شهر" value={f('city')} onChange={(e) => set('city', e.target.value)}>
          <option value="">همه</option>
          {opts.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select label="برند" value={f('brand')} onChange={(e) => set('brand', e.target.value)}>
          <option value="">همه</option>
          {opts.brands.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </Select>
        <Select label="محصول" value={f('product')} onChange={(e) => set('product', e.target.value)}>
          <option value="">همه</option>
          {opts.products
            .filter(([, p]) => !f('brand') || p.brandId === f('brand'))
            .map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
        </Select>
        <Select label="بازاریاب" value={f('user')} onChange={(e) => set('user', e.target.value)}>
          <option value="">همه</option>
          {opts.users.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </Select>
        <Select label="وضعیت" value={f('status')} onChange={(e) => set('status', e.target.value)}>
          <option value="">همه</option>
          <option value="new">شروع‌نشده</option>
          <option value="in_progress">در حال انجام</option>
          <option value="completed">تکمیل</option>
          <option value="overdue">دیرکرد</option>
        </Select>
        <JalaliDateField label="مهلت از" value={f('from')} onChange={(v) => set('from', v)} />
        <JalaliDateField
          label="مهلت تا"
          value={f('to')}
          onChange={(v) => set('to', v)}
          error={
            f('from') && f('to') && f('from') > f('to') ? 'تاریخ پایان قبل از شروع است.' : undefined
          }
        />
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">{toPersianDigits(filtered.length)} ردیف</p>
        <div className="flex gap-2">
          {any && (
            <Button
              variant="ghost"
              icon={<FilterX className="size-4" aria-hidden />}
              onClick={() => setSp(new URLSearchParams(), { replace: true })}
            >
              حذف فیلترها
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Download className="size-4" aria-hidden />}
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            خروجی CSV
          </Button>
          <Button
            icon={<FileSpreadsheet className="size-4" aria-hidden />}
            onClick={exportXlsx}
            disabled={filtered.length === 0}
          >
            خروجی اکسل
          </Button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length ? 'با این فیلترها نتیجه‌ای نیست' : 'هنوز آموزشی به اعضا داده نشده'}
        />
      ) : (
        <DataTable
          caption="گزارش تکمیل"
          rows={filtered}
          rowKey={(r) => `${r.userId}-${r.packageId}`}
          onRowClick={(r) => nav(memberLink(r.userId))}
          columns={[
            {
              key: 'u',
              sortValue: (r) => r.userName,
              header: 'نام',
              cell: (r) => <span className="font-bold">{r.userName}</span>,
            },
            {
              key: 'loc',
              sortValue: (r) => (r.city ? `${r.province ?? ''} ${r.city}` : null),
              header: 'شهر',
              cell: (r) =>
                r.city ? (
                  <span className="text-sm">
                    {r.province} • {r.city}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              key: 'p',
              sortValue: (r) => r.packageTitle,
              header: 'آموزش',
              cell: (r) => r.packageTitle,
            },
            {
              key: 'b',
              header: 'برند/محصول',
              cell: (r) => [r.brandName, r.productName].filter(Boolean).join(' • ') || '—',
              hideOnMobile: true,
            },
            {
              key: 'pct',
              sortValue: (r) => r.percent,
              header: 'پیشرفت',
              cell: (r) => (
                <div className="flex min-w-24 items-center gap-2">
                  <ProgressBar value={r.percent} label="پیشرفت" className="flex-1" />
                  <span className="text-xs">{faPercent(r.percent)}</span>
                </div>
              ),
            },
            {
              key: 's',
              sortValue: (r) => (r.overdue ? 3 : r.lagging ? 2 : r.status === 'completed' ? 0 : 1),
              header: 'وضعیت',
              cell: (r) =>
                r.overdue ? (
                  <span className="font-bold text-danger">دیرکرد</span>
                ) : r.lagging ? (
                  <span className="font-bold text-warning-fg">عقب</span>
                ) : (
                  STATUS_LABEL[r.status]
                ),
            },
            {
              key: 'd',
              sortValue: (r) => (r.deadlineAt ? Date.parse(r.deadlineAt) : null),
              header: 'مهلت',
              cell: (r) => (r.deadlineAt ? faDate(r.deadlineAt) : '—'),
              hideOnMobile: true,
            },
            {
              key: 'l',
              sortValue: (r) => (r.lastActivityAt ? Date.parse(r.lastActivityAt) : null),
              header: 'آخرین فعالیت',
              cell: (r) => (r.lastActivityAt ? faRelative(r.lastActivityAt) : 'هرگز'),
              hideOnMobile: true,
            },
          ]}
        />
      )}
    </div>
  );
}
