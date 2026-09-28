import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      className="fixed top-4 left-4 right-4 z-50 flex flex-col gap-2 max-w-md mx-auto pointer-events-none"
    >
      {toasts.map((toast) => {
        const getIcon = () => {
          switch (toast.type) {
            case 'success':
              return <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />;
            case 'error':
              return <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />;
            case 'warning':
              return <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />;
            case 'info':
            default:
              return <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />;
          }
        };

        const getBg = () => {
          switch (toast.type) {
            case 'success':
              return 'bg-white border-emerald-200 text-slate-800 shadow-emerald-900/10';
            case 'error':
              return 'bg-white border-rose-200 text-slate-800 shadow-rose-900/10';
            case 'warning':
              return 'bg-white border-amber-200 text-slate-800 shadow-amber-900/10';
            case 'info':
            default:
              return 'bg-white border-blue-200 text-slate-800 shadow-blue-900/10';
          }
        };

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-lg transition-all duration-300 transform translate-y-0 ${getBg()}`}
          >
            <div className="flex items-center gap-2.5">
              {getIcon()}
              <p className="text-xs md:text-sm font-medium leading-relaxed">{toast.message}</p>
            </div>
            <button
              id={`close-toast-${toast.id}`}
              onClick={() => removeToast(toast.id)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
