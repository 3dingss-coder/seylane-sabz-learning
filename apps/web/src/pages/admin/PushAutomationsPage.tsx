import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { PushAutomationsPanel } from './PushAutomationsPanel';
import { PushSectionTabs } from './PushSectionTabs';

/**
 * «کمپین‌های Push ← اتوماسیون اعلان». The page is deliberately thin: the panel owns the data and the
 * rules it displays live on the server (`services/push-automation-governor.ts`).
 */
export function PushAutomationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="اتوماسیون اعلان (Push)"
        subtitle="قانون‌هایی که بر پایه رفتار کاربر اعلان می‌سازند؛ هر کدام روشن/خاموش، با سقف و پنجره زمانی خودشان"
        actions={
          <Link
            to="/admin/push-campaigns"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
          >
            <ArrowRight className="size-4" aria-hidden />
            بازگشت به کمپین‌ها
          </Link>
        }
      />
      <PushSectionTabs value="automations" />
      <PushAutomationsPanel />
    </div>
  );
}
