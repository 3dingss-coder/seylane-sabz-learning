import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Brain, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { qk, useGamification } from '@/lib/queries';
import type { ReviewAnswerResult } from '@/lib/types';
import { Button, Card, ProgressBar } from '@/components/ui';

/**
 * PHASE-3 §3.4 — «مرور امروز».
 *
 * The one screen that serves the business goal: a marketer who still recalls the ingredient at
 * day 90 sells better than one with a long streak and a forgotten formula. Real due questions come
 * from the server's memory model; answering one on time pays coins and capability points, and the
 * server refuses to reward answers faster than a human can read (AC-03).
 */
export function ReviewDeck() {
  const g = useGamification();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);

  const items = g.data?.reviews.items ?? [];
  const due = g.data?.reviews.due ?? 0;
  const cap = g.data?.reviews.cap ?? 7;
  const item = items[index];

  async function answer(answerKey: string) {
    if (!item || busy) return;
    setBusy(true);
    setPicked(answerKey);
    try {
      const res = await api.post<ReviewAnswerResult>(`/me/reviews/${item.questionId}/answer`, {
        answerKey,
      });
      setResult(res);
      await qc.invalidateQueries({ queryKey: qk.gamification });
      await qc.invalidateQueries({ queryKey: qk.coins });
      await qc.invalidateQueries({ queryKey: qk.points });
    } finally {
      setBusy(false);
    }
  }

  if (g.isLoading) return null;
  if (due === 0)
    return (
      <Card chunky className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft-brand text-leaf">
          <Brain className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">مرور امروز انجام شد</p>
          <p className="text-xs leading-6 text-text-secondary">
            سؤال‌ها وقتی برمی‌گردند که نزدیک فراموشی باشند — نه زودتر.
          </p>
        </div>
      </Card>
    );

  return (
    <Card chunky className="flex flex-col gap-3" data-testid="review-deck">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <Brain className="size-4 text-leaf" aria-hidden />
          مرور امروز
        </h2>
        <span className="rounded-pill bg-soft-brand px-2.5 py-0.5 text-xs font-extrabold text-leaf">
          {toPersianDigits(due)} مورد · سقف {toPersianDigits(cap)}
        </span>
      </div>

      {item ? (
        <>
          <ProgressBar
            value={Math.round((index / items.length) * 100)}
            label="پیشرفت مرور امروز"
          />
          <p className="text-sm font-bold leading-7 text-text">{item.stem}</p>
          <div className="flex flex-col gap-2">
            {item.options.map((o) => {
              // only the chosen option is marked: the server never ships the answer key to the
              // client, so a wrong pick shows red rather than revealing the right one
              const mine = picked === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={result !== null || busy}
                  onClick={() => answer(o.key)}
                  className={cn(
                    'pressable tap w-full rounded-input border-2 border-chunk-border bg-surface px-4 py-3 text-start text-sm font-bold leading-7 text-text',
                    'hover:border-leaf/60 disabled:cursor-default disabled:opacity-70',
                    mine && result?.correct && 'border-leaf bg-soft-brand',
                    mine && result && !result.correct && 'border-danger bg-danger-light',
                  )}
                >
                  {o.text}
                </button>
              );
            })}
          </div>

          {result && (
            <div
              role="status"
              className={cn(
                'flex flex-col gap-2 rounded-input border-2 p-3',
                result.correct ? 'border-leaf/40 bg-soft-brand' : 'border-danger/40 bg-danger-light',
              )}
            >
              <p className="flex items-center gap-2 text-sm font-extrabold text-text">
                {result.correct ? (
                  <Check className="size-4 text-leaf" aria-hidden />
                ) : (
                  <X className="size-4 text-danger" aria-hidden />
                )}
                {result.correct ? 'یادت ماند — نیمه‌عمر بلندتر شد' : 'دوباره مرور می‌شود، زودتر'}
                {result.coinsEarned > 0 && (
                  <span className="rounded-pill bg-reward px-2 py-0.5 text-xs text-reward-fg">
                    +{toPersianDigits(result.coinsEarned)} سکه
                  </span>
                )}
                {result.rewarded === false && result.reason === 'too_fast' && (
                  <span className="text-xs font-bold text-text-secondary">
                    (خیلی سریع بود — امتیازی ثبت نشد)
                  </span>
                )}
              </p>
              <p className="text-xs leading-6 text-text-secondary">{result.explanation}</p>
              <Button
                onClick={() => {
                  setResult(null);
                  setPicked(null);
                  setIndex((i) => i + 1);
                }}
              >
                {index + 1 >= items.length ? 'بستن' : 'سؤال بعدی'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-text-secondary">مرورهای امروز تمام شد. آفرین.</p>
      )}
    </Card>
  );
}
