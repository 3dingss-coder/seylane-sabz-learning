import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CustomerCard } from './CustomerCard';
import { CustomerCardSkeleton } from '../common/Skeleton';
import { EmptyState } from '../common/EmptyState';
import { BusinessType } from '../../types';
import { UserPlus, Search, X, Users, Store } from 'lucide-react';
import { toPersianDigits, toEnglishDigits } from '../../utils/persian';

export const CustomersView: React.FC = () => {
  const {
    customers,
    isLoading,
    customerSearchQuery,
    setCustomerSearchQuery,
    setIsAddCustomerOpen,
  } = useApp();

  const [businessFilter, setBusinessFilter] = useState<BusinessType | 'all'>('all');

  const filteredCustomers = customers.filter((customer) => {
    if (businessFilter !== 'all' && customer.business_type !== businessFilter) {
      return false;
    }

    if (customerSearchQuery.trim()) {
      const q = customerSearchQuery.toLowerCase().trim();
      const qEng = toEnglishDigits(q);
      const matchStore = customer.store_name?.toLowerCase().includes(q);
      const matchName =
        customer.first_name?.toLowerCase().includes(q) || customer.last_name?.toLowerCase().includes(q);
      const matchPhone = customer.phone?.includes(qEng) || customer.phone?.includes(q);
      const matchCode = customer.customer_code?.toLowerCase().includes(qEng);

      if (!matchStore && !matchName && !matchPhone && !matchCode) {
        return false;
      }
    }

    return true;
  });

  return (
    <div id="customers-view" className="space-y-4 pb-20 pt-2 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">مشتریان من</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            داروخانه‌ها و فروشگاه‌های تحت پوشش منطقه شما ({toPersianDigits(customers.length)})
          </p>
        </div>

        <button
          id="btn-open-add-customer-header"
          onClick={() => setIsAddCustomerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>مشتری جدید</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          id="customer-search-input"
          type="text"
          value={customerSearchQuery}
          onChange={(e) => setCustomerSearchQuery(e.target.value)}
          placeholder="جستجوی داروخانه، نام مشتری یا شماره تماس..."
          className="w-full pr-10 pl-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
        />
        {customerSearchQuery && (
          <button
            id="clear-customer-search-btn"
            onClick={() => setCustomerSearchQuery('')}
            className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
        {[
          { id: 'all', label: 'همه مشتریان' },
          { id: 'pharmacy', label: 'داروخانه‌ها' },
          { id: 'cosmetics', label: 'آرایشی و بهداشتی' },
          { id: 'hypermarket', label: 'هایپرمارکت‌ها' },
          { id: 'supermarket', label: 'سوپرمارکت‌ها' },
        ].map((tab) => {
          const isSelected = businessFilter === tab.id;
          return (
            <button
              key={tab.id}
              id={`filter-customer-${tab.id}`}
              onClick={() => setBusinessFilter(tab.id as BusinessType | 'all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Customer List */}
      {isLoading ? (
        <div className="space-y-3">
          <CustomerCardSkeleton />
          <CustomerCardSkeleton />
          <CustomerCardSkeleton />
        </div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          title="مشتری یافت نشد"
          description={
            customerSearchQuery
              ? 'مشتری با مشخصات جستجو شده یافت نشد.'
              : 'هنوز مشتری با این نوع کسب‌وکار ثبت نشده است.'
          }
          actionText="افزودن مشتری جدید"
          onAction={() => setIsAddCustomerOpen(true)}
          icon={<Store className="w-8 h-8 text-emerald-600" />}
        />
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} />
          ))}
        </div>
      )}
    </div>
  );
};
