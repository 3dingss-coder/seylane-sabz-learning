import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Home, RotateCw } from 'lucide-react';
import { COPY } from '@/lib/copy/fa';
import { Button } from './Button';
import { ErrorIllustration } from './illustrations';

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. the route), a previously caught error is cleared. */
  resetKey?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}

/** Catches render errors so a bug in one screen shows a friendly page instead of a blank one. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <ErrorIllustration className="animate-fade-up h-36" />
        <h1 className="text-xl font-bold text-text">{COPY.crash.title}</h1>
        <p className="text-sm text-text-secondary">{COPY.crash.body}</p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button
            block
            icon={<RotateCw className="size-4" aria-hidden />}
            onClick={() => this.setState({ failed: false })}
          >
            {COPY.crash.retry}
          </Button>
          <Button
            block
            variant="secondary"
            icon={<Home className="size-4" aria-hidden />}
            onClick={() => window.location.assign('/')}
          >
            {COPY.crash.goHome}
          </Button>
        </div>
      </main>
    );
  }
}
