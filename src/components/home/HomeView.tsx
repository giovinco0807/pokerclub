import React from 'react';
import UserProfileCard from './UserProfileCard';
import CurrentBillCard from './CurrentBillCard';
import StoreAnnouncementCard from './StoreAnnouncementCard'; // Changed from PokerTipCard
import RecentOrdersCard from './RecentOrdersCard';
import { useAppContext } from '../../contexts/AppContext';
import { MOCK_ANNOUNCEMENT } from '../../constants'; // Import mock announcement

const HomeView: React.FC = () => {
  const { currentUser, currentBill, attendance, orders } = useAppContext();

  if (!currentUser) {
    return <p>ユーザーデータを読み込み中...</p>; // Or a spinner
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-secondary font-condensed">ホーム</h2> {/* Changed title */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <UserProfileCard user={currentUser} attendance={attendance} />
        <CurrentBillCard bill={currentBill} isCheckedIn={attendance.isCheckedIn} />
        {/* Use StoreAnnouncementCard instead of PokerTipCard, span 1 or 2 cols based on content? */}
        {/* For now, it will take 1 column like other cards. */}
        <StoreAnnouncementCard announcement={MOCK_ANNOUNCEMENT} />
      </div>
      <RecentOrdersCard orders={orders.filter(o => o.userId === currentUser.id).slice(0,5)} /> {/* Show last 5 orders */}
    </div>
  );
};

export default HomeView;