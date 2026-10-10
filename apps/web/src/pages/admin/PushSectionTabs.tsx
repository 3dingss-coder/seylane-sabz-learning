import { useNavigate } from 'react-router-dom';
import { Tabs } from '@/components/common/Field';

export type PushSection = 'campaigns' | 'automations';

const ITEMS: Array<{ value: PushSection; label: string }> = [
  { value: 'campaigns', label: 'کمپین‌های دستی' },
  { value: 'automations', label: 'اتوماسیون اعلان' },
];

/**
 * The two halves of the same product: a person writes a campaign, the engine writes rules. They share
 * one URL namespace (`/admin/push-campaigns[/automations]`) and one navigation surface, so this is the
 * single place that knows the labels. The tabs are links in disguise: the browser back button works.
 */
export function PushSectionTabs({ value }: { value: PushSection }) {
  const navigate = useNavigate();
  return (
    <Tabs
      label="بخش کمپین‌های Push"
      value={value}
      onChange={(next) =>
        navigate(
          next === 'automations' ? '/admin/push-campaigns/automations' : '/admin/push-campaigns',
        )
      }
      items={ITEMS}
    />
  );
}
