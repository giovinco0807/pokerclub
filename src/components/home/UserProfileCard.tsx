import React from 'react';
import { User, Attendance } from '../../types';

interface UserProfileCardProps {
  user: User;
  attendance: Attendance;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ user, attendance }) => {
  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl h-full flex flex-col justify-between">
      <div>
        <h3 className="text-xl font-semibold text-secondary mb-1">プレイヤープロフィール</h3>
        <p className="text-2xl font-bold text-neutral-lightest">{user.pokerName || <span className="italic text-sm text-neutral-light">(ポーカーネーム未設定)</span>}</p>
        {user.fullName && <p className="text-sm text-neutral-light">{user.fullName}</p>}
      </div>
      <div className="mt-4">
        <p className="text-sm text-neutral-light">保有チップ数：</p>
        <p className="text-3xl font-bold text-secondary">{user.chips.toLocaleString()}</p>
      </div>
      <div className="mt-4 pt-4 border-t border-neutral-light">
        <p className="text-sm text-neutral-light">ステータス：</p>
        {attendance.isCheckedIn ? (
          <p className="text-lg font-semibold text-green-400">チェックイン中</p>
        ) : (
          <p className="text-lg font-semibold text-red-400">チェックアウト済</p>
        )}
        {attendance.isCheckedIn && attendance.chipsAtTable > 0 && (
             <p className="text-sm text-neutral-light">テーブルのチップ： <span className="font-semibold text-neutral-lightest">{attendance.chipsAtTable.toLocaleString()}</span></p>
        )}
      </div>
    </div>
  );
};

export default UserProfileCard;