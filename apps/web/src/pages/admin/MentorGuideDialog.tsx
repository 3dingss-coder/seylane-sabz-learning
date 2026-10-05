import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, Input, Modal, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { Select, Textarea } from '@/components/common/Field';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ApiError, api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import type {
  MentorGuide,
  MentorGuideDetail,
  MentorGuideKind,
  MentorGuideQuizPolicy,
  MentorGuideTone,
} from '@/lib/types';
import { ak, guideKey, useMentorGuide } from './adminQueries';
import { QUIZ_OPTIONS, TONE_OPTIONS, toneLabel } from './mentorGuideModel';

const cleanList = (rows: string[]) => rows.map((r) => r.trim()).filter((r) => r.length > 0);

// ─── Small building blocks ───────────────────────────────────────────────────

function Fieldset({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-text">{title}</span>
        {hint && <span className="text-xs text-text-secondary">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** Editable list of one-line items (key points, do's, don'ts, selling points). */
function ListField({
  label,
  addLabel,
  placeholder,
  rows,
  onChange,
  tone = 'default',
}: {
  label: string;
  addLabel: string;
  placeholder: string;
  rows: string[];
  onChange: (next: string[]) => void;
  tone?: 'default' | 'danger';
}) {
  const update = (i: number, v: string) => onChange(rows.map((r, idx) => (idx === i ? v : r)));
  return (
    <Fieldset title={label}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            value={r}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            className={
              'min-h-12 flex-1 rounded-input border bg-surface px-3 text-base text-text shadow-xs transition-[border-color,box-shadow] placeholder:text-muted-fg focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15 ' +
              (tone === 'danger' ? 'border-danger/40' : 'border-border')
            }
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`حذف مورد ${i + 1}`}
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => onChange([...rows, ''])}
      >
        {addLabel}
      </Button>
    </Fieldset>
  );
}

/** Editable list of question/answer pairs (objections, FAQ). */
function PairField({
  label,
  aLabel,
  bLabel,
  aPlaceholder,
  bPlaceholder,
  rows,
  onChange,
}: {
  label: string;
  aLabel: string;
  bLabel: string;
  aPlaceholder: string;
  bPlaceholder: string;
  rows: Array<{ a: string; b: string }>;
  onChange: (next: Array<{ a: string; b: string }>) => void;
}) {
  const update = (i: number, patch: Partial<{ a: string; b: string }>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <Fieldset title={label}>
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-card border border-border bg-surface-2 p-3"
        >
          <div className="flex items-start gap-2">
            <input
              value={r.a}
              onChange={(e) => update(i, { a: e.target.value })}
              placeholder={aPlaceholder}
              aria-label={`${aLabel} ${i + 1}`}
              className="min-h-12 flex-1 rounded-input border border-border bg-surface px-3 text-base text-text shadow-xs placeholder:text-muted-fg focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15"
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={`حذف مورد ${i + 1}`}
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            />
          </div>
          <textarea
            value={r.b}
            onChange={(e) => update(i, { b: e.target.value })}
            placeholder={bPlaceholder}
            aria-label={`${bLabel} ${i + 1}`}
            className="min-h-20 w-full rounded-input border border-border bg-surface px-3 py-2 text-base leading-7 text-text shadow-xs placeholder:text-muted-fg focus:border-info focus:outline-none focus:ring-4 focus:ring-info/15"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => onChange([...rows, { a: '', b: '' }])}
      >
        {aLabel} جدید
      </Button>
    </Fieldset>
  );
}

/** Exactly the block the mentor receives, so the admin can proof-read it before saving. */
function previewBlock(g: MentorGuide, name: string): string {
  const lines: string[] = [];
  const subject = g.title.trim() || name;
  if (subject) lines.push(`- موضوع: ${subject}`);
  lines.push(`- لحن گفتار: ${toneLabel(g.tone)}`);
  if (g.personaNote.trim()) lines.push(`- نقش منتور: ${g.personaNote.trim()}`);
  if (g.summary.trim()) lines.push(`- آنچه منتور باید بداند: ${g.summary.trim()}`);
  if ((g.document ?? '').trim())
    lines.push(`- سند دانش: ${(g.document ?? '').trim().slice(0, 500)}`);
  if (g.dos.length) lines.push(`- حتماً بگو: ${g.dos.join(' | ')}`);
  if (g.donts.length) lines.push(`- هرگز نگو: ${g.donts.join(' | ')}`);
  if (g.sellingPoints.length) lines.push(`- مزیت‌های اصلی: ${g.sellingPoints.join(' | ')}`);
  if (g.keyPoints.length) lines.push(`- نکات کلیدی: ${g.keyPoints.join(' | ')}`);
  for (const o of g.objections) lines.push(`- اعتراض «${o.objection}» → ${o.answer}`);
  for (const f of g.faq) lines.push(`- ${f.question} → ${f.answer}`);
  return lines.join('\n');
}

// ─── Form ────────────────────────────────────────────────────────────────────

function GuideForm({
  kind,
  targetId,
  name,
  initial,
  defined,
  onClose,
}: {
  kind: MentorGuideKind;
  targetId: string | null;
  name: string;
  initial: MentorGuide;
  defined: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [g, setG] = useState<MentorGuide>({
    ...initial,
    document: initial.document ?? '',
    keyPoints: initial.keyPoints ?? [],
    sellingPoints: initial.sellingPoints ?? [],
    objections: initial.objections ?? [],
    faq: initial.faq ?? [],
    dos: initial.dos ?? [],
    donts: initial.donts ?? [],
    keywords: initial.keywords ?? [],
    summary: initial.summary ?? '',
    personaNote: initial.personaNote ?? '',
    title: initial.title ?? '',
  });
  const [keywords, setKeywords] = useState((initial.keywords ?? []).join('، '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const patch = (p: Partial<MentorGuide>) => setG((prev) => ({ ...prev, ...p }));
  const body = useMemo(
    () => ({
      ...g,
      keyPoints: cleanList(g.keyPoints),
      sellingPoints: cleanList(g.sellingPoints),
      dos: cleanList(g.dos),
      donts: cleanList(g.donts),
      keywords: keywords
        .split(/[،,]/)
        .map((x) => x.trim())
        .filter(Boolean),
      objections: g.objections
        .map((o) => ({ objection: o.objection.trim(), answer: o.answer.trim() }))
        .filter((o) => o.objection || o.answer),
      faq: g.faq
        .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
        .filter((f) => f.question || f.answer),
      document: (g.document ?? '').trim(),
    }),
    [g, keywords],
  );
  const payload = useMemo(
    () => ({
      title: body.title,
      enabled: body.enabled,
      tone: body.tone,
      personaNote: body.personaNote,
      summary: body.summary,
      document: body.document ?? '',
      keyPoints: body.keyPoints,
      sellingPoints: body.sellingPoints,
      objections: body.objections,
      faq: body.faq,
      dos: body.dos,
      donts: body.donts,
      keywords: body.keywords,
      priority: body.priority,
      quizAnswers: body.quizAnswers,
    }),
    [body],
  );

  const url = `/admin/mentor/guides/${kind}${targetId ? `/${encodeURIComponent(targetId)}` : ''}`;
  const save = useMutation({
    mutationFn: () => {
      if ((payload.summary ?? '').length > 20_000)
        throw new ApiError('VALIDATION', 'متن «آنچه منتور باید بداند» طولانی است. فایل دانش را در «سند دانش» بگذارید.', 400);
      if ((payload.document ?? '').length > 40_000)
        throw new ApiError('VALIDATION', 'سند دانش طولانی‌تر از حد مجاز است. آن را کمی کوتاه کنید.', 400);
      return api.put<MentorGuideDetail>(url, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ak.guides });
      void qc.invalidateQueries({ queryKey: ak.guide(guideKey(kind, targetId)) });
      toast.show({ type: 'success', message: 'جعبه‌ی رفتار منتور ذخیره شد.' });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setErrors(e.fields);
        setFormError(Object.values(e.fields)[0] ?? errMsg(e));
        return;
      }
      const message = errMsg(e);
      setFormError(message);
      toast.show({ type: 'error', message });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ak.guides });
      void qc.invalidateQueries({ queryKey: ak.guide(guideKey(kind, targetId)) });
      toast.show({ type: 'success', message: 'جعبه حذف شد؛ منتور به رفتار پیش‌فرض برگشت.' });
      onClose();
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  const filled =
    cleanList(g.keyPoints).length +
    cleanList(g.sellingPoints).length +
    g.objections.length +
    g.faq.length +
    cleanList(g.dos).length +
    cleanList(g.donts).length +
    (g.summary.trim() ? 2 : 0) +
    ((g.document ?? '').trim() ? 2 : 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        kind === 'global'
          ? 'رفتار پیش‌فرض منتور'
          : `رفتار منتور — ${name || (kind === 'brand' ? 'برند' : 'محصول')}`
      }
      footer={
        <>
          {defined && kind !== 'global' && (
            <Button
              type="button"
              variant="ghost"
              className="!text-danger-fg"
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={() => setConfirmDelete(true)}
            >
              حذف جعبه
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={save.isPending}
            icon={<Check className="size-4" aria-hidden />}
            onClick={() => save.mutate()}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {formError && (
          <p role="alert" className="rounded-card border border-danger/40 bg-danger-light p-3 text-sm leading-7 text-danger-fg">
            {formError}
          </p>
        )}
        <p className="rounded-card border border-info/30 bg-info-light p-3 text-sm leading-7 text-text">
          هرچه اینجا می‌نویسی دو جا می‌رود: <b>دانش منتور</b> (مثل بقیه محتوای تأییدشده، قابل
          جست‌وجو و ارجاع) و <b>دستور رفتار</b> (لحن، بایدها و نبایدها). منتور درباره‌ی این{' '}
          {kind === 'brand' ? 'برند' : kind === 'product' ? 'محصول' : 'سایت'} همیشه همین را ملاک
          قرار می‌دهد.
        </p>

        <Card className="flex flex-col gap-4">
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span className="text-sm font-bold text-text">
              این جعبه فعال است
              <span className="block text-xs font-normal text-text-secondary">
                با غیرفعال‌سازی، منتور درباره‌ی این مورد به رفتار پیش‌فرض برمی‌گردد (متن حذف
                نمی‌شود).
              </span>
            </span>
            <input
              type="checkbox"
              checked={g.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="size-5 accent-primary"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="لحن گفتار منتور"
              value={g.tone}
              onChange={(e) => patch({ tone: e.target.value as MentorGuideTone })}
              hint={TONE_OPTIONS.find((t) => t.value === g.tone)?.hint}
            >
              {TONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Select
              label="اولویت در پاسخ (۰ تا ۲)"
              value={String(g.priority)}
              onChange={(e) => patch({ priority: Number(e.target.value) || 0 })}
              hint="عدد بیشتر = این جعبه زودتر در پاسخ منتور دیده می‌شود."
            >
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="عنوان دلخواه (اختیاری)"
            value={g.title}
            onChange={(e) => patch({ title: e.target.value })}
            error={errors.title}
            hint="اگر خالی بماند، نام برند/محصول استفاده می‌شود."
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <Input
            label="نقش منتور در یک خط"
            value={g.personaNote}
            onChange={(e) => patch({ personaNote: e.target.value })}
            error={errors.personaNote}
            placeholder="مثل یک کارشناس مراقبت پوست که کنار دست بازاریاب ایستاده"
          />
          <Textarea
            label="آنچه منتور باید کامل بداند"
            value={g.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            error={errors.summary}
            hint="جایگاه برند/محصول، مخاطب و نکته‌های اصلی. متن خیلی بلند را در سند دانش بگذار."
            rows={5}
          />
          <Textarea
            label="سند دانش محصول (متن کامل)"
            value={g.document ?? ''}
            onChange={(e) => patch({ document: e.target.value })}
            error={errors.document}
            hint="فایل دانش تأییدشده را اینجا بگذار یا بارگذاری کن. منتور عین همین متن را ملاک قرار می‌دهد."
            rows={8}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.markdown,text/plain,text/markdown"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (file.size > 80_000) {
                  setFormError('فایل بزرگ‌تر از حد مجاز است. یک فایل متنی کوتاه‌تر انتخاب کن.');
                  return;
                }
                void file.text().then((text) => {
                  const clipped = text.slice(0, 40_000);
                  patch({ document: clipped, title: g.title || file.name.replace(/\.[^.]+$/, '') });
                  setFormError(
                    text.length > 40_000 ? 'انتهای فایل به‌خاطر سقف طول حذف شد، ولی بقیه ذخیره می‌شود.' : '',
                  );
                });
              }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              بارگذاری فایل دانش (md/txt)
            </Button>
            <span className="text-xs text-text-secondary">
              {toPersianDigits((g.document ?? '').length)} نویسه
            </span>
          </div>
        </Card>

        <Card className="flex flex-col gap-5">
          <ListField
            label="نکات کلیدی"
            addLabel="نکته جدید"
            placeholder="مثلاً: جذب سریع بدون احساس چربی"
            rows={g.keyPoints}
            onChange={(v) => patch({ keyPoints: v })}
          />
          <ListField
            label="مزیت‌های اصلی برای مشتری"
            addLabel="مزیت جدید"
            placeholder="مثلاً: ماندگاری ۲۴ ساعته آبرسانی"
            rows={g.sellingPoints}
            onChange={(v) => patch({ sellingPoints: v })}
          />
          <PairField
            label="اعتراض‌های مشتری و پاسخ تأییدشده"
            aLabel="اعتراض"
            bLabel="پاسخ"
            aPlaceholder="مثلاً: قیمت بالاست"
            bPlaceholder="پاسخی که منتور باید بدهد…"
            rows={g.objections.map((o) => ({ a: o.objection, b: o.answer }))}
            onChange={(v) => patch({ objections: v.map((r) => ({ objection: r.a, answer: r.b })) })}
          />
          <PairField
            label="پرسش‌های پرتکرار"
            aLabel="پرسش"
            bLabel="پاسخ"
            aPlaceholder="مثلاً: برای پوست چرب مناسب است؟"
            bPlaceholder="پاسخ تأییدشده…"
            rows={g.faq.map((f) => ({ a: f.question, b: f.answer }))}
            onChange={(v) => patch({ faq: v.map((r) => ({ question: r.a, answer: r.b })) })}
          />
        </Card>

        <Card className="flex flex-col gap-5">
          <ListField
            label="حتماً بگو / تأکید کن"
            addLabel="مورد جدید"
            placeholder="مثلاً: روی آبرسانی و ماندگاری تأکید کن"
            rows={g.dos}
            onChange={(v) => patch({ dos: v })}
          />
          <ListField
            label="هرگز نگو"
            addLabel="مورد جدید"
            placeholder="مثلاً: ادعای درمانی یا مقایسه با رقیب"
            rows={g.donts}
            onChange={(v) => patch({ donts: v })}
            tone="danger"
          />
          <Input
            label="کلمات کلیدیِ جست‌وجو (با ویرگول جدا کن)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            hint="نام‌های مستعار، معادل لاتین و اصطلاحات بازار — کمک می‌کند سؤال بازاریاب به این جعبه برسد."
          />
          <Select
            label="دسترسی منتور به پاسخ آزمون‌ها"
            value={g.quizAnswers}
            onChange={(e) => patch({ quizAnswers: e.target.value as MentorGuideQuizPolicy })}
            hint="تنظیم کلی سایت از بخش «سیاست‌ها» است؛ اینجا می‌توانی برای این مورد استثنا بگذاری."
          >
            {QUIZ_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Card>

        <Card className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className="pressable flex min-h-12 items-center justify-between gap-2 text-sm font-bold text-text"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              پیش‌نمایش: متنی که به منتور داده می‌شود
            </span>
            <span className="flex items-center gap-2 text-xs font-normal text-text-secondary">
              <StatusBadge status={filled > 0 ? 'active' : 'draft'} />
              {toPersianDigits(filled)} مورد
            </span>
          </button>
          {showPreview && (
            <pre
              dir="rtl"
              className="max-h-64 overflow-auto whitespace-pre-wrap rounded-card border border-border bg-surface-2 p-3 text-xs leading-7 text-text"
            >
              {previewBlock(body, name)}
            </pre>
          )}
        </Card>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          open
          danger
          title="حذف جعبه‌ی رفتار؟"
          confirmText="حذف"
          loading={remove.isPending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate()}
        >
          محتوای این جعبه پاک می‌شود و منتور درباره‌ی این {kind === 'brand' ? 'برند' : 'محصول'} فقط
          به رفتار پیش‌فرض و محتوای آموزشی تکیه می‌کند.
        </ConfirmDialog>
      )}
    </Modal>
  );
}

/** Loads the box then renders the editor (a `key` on the form resets state between targets). */
export function MentorGuideDialog({
  kind,
  targetId,
  name,
  onClose,
}: {
  kind: MentorGuideKind;
  targetId: string | null;
  name?: string;
  onClose: () => void;
}) {
  const q = useMentorGuide(kind, targetId);
  if (q.isPending)
    return (
      <Modal open onClose={onClose} title="در حال بارگذاری…" size="sm">
        <Skeleton className="h-40 w-full" />
      </Modal>
    );
  if (q.isError)
    return (
      <Modal open onClose={onClose} title="خطا" size="sm">
        <p className="text-sm text-danger-fg">{errMsg(q.error)}</p>
      </Modal>
    );
  return (
    <GuideForm
      key={guideKey(kind, targetId)}
      kind={kind}
      targetId={targetId}
      name={name ?? q.data.name}
      initial={q.data.guide}
      defined={q.data.defined}
      onClose={onClose}
    />
  );
}
