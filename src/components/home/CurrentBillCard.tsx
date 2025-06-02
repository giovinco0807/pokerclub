import React from 'react';
import { Bill } from '../../types';

interface CurrentBillCardProps {
  bill: Bill | null;
  isCheckedIn: boolean;
}

const CurrentBillCard: React.FC<CurrentBillCardProps> = ({ bill, isCheckedIn }) => {
  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl h-full">
      <h3 className="text-xl font-semibold text-secondary mb-2">現在のお会計</h3>
      {isCheckedIn ? (
        bill ? (
          <>
            <p className="text-sm text-neutral-light">請求額：</p>
            <p className="text-3xl font-bold text-primary-light">¥{bill.amount.toLocaleString()}</p>
            <p className="text-sm text-neutral-light mt-2">滞在時間： {bill.durationMinutes} 分</p>
            <p className="text-xs text-neutral-light">料金レート： ¥{bill.ratePerHour}/時間</p>
            <p className="text-xs text-neutral-light mt-1">{bill.details}</p>
          </>
        ) : (
          <p className="text-neutral-lightest">お会計を計算中...</p>
        )
      ) : (
        <p className="text-neutral-lightest text-lg">現在チェックインしていません。</p>
      )}
       <p className="text-xs text-neutral-light mt-4">注意：これはテーブル利用時間のみの料金です。飲食やチップ購入は別途請求されるか、スタッフによるチェックアウト時にここに追加される場合があります。</p>
    </div>
  );
};

export default CurrentBillCard;