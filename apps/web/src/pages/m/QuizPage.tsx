import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  Confetti,
  EmptyState,
  Modal,
  ProgressBar,
  ProgressRing,
  Skeleton,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/components/common/PageHeader';
import { Character } from '@/components/character/Character';
import { CelebrationScreen } from '@/components/learning/CelebrationScreen';
import { playMoment } from '@/lib/sound';
import { QueryState } from '@/components/common/QueryState';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { faNumber, faPercent } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { QuizData, SectionDetail, StartAttempt, SubmitResult } from '@/lib/types';

const OPTION_LABEL: Record<string, string> = { a: 'الف', b: 'ب', c: 'ج', d: 'د' };
const draftKey = (attemptId: string) => `ssl.quiz.${attemptId}`;

/** M7 آزمون + M8 نتیجه. Grading happens only on the server; the client never sees answer keys. */
export function QuizPage() {
  const { sectionId = '' } = useParams();
  const section = useQuery({
    queryKey: qk.section(sectionId),
    queryFn: ({ signal }) => api.get<SectionDetail>(`/me/sections/${sectionId}`, signal),
  });
  const quizId = section.data?.section.quizId;
  const quiz = useQuery({
    queryKey: qk.quiz(quizId ?? ''),
    queryFn: ({ signal }) => api.get<QuizData>(`/me/quizzes/${quizId}`, signal),
    enabled: Boolean(quizId),
    staleTime: 0,
  });
  const loading = (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
  if (section.isError)
    return (
      <QueryState query={section} loading={loading}>
        {() => null}
      </QueryState>
    );
  return (
    <QueryState query={quiz} loading={loading}>
      {(d) => (
        <QuizFlow
          // Keyed by quiz only: the post-submit refetch bumps attemptInfo.used and must not
          // remount the flow (that would drop the result screen).
          key={d.quiz.id}
          d={d}
          sectionId={sectionId}
          nextSectionId={section.data?.nextSectionId ?? null}
        />
      )}
    </QueryState>
  );
}

function QuizFlow({
  d,
  sectionId,
  nextSectionId,
}: {
  d: QuizData;
  sectionId: string;
  nextSectionId: string | null;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const info = d.attemptInfo;
  const [attempt, setAttempt] = useState<StartAttempt | null>(
    info.inProgressAttemptId
      ? { attemptId: info.inProgressAttemptId, attemptNumber: info.used + 1, resumed: true }
      : null,
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const local = info.inProgressAttemptId
      ? localStorage.getItem(draftKey(info.inProgressAttemptId))
      : null;
    try {
      return {
        ...info.inProgressAnswers,
        ...(local ? (JSON.parse(local) as Record<string, string>) : {}),
      };
    } catch {
      return { ...info.inProgressAnswers };
    }
  });
  const [idx, setIdx] = useState(0);
  // slide direction of the question transition (next → enters from the forward side)
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const go = (to: number) => {
    setDir(to > idx ? 'next' : 'prev');
    setIdx(to);
  };
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const questions = d.questions;
  const q = questions[idx];

  useEffect(() => {
    if (attempt) localStorage.setItem(draftKey(attempt.attemptId), JSON.stringify(answers));
  }, [answers, attempt]);

  // PHASE-5 §5.2 moments 1–3: a short cue on the verdict, a fanfare only for the real peak.
  // Silent under prefers-reduced-motion and when the sound switch is off (then haptics instead).
  useEffect(() => {
    if (!result) return;
    playMoment(
      result.passed ? (result.packageCompleted ? 'celebrate' : 'correct') : 'wrong',
    );
  }, [result]);

  const start = useMutation({
    mutationFn: () => api.post<StartAttempt>(`/me/quizzes/${d.quiz.id}/attempts`),
    onSuccess: (a) => {
      setAttempt(a);
      if (!a.resumed) {
        setAnswers({});
        setIdx(0);
      }
      void qc.invalidateQueries({ queryKey: qk.quiz(d.quiz.id) });
    },
    onError: (e) =>
      toast.show({ type: 'error', message: e instanceof ApiError ? e.message : 'خطایی رخ داد.' }),
  });
  const submit = useMutation({
    mutationFn: (attemptId: string) =>
      api.post<SubmitResult>(`/me/attempts/${attemptId}/submit`, { answers }),
    onSuccess: (r) => {
      if (attempt) localStorage.removeItem(draftKey(attempt.attemptId));
      setConfirm(false);
      setResult(r);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => {
      setConfirm(false);
      toast.show({
        type: 'error',
        message:
          e instanceof ApiError ? e.message : 'ارسال نشد؛ پاسخ‌هایت ذخیره شده. دوباره تلاش کن.',
      });
    },
  });
  const retake = useMutation({
    mutationFn: () =>
      api.post<{ id: string; status: string }>(`/me/quizzes/${d.quiz.id}/retake-requests`),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'درخواست آزمون مجدد برای مدیر ارسال شد.' });
      void qc.invalidateQueries({ queryKey: qk.quiz(d.quiz.id) });
      nav(`/packages/${d.quiz.packageId}`);
    },
    onError: (e) =>
      toast.show({ type: 'error', message: e instanceof ApiError ? e.message : 'خطایی رخ داد.' }),
  });

  const answered = useMemo(
    () => questions.filter((x) => answers[x.id]).length,
    [answers, questions],
  );
  const header = (
    <PageHeader
      title="آزمون"
      back={`/sections/${sectionId}`}
      subtitle={`${d.quiz.packageTitle} • ${d.quiz.sectionTitle}`}
    />
  );

  // ── M8 result ──
  if (result) {
    const peak = result.passed && result.packageCompleted; // C-07: only a real achievement
    const actions = (
      <>
        {result.nextAction === 'next_section' && nextSectionId ? (
          <Button size="lg" block onClick={() => nav(`/sections/${nextSectionId}`)}>
            قسمت بعد
          </Button>
        ) : result.nextAction === 'package_complete' || result.nextAction === 'next_section' ? (
          <Button
            size="lg"
            block
            onClick={() => nav(result.packageCompleted ? '/' : `/packages/${d.quiz.packageId}`)}
          >
            {result.packageCompleted ? 'بسته تمام شد — بازگشت به خانه' : 'بازگشت به بسته'}
          </Button>
        ) : result.nextAction === 'retry' ? (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              block
              icon={<RotateCcw className="size-5" aria-hidden />}
              loading={start.isPending}
              onClick={() => {
                setResult(null);
                setAttempt(null);
                start.mutate();
              }}
            >
              تلاش دوباره
            </Button>
            <Button variant="ghost" block onClick={() => nav(`/sections/${sectionId}`)}>
              دوباره دیدن قسمت
            </Button>
          </div>
        ) : result.nextAction === 'request_retake' ? (
          <Button size="lg" block loading={retake.isPending} onClick={() => retake.mutate()}>
            درخواست آزمون مجدد از مدیر
          </Button>
        ) : (
          <EmptyState title="درخواست آزمون مجددت در انتظار تأیید مدیر است." />
        )}
      </>
    );

    if (peak)
      return (
        <div className="flex flex-col gap-4">
          {header}
          <CelebrationScreen
            testId="quiz-result"
            title="بسته تمام شد! 🎉"
            subtitle={`${toPersianDigits(result.correctCount)} پاسخ درست از ${toPersianDigits(
              result.total,
            )} • نمره ${faPercent(result.score)}`}
            pointsEarned={result.pointsEarned}
            actionLabel="بازگشت به خانه"
            onAction={() => nav('/')}
          />
        </div>
      );

    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card
          tone={result.passed ? 'brand' : 'default'}
          className="animate-slide-up relative flex flex-col items-center gap-2 overflow-hidden py-6 text-center"
          data-testid="quiz-result"
        >
          {result.passed && <Confetti />}
          {result.passed ? (
            /* a pass = the customer was convinced. Simin says it; Seyla only celebrates. */
            <div className="flex items-end justify-center gap-1">
              <Character id="simin" expression="happy" size="sm" speech="قانع شدم." />
              <Character id="seyla" expression="celebrate" mastery={1} size="lg" />
            </div>
          ) : (
            /* a fail is never shown on the customer's face — Kamran teaches, in an
               empathy voice (C-06 fail rule). Simin never says «نتونستم». */
            <Character
              id="kamran"
              expression="empathy"
              size="lg"
              speech="بذار یه بار دیگه با هم مرور کنیم."
            />
          )}
          <ProgressRing
            value={result.score}
            size={120}
            stroke={10}
            label="نمره آزمون"
            tone={result.passed ? 'success' : 'danger'}
            center={
              <span className="absolute flex flex-col items-center leading-tight">
                {result.passed ? (
                  <PartyPopper className="animate-pop size-7 text-primary" aria-hidden />
                ) : (
                  <XCircle className="animate-shake size-7 text-danger" aria-hidden />
                )}
                <span className="text-xl font-extrabold text-text">{faPercent(result.score)}</span>
              </span>
            }
          />
          <h2 className="mt-1 text-xl font-bold text-text">
            {result.passed ? 'قبول شدی! 🎉' : 'این بار قبول نشدی'}
          </h2>
          <p className="text-sm text-text-secondary">
            {toPersianDigits(result.correctCount)} پاسخ درست از {toPersianDigits(result.total)} •
            نمره قبولی {faPercent(result.passScore)}
          </p>
          {result.pointsEarned > 0 && (
            <p className="animate-pop inline-flex items-center gap-1 rounded-full bg-accent-light px-3 py-1 text-sm font-bold text-accent-fg">
              <Sparkles className="size-4" aria-hidden />+{faNumber(result.pointsEarned)} امتیاز
            </p>
          )}
          {!result.passed && result.remainingAttempts > 0 && (
            <p className="text-sm text-text-secondary">
              {toPersianDigits(result.remainingAttempts)} فرصت دیگر داری.
            </p>
          )}
        </Card>
        <section aria-labelledby="review" className="flex flex-col gap-2">
          <h3 id="review" className="text-base font-bold">
            مرور پاسخ‌ها
          </h3>
          <div className="stagger flex flex-col gap-2">
            {result.review.map((r, i) => {
              const qq = questions.find((x) => x.id === r.questionId);
              return (
                <Card
                  key={r.questionId}
                  className={cn(
                    'flex gap-3 border-s-4',
                    r.correct ? 'border-s-success' : 'border-s-danger',
                  )}
                >
                  {r.correct ? (
                    <CheckCircle2
                      className="animate-pop size-5 shrink-0 text-success"
                      aria-label="درست"
                    />
                  ) : (
                    <XCircle
                      className="animate-shake size-5 shrink-0 text-danger"
                      aria-label="نادرست"
                    />
                  )}
                  <div className="text-sm">
                    <p className="font-bold text-text">
                      {toPersianDigits(i + 1)}. {qq?.stem}
                    </p>
                    {r.explanation && (
                      <p className="mt-1 leading-7 text-text-secondary">{r.explanation}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
        {actions}
      </div>
    );
  }

  // ── Pre-start ──
  if (!attempt) {
    let body: React.ReactNode;
    if (info.passed)
      body = (
        <>
          <EmptyState
            title="این آزمون را قبول شده‌ای ✅"
            description={
              info.lastAttempt ? `نمره: ${faPercent(info.lastAttempt.score)}` : undefined
            }
          />
          <Button
            size="lg"
            block
            onClick={() =>
              nav(nextSectionId ? `/sections/${nextSectionId}` : `/packages/${d.quiz.packageId}`)
            }
          >
            {nextSectionId ? 'قسمت بعد' : 'بازگشت به بسته'}
          </Button>
        </>
      );
    else if (info.pendingRetake)
      body = (
        <EmptyState
          title="در انتظار تأیید مدیر"
          description="درخواست آزمون مجددت ثبت شده است. بعد از تأیید، اینجا فعال می‌شود."
        />
      );
    else if (!info.canAttempt)
      body = (
        <>
          <EmptyState
            title="فرصت‌های آزمون تمام شد"
            description="می‌توانی از مدیرت درخواست آزمون مجدد کنی."
          />
          <Button size="lg" block loading={retake.isPending} onClick={() => retake.mutate()}>
            درخواست آزمون مجدد از مدیر
          </Button>
        </>
      );
    else if (questions.length === 0)
      body = (
        <EmptyState
          title="آزمونی برای این قسمت تعریف نشده است"
          description="به مدیر اطلاع داده شد."
        />
      );
    else
      body = (
        <>
          <Card className="flex flex-col gap-2 text-sm text-text">
            <p>• {toPersianDigits(d.quiz.questionCount)} سؤال چهارگزینه‌ای</p>
            <p>• نمره قبولی: {faPercent(d.quiz.passScore)}</p>
            <p>
              • فرصت باقی‌مانده: {toPersianDigits(info.remaining)} از {toPersianDigits(info.max)}
            </p>
            {info.lastAttempt && <p>• آخرین نمره: {faPercent(info.lastAttempt.score)}</p>}
          </Card>
          <Button
            size="lg"
            block
            loading={start.isPending}
            onClick={() => start.mutate()}
            data-testid="quiz-start"
          >
            شروع آزمون
          </Button>
        </>
      );
    return (
      <div className="flex flex-col gap-4">
        {header}
        {body}
      </div>
    );
  }

  // ── M7 question ──
  if (!q) return null;
  const last = idx === questions.length - 1;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {header}
      <div className="flex items-center gap-3">
        <ProgressBar
          value={((idx + 1) / questions.length) * 100}
          label="پیشرفت آزمون"
          className="flex-1"
        />
        <span className="text-sm font-bold text-text-secondary">
          سؤال {toPersianDigits(idx + 1)} از {toPersianDigits(questions.length)}
        </span>
      </div>
      <div
        key={q.id}
        className={dir === 'next' ? 'animate-slide-in-end' : 'animate-slide-in-start'}
      >
        <fieldset className="stagger flex flex-col gap-3">
          {/* The question itself is the speech bubble below; the legend only names the group
              (duplicating the stem would double-announce it to screen readers). */}
          <legend className="sr-only">سؤال آزمون</legend>
          <div className="mb-1 flex items-start gap-2">
            {/* PHASE-2 §2.4: on M7 the asker is always Simin, the hesitating customer.
                The mentor never grades and never celebrates (C-05 / S-09). */}
            <Character id="simin" expression="thinking" speech={q.stem} size="sm" />
          </div>
          {q.options.map((o) => {
            const checked = answers[q.id] === o.key;
            return (
              <label
                key={o.key}
                className={cn(
                  'pressable flex min-h-14 cursor-pointer items-center gap-3 rounded-card border-2 bg-surface p-3 text-base',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-info',
                  checked
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-border hover:border-primary/40 hover:shadow-xs',
                )}
              >
                <input
                  type="radio"
                  name={q.id}
                  value={o.key}
                  checked={checked}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-[transform,background-color] duration-200 ease-spring',
                    checked
                      ? 'scale-110 bg-primary text-on-primary'
                      : 'bg-surface-2 text-text-secondary',
                  )}
                >
                  {OPTION_LABEL[o.key] ?? o.key}
                </span>
                <span className="flex-1 text-text">{o.text}</span>
                {checked && (
                  <CheckCircle2 className="animate-pop size-5 text-primary" aria-hidden />
                )}
              </label>
            );
          })}
        </fieldset>
      </div>
      <div className="sticky bottom-24 z-20 flex gap-2 rounded-card border border-border/70 bg-surface/95 p-2 shadow-md backdrop-blur lg:bottom-4">
        <Button
          variant="secondary"
          disabled={idx === 0}
          onClick={() => go(idx - 1)}
          icon={<ChevronRight className="size-5" aria-hidden />}
        >
          قبلی
        </Button>
        {last ? (
          <Button
            className="flex-1"
            size="lg"
            disabled={answered < questions.length}
            onClick={() => setConfirm(true)}
            icon={<Send className="size-5" aria-hidden />}
            data-testid="quiz-submit"
          >
            ارسال پاسخ‌ها
          </Button>
        ) : (
          <Button
            className="flex-1"
            size="lg"
            disabled={!answers[q.id]}
            onClick={() => go(idx + 1)}
          >
            <span className="inline-flex items-center gap-1">
              بعدی
              <ChevronLeft className="size-5" aria-hidden />
            </span>
          </Button>
        )}
      </div>
      {answered < questions.length && last && (
        <p className="text-center text-sm text-warning-fg">
          به همه سؤال‌ها پاسخ بده ({toPersianDigits(answered)} از{' '}
          {toPersianDigits(questions.length)}).
        </p>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ارسال پاسخ‌ها؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              بازبینی
            </Button>
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate(attempt.attemptId)}
              data-testid="quiz-confirm"
            >
              ارسال
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">بعد از ارسال نمی‌توانی پاسخ‌ها را تغییر بدهی.</p>
      </Modal>
    </div>
  );
}
