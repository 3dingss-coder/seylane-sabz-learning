import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, FileQuestion, Rocket, Route as RouteIcon, type LucideIcon } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { toPersianDigits } from '@/lib/digits';

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
  action: ReactNode;
}

/**
 * A1 — «از کجا شروع کنم؟»: the whole admin journey (spec J3: Create → Media → Quiz → Publish →
 * Assign) on one card, each step with the button that does it.
 */
export function PublishGuide({
  onNewPackage,
  drafts,
}: {
  onNewPackage: () => void;
  drafts: number;
}) {
  const steps: Step[] = [
    {
      icon: FilePlus2,
      title: 'آموزش بساز',
      body: 'برای یک محصول (یا کل برند) «بسته آموزشی» بساز و قسمت‌هایش را اضافه کن: ویدیو، صوت یا لینک یوتیوب.',
      action: (
        <Button className="w-full" onClick={onNewPackage}>
          ساخت بسته آموزشی
        </Button>
      ),
    },
    {
      icon: FileQuestion,
      title: 'آزمون بگذار',
      body: 'داخل صفحه بسته، کنار هر قسمت دکمه «آزمون» هست. حداقل ۳ سؤال چهارگزینه‌ای بنویس.',
      action: (
        <GuideLink to="/admin/content">
          {drafts > 0 ? `${toPersianDigits(drafts)} پیش‌نویس منتظر تکمیل` : 'برندها و محصولات'}
        </GuideLink>
      ),
    },
    {
      icon: Rocket,
      title: 'منتشر کن',
      body: 'وقتی قسمت‌ها و آزمون‌ها کامل شد، در صفحه بسته دکمه «انتشار» فعال می‌شود.',
      action: <GuideLink to="/admin/content">مشاهده بسته‌ها</GuideLink>,
    },
    {
      icon: RouteIcon,
      title: 'به بازاریاب‌ها برسان',
      body: 'یک «مسیر یادگیری» بساز: چه کسانی (همه، تیم، فرد) کدام آموزش‌ها را، به چه ترتیبی و تا چه روزی ببینند.',
      action: <GuideLink to="/admin/assignments">مسیرها و مخاطبان</GuideLink>,
    },
  ];
  return (
    <Card className="flex flex-col gap-3" data-testid="publish-guide">
      <div>
        <h2 className="font-bold text-text">انتشار آموزش در ۴ قدم</h2>
        <p className="text-sm text-text-secondary">
          هر آموزش همین مسیر را طی می‌کند. هر قدم دکمه خودش را دارد.
        </p>
      </div>
      <ol className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="flex flex-col gap-2 rounded-card border border-border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
                {toPersianDigits(i + 1)}
              </span>
              <s.icon className="size-5 text-primary" aria-hidden />
              <h3 className="font-bold text-text">{s.title}</h3>
            </div>
            <p className="flex-1 text-sm leading-6 text-text-secondary">{s.body}</p>
            {s.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function GuideLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex min-h-12 items-center justify-center rounded-input border border-border bg-surface px-3 text-sm font-bold text-primary hover:border-primary/40"
    >
      {children}
    </Link>
  );
}
