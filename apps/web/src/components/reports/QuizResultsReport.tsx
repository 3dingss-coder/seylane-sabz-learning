import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FilterX,
  Percent,
  Repeat,
  Users,
  XCircle,
} from 'lucide-react';
import { Button, Card, EmptyState, KpiCard } from '@/components/ui';
import { DataTable } from '@/components/admin/DataTable';
import { Select, Tabs } from '@/components/common/Field';
import { JalaliDateField } from '@/components/common/JalaliDateField';
import { downloadCsv, toCsv } from '@/lib/csv';
import { exportExcelSheets, type ExcelColumn } from '@/lib/excel';
import { fromZonedInput } from '@/lib/dates';
import { toPersianDigits } from '@/lib/digits';
import { faDate, faDateTime, faNumber, faPercent } from '@/lib/format';
import { track } from '@/lib/telemetry';
import type { QuizAttemptRow, QuizReport, QuizSummaryRow } from '@/lib/types';

type Filter =
  'brand' | 'product' | 'user' | 'team' | 'province' | 'city' | 'result' | 'from' | 'to';
type View = 'summary' | 'attempts';

const fa = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : toPersianDigits(n);
const score = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : faPercent(n);
const durationFa = (sec: number | null) => {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m
    ? `${toPersianDigits(m)} دقیقه و ${toPersianDigits(s)} ثانیه`
    : `${toPersianDigits(s)} ثانیه`;
};
const resultLabel = (r: Pick<QuizSummaryRow, 'passed' | 'attempts' | 'passedAtAttempt'>) =>
  r.passed ? `قبول (تلاش ${toPersianDigits(r.passedAtAttempt ?? r.attempts)})` : 'مردود';

/**
 * گزارش نتایج آزمون — برای هر کاربر: تعداد دفعات آزمون، پاسخ درست و غلط، نمره و قبولی.
 * دو نما: «خلاصه هر کاربر» (یک ردیف برای هر کاربر و آزمون) و «همه تلاش‌ها» (یک ردیف برای هر تلاش).
 * خروجی اکسل هر دو نما را در دو شیت جدا دارد.
 */
export function QuizResultsReport({
  data,
  memberLink,
  teams,
}: {
  data: QuizReport;
  memberLink: (userId: string) => string;
  teams?: Array<{ id: string; name: string }>;
}) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [view, setView] = useState<View>('summary');
  const f = (k: Filter) => sp.get(`q_${k}`) ?? '';
  const provinceFilter = f('province');
  const set = (k: Filter, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(`q_${k}`, v);
    else next.delete(`q_${k}`);
    if (k === 'brand') next.delete('q_product');
    if (k === 'province') next.delete('q_city');
    if (v) track('report_filtered', { filter: `quiz_${k}` });
    setSp(next, { replace: true });
  };

  const opts = useMemo(() => {
    const brands = new Map<string, string>();
    const products = new Map<string, string>();
    const users = new Map<string, string>();
    const provinces = new Set<string>();
    const citiesByProvince = new Map<string, Set<string>>();
    for (const r of data.summary) {
      if (r.brandName) brands.set(r.brandName, r.brandName);
      if (r.productName) products.set(r.productName, r.productName);
      users.set(r.userId, r.userName);
      if (r.province) {
        provinces.add(r.province);
        const set2 = citiesByProvince.get(r.province) ?? new Set<string>();
        if (!citiesByProvince.has(r.province)) citiesByProvince.set(r.province, set2);
        if (r.city) set2.add(r.city);
      }
    }
    return {
      brands: [...brands.keys()].sort(),
      products: [...products.keys()].sort(),
      users: [...users],
      provinces: [...provinces].sort(),
      cities: provinceFilter ? [...(citiesByProvince.get(provinceFilter) ?? [])].sort() : [],
    };
  }, [data.summary, provinceFilter]);

  const { summary, attempts } = useMemo(() => {
    const fromStart = fromZonedInput(f('from'));
    const toStart = fromZonedInput(f('to'));
    const from = fromStart ? Date.parse(fromStart) : null;
    const to = toStart ? Date.parse(toStart) + 86_400_000 - 1 : null;
    const base = (r: {
      brandName: string | null;
      productName: string | null;
      userId: string;
      teamId: string | null;
      province: string | null;
      city: string | null;
    }) =>
      !(f('brand') && r.brandName !== f('brand')) &&
      !(f('product') && r.productName !== f('product')) &&
      !(f('user') && r.userId !== f('user')) &&
      !(f('team') && r.teamId !== f('team')) &&
      !(f('province') && r.province !== f('province')) &&
      !(f('city') && r.city !== f('city'));
    const inRange = (iso: string | null) => {
      if (!from && !to) return true;
      if (!iso) return false;
      const t = Date.parse(iso);
      return !(from && t < from) && !(to && t > to);
    };
    const res = f('result');
    return {
      summary: data.summary.filter(
        (r) =>
          base(r) &&
          inRange(r.lastSubmittedAt) &&
          (res === 'passed' ? r.passed : res === 'failed' ? !r.passed : true),
      ),
      attempts: data.attempts.filter(
        (r) =>
          base(r) &&
          inRange(r.submittedAt) &&
          (res === 'passed' ? r.passed === true : res === 'failed' ? r.passed === false : true),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sp]);

  const kpis = useMemo(() => {
    const learners = new Set(summary.map((r) => r.userId)).size;
    const passedQuizzes = summary.filter((r) => r.passed).length;
    const scores = attempts.map((a) => a.score).filter((x): x is number => x !== null);
    const first = attempts.filter((a) => a.attemptNumber === 1);
    return {
      learners,
      attempts: attempts.length,
      passedQuizzes,
      failedQuizzes: summary.length - passedQuizzes,
      avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      firstTry: first.length
        ? Math.round((first.filter((a) => a.passed).length / first.length) * 100)
        : null,
    };
  }, [summary, attempts]);

  const summaryColumns: ExcelColumn[] = [
    { header: 'نام بازاریاب', key: 'userName', width: 22 },
    { header: 'استان', key: 'province', width: 14 },
    { header: 'شهر', key: 'city', width: 14 },
    { header: 'آموزش', key: 'packageTitle', width: 28 },
    { header: 'برند', key: 'brandName', width: 16 },
    { header: 'محصول', key: 'productName', width: 20 },
    { header: 'قسمت (آزمون)', key: 'sectionTitle', width: 26 },
    { header: 'تعداد دفعات آزمون', key: 'attempts', width: 14, isNumber: true, align: 'center' },
    { header: 'نتیجه', key: 'result', width: 16, align: 'center' },
    { header: 'قبول در تلاش', key: 'passedAt', width: 12, isNumber: true, align: 'center' },
    { header: 'نمره اولین تلاش', key: 'firstScore', width: 12, isNumber: true, align: 'center' },
    { header: 'نمره آخرین تلاش', key: 'lastScore', width: 12, isNumber: true, align: 'center' },
    { header: 'بهترین نمره', key: 'bestScore', width: 12, isNumber: true, align: 'center' },
    { header: 'حد نصاب قبولی', key: 'passScore', width: 12, isNumber: true, align: 'center' },
    { header: 'تعداد سؤال', key: 'lastTotal', width: 10, isNumber: true, align: 'center' },
    { header: 'درست (آخرین تلاش)', key: 'lastCorrect', width: 14, isNumber: true, align: 'center' },
    { header: 'غلط (آخرین تلاش)', key: 'lastWrong', width: 14, isNumber: true, align: 'center' },
    { header: 'مجموع پاسخ درست', key: 'totalCorrect', width: 14, isNumber: true, align: 'center' },
    { header: 'مجموع پاسخ غلط', key: 'totalWrong', width: 14, isNumber: true, align: 'center' },
    { header: 'آخرین آزمون', key: 'lastAt', width: 18 },
  ];
  const attemptColumns: ExcelColumn[] = [
    { header: 'نام بازاریاب', key: 'userName', width: 22 },
    { header: 'استان', key: 'province', width: 14 },
    { header: 'شهر', key: 'city', width: 14 },
    { header: 'آموزش', key: 'packageTitle', width: 28 },
    { header: 'برند', key: 'brandName', width: 16 },
    { header: 'محصول', key: 'productName', width: 20 },
    { header: 'قسمت (آزمون)', key: 'sectionTitle', width: 26 },
    { header: 'شماره تلاش', key: 'attemptNumber', width: 10, isNumber: true, align: 'center' },
    { header: 'تعداد سؤال', key: 'total', width: 10, isNumber: true, align: 'center' },
    { header: 'پاسخ درست', key: 'correct', width: 10, isNumber: true, align: 'center' },
    { header: 'پاسخ غلط', key: 'wrong', width: 10, isNumber: true, align: 'center' },
    { header: 'بی‌پاسخ', key: 'unanswered', width: 10, isNumber: true, align: 'center' },
    { header: 'نمره (٪)', key: 'score', width: 10, isNumber: true, align: 'center' },
    { header: 'حد نصاب قبولی', key: 'passScore', width: 12, isNumber: true, align: 'center' },
    { header: 'نتیجه', key: 'result', width: 10, align: 'center' },
    { header: 'شروع', key: 'startedAt', width: 18 },
    { header: 'پایان', key: 'submittedAt', width: 18 },
    { header: 'مدت پاسخ‌دهی', key: 'duration', width: 18 },
  ];
  const summaryRows = (rows: QuizSummaryRow[]) =>
    rows.map((r) => ({
      userName: r.userName,
      province: r.province ?? '—',
      city: r.city ?? '—',
      packageTitle: r.packageTitle,
      brandName: r.brandName ?? '—',
      productName: r.productName ?? '—',
      sectionTitle: r.sectionTitle,
      attempts: r.attempts,
      result: r.passed ? 'قبول' : 'مردود',
      passedAt: r.passedAtAttempt,
      firstScore: r.firstScore,
      lastScore: r.lastScore,
      bestScore: r.bestScore,
      passScore: r.passScore,
      lastTotal: r.lastTotal,
      lastCorrect: r.lastCorrect,
      lastWrong: r.lastWrong,
      totalCorrect: r.totalCorrect,
      totalWrong: r.totalWrong,
      lastAt: r.lastSubmittedAt ? faDateTime(r.lastSubmittedAt) : '—',
    }));
  const attemptRowsX = (rows: QuizAttemptRow[]) =>
    rows.map((r) => ({
      userName: r.userName,
      province: r.province ?? '—',
      city: r.city ?? '—',
      packageTitle: r.packageTitle,
      brandName: r.brandName ?? '—',
      productName: r.productName ?? '—',
      sectionTitle: r.sectionTitle,
      attemptNumber: r.attemptNumber,
      total: r.total,
      correct: r.correct,
      wrong: r.wrong,
      unanswered: r.unanswered,
      score: r.score,
      passScore: r.passScore,
      result: r.passed ? 'قبول' : 'مردود',
      startedAt: faDateTime(r.startedAt),
      submittedAt: r.submittedAt ? faDateTime(r.submittedAt) : '—',
      duration: durationFa(r.durationSec),
    }));

  const day = new Date().toISOString().slice(0, 10);
  const exportXlsx = () => {
    void exportExcelSheets(`quiz-results-${day}`, [
      {
        sheetName: 'خلاصه هر کاربر',
        title: 'نتایج آزمون — خلاصه هر کاربر',
        subtitle: `آکادمی سیلانه • ${toPersianDigits(summary.length)} ردیف`,
        fileName: `quiz-results-${day}`,
        columns: summaryColumns,
        rows: summaryRows(summary),
      },
      {
        sheetName: 'همه تلاش‌ها',
        title: 'نتایج آزمون — جزئیات همه تلاش‌ها',
        subtitle: `آکادمی سیلانه • ${toPersianDigits(attempts.length)} تلاش`,
        fileName: `quiz-results-${day}`,
        columns: attemptColumns,
        rows: attemptRowsX(attempts),
      },
    ]);
  };
  const exportCsv = () => {
    const cols = view === 'summary' ? summaryColumns : attemptColumns;
    const rows = view === 'summary' ? summaryRows(summary) : attemptRowsX(attempts);
    downloadCsv(
      `quiz-results-${view}-${day}.csv`,
      toCsv(
        cols.map((c) => c.header),
        rows.map((r) =>
          cols.map((c) => (r as Record<string, string | number | null>)[c.key] ?? ''),
        ),
      ),
    );
  };

  const any = [...sp.keys()].some((k) => k.startsWith('q_'));
  const clear = () => {
    const next = new URLSearchParams(sp);
    for (const k of [...next.keys()]) if (k.startsWith('q_')) next.delete(k);
    setSp(next, { replace: true });
  };
  const empty = data.summary.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          title="کاربران آزمون‌داده"
          value={faNumber(kpis.learners)}
          icon={Users}
          tone="info"
        />
        <KpiCard title="مجموع تلاش‌ها" value={faNumber(kpis.attempts)} icon={Repeat} />
        <KpiCard
          title="قبول / مردود"
          value={`${faNumber(kpis.passedQuizzes)} / ${faNumber(kpis.failedQuizzes)}`}
          icon={CheckCircle2}
          subtitle="تعداد کاربر-آزمون"
        />
        <KpiCard
          title="میانگین نمره"
          value={kpis.avg === null ? '—' : faPercent(kpis.avg)}
          icon={Percent}
          subtitle={
            kpis.firstTry === null ? undefined : `قبولی در تلاش اول ${faPercent(kpis.firstTry)}`
          }
        />
      </div>
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
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
          {opts.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
        <Select label="محصول" value={f('product')} onChange={(e) => set('product', e.target.value)}>
          <option value="">همه</option>
          {opts.products.map((p) => (
            <option key={p} value={p}>
              {p}
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
        <Select label="نتیجه" value={f('result')} onChange={(e) => set('result', e.target.value)}>
          <option value="">همه</option>
          <option value="passed">قبول</option>
          <option value="failed">مردود</option>
        </Select>
        <JalaliDateField label="آزمون از" value={f('from')} onChange={(v) => set('from', v)} />
        <JalaliDateField
          label="آزمون تا"
          value={f('to')}
          onChange={(v) => set('to', v)}
          error={
            f('from') && f('to') && f('from') > f('to') ? 'تاریخ پایان قبل از شروع است.' : undefined
          }
        />
      </Card>
      <Tabs
        label="نمای گزارش آزمون"
        value={view}
        onChange={setView}
        items={[
          { value: 'summary', label: 'خلاصه هر کاربر', count: summary.length },
          { value: 'attempts', label: 'همه تلاش‌ها', count: attempts.length },
        ]}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {any && (
          <Button variant="ghost" icon={<FilterX className="size-4" aria-hidden />} onClick={clear}>
            حذف فیلترها
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<Download className="size-4" aria-hidden />}
          onClick={exportCsv}
          disabled={(view === 'summary' ? summary : attempts).length === 0}
        >
          خروجی CSV
        </Button>
        <Button
          icon={<FileSpreadsheet className="size-4" aria-hidden />}
          onClick={exportXlsx}
          disabled={summary.length === 0}
        >
          خروجی اکسل (هر دو نما)
        </Button>
      </div>
      {view === 'summary' ? (
        summary.length === 0 ? (
          <EmptyState title={empty ? 'هنوز کسی آزمون نداده' : 'با این فیلترها نتیجه‌ای نیست'} />
        ) : (
          <DataTable
            caption="خلاصه نتایج آزمون هر کاربر"
            rows={summary}
            rowKey={(r) => `${r.userId}-${r.quizId}`}
            onRowClick={(r) => nav(memberLink(r.userId))}
            columns={[
              {
                key: 'u',
                header: 'نام',
                sortValue: (r) => r.userName,
                cell: (r) => (
                  <div>
                    <span className="font-bold">{r.userName}</span>
                    {r.city && (
                      <span className="block text-xs text-text-secondary">
                        {r.province} • {r.city}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'q',
                header: 'آموزش / آزمون',
                sortValue: (r) => r.packageTitle,
                cell: (r) => (
                  <div>
                    <span>{r.packageTitle}</span>
                    <span className="block text-xs text-text-secondary">{r.sectionTitle}</span>
                  </div>
                ),
              },
              {
                key: 'n',
                header: 'دفعات',
                sortValue: (r) => r.attempts,
                cell: (r) => fa(r.attempts),
              },
              {
                key: 'ok',
                header: 'درست',
                hideOnMobile: true,
                sortValue: (r) => r.lastCorrect,
                cell: (r) => (
                  <span className="font-bold text-success-fg">
                    {fa(r.lastCorrect)}
                    <span className="text-xs font-normal text-text-secondary">
                      {' '}
                      از {fa(r.lastTotal)}
                    </span>
                  </span>
                ),
              },
              {
                key: 'bad',
                header: 'غلط',
                hideOnMobile: true,
                sortValue: (r) => r.lastWrong,
                cell: (r) => <span className="font-bold text-danger">{fa(r.lastWrong)}</span>,
              },
              {
                key: 'last',
                header: 'نمره آخر',
                sortValue: (r) => r.lastScore,
                cell: (r) => score(r.lastScore),
              },
              {
                key: 'best',
                header: 'بهترین',
                hideOnMobile: true,
                sortValue: (r) => r.bestScore,
                cell: (r) => score(r.bestScore),
              },
              {
                key: 'res',
                header: 'نتیجه',
                sortValue: (r) => Number(r.passed),
                cell: (r) =>
                  r.passed ? (
                    <span className="inline-flex items-center gap-1 font-bold text-success-fg">
                      <CheckCircle2 className="size-4" aria-hidden /> {resultLabel(r)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-danger">
                      <XCircle className="size-4" aria-hidden /> {resultLabel(r)}
                      {r.inProgress && (
                        <span className="text-xs font-normal text-text-secondary">
                          {' '}
                          (در حال آزمون)
                        </span>
                      )}
                    </span>
                  ),
              },
              {
                key: 'at',
                header: 'آخرین آزمون',
                hideOnMobile: true,
                sortValue: (r) => (r.lastSubmittedAt ? Date.parse(r.lastSubmittedAt) : null),
                cell: (r) => (r.lastSubmittedAt ? faDate(r.lastSubmittedAt) : '—'),
              },
            ]}
          />
        )
      ) : attempts.length === 0 ? (
        <EmptyState title={empty ? 'هنوز کسی آزمون نداده' : 'با این فیلترها نتیجه‌ای نیست'} />
      ) : (
        <DataTable
          caption="جزئیات همه تلاش‌های آزمون"
          rows={attempts}
          rowKey={(r) => r.attemptId}
          onRowClick={(r) => nav(memberLink(r.userId))}
          columns={[
            {
              key: 'u',
              header: 'نام',
              sortValue: (r) => r.userName,
              cell: (r) => <span className="font-bold">{r.userName}</span>,
            },
            {
              key: 'q',
              header: 'آموزش / آزمون',
              sortValue: (r) => r.packageTitle,
              cell: (r) => (
                <div>
                  <span>{r.packageTitle}</span>
                  <span className="block text-xs text-text-secondary">{r.sectionTitle}</span>
                </div>
              ),
            },
            {
              key: 'n',
              header: 'تلاش',
              sortValue: (r) => r.attemptNumber,
              cell: (r) => fa(r.attemptNumber),
            },
            {
              key: 'ok',
              header: 'درست',
              sortValue: (r) => r.correct,
              cell: (r) => <span className="font-bold text-success-fg">{fa(r.correct)}</span>,
            },
            {
              key: 'bad',
              header: 'غلط',
              sortValue: (r) => r.wrong,
              cell: (r) => <span className="font-bold text-danger">{fa(r.wrong)}</span>,
            },
            {
              key: 'tot',
              header: 'سؤال',
              hideOnMobile: true,
              sortValue: (r) => r.total,
              cell: (r) => fa(r.total),
            },
            {
              key: 'sc',
              header: 'نمره',
              sortValue: (r) => r.score,
              cell: (r) => (
                <span>
                  {score(r.score)}
                  <span className="text-xs text-text-secondary"> / حد {score(r.passScore)}</span>
                </span>
              ),
            },
            {
              key: 'res',
              header: 'نتیجه',
              sortValue: (r) => (r.passed ? 1 : 0),
              cell: (r) =>
                r.passed ? (
                  <span className="font-bold text-success-fg">قبول</span>
                ) : (
                  <span className="font-bold text-danger">مردود</span>
                ),
            },
            {
              key: 'at',
              header: 'زمان',
              hideOnMobile: true,
              sortValue: (r) => (r.submittedAt ? Date.parse(r.submittedAt) : null),
              cell: (r) => (r.submittedAt ? faDateTime(r.submittedAt) : '—'),
            },
          ]}
        />
      )}
    </div>
  );
}
