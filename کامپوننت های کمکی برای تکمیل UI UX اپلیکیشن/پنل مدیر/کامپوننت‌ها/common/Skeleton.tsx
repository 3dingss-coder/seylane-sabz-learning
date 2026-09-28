import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-6 w-full' }) => {
  return (
    <div className={`animate-pulse bg-slate-200/80 rounded-md ${className}`}></div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 6 }) => {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="p-4 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <Skeleton key={cIdx} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
