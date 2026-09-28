import React from 'react';
import { OrderStatus } from '../../types';
import { getStatusConfig } from '../../utils/persian';
import { Clock, CheckCircle2, Package, Truck, XCircle, HelpCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: OrderStatus | string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showIcon = true,
  size = 'md',
  className = '',
}) => {
  const config = getStatusConfig(status);

  const getIcon = () => {
    switch (status) {
      case 'pending':
        return <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
      case 'confirmed':
        return <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
      case 'processing':
        return <Package className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
      case 'shipped':
        return <Truck className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
      case 'cancelled':
        return <XCircle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
      default:
        return <HelpCircle className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />;
    }
  };

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-medium',
  }[size];

  return (
    <span
      id={`status-badge-${status}`}
      className={`inline-flex items-center rounded-full border whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
    >
      {showIcon && getIcon()}
      <span>{config.label}</span>
    </span>
  );
};
