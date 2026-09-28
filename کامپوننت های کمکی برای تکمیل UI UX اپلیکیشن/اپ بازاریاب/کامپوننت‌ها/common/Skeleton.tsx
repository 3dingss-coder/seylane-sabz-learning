import React from 'react';

export const OrderCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm animate-pulse space-y-3">
      <div className="flex justify-between items-center">
        <div className="h-5 bg-slate-200 rounded-md w-36"></div>
        <div className="h-6 bg-slate-200 rounded-full w-24"></div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 bg-slate-100 rounded w-48"></div>
        <div className="h-3.5 bg-slate-100 rounded w-28"></div>
      </div>
      <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
        <div className="h-4 bg-slate-200 rounded w-20"></div>
        <div className="h-8 bg-slate-200 rounded-xl w-24"></div>
      </div>
    </div>
  );
};

export const CustomerCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-slate-200 rounded-2xl"></div>
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-slate-200 rounded w-32"></div>
          <div className="h-3 bg-slate-100 rounded w-24"></div>
        </div>
      </div>
      <div className="h-3.5 bg-slate-100 rounded w-full"></div>
    </div>
  );
};

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm animate-pulse flex flex-col justify-between h-48">
      <div className="h-20 bg-slate-200 rounded-xl"></div>
      <div className="space-y-2 pt-2">
        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        <div className="h-3 bg-slate-100 rounded w-1/2"></div>
      </div>
      <div className="h-8 bg-slate-200 rounded-xl w-full"></div>
    </div>
  );
};
