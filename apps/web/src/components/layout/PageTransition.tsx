import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Fades/slides a route's content in (360ms, transform+opacity). Re-runs per pathname. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
