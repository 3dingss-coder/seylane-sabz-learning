import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Braces, ChevronDown, ChevronUp, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { Button, Card, Input, useToast } from '@/components/ui';
import { Select, Textarea } from '@/components/common/Field';
import { cn } from '@/lib/cn';
import { Chip } from './PushAutomationsPanel';
import { toFa, type CatalogMeta, type DetailMeta, type RuleVerdict } from './automationWizardModel';
import {
  addChild,
  countLeaves,
  countNodes,
  depthOf,
  emptyPolicy,
  emptyStep,
  fa,
  logicToPatch,
  nestGroup,
  newLeaf,
  moveChild,
  moveItem,
  removeChild,
  setGroupOp,
  updateTree,
  validateLogic,
  emptyLogic,
  type GroupDraft,
  type Issue,
  type LeafDraft,
  type LogicDraft,
  type PolicyDraft,
  type StepDraft,
} from './automationRuleModel';

/**
 * The v2 logic of a rule, editable from the panel: the condition tree, the audience filter, the workflow
 * steps and the repeat policy. This is the piece that turns «the engine can evaluate a tree» into «an
 * admin can write one».
 *
 * Three rules this component keeps:
 *  • every option it offers comes from `/catalog` (the live registries). No list of fields, operators or
 *    step types is copied here — a new field appears in the builder without a UI change, exactly as the
 *    evaluator grows without one;
 *  • no fixed condition count. The only ceiling is the engine's own budget, read from `ruleLimits`, and
 *    the button stays enabled until that number is reached;
 *  • what the server refuses is shown, not guessed. The client-side check exists to stop an obviously
 *    broken save; the payload and its validity are the API's business (`validateRuleExpr`,
 *    `validateSteps`, `validateRepeatPolicy`).
 */
export function LogicCard({
  det,
  meta,
  onSaved,
}: {
  det: DetailMeta;
  meta: CatalogMeta | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<LogicDraft>(() => emptyLogic(det));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [verdict, setVerdict] = useState<RuleVerdict | null>(null);
  const scheduled = det.triggerKind === 'schedule_daily' || det.triggerKind === 'schedule_weekly';

  // One builder for two calls: what `اعتبارسنجی` asks about is byte-for-byte what `ذخیره` would send, so a
  // green verdict and a red save cannot disagree.
  const patchBody = (): Record<string, unknown> => {
    const patch = logicToPatch(draft, meta);
    return {
      // A rule only becomes v2 when it actually carries a tree; an empty card must not flip the shape
      // and leave a rule whose conditions live nowhere.
      ...(patch.when || patch.audienceFilter || patch.steps ? { schemaVersion: 2 } : {}),
      when: patch.when,
      audience: { ...det.audience, filter: patch.audienceFilter },
      steps: patch.steps,
      repeatPolicy: patch.repeatPolicy,
    };
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/push-automations/${det.key}`, {
        ...patchBody(),
        expectedVersion: det.version,
      }),
    onSuccess: () => {
      setIssues([]);
      setVerdict(null);
      toast.show({ type: 'success', message: 'منطق قاعده ذخیره شد.' });
      onSaved();
    },
    onError: (e) => {
      // A zod/registry refusal is authoritative: put its Persian sentence on the field it named.
      const details = (e as ApiError).details;
      setIssues(
        Array.isArray(details)
          ? details.map((d: { field?: string; message?: string }) => ({
              path: String(d?.field ?? 'when'),
              message: String(d?.message ?? 'نامعتبر.'),
            }))
          : [],
      );
      toast.show({ type: 'error', message: errMsg(e, 'ذخیره نشد.') });
    },
  });

  const check = useMutation({
    mutationFn: () =>
      api.post<RuleVerdict>(`/admin/push-automations/${det.key}/validate`, patchBody()),
    onSuccess: (v) => {
      setVerdict(v);
      // The server names the field, so the same rows that block a save light up here too.
      setIssues(v.errors.filter((e) => e.path).map((e) => ({ path: e.path, message: e.message })));
      toast.show({
        type: v.ok ? 'success' : 'error',
        message: v.ok
          ? 'سرور این تعریف را می‌پذیرد؛ ذخیره شدنی است.'
          : 'این تعریف هنوز ذخیره نمی‌شود؛ پیام‌ها را ببینید.',
      });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e, 'اعتبارسنجی انجام نشد.') }),
  });

  if (!meta?.ruleFields?.length) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm font-bold text-text">منطق قاعده (نسخه ۲)</p>
        <p className="text-xs leading-6 text-muted-fg">
          رجیستری فیلدها و عملگرها از سرویس دسته‌بندی خوانده نمی‌شود، پس این ویرایشگر عمداً نمایش
          داده نمی‌شود: ساختن درختی که موتور معنایش را نمی‌داند کار پنل نیست.
        </p>
      </Card>
    );
  }

  const treeCount = `${fa(countNodes(draft.when))} گره / ${fa(depthOf(draft.when))} سطح`;
  const budget = meta.ruleLimits;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-text">
            <Braces className="size-4" aria-hidden />
            منطق قاعده (نسخه ۲)
          </p>
          <p className="mt-1 text-xs leading-6 text-muted-fg">
            شرط‌ها درخت‌اند: هر گروه «و»/«یا»/«نات» و هر برگ یک فیلد از رجیستری. تعداد شرط سقف ثابت
            ندارد — تنها محدودیت، بودجه‌ی ارزیابی موتور است (
            {budget ? `${fa(budget.maxNodes)} گره` : '—'}).
          </p>
        </div>
        <Chip tone="neutral">{treeCount}</Chip>
      </div>

      {det.deadConditions && det.deadConditions.length > 0 && (
        <p className="rounded-card border border-warning/30 bg-warning-light px-3 py-2 text-xs leading-6 text-warning-fg">
          {fa(det.deadConditions.length)} شرط در تعریف قدیمی این قاعده هست که برای این محرک اجرا
          نمی‌شود («trigger.conditions» فقط برای محرک «شرط» خوانده می‌شود). اینجا بازنویسی‌شان کنید.
        </p>
      )}

      <LogicEditors draft={draft} setDraft={setDraft} meta={meta} ctx={det} issues={issues} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={() => {
            const found = validateLogic(draft, meta, { scheduled });
            setIssues(found);
            if (found.length) {
              toast.show({ type: 'error', message: found[0]?.message ?? 'نامعتبر.' });
              return;
            }
            save.mutate();
          }}
        >
          <Save className="size-4" aria-hidden />
          ذخیره منطق
        </Button>
        <Button variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>
          <ShieldCheck className="size-4" aria-hidden />
          اعتبارسنجی با سرور
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(emptyLogic(det));
            setIssues([]);
            setVerdict(null);
          }}
        >
          بازگشت به آنچه ذخیره شده
        </Button>
        {issues.length > 0 && (
          <span className="text-xs font-bold text-danger-fg">
            {fa(issues.length)} مورد باید درست شود
          </span>
        )}
      </div>

      {verdict && <VerdictBox verdict={verdict} />}
    </Card>
  );
}

/**
 * The four editors of a v2 rule, as one controlled block: condition tree, audience filter, workflow steps
 * and repeat policy. `LogicCard` (an existing rule, with saves and server verdicts around it) and
 * `CreateLogicCard` (a rule that does not exist yet) render the very same block, so nothing about *how a
 * rule is expressed* differs between creating and editing — only what happens to the payload does.
 *
 * `ctx` carries the handful of read-only facts the notes quote; a caller with no saved rule simply leaves
 * them out.
 */
export interface LogicEditorsCtx {
  /** The shape comes from `DetailMeta`; the editors only count them, so nothing tighter is claimed. */
  deadConditions?: readonly unknown[];
  usesFlow?: boolean;
  stepsSummary?: string | null;
  policySource?: string;
}

export function LogicEditors({
  draft,
  setDraft,
  meta,
  ctx,
  issues,
}: {
  draft: LogicDraft;
  setDraft: (fn: (d: LogicDraft) => LogicDraft) => void;
  meta: CatalogMeta;
  ctx: LogicEditorsCtx;
  issues: Issue[];
}) {
  const errAt = (path: string) => issues.find((i) => i.path === path)?.message;
  return (
    <>
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold text-text">شرط‌های اجرا (when)</h4>
        <TreeEditor
          root={draft.when}
          meta={meta}
          scope="trigger"
          onChange={(next) => setDraft((d) => ({ ...d, when: next }))}
          error={errAt('when')}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold text-text">فیلتر مخاطب</h4>
        <p className="text-xs leading-6 text-muted-fg">
          فقط فیلدهایی که «برای فیلتر مخاطب» ثبت شده‌اند. این فهرست لحظه‌ی ارسال دوباره سنجیده
          می‌شود، پس عضوی که بین صف‌شدن و تحویل عوض شده، پوش نمی‌گیرد.
        </p>
        <TreeEditor
          root={draft.audience}
          meta={meta}
          scope="audience"
          onChange={(next) => setDraft((d) => ({ ...d, audience: next }))}
          error={errAt('audience.filter')}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold text-text">گام‌های گردش‌کار</h4>
        <p className="text-xs leading-6 text-muted-fg">
          سه اثر: ارسال پیام، صبر (یک سطر در صف؛ ادامه در اجرای بعدی با بازرسی دوباره)، توقف با
          دلیل. ترتیب گام‌ها همان ترتیب اجراست؛ سیاستِ هر گام با «شناسه»اش گره خورده نه جایگاهش، پس
          جابه‌جایی، سیاست‌ها را بی‌نام نمی‌کند.
          {ctx.usesFlow === false && ctx.stepsSummary
            ? ' این قاعده یک گام دارد و روی همان مسیر تک‌پیامی می‌ماند.'
            : null}
        </p>
        <StepsEditor
          steps={draft.steps}
          meta={meta}
          onChange={(next) => setDraft((d) => ({ ...d, steps: next }))}
          issues={issues.filter((i) => i.path.startsWith('steps'))}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold text-text">سیاست تکرار</h4>
        <PolicyEditor
          draft={draft.policy}
          meta={meta}
          onChange={(next) => setDraft((d) => ({ ...d, policy: next }))}
          inherited={ctx.policySource === 'inherited'}
          error={errAt('policy')}
        />
      </section>
    </>
  );
}

/**
 * The same editors, before the rule exists. Two things make this card different from `LogicCard` rather
 * than a copy of it: nothing here is saved on its own (the wizard's «ساخت اتوماسیون» is the only write),
 * and «اعتبارسنجی با سرور» validates the *exact* body that button will send — the same builder, so a
 * green verdict and a rejected create can never disagree.
 */
export function CreateLogicCard({
  meta,
  draft,
  setDraft,
  body,
}: {
  meta: CatalogMeta | null;
  draft: LogicDraft;
  setDraft: (fn: (d: LogicDraft) => LogicDraft) => void;
  /** The payload `POST /admin/push-automations` will get, built by the wizard's own `createBody`. */
  body: () => Record<string, unknown>;
}) {
  const toast = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [verdict, setVerdict] = useState<RuleVerdict | null>(null);
  const kind = String((body() as { trigger?: { kind?: string } }).trigger?.kind ?? '');
  const scheduled = kind === 'schedule_daily' || kind === 'schedule_weekly';
  const check = useMutation({
    mutationFn: () => api.post<RuleVerdict>('/admin/push-automations/validate', body()),
    onSuccess: (v) => {
      setVerdict(v);
      setIssues(v.errors);
      toast.show({
        type: v.ok ? 'success' : 'error',
        message: v.ok
          ? 'سرور این تعریف را می‌پذیرد؛ با «ساخت اتوماسیون» همان چیز ساخته می‌شود.'
          : 'سرور این تعریف را نمی‌پذیرد؛ پیام‌ها را ببینید.',
      });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e, 'اعتبارسنجی انجام نشد.') }),
  });

  if (!meta?.ruleFields?.length) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-text">
          <Braces className="size-4" aria-hidden />
          منطق قاعده (نسخه ۲)
        </p>
        <p className="text-xs leading-6 text-muted-fg">
          رجیستری فیلد و عملگر از سرور نیامد، برای همین ویرایشگر درخت اینجا باز نمی‌شود — ساختن
          درختی که موتور معنایش را نمی‌داند کار پنل نیست. فرم بالا همان شکل سادهٔ قاعده را می‌سازد.
        </p>
      </Card>
    );
  }

  const local = validateLogic(draft, meta, { scheduled });
  const treeCount = `${fa(countNodes(draft.when))} گره / ${fa(depthOf(draft.when))} سطح`;
  return (
    <Card className="flex flex-col gap-4" data-testid="create-logic-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-text">
            <Braces className="size-4" aria-hidden />
            منطق قاعده (نسخه ۲)
          </p>
          <p className="mt-1 text-xs leading-6 text-muted-fg">
            هرچه اینجا بسازید در همان «ساخت اتوماسیون» ثبت می‌شود؛ این کارت به‌تنهایی چیزی ذخیره
            نمی‌کند. تا وقتی خالی بماند، قاعده در شکل ساده (نسخه ۱) ساخته می‌شود. برای محرک «شرط
            وضعیتی»، فهرست تختِ فرم هم اعمال می‌شود — هر دو باید برقرار باشند.
          </p>
        </div>
        <Chip tone="neutral">{treeCount}</Chip>
      </div>

      <LogicEditors
        draft={draft}
        setDraft={setDraft}
        meta={meta}
        ctx={{ policySource: 'own' }}
        issues={issues}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          loading={check.isPending}
          onClick={() => {
            if (local.length) {
              setIssues(local);
              toast.show({ type: 'error', message: local[0]?.message ?? 'نامعتبر.' });
              return;
            }
            check.mutate();
          }}
        >
          <ShieldCheck className="size-4" aria-hidden />
          اعتبارسنجی با سرور
        </Button>
        {issues.length > 0 && (
          <span className="text-xs font-bold text-danger-fg">
            {fa(issues.length)} مورد باید درست شود
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {issues.map((i) => (
            <li key={`${i.path}-${i.message}`} className="text-xs leading-6 text-danger-fg">
              <code className="font-mono text-[11px] text-muted-fg">{i.path}</code> — {i.message}
            </li>
          ))}
        </ul>
      )}

      {verdict && <VerdictBox verdict={verdict} />}
    </Card>
  );
}

/**
 * The server's own answer about the draft: what it refuses, what it would merely warn about, and what the
 * rule costs the engine. Nothing here is recomputed locally — the tree, its budget and the warnings are the
 * evaluation-side numbers, from the same walkers the sender uses.
 */
function VerdictBox({ verdict }: { verdict: RuleVerdict }) {
  const r = verdict.review;
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-card border p-3',
        verdict.ok
          ? 'border-success/30 bg-success-light text-success-fg'
          : 'border-danger/30 bg-danger-light text-danger-fg',
      )}
      aria-live="polite"
    >
      <p className="text-xs font-extrabold">
        {verdict.ok
          ? 'این تعریف ذخیره شدنی است.'
          : `${toFa(verdict.errors.length)} مورد هست که ذخیره را می‌بندد.`}
      </p>
      <p className="text-[11px] leading-6 opacity-80">
        «ذخیره شدنی» یعنی ساختار و رجیستری قبول شده‌اند؛ قولِ ارسال نیست — سقف‌ها، ترجیحات کاربر و
        دستگاه‌های او موقع اجرا بررسی می‌شوند.
      </p>
      {verdict.errors.length > 0 && (
        <ul className="flex flex-col gap-1">
          {verdict.errors.map((e, i) => (
            <li key={`${e.path}-${i}`} className="text-xs leading-6">
              {e.path && (
                <code className="ms-1 rounded bg-surface-2 px-1 font-mono text-[10px]">
                  {e.path}
                </code>
              )}{' '}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      {verdict.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-warning/30 pt-2">
          {verdict.warnings.map((w, i) => (
            <li key={`${w.path}-${i}`} className="text-xs leading-6 text-warning-fg">
              ⚠ {w.message}
            </li>
          ))}
        </ul>
      )}
      {r && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-current/20 pt-2 text-[11px] sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-3">
            {r.treeSummary ? `خلاصهٔ شرط: ${r.treeSummary}` : 'شرطی برای این قاعده نیست.'}
          </div>
          {r.budget && (
            <>
              <dt>گره‌های درخت</dt>
              <dd>
                {fa(r.budget.nodes)} از {fa(r.limits.maxNodes)}
              </dd>
              <dt>تعداد شرط</dt>
              <dd>
                {fa(r.budget.leaves)} از {fa(r.limits.maxLeaves)}
              </dd>
              <dt>عمق تودرتو</dt>
              <dd>
                {fa(r.budget.depth)} از {fa(r.limits.maxDepth)}
              </dd>
            </>
          )}
          <dt>مسیر اجرا</dt>
          <dd>
            {r.usesFlow
              ? `گردش‌کار با ${fa(r.stepIds.length)} گام`
              : 'یک ارسال، بدون موتور گردش‌کار'}
          </dd>
          <dt>گام در انتظار</dt>
          <dd>{r.pendingSteps ? `${fa(r.pendingSteps)} گام پارک‌شده` : '—'}</dd>
          {r.treeSource === 'legacy_conditions' && (
            <>
              <dt>منبع شرط</dt>
              <dd>شرط‌های نسخهٔ ۱ (این محرک آن‌ها را نمی‌خواند)</dd>
            </>
          )}
          {r.eventProduced === false && (
            <div className="col-span-2 sm:col-span-3 font-bold">
              اتفاق «{r.event}» را هنوز هیچ کدی نمی‌فرستد؛ این قاعده اجرا نمی‌شود.
            </div>
          )}
          {r.runNote && (
            <div className="col-span-2 sm:col-span-3 opacity-80">وضعیت امروز: {r.runNote}</div>
          )}
        </dl>
      )}
    </section>
  );
}

// ─── The tree ────────────────────────────────────────────────────────────────

function TreeEditor({
  root,
  meta,
  scope,
  onChange,
  error,
  path = '',
}: {
  root: GroupDraft;
  meta: CatalogMeta;
  scope: 'trigger' | 'audience';
  onChange: (next: GroupDraft) => void;
  error?: string;
  path?: string;
}) {
  const allowed = (meta.ruleFields ?? []).filter((f) => (scope === 'audience' ? f.audience : true));
  const canAddMore = !meta.ruleLimits || countLeaves(root) < meta.ruleLimits.maxLeaves;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-muted-fg">
          {path === '' ? 'شرط اصلی' : 'زیرگروه'}
        </span>
        <select
          aria-label={path === '' ? 'منطق گروه اصلی' : `منطق زیرگروه ${path}`}
          className="h-8 rounded-input border border-border bg-background px-2 text-xs font-bold text-text"
          value={root.op}
          onChange={(e) => onChange(setGroupOp(root, path, e.target.value as 'and' | 'or' | 'not'))}
        >
          <option value="and">همه‌ی این‌ها (و)</option>
          <option value="or">حداقل یکی (یا)</option>
          <option value="not">نات (یک فرزند)</option>
        </select>
      </div>
      {error ? <p className="text-xs font-bold text-danger-fg">{error}</p> : null}
      <ul className="flex flex-col gap-2">
        {root.children.map((child, i) => {
          const cp = path === '' ? `${i}` : `${path}.${i}`;
          return (
            <li key={cp} className="rounded-card border border-border bg-background p-2">
              {child.type === 'group' ? (
                <div className="flex flex-col gap-2">
                  <TreeEditor
                    root={child}
                    meta={meta}
                    scope={scope}
                    onChange={(next) => onChange(updateTree(root, cp, () => next))}
                    error={error}
                  />
                  <MoveRow
                    index={i}
                    count={root.children.length}
                    onMove={(d) => onChange(moveChild(root, path, i, d))}
                  />
                  <RemoveButton
                    label="حذف زیرگروه"
                    onClick={() => onChange(removeChild(root, path, i))}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <LeafRow
                    leaf={child}
                    fields={allowed}
                    operators={meta.ruleOperators ?? []}
                    onChange={(next) => onChange(updateTree(root, cp, () => next))}
                    onRemove={() => onChange(removeChild(root, path, i))}
                  />
                  <MoveRow
                    index={i}
                    count={root.children.length}
                    onMove={(d) => onChange(moveChild(root, path, i, d))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          disabled={!canAddMore && root.children.length > 0}
          onClick={() => onChange(addChild(root, path, newLeaf()))}
        >
          <Plus className="size-3.5" aria-hidden />
          افزودن شرط
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          onClick={() => onChange(nestGroup(root, path))}
        >
          <Plus className="size-3.5" aria-hidden />
          افزودن گروه تودرتو
        </button>
        {!canAddMore ? (
          <span className="text-[11px] text-muted-fg">
            به سقف {fa(meta.ruleLimits?.maxLeaves ?? 0)} شرط بودجه‌ی ارزیابی رسیدید؛ درخت را ساده‌تر
            کنید.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Order is not decoration here: the engine names the first condition that failed, and a flow runs in the
 * order of its steps. So every item carries its own move buttons — keyboard and touch first, which is why
 * there is no drag handle: a tree you can only fix with a mouse is a tree an admin on a laptop trackpad
 * with the panel in a narrow column cannot fix at all.
 */
function MoveRow({
  index,
  count,
  onMove,
}: {
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
}) {
  const cls =
    'inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline disabled:text-muted-fg/60 disabled:no-underline';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[11px] text-muted-fg">
        قلم {fa(index + 1)} از {fa(count)}
      </span>
      <button type="button" className={cls} disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronUp className="size-3.5" aria-hidden />
        بالا
      </button>
      <button type="button" className={cls} disabled={index >= count - 1} onClick={() => onMove(1)}>
        <ChevronDown className="size-3.5" aria-hidden />
        پایین
      </button>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] font-bold text-danger-fg hover:underline"
      onClick={onClick}
    >
      <Trash2 className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

function LeafRow({
  leaf,
  fields,
  operators,
  onChange,
  onRemove,
}: {
  leaf: LeafDraft;
  fields: NonNullable<CatalogMeta['ruleFields']>;
  operators: NonNullable<CatalogMeta['ruleOperators']>;
  onChange: (next: LeafDraft) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.id === leaf.field);
  const ops = operators.filter((o) => (field ? o.kinds.includes(field.kind) : true));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="فیلد"
          className="min-w-44 flex-1"
          value={leaf.field}
          onChange={(e) =>
            onChange({ ...leaf, field: e.target.value, operator: '', value: '', value2: '' })
          }
        >
          <option value="">— انتخاب کنید —</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {f.sweep === false ? ' (فقط مسیر تک‌کاربری)' : ''}
            </option>
          ))}
        </Select>
        <Select
          label="عملگر"
          className="min-w-32 flex-1"
          value={leaf.operator}
          onChange={(e) => onChange({ ...leaf, operator: e.target.value })}
        >
          <option value="">— انتخاب کنید —</option>
          {ops.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <RemoveButton label="حذف شرط" onClick={onRemove} />
      </div>
      {field && field.kind !== 'presence' ? (
        field.kind === 'boolean' ? (
          <Select
            label="مقدار"
            value={leaf.value}
            onChange={(e) => onChange({ ...leaf, value: e.target.value })}
          >
            <option value="">— انتخاب کنید —</option>
            <option value="true">بله</option>
            <option value="false">خیر</option>
          </Select>
        ) : field.kind === 'enum' && field.options?.length ? (
          <Select
            label="مقدار"
            value={leaf.value}
            onChange={(e) => onChange({ ...leaf, value: e.target.value })}
          >
            <option value="">— انتخاب کنید —</option>
            {(field.options as unknown[]).map((v) => (
              <option key={String(v)} value={String(v)}>
                {String(v)}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            label="مقدار"
            type={field.kind === 'number' ? 'number' : 'text'}
            value={leaf.value}
            onChange={(e) => onChange({ ...leaf, value: e.target.value })}
          />
        )
      ) : null}
      {operators.find((o) => o.id === leaf.operator)?.arity === 2 ? (
        <Input
          label="مقدار دوم"
          type={field?.kind === 'number' ? 'number' : 'text'}
          value={leaf.value2}
          onChange={(e) => onChange({ ...leaf, value2: e.target.value })}
        />
      ) : null}
    </div>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function StepsEditor({
  steps,
  meta,
  onChange,
  issues,
}: {
  steps: StepDraft[];
  meta: CatalogMeta;
  onChange: (next: StepDraft[]) => void;
  issues: Issue[];
}) {
  const defs = meta.stepDefs ?? [];
  const max = meta.stepLimits?.maxSteps ?? 8;
  const add = (type: StepDraft['type']) =>
    onChange([...steps, emptyStep(type, `g${steps.length + 1}`)]);
  const patch = (i: number, over: Partial<StepDraft>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...over } : s)));
  const issueAt = (path: string) => issues.find((x) => x.path === path)?.message;
  return (
    <div className="flex flex-col gap-2">
      {steps.length === 0 ? (
        <p className="text-xs leading-6 text-muted-fg">
          بی‌گام یعنی همان «یک پیام» قدیمی. برای صبر، بازرسی دوباره یا انشعاب، یک گام اضافه کنید.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={`${s.id}-${i}`} className="rounded-card border border-border bg-background p-2">
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="شناسه گام"
                value={s.id}
                onChange={(e) => patch(i, { id: e.target.value })}
                className="min-w-28"
              />
              <Select
                label="نوع"
                value={s.type}
                onChange={(e) => patch(i, { type: e.target.value as StepDraft['type'] })}
              >
                {(defs.length
                  ? defs
                  : (['notify', 'wait', 'stop'] as const).map((t) => ({ type: t, label: t }))
                ).map((def) => (
                  <option key={def.type} value={def.type}>
                    {def.label}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                className="text-[11px] font-bold text-danger-fg hover:underline"
                onClick={() => onChange(steps.filter((_, j) => j !== i))}
              >
                حذف گام
              </button>
            </div>
            <MoveRow
              index={i}
              count={steps.length}
              onMove={(d) => onChange(moveItem(steps, i, d))}
            />
            {s.type === 'notify' ? (
              <div className="mt-2 flex flex-col gap-2">
                <Input
                  label="عنوان"
                  value={s.title}
                  error={issueAt(`steps.${i}.title`)}
                  onChange={(e) => patch(i, { title: e.target.value })}
                />
                <Textarea
                  label="متن"
                  rows={2}
                  value={s.body}
                  error={issueAt(`steps.${i}.body`)}
                  onChange={(e) => patch(i, { body: e.target.value })}
                />
                <Input
                  label="مقصد"
                  value={s.actionRef}
                  onChange={(e) => patch(i, { actionRef: e.target.value })}
                />
              </div>
            ) : null}
            {s.type === 'wait' ? (
              <Input
                label="دقیقه"
                type="number"
                className="mt-2 max-w-40"
                value={s.minutes}
                error={issueAt(`steps.${i}.minutes`)}
                hint={`حداکثر ${fa(meta.stepLimits?.maxWaitMinutes ?? 43200)} دقیقه (سی روز)`}
                onChange={(e) => patch(i, { minutes: e.target.value })}
              />
            ) : null}
            {s.type === 'stop' ? (
              <Input
                label="دلیل (در لاگ و پنل)"
                className="mt-2"
                value={s.reason}
                error={issueAt(`steps.${i}.reason`)}
                onChange={(e) => patch(i, { reason: e.target.value })}
              />
            ) : null}
            <label className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-text">
              <input
                type="checkbox"
                checked={s.useCond}
                onChange={(e) => patch(i, { useCond: e.target.checked })}
              />
              {s.type === 'wait' ? 'در پایان صبر دوباره بسنج' : 'فقط اگر (انشعاب)'}
            </label>
            {s.useCond ? (
              <div className="mt-2 border-s-2 border-border ps-2">
                <TreeEditor
                  root={s.cond}
                  meta={meta}
                  scope="trigger"
                  onChange={(next) => patch(i, { cond: next })}
                  error={issueAt(`steps.${i}.cond`)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {(['notify', 'wait', 'stop'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:text-muted-fg"
            disabled={steps.length >= max}
            onClick={() => add(t)}
          >
            <Plus className="size-3.5" aria-hidden />
            {defs.find((d) => d.type === t)?.label ?? t}
          </button>
        ))}
        {steps.length >= max ? (
          <span className="text-[11px] text-muted-fg">سقف {fa(max)} گام پر شده است.</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Policy ──────────────────────────────────────────────────────────────────

function PolicyEditor({
  draft,
  meta,
  onChange,
  inherited,
  error,
}: {
  draft: PolicyDraft;
  meta: CatalogMeta;
  onChange: (next: PolicyDraft) => void;
  inherited: boolean;
  error?: string;
}) {
  const patch = (over: Partial<PolicyDraft>) => onChange({ ...draft, ...over });
  const limits = meta.repeatLimits;
  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex items-center gap-2 text-xs font-bold text-text">
        <input
          type="checkbox"
          checked={draft.on}
          onChange={(e) => onChange(e.target.checked ? { ...draft, on: true } : emptyPolicy())}
        />
        این قاعده سیاست تکرار خودش را دارد
      </label>
      <p className="text-xs leading-6 text-muted-fg">
        {draft.on
          ? 'سیاست تکرار این قانون فعال است؛ تعداد و فاصله ارسال را همین‌جا تعیین می‌کنید. چیزی که هیچ سیاستی بالا نمی‌برد: کلید توقف، انتخاب خودِ کاربر، ساعت سکوت، دستگاه معتبر و ضدتکرار همان پنجره.'
          : inherited
            ? 'این قاعده سیاست تکرار اختصاصی ندارد؛ سقف روز/هفته/فاصله سراسری قدیمی دیگر روی اجرا اعمال نمی‌شود.'
            : 'سیاست تکرار ندارد؛ سقف روز/هفته/فاصله سراسری روی اجرا اعمال نمی‌شود.'}
      </p>
      {error ? <p className="text-xs font-bold text-danger-fg">{error}</p> : null}
      {draft.on ? (
        <div className="flex flex-wrap gap-2">
          <Input
            label="حداقل فاصله (دقیقه)"
            type="number"
            className="min-w-32"
            value={draft.minIntervalMinutes}
            hint={`کف فنی ${fa(Math.round((limits?.minIntervalFloorMs ?? 60000) / 60000))} دقیقه`}
            onChange={(e) => patch({ minIntervalMinutes: e.target.value })}
          />
          <Input
            label="حداکثر در روز"
            type="number"
            className="min-w-28"
            value={draft.perDay}
            hint="خالی یعنی نامحدودِ سیاست؛ ۰ یعنی بستن"
            onChange={(e) => patch({ perDay: e.target.value })}
          />
          <Input
            label="حداکثر در هفته"
            type="number"
            className="min-w-28"
            value={draft.perWeek}
            onChange={(e) => patch({ perWeek: e.target.value })}
          />
          <Input
            label="حداکثر در ماه"
            type="number"
            className="min-w-28"
            value={draft.perMonth}
            onChange={(e) => patch({ perMonth: e.target.value })}
          />
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
            <input
              type="checkbox"
              checked={draft.oncePerEventInstance}
              onChange={(e) => patch({ oncePerEventInstance: e.target.checked })}
            />
            برای همین رخداد، یک بار
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
            <input
              type="checkbox"
              checked={draft.onceInLivespan}
              onChange={(e) => patch({ onceInLivespan: e.target.checked })}
            />
            یک بار در کل (مثل خوش‌آمد)
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
            <input
              type="checkbox"
              checked={draft.respectQuietHoursAlways}
              onChange={(e) => patch({ respectQuietHoursAlways: e.target.checked })}
            />
            ساعت سکوت همیشه (حتی فوری)
          </label>
        </div>
      ) : null}
    </div>
  );
}
