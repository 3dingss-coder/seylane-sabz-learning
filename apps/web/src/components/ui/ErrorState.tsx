import { WifiOff } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  /** Simple Persian message + next action — never an error code (§15.0 rule 3). */
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = 'اطلاعات بارگذاری نشد. اتصال اینترنت را بررسی کنید.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger-light px-6 py-8 text-center"
    >
      <WifiOff className="size-8 text-danger" aria-hidden />
      <p className="text-sm font-medium text-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          تلاش مجدد
        </Button>
      )}
    </div>
  );
}
