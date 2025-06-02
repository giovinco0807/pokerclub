
import React from 'react';
import UserProfileCard from './UserProfileCard';
import CurrentBillCard from './CurrentBillCard';
import PokerTipCard from './PokerTipCard';
import RecentOrdersCard from './RecentOrdersCard';
import { useAppContext } from '../../contexts/AppContext';

const DashboardView: React.FC = () => {
  const { currentUser, currentBill, attendance, orders } = useAppContext();

  if (!currentUser) {
    return <p>ユーザーデータを読み込み中...</p>; // Or a spinner
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-secondary font-condensed">マイダッシュボード</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <UserProfileCard user={currentUser} attendance={attendance} />
        <CurrentBillCard bill={currentBill} isCheckedIn={attendance.isCheckedIn} />
        <PokerTipCard />
      </div>
      <RecentOrdersCard orders={orders.filter(o => o.userId === currentUser.id).slice(0,5)} /> {/* Show last 5 orders */}
    </div>
  );
};

export default DashboardView;