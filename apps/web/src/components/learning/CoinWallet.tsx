import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Gift, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { COPY, LINES } from '@/lib/copy/fa';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { qk, useCoins } from '@/lib/queries';
import { Button, Card, useToast } from '@/components/ui';

/**
 * PHASE-3 §3.3 — سکهٔ توانمندی.
 *
 * There is deliberately no virtual shop: every item here is a real thing (a tester, a printed
 * catalogue, priority assignment, a coaching slot) and every redemption stays visible to the user
 * and to ops. G-04: nothing purchasable can buy a score or silently move a deadline.
 */
export function CoinWallet() {
  const coins = useCoins();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const w = coins.data;

  async function redeem(code: string, title: string, price: number) {
    setBusy(code);
    try {
      await api.post('/me/coins/redeem', { code });
      await qc.invalidateQueries({ queryKey: qk.coins });
      await qc.invalidateQueries({ queryKey: qk.gamification });
      toast.show({ type: 'success', message: LINES.redeemRecorded(title, toPersianDigits(price)) });
    } catch {
      toast.show({ type: 'error', message: COPY.coins.notEnough });
    } finally {
      setBusy(null);
    }
  }

  if (coins.isLoading || !w) return null;

  return (
    <Card chunky className="flex flex-col gap-3" data-testid="coin-wallet">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">{COPY.coins.title}</h2>
        <span className="rounded-pill bg-reward px-2.5 py-0.5 text-xs font-extrabold text-reward-fg">
          <span className="num-latin" dir="ltr">
            {w.balance}
          </span>{' '}
          {COPY.coins.unit}
        </span>
      </div>
      <p className="text-xs leading-6 text-text-secondary">{COPY.coins.note}</p>

      <div className="flex flex-col gap-2">
        {w.catalog.map((item) => {
          const affordable = w.balance >= item.price;
          return (
            <div
              key={item.code}
              className="flex items-center gap-3 rounded-input border-2 border-chunk-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text">{item.title}</p>
                <p className="text-[11px] leading-5 text-text-secondary">{item.note}</p>
              </div>
              <Button
                variant={affordable ? 'primary' : 'ghost'}
                disabled={!affordable || busy === item.code}
                loading={busy === item.code}
                onClick={() => redeem(item.code, item.title, item.price)}
                className="shrink-0"
              >
                {LINES.coinPrice(toPersianDigits(item.price))}
              </Button>
            </div>
          );
        })}
      </div>

      {w.redemptions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t-2 border-chunk-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-text-secondary">
            <ShieldCheck className="size-3.5" aria-hidden />
            {COPY.coins.requests}
          </p>
          {w.redemptions.slice(0, 5).map((r) => (
            <p
              key={r.id}
              className={cn(
                'flex items-center justify-between gap-2 text-xs',
                r.status === 'fulfilled' ? 'text-leaf' : 'text-text-secondary',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
              <span className="shrink-0">
                {r.status === 'pending_fulfilment'
                  ? COPY.coins.pending
                  : r.status === 'fulfilled'
                    ? COPY.coins.fulfilled
                    : COPY.coins.cancelled}
              </span>
            </p>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-text-secondary">
        <Gift className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {COPY.coins.lifetimePrefix}{' '}
        <span className="num-latin font-bold" dir="ltr">
          {w.lifetime}
        </span>
      </p>
    </Card>
  );
}
