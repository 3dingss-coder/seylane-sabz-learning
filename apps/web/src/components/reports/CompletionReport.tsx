import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FilterX } from 'lucide-react';
import { Button, Card, EmptyState, ProgressBar } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { Select } from '@/components/common/Field';
import { downloadCsv, toCsv } from '@/lib/csv';
import { fromZonedInput } from '@/lib/dates';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { track } from '@/lib/telemetry';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faPercent, faRelative } from '@/lib/format';
import type { CompletionRow } from '@/lib/types';

const STATUS_LABEL = { new: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل' } as const;
type Filter = 'brand' | 'product' | 'user' | 'status' | 'team' | 'from' | 'to';

/** W2 / A-reports — completion report with filters (URL-synced) and CSV export. */
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
  const set = (k: Filter, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === 'brand') next.delete('product');
    if (v) track('report_filtered', { filter: k });
    setSp(next, { replace: true });
  };
  const opts = useMemo(() => {
    const brands = new Map<string, string>();
    const products = new Map<string, { name: string; brandId: string | null }>();
    const users = new Map<string, string>();
    for (const r of rows) {
      if (r.brandId && r.brandName) brands.set(r.brandId, r.brandName);
      if (r.productId && r.productName)
        products.set(r.productId, { name: r.productName, brandId: r.brandId });
      users.set(r.userId, r.userName);
    }
    return { brands: [...brands], products: [...products], users: [...users] };
  }, [rows]);

  const filtered = useMemo(() => {
    // Range ends are Tehran days, matching how the dates are displayed in the table.
    const fromStart = fromZonedInput(f('from'));
    const toStart = fromZonedInput(f('to'));
    const from = fromStart ? Date.parse(fromStart) : null;
    const to = toStart ? Date.parse(toStart) + 86_400_000 - 1 : null;
    return rows.filter((r) => {
      if (f('brand') && r.brandId !== f('brand')) return false;
      if (f('product') && r.productId !== f('product')) return false;
      if (f('user') && r.userId !== f('user')) return false;
      if (f('team') && r.teamId !== f('team')) return false;
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
  const any = [...sp.keys()].length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
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
        <JalaliDateField label="مهلت تا" value={f('to')} onChange={(v) => set('to', v)} />
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
              header: 'نام',
              cell: (r) => <span className="font-bold">{r.userName}</span>,
            },
            { key: 'p', header: 'آموزش', cell: (r) => r.packageTitle },
            {
              key: 'b',
              header: 'برند/محصول',
              cell: (r) => [r.brandName, r.productName].filter(Boolean).join(' • ') || '—',
              hideOnMobile: true,
            },
            {
              key: 'pct',
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
              header: 'مهلت',
              cell: (r) => (r.deadlineAt ? faDate(r.deadlineAt) : '—'),
              hideOnMobile: true,
            },
            {
              key: 'l',
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
