import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BellRing, History, ShieldAlert, UserSearch } from 'lucide-react';
import { Card, Input, Skeleton } from '@/components/ui';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { api } from '@/lib/api';
import { faDateTime, faRelative } from '@/lib/format';
import { toPersianDigits } from '@/lib/digits';
import { Chip } from './PushAutomationsPanel';
import {
  capSentence,
  filterUsers,
  prefsSentence,
  pushStatusMeta,
  sentKeys,
  tracePath,
  type AutomationTrace,
} from './pushAutomationRunModel';
import { useUsers } from './adminQueries';
import type { AutomationSettings } from './pushAutomationModel';
import type { CatalogMeta } from './automationWizardModel';

/**
 * «ردیابی کاربر» — the per-user answer to «why did this person get nothing?» (prompt §7 «per-user
 * trace»). It is the same three facts the engine used for its own decision, nothing more:
 * the person's choice (`notification_prefs`), their share of the caps (`push_automation_counters`)
 * and the refusals of the last hours (`push_automation_decisions`, 20 per user per day).
 *
 * Read-only, and it shows no phone number and no id in the body: an admin debugging a rule does not
 * need the identifier of the person, only which rule stopped and why (prompt §4.6). The number is a
 * search input, never an output.
 */
export function PushAutomationTracePage() {
  const [picked, setPicked] = useState('');
  const [query, setQuery] = useState('');
  const users = useUsers();
  const settings = useQuery({
    queryKey: ['admin', 'push-automations', 'settings'],
    queryFn: ({ signal }) =>
      api.get<AutomationSettings>('/admin/push-automations/settings', signal),
    staleTime: 60_000,
  });
  const catalog = useQuery({
    queryKey: ['admin', 'push-automations', 'catalog'],
    queryFn: ({ signal }) => api.get<CatalogMeta>('/admin/push-automations/catalog', signal),
    staleTime: 300_000,
  });
  // `users.data` is the stable identity here; deriving `list` first would recreate the memo input on
  // every render (and the lint rule says so).
  const filtered = useMemo(() => filterUsers(users.data ?? [], query), [users.data, query]);
  // A search that narrows the list to exactly one person is already an answer: use it, so the admin
  // does not have to touch the second control. `''` means «nothing selected yet» and fetches nothing.
  const userId = picked || (filtered.length === 1 ? (filtered[0]?.id ?? '') : '');
  const trace = useQuery({
    queryKey: ['admin', 'push-automations', 'trace', userId],
    queryFn: ({ signal }) =>
      userId ? api.get<AutomationTrace>(tracePath(userId), signal) : Promise.resolve(null),
  });
  // A decision or a send only carries the automation key; `catalog` is what turns it into the name an
  // admin recognises — the same list the panel groups by, so no second naming table is needed here.
  const nameOf = (key: string) => catalog.data?.entries.find((e) => e.key === key)?.name ?? key;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ردیابی اعلان یک کاربر"
        subtitle="چه انتخابی کرده، چقدر از سقفش را مصرف کرده و موتور در ساعات اخیر چه چیزهایی را رد کرد"
        back="/admin/push-campaigns/automations"
        actions={
          <Link
            to="/admin/push-campaigns/automations/runs"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-input border border-primary/70 bg-surface px-3 text-sm font-bold text-primary hover:bg-primary-light"
          >
            <History className="size-4" aria-hidden />
            تاریخچه اجراها
          </Link>
        }
      />

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Input
            label="جست‌وجو"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام یا شماره موبایل"
            hint={`${toPersianDigits(filtered.length)} نتیجه از ${toPersianDigits(users.data?.length ?? 0)} کاربر`}
          />
        </div>
        <div className="min-w-56 flex-1">
          <Select
            label="کاربر"
            value={userId}
            onChange={(e) => setPicked(e.target.value)}
            hint={userId ? undefined : 'یک کاربر را انتخاب کنید'}
          >
            <option value="">— انتخاب کنید —</option>
            {filtered.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!userId && (
        <Card>
          <p className="flex items-start gap-2 text-sm leading-7 text-text-secondary">
            <UserSearch className="mt-1 size-4 shrink-0 text-muted-fg" aria-hidden />
            برای دیدن جزئیات، یک کاربر را انتخاب کنید. فهرست همین‌جا از «کاربران» مدیر می‌آید و
            شماره تماس در آن نمایش داده نمی‌شود.
          </p>
        </Card>
      )}

      {userId && trace.isPending && <Skeleton className="h-40" />}
      {userId && trace.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-extrabold text-text">
              {trace.data.name}
              <span className="ms-2 text-[11px] font-normal text-muted-fg">
                {toPersianDigits(trace.data.counter.daySent)} پوش امروز ·{' '}
                {faRelative(trace.data.counter.lastAt)}
              </span>
            </h2>
            {settings.data && (
              <p className="text-xs leading-6 text-text-secondary">
                {capSentence(trace.data.counter, settings.data)}
              </p>
            )}
            <p className="text-xs leading-6 text-text-secondary">
              {prefsSentence(trace.data.prefs, catalog.data?.categories ?? [])}
            </p>
            {!!sentKeys(trace.data.counter).length && (
              <ul className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-fg">
                {sentKeys(trace.data.counter)
                  .slice(0, 6)
                  .map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-2">
                      <Link
                        to={`/admin/push-campaigns/automations/${s.key}`}
                        className="font-bold text-primary hover:underline"
                      >
                        {nameOf(s.key)}
                      </Link>
                      <span>{faDateTime(s.at)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-text">
              <BellRing className="size-4" aria-hidden />
              اعلان‌های ساخته‌شده
            </h2>
            {!trace.data.notifications.length && (
              <p className="text-xs leading-6 text-muted-fg">
                هیچ اعلان خودکاری برای این کاربر ثبت نشده (اعلان‌های دستی و کمپین‌ها اینجا نیستند).
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {trace.data.notifications.map((n) => {
                const meta = pushStatusMeta(n.pushStatus);
                return (
                  <li
                    key={`${n.at}-${n.title}`}
                    className="rounded-card border border-border bg-background p-2 text-xs"
                  >
                    <p className="flex items-start justify-between gap-2">
                      <b className="font-bold text-text">{n.title}</b>
                      <Chip tone={meta.tone}>{meta.label}</Chip>
                    </p>
                    <p className="mt-1 leading-6 text-text-secondary">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-fg">
                      {faDateTime(n.at)}
                      {n.key ? ` · ${nameOf(n.key)}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="flex flex-col gap-2 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-text">
              <ShieldAlert className="size-4" aria-hidden />
              چرا نرفت؟
            </h2>
            {!trace.data.decisions.length && (
              <p className="text-xs leading-6 text-muted-fg">
                در امروز و روزهای اخیر (تا ۱۴ روز، سقف ۴۰ مورد) ردّی ثبت نشده؛ یعنی یا قانونی مشمول
                این کاربر نشده، یا اجرا در پنجره زمانی خودش نبوده است.
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {trace.data.decisions.map((x) => (
                <li
                  key={`${x.at}-${x.key}-${x.reason}`}
                  className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-background p-2 text-xs"
                >
                  <Link
                    to={`/admin/push-campaigns/automations/${x.key}`}
                    className="font-bold text-primary hover:underline"
                  >
                    {nameOf(x.key)}
                  </Link>
                  <span className="text-text-secondary">{x.label}</span>
                  {x.detail && <span className="text-[11px] text-muted-fg">({x.detail})</span>}
                  <span className="ms-auto text-[11px] text-muted-fg">{faDateTime(x.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
