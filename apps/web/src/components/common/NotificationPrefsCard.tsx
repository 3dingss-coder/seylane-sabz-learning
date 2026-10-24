import { useCallback, useEffect, useState } from 'react';
import { BellOff, Lock } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { cn } from '@/lib/cn';

/**
 * «تنظیمات اعلان» — the learner's own switches over the notification categories, mounted under the
 * browser-consent card `PushOptIn`. It is not the same thing and does not touch it: `PushOptIn` decides
 * whether the *browser* may show anything; this decides which *categories* the server sends at all
 * (`mutedCategories` / `optIns`, read by `readPrefsForNotify` in `push-automation-governor.ts` for every
 * batch). A person who is tired of evening messages should not have to silence the whole app to stop them.
 *
 * Every row on the screen comes from `GET /me/notification-prefs`: the category list with its Persian
 * label, its hint, and whether it is `mutable`. That is deliberate — the vocabulary lives in
 * `domain/notification-categories.ts`, and a second copy in the web app would be a second authority that
 * drifts the next time a category is added. Same rule for the opt-in list: the server only offers rules
 * that are enabled, not archived and runnable today, so the screen cannot promise a push that no producer
 * would send.
 */

type CategoryRow = { key: string; label: string; hint: string; mutable: boolean };
type Prefs = {
  mutedCategories: string[];
  /** Carried through every save, never edited here — see `save`. */
  preferredHour: number | null;
  optIns: Record<string, boolean>;
  updatedAt?: string | null;
};
type PrefsView = {
  prefs: Prefs;
  protectedCategories: string[];
  categories: CategoryRow[];
  optInOptions: Array<{ key: string; name: string; description: string }>;
};

export function NotificationPrefsCard() {
  const [view, setView] = useState<PrefsView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      setView(await api.get<PrefsView>('/me/notification-prefs'));
      setState('ready');
    } catch (e) {
      // No switches at all rather than switches whose position is a guess: a screen that failed to load
      // must not read as «everything is on» and then quietly disagree with the server.
      setState('error');
      setError(errMsg(e, 'انتخاب‌های شما بارگذاری نشد.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reload]);

  /**
   * One save per switch, optimistic, with a rollback. `PUT /me/notification-prefs` writes the whole
   * document (`writePrefsSafe`), so the body always carries the *complete* list — sending only the row
   * that moved would unmute every other category — and it re-sends `preferredHour`, which has no UI of
   * its own (the `preferred_time` scenario is panel-selectable but not runnable) and would otherwise be
   * erased by a save the user made for an unrelated reason.
   */
  async function save(next: PrefsView, mark: string, rollback: PrefsView) {
    setView(next);
    setSaving(mark);
    setError(null);
    try {
      const written = await api.put<Prefs>('/me/notification-prefs', {
        mutedCategories: next.prefs.mutedCategories,
        preferredHour: next.prefs.preferredHour,
        optIns: next.prefs.optIns,
      });
      // Merge, do not replace: the server's answer wins for every field it sent, and a partial or
      // unexpected body can never blank the list out from under the switches.
      setView({ ...next, prefs: { ...next.prefs, ...(written ?? {}) } });
    } catch (e) {
      setView(rollback);
      setError(errMsg(e, 'ذخیره نشد. دوباره تلاش کنید.'));
    } finally {
      setSaving(null);
    }
  }

  function toggleCategory(row: CategoryRow, on: boolean) {
    if (!view || !row.mutable) return; // protected categories are not clickable, and never muted
    const rollback = view;
    const muted = new Set(view.prefs.mutedCategories);
    // The switch reports whether the category is *on*; what is stored is its opposite — the list of
    // mutes. So turning a live category off adds its key, and switching a muted one back removes it.
    if (on) muted.add(row.key);
    else muted.delete(row.key);
    void save(
      { ...view, prefs: { ...view.prefs, mutedCategories: [...muted] } },
      row.key,
      rollback,
    );
  }

  function toggleOptIn(key: string, on: boolean) {
    if (!view) return;
    const rollback = view;
    void save(
      { ...view, prefs: { ...view.prefs, optIns: { ...view.prefs.optIns, [key]: on } } },
      `optin:${key}`,
      rollback,
    );
  }

  if (state === 'error') {
    return (
      <Card className="flex flex-col gap-2" aria-labelledby="notif-prefs-heading">
        <h2 id="notif-prefs-heading" className="flex items-center gap-2 text-base font-bold">
          <BellOff className="size-5 text-primary" aria-hidden />
          تنظیمات اعلان
        </h2>
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
        <Button variant="secondary" onClick={() => setReload((x) => x + 1)}>
          تلاش دوباره
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className="flex flex-col gap-3"
      aria-labelledby="notif-prefs-heading"
      aria-busy={state === 'loading' || saving !== null}
    >
      <div>
        <h2 id="notif-prefs-heading" className="flex items-center gap-2 text-base font-bold">
          <BellOff className="size-5 text-primary" aria-hidden />
          تنظیمات اعلان
        </h2>
        <p className="text-xs text-text-secondary">
          خاموش‌کردن فقط پوش را قطع می‌کند؛ اعلان داخل اپ همیشه می‌رسد.
        </p>
        <p id="notif-prefs-help" className="text-xs text-text-secondary">
          دسته‌های «همیشه روشن» را نمی‌توان خاموش کرد: مهلت‌ها و وضعیت دوره.
        </p>
      </div>

      {state === 'loading' && (
        <p role="status" className="text-sm text-text-secondary">
          در حال بارگذاری…
        </p>
      )}

      {state === 'ready' && view && (
        <ul className="flex flex-col gap-3">
          {view.categories.map((row) => {
            const on = !view.prefs.mutedCategories.includes(row.key);
            return (
              <li key={row.key} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{row.label}</span>
                  <span className="block text-xs text-text-secondary">{row.hint}</span>
                </span>
                <Switch
                  on={on}
                  label={`اعلان‌های ${row.label}`}
                  locked={!row.mutable}
                  pending={saving === row.key}
                  busy={saving !== null}
                  describedby={row.mutable ? undefined : 'notif-prefs-help'}
                  onClick={() => toggleCategory(row, on)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Nothing offered → nothing rendered. An empty fieldset with a heading would promise a choice. */}
      {state === 'ready' && view && view.optInOptions.length > 0 && (
        <fieldset className="flex flex-col gap-3 border-t border-border pt-3">
          <legend className="px-1 text-sm font-bold">اعلان‌های انتخابی</legend>
          {view.optInOptions.map((opt) => {
            const on = view.prefs.optIns[opt.key] === true;
            return (
              <div key={opt.key} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{opt.name}</span>
                  <span className="block text-xs text-text-secondary">{opt.description}</span>
                </span>
                <Switch
                  on={on}
                  label={`دریافت «${opt.name}»`}
                  pending={saving === `optin:${opt.key}`}
                  busy={saving !== null}
                  onClick={() => toggleOptIn(opt.key, !on)}
                />
              </div>
            );
          })}
        </fieldset>
      )}

      {error !== null && (
        <p role="alert" aria-live="polite" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
    </Card>
  );
}

/**
 * The same switch the automation panel uses (`role="switch"`, Persian state inside the button), with one
 * addition: a `locked` row stays visible with `aria-checked="true"` and is not operable. The protected
 * categories are shown rather than hidden because «this one is always on, and here is why» is information
 * the user needs in order to trust the rest of the screen.
 */
function Switch({
  on,
  label,
  locked = false,
  pending = false,
  busy = false,
  describedby,
  onClick,
}: {
  on: boolean;
  label: string;
  locked?: boolean;
  pending?: boolean;
  busy?: boolean;
  describedby?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedby}
      aria-busy={pending}
      disabled={locked || busy}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none',
        on
          ? 'border-success/40 bg-success-light text-success-fg'
          : 'border-border bg-background text-text-secondary',
        locked || busy ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40',
      )}
    >
      {locked ? (
        <Lock className="size-3" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex size-4 items-center justify-center rounded-full border text-[10px] font-black',
            on ? 'border-success bg-success text-on-primary' : 'border-border bg-surface',
          )}
        >
          {on ? '✓' : ''}
        </span>
      )}
      <span aria-live="polite">
        {pending ? 'در حال ذخیره…' : locked ? 'همیشه روشن' : on ? 'روشن' : 'خاموش'}
      </span>
    </button>
  );
}
