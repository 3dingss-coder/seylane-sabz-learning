import React from 'react';
import { StatCards } from './StatCards';
import { QuickActions } from './QuickActions';
import { RecentOrders } from './RecentOrders';

export const DashboardView: React.FC = () => {
  return (
    <div id="dashboard-view" className="space-y-5 pb-20 pt-2 animate-fadeIn">
      {/* KPI Stats */}
      <StatCards />

      {/* Quick Action Buttons */}
      <QuickActions />

      {/* Recent Orders List */}
      <RecentOrders />
    </div>
  );
};
