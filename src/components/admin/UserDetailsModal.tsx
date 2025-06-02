// src/components/admin/UserDetailsModal.tsx
import React from 'react';
import { UserWithId } from '../../types';
import { Timestamp } from 'firebase/firestore';

// StatusBadgeコンポーネント (他の場所で共通化されていればそちらをインポート)
export const StatusBadge: React.FC<{ color: 'green' | 'red' | 'yellow' | 'blue' | 'sky' | 'slate' | 'purple'; text: string }> = ({ color, text }) => {
  const colorClasses = {
    green: 'bg-green-100 text-green-800 border border-green-300',
    red: 'bg-red-100 text-red-800 border border-red-300',
    yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    blue: 'bg-blue-100 text-blue-800 border border-blue-300',
    sky: 'bg-sky-100 text-sky-800 border border-sky-300',
    slate: 'bg-slate-200 text-slate-800 border border-slate-400',
    purple: 'bg-purple-100 text-purple-800 border border-purple-300',
  };
  return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[color]} shadow-sm`}>{text}</span>;
};

// ★★★ UserDetailsModalProps を export する ★★★
export interface UserDetailsModalProps {
  user: UserWithId | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (userId: string) => Promise<void>;
  onUnapprove?: (userId: string) => Promise<void>;
  // 今後のアバター承認機能用 (コメントアウトのまま)
  // onApproveAvatar?: (userId: string) => Promise<void>;
  // onRejectAvatar?: (userId: string) => Promise<void>;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  isOpen,
  onClose,
  onApprove,
  onUnapprove,
}) => {
  if (!isOpen || !user) {
    return null;
  }

  const formatTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date.toLocaleString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const handleApproveClick = async () => {
    if (onApprove && user.id) {
      try {
        await onApprove(user.id);
      } catch (error) {
        console.error("UserDetailsModal: onApprove failed", error);
      }
    }
  };

  const handleUnapproveClick = async () => {
    if (onUnapprove && user.id) {
      try {
        await onUnapprove(user.id);
      } catch (error) {
        console.error("UserDetailsModal: onUnapprove failed", error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-neutral-lightest max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-red-400">ユーザー詳細: {user.pokerName || user.email}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-slate-400">ユーザーID:</p>
            <p className="font-mono text-xs break-all" title={user.id}>{user.id}</p>
          </div>
          <div>
            <p className="text-slate-400">ポーカーネーム:</p>
            <p className="font-semibold">{user.pokerName || '未設定'}</p>
          </div>
          <div>
            <p className="text-slate-400">氏名:</p>
            <p>{user.fullName || '未設定'}</p>
          </div>
          <div>
            <p className="text-slate-400">メールアドレス:</p>
            <p className="break-all">{user.email}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-slate-400">住所:</p>
            <p>{user.address || '未設定'}</p>
          </div>
          <div>
            <p className="text-slate-400">電話番号:</p>
            <p>{user.phone || '未設定'}</p>
          </div>
          <div>
            <p className="text-slate-400">生年月日 (パスワード):</p>
            <p>{user.birthDate || '未設定'}</p>
          </div>
          
          <div className="sm:col-span-2 mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400 mb-1">身分証:</p>
            <div className="flex space-x-4">
              {user.idFrontUrl ? (
                <a href={user.idFrontUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">表を見る</a>
              ) : (<span className="text-slate-500">表: 未提出</span>)}
              {user.idBackUrl ? (
                <a href={user.idBackUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">裏を見る</a>
              ) : (<span className="text-slate-500">裏: 未提出</span>)}
            </div>
          </div>

          <div className="sm:col-span-2 mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">アバター:</p>
            {user.avatarUrl && user.avatarApproved ? (
              <img src={user.avatarUrl} alt="アバター" className="mt-1 w-20 h-20 rounded-full object-cover border-2 border-green-500" />
            ) : user.pendingAvatarUrl ? (
              <div>
                <img src={user.pendingAvatarUrl} alt="申請中アバター" className="mt-1 w-20 h-20 rounded-full object-cover border-2 border-yellow-500" />
                <p className="text-xs text-yellow-400">
                  ステータス: {user.avatarApprovalStatus === 'pending' ? '承認待ち' : user.avatarApprovalStatus || '不明'}
                </p>
              </div>
            ) : (
              <p className="text-slate-500">アバター未設定</p>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">保有チップ:</p>
            <p className="font-semibold text-amber-300">{(user.chips ?? 0).toLocaleString()} チップ</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">使用中チップ:</p>
            <p className="font-semibold text-sky-300">{(user.chipsInPlay ?? 0).toLocaleString()} チップ</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">支払い残高:</p>
            <p className="font-semibold text-yellow-400">{(user.bill ?? 0).toLocaleString()} 円</p>
          </div>

          <div className="mt-2 sm:col-span-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">アカウント状態:</p>
            <div className="flex items-center space-x-2 mt-1 flex-wrap">
              <StatusBadge color={user.approved ? "green" : "yellow"} text={user.approved ? "承認済" : "未承認"} />
              <StatusBadge color={user.isCheckedIn ? "sky" : "slate"} text={user.isCheckedIn ? "チェックイン中" : "チェックアウト済"} />
              {user.isStaff && <StatusBadge color="purple" text="スタッフ" />}
              {user.isAdminClientSide && <StatusBadge color="red" text="管理者(あなた)" />} 
            </div>
             {user.pendingChipSettlement && (
                <div className="mt-2">
                    <StatusBadge color="purple" text="チップ精算ユーザー確認待ち" />
                    <p className="text-xs text-slate-400">
                        T{user.pendingChipSettlement.tableId}-S{user.pendingChipSettlement.seatNumber} より {user.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()}チップ
                    </p>
                     <p className="text-xs text-slate-400">
                        内訳: {Object.entries(user.pendingChipSettlement.denominationsCount).map(([d,c]) => `${d}P x${c}`).join(', ')}
                     </p>
                     <p className="text-xs text-slate-500">処理者: {user.pendingChipSettlement.initiatedBy.substring(0,6)}... ({formatTimestamp(user.pendingChipSettlement.initiatedAt)})</p>
                </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">現在地:</p>
            <p>テーブル: {user.currentTableId || 'N/A'}, 座席: {user.currentSeatNumber ?? 'N/A'}</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">最終チェックイン:</p>
            <p>{formatTimestamp(user.checkedInAt)}</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">最終チェックアウト:</p>
            <p>{formatTimestamp(user.checkedOutAt)}</p>
          </div>
           <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">登録日時:</p>
            <p>{formatTimestamp(user.createdAt)}</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <p className="text-slate-400">最終更新日時:</p>
            <p>{formatTimestamp(user.updatedAt)}</p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700 flex flex-wrap gap-3 justify-end">
          {!user.approved && onApprove && user.id && ( // user.idの存在も確認
            <button
              onClick={handleApproveClick}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm"
            >
              アカウントを承認する
            </button>
          )}
          {user.approved && onUnapprove && user.id && ( // user.idの存在も確認
            <button
              onClick={handleUnapproveClick}
              className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 rounded-md shadow-sm"
            >
              承認を取り消す
            </button>
          )}
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md shadow-sm"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailsModal;