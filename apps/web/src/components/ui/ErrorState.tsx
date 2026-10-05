import { RotateCw } from 'lucide-react';
import { COPY } from '@/lib/copy/fa';
import { Button } from './Button';
import { ErrorIllustration } from './illustrations';

export interface ErrorStateProps {
  /** Simple Persian message + next action — never an error code (§15.0 rule 3). */
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = COPY.error.generic, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="animate-fade-up flex flex-col items-center gap-2 rounded-card border border-danger/30 bg-danger-light px-6 py-7 text-center"
    >
      <ErrorIllustration className="h-24" />
      <p className="text-sm font-medium text-text">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          className="mt-1"
          icon={<RotateCw className="size-4" aria-hidden />}
          onClick={onRetry}
        >
          {COPY.actions.retry}
        </Button>
      )}
    </div>
  );
}
