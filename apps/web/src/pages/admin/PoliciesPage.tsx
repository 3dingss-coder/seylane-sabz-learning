import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Button, Card, Input, Skeleton, useToast } from '@/components/ui';
import { Select } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { faDateTime } from '@/lib/format';
import type { PolicyData } from '@/lib/types';

const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** A8 — سیاست‌ها: pass score, attempts, threshold, points, reminders, mentor limits. */
export function PoliciesPage() {
  const q = useQuery({
    queryKey: ['admin', 'policies'],
    queryFn: ({ signal }) => api.get<PolicyData>('/admin/policies', signal),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="سیاست‌ها"
        subtitle="تغییرات فقط روی تلاش‌ها و رویدادهای جدید اعمال می‌شود"
      />
      <QueryState query={q} loading={<Skeleton className="h-96 w-full" />}>
        {(d) => <PolicyForm initial={d} />}
      </QueryState>
    </div>
  );
}

function PolicyForm({ initial }: { initial: PolicyData }) {
  const [p, setP] = useState<PolicyData>(initial);
  const [warn, setWarn] = useState(initial.warningHours.join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => setP(initial), [initial]);
  const num = (k: keyof PolicyData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((x) => ({ ...x, [k]: Number(e.target.value) }));
  const m = useMutation({
    mutationFn: () => {
      const rest: Partial<PolicyData> = { ...p };
      delete rest.updatedAt;
      delete rest.updatedBy;
      const warningHours = warn
        .split(/[,،\s]+/)
        .map((s) => Number(s.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))))
        .filter((n) => Number.isFinite(n) && n > 0);
      return api.put<PolicyData>('/admin/policies', { ...rest, warningHours });
    },
    onSuccess: () => {
      toast.show({ type: 'success', message: 'سیاست‌ها ذخیره شد.' });
      setErrors({});
      void qc.invalidateQueries({ queryKey: ['admin', 'policies'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      toast.show({ type: 'error', message: errMsg(e) });
    },
  });
  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">آزمون و تکمیل</h2>
        <Input
          label="نمره قبولی (٪)"
          type="number"
          ltr
          min={1}
          max={100}
          value={p.passScore}
          onChange={num('passScore')}
          error={errors.passScore}
        />
        <Input
          label="حداکثر تلاش"
          type="number"
          ltr
          min={1}
          max={10}
          value={p.maxAttempts}
          onChange={num('maxAttempts')}
          error={errors.maxAttempts}
        />
        <Input
          label="آستانه تکمیل رسانه (٪)"
          type="number"
          ltr
          min={50}
          max={100}
          value={p.completionThreshold}
          onChange={num('completionThreshold')}
          error={errors.completionThreshold}
          hint="درصدی از قسمت که باید واقعاً دیده/شنیده شود"
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">امتیاز</h2>
        {(
          [
            ['first_pass_quiz', 'قبولی در تلاش اول'],
            ['package_completion', 'تکمیل بسته'],
            ['on_time_completion', 'تکمیل به‌موقع'],
          ] as const
        ).map(([k, label]) => (
          <Input
            key={k}
            label={label}
            type="number"
            ltr
            min={0}
            value={p.pointsTable[k]}
            onChange={(e) =>
              setP((x) => ({
                ...x,
                pointsTable: { ...x.pointsTable, [k]: Number(e.target.value) },
              }))
            }
            error={errors[`pointsTable.${k}`]}
          />
        ))}
        <label className="flex min-h-12 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={p.penaltyEnabled}
            onChange={(e) => setP((x) => ({ ...x, penaltyEnabled: e.target.checked }))}
          />
          کسر امتیاز برای تأخیر
        </label>
        {p.penaltyEnabled && (
          <Input
            label="امتیاز کسر تأخیر"
            type="number"
            ltr
            min={0}
            value={p.latePenalty}
            onChange={num('latePenalty')}
            error={errors.latePenalty}
          />
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">یادآوری و اعلان</h2>
        <Input
          label="هشدار مهلت (ساعت قبل، با کاما)"
          ltr
          value={warn}
          onChange={(e) => setWarn(e.target.value)}
          error={errors.warningHours}
          hint="مثال: 48, 24"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="شروع ساعت سکوت"
            type="time"
            ltr
            value={p.quietHours.start}
            onChange={(e) =>
              setP((x) => ({ ...x, quietHours: { ...x.quietHours, start: e.target.value } }))
            }
            error={errors['quietHours.start']}
          />
          <Input
            label="پایان ساعت سکوت"
            type="time"
            ltr
            value={p.quietHours.end}
            onChange={(e) =>
              setP((x) => ({ ...x, quietHours: { ...x.quietHours, end: e.target.value } }))
            }
            error={errors['quietHours.end']}
          />
        </div>
        <Input
          label="یادآوری پس از چند روز عدم فعالیت"
          type="number"
          ltr
          min={1}
          max={30}
          value={p.reminderInactiveDays}
          onChange={num('reminderInactiveDays')}
          error={errors.reminderInactiveDays}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="روز خلاصه هفتگی"
            value={p.weeklyDigestDay}
            onChange={(e) => setP((x) => ({ ...x, weeklyDigestDay: Number(e.target.value) }))}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </Select>
          <Input
            label="ساعت خلاصه هفتگی"
            type="number"
            ltr
            min={0}
            max={23}
            value={p.weeklyDigestHour}
            onChange={num('weeklyDigestHour')}
            error={errors.weeklyDigestHour}
          />
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-bold">منتور هوشمند</h2>
        <label className="flex min-h-12 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={p.mentorChatEnabled}
            onChange={(e) => setP((x) => ({ ...x, mentorChatEnabled: e.target.checked }))}
          />
          چت منتور فعال باشد
        </label>
        <Input
          label="سقف پیام روزانه هر کاربر"
          type="number"
          ltr
          min={1}
          value={p.mentorDailyLimitPerUser}
          onChange={num('mentorDailyLimitPerUser')}
          error={errors.mentorDailyLimitPerUser}
        />
        <Input
          label="سقف پیام روزانه کل سیستم"
          type="number"
          ltr
          min={1}
          value={p.mentorDailyLimitGlobal}
          onChange={num('mentorDailyLimitGlobal')}
          error={errors.mentorDailyLimitGlobal}
          hint="برای ماندن در سهمیه رایگان"
        />
      </Card>
      <div className="flex flex-col gap-1 lg:col-span-2">
        <Button
          type="submit"
          size="lg"
          loading={m.isPending}
          icon={<Save className="size-5" aria-hidden />}
        >
          ذخیره سیاست‌ها
        </Button>
        {initial.updatedAt && (
          <p className="text-center text-xs text-muted-fg">
            آخرین تغییر: {faDateTime(initial.updatedAt)}
          </p>
        )}
      </div>
    </form>
  );
}
