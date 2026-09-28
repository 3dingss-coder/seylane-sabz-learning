import { cn } from '@/lib/cn';

interface SpinnerProps {
  className?: string;
  /** Accessible label; omit when the parent already announces the state. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-e-transparent',
        className,
      )}
    />
  );
}
