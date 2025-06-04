// src/components/admin/UserDetailsModal.tsx
import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebase'; // パスを確認
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { UserWithId } from '../../types'; // パスを確認
import { AiOutlineLoading } from 'react-icons/ai'; // ローディングアイコン

// StatusBadgeコンポーネント (変更なし、または共通化されていればインポート)
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

export interface UserDetailsModalProps {
  user: UserWithId | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (userId: string) => Promise<void>;
  onUnapprove?: (userId: string) => Promise<void>;
  onUserUpdateSuccess?: (message: string) => void;
  onUserUpdateError?: (message: string) => void;
  onBalanceResetSuccess?: (userId: string, newBillValue: number) => void;
  onBalanceResetError?: (errorMsg: string) => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  isOpen,
  onClose,
  onApprove,
  onUnapprove,
  onUserUpdateSuccess,
  onUserUpdateError,
  onBalanceResetSuccess,
  onBalanceResetError,
}) => {
  const [loadingAction, setLoadingAction] = useState(false); // 承認などの一般的なアクション用
  const [isProcessingPayment, setIsProcessingPayment] = useState(false); // 会計処理専用

  // formatTimestamp関数 (AdminUserManagementPageからコピペまたは共通化)
  const formatTimestampLocal = (timestamp?: Timestamp | Date | null, includeSeconds: boolean = false): string => {
    if (!timestamp) return 'N/A';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return 'Invalid Date';
    }
    try {
      return date.toLocaleString('ja-JP', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined
      });
    } catch (e) {
        console.error("Error formatting timestamp in UserDetailsModal:", e, "Original value:", timestamp);
        return 'Date Format Error';
    }
  };


  const handleApproveClick = async () => {
    if (onApprove && user?.id) {
      setLoadingAction(true);
      try {
        await onApprove(user.id);
        onUserUpdateSuccess?.("アカウントを承認しました。");
      } catch (error: any) {
        onUserUpdateError?.(`承認処理に失敗: ${error.message}`);
      } finally {
        setLoadingAction(false);
      }
    }
  };

  const handleUnapproveClick = async () => {
    if (onUnapprove && user?.id) {
      setLoadingAction(true);
      try {
        await onUnapprove(user.id);
        onUserUpdateSuccess?.("アカウントの承認を取り消しました。");
      } catch (error: any) {
        onUserUpdateError?.(`承認取り消しに失敗: ${error.message}`);
      } finally {
        setLoadingAction(false);
      }
    }
  };

  const handleCashPaymentAndResetBill = async () => {
    if (!user?.id) {
      onBalanceResetError?.("対象ユーザー情報がありません。");
      return;
    }
    if ((user.bill ?? 0) === 0) {
      // 既に0円の場合はメッセージだけ表示して何もしない、またはボタンを非表示にする
      onUserUpdateSuccess?.("既にお支払い済み、または残高はありません。");
      return;
    }

    if (!window.confirm(`ユーザー「${user.pokerName || user.email}」の会計残高 ¥${(user.bill ?? 0).toLocaleString()} を現金で受け取り、残高を0円にしますか？この操作は元に戻せません。`)) {
      return;
    }

    setIsProcessingPayment(true);
    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        bill: 0,
        lastPaymentType: 'cash_admin_reset', // 支払い方法を記録 (より具体的に)
        lastPaymentAt: serverTimestamp(),    // 支払い日時を記録
        updatedAt: serverTimestamp(),         // 更新日時も記録
      });
      // 成功メッセージとコールバック
      const successMsg = `${user.pokerName || user.email} の会計残高を0にリセットしました。`;
      onUserUpdateSuccess?.(successMsg); // 汎用的な成功メッセージコールバック
      onBalanceResetSuccess?.(user.id, 0); // 専用の成功コールバック (ユーザーIDと新しい残高0を渡す)

      // 親コンポーネント側でリストを再取得・更新するため、ここではモーダルを閉じるか、
      // またはローカルでユーザー情報を更新して表示を継続するかを選択できます。
      // 今回は親側でリスト再取得を行う想定で、モーダルは閉じない形も考えられますが、
      // ユーザー操作後は閉じて再表示する方が状態管理がシンプルになることが多いです。
      // onClose(); // 必要に応じて自動で閉じる
    } catch (error: any) {
      console.error("会計残高のリセット処理に失敗:", error);
      const errorMsg = `会計残高のリセットに失敗: ${error.message}`;
      onUserUpdateError?.(errorMsg); // 汎用的なエラーメッセージコールバック
      onBalanceResetError?.(errorMsg);  // 専用のエラーコールバック
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (!isOpen || !user) {
    return null;
  }

  const currentBill = user.bill ?? 0;

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-neutral-lightest max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
          <h2 className="text-2xl font-semibold text-red-400">ユーザー詳細: {user.pokerName || user.email}</h2>
          <button
            onClick={onClose}
            disabled={loadingAction || isProcessingPayment}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-700"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ユーザー情報表示セクション */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
          {/* ... (ID, ポーカーネーム, 氏名, メールなどの表示 ... 変更なし) ... */}
          <div><p className="text-slate-400">ID:</p><p className="font-mono text-xs break-all" title={user.id}>{user.id}</p></div>
          <div><p className="text-slate-400">ポーカーネーム:</p><p className="font-semibold">{user.pokerName || '未設定'}</p></div>
          <div><p className="text-slate-400">氏名:</p><p>{user.fullName || '未設定'}</p></div>
          <div><p className="text-slate-400">メール:</p><p className="break-all">{user.email}</p></div>
          <div className="sm:col-span-2"><p className="text-slate-400">住所:</p><p>{user.address || '未設定'}</p></div>
          <div><p className="text-slate-400">電話:</p><p>{user.phone || '未設定'}</p></div>
          <div><p className="text-slate-400">生年月日:</p><p>{user.birthDate || '未設定'}</p></div>
          <div className="sm:col-span-2 mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400 mb-1">身分証:</p><div className="flex space-x-4">{user.idFrontUrl ? <a href={user.idFrontUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">表</a> : <span className="text-slate-500">表:未</span>}{user.idBackUrl ? <a href={user.idBackUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">裏</a> : <span className="text-slate-500">裏:未</span>}</div></div>
          <div className="sm:col-span-2 mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400">アバター:</p>{user.avatarUrl && user.avatarApproved ? <img src={user.avatarUrl} alt="アバター" className="mt-1 w-20 h-20 rounded-full object-cover border-2 border-green-500" /> : user.pendingAvatarUrl ? <div><img src={user.pendingAvatarUrl} alt="申請中" className="mt-1 w-20 h-20 rounded-full object-cover border-2 border-yellow-500" /><p className="text-xs text-yellow-400">ステータス: {user.avatarApprovalStatus || '不明'}</p></div> : <p className="text-slate-500">未設定</p>}</div>
          <div className="mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400">保有チップ:</p><p className="font-semibold text-amber-300">{(user.chips ?? 0).toLocaleString()} P</p></div>
          <div className="mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400">使用中チップ:</p><p className="font-semibold text-sky-300">{(user.chipsInPlay ?? 0).toLocaleString()} P</p></div>
          <div className="mt-2 pt-2 border-t border-slate-700 sm:col-span-2">
            <p className="text-slate-400">会計残高:</p>
            <p className={`font-semibold text-xl ${currentBill > 0 ? 'text-yellow-400' : 'text-green-400'}`}>¥{currentBill.toLocaleString()}</p>
          </div>
          <div className="mt-2 sm:col-span-2 pt-2 border-t border-slate-700"><p className="text-slate-400">アカウント状態:</p><div className="flex items-center space-x-2 mt-1 flex-wrap"><StatusBadge color={user.approved ? "green" : "yellow"} text={user.approved ? "承認済" : "未承認"} /><StatusBadge color={user.isCheckedIn ? "sky" : "slate"} text={user.isCheckedIn ? "IN" : "OUT"} />{user.isStaff && <StatusBadge color="purple" text="スタッフ" />}{user.pendingChipSettlement && <StatusBadge color="purple" text="精算確認中" />}</div></div>
          <div className="mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400">登録日時:</p><p>{formatTimestampLocal(user.createdAt)}</p></div>
          <div className="mt-2 pt-2 border-t border-slate-700"><p className="text-slate-400">最終更新:</p><p>{formatTimestampLocal(user.updatedAt)}</p></div>
        </div>

        {/* 現金受領ボタンセクション */}
        <div className="mt-6 pt-4 border-t border-slate-700">
          <h4 className="text-lg font-semibold text-neutral-lightest mb-3">会計処理</h4>
          {currentBill > 0 ? (
            <button
              onClick={handleCashPaymentAndResetBill}
              disabled={isProcessingPayment || loadingAction}
              className={`w-full px-4 py-2.5 rounded-md font-semibold transition-colors flex items-center justify-center text-base
                ${isProcessingPayment || loadingAction
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
              {isProcessingPayment ? (
                <><AiOutlineLoading className="inline-block animate-spin mr-2" size={20} />処理中...</>
              ) : `現金受領 (残高 ¥${currentBill.toLocaleString()} を0にする)`}
            </button>
          ) : (
             <p className="text-green-400 text-center font-semibold py-2">会計済み、または残高はありません。</p>
          )}
        </div>

        {/* アクションボタンセクション (承認・非承認・閉じる) */}
        <div className="mt-8 pt-4 border-t border-slate-700 flex flex-wrap gap-3 justify-end">
          {!user.approved && onApprove && user.id && (
            <button
              onClick={handleApproveClick}
              disabled={loadingAction || isProcessingPayment}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm
                ${loadingAction || isProcessingPayment ? 'bg-slate-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {loadingAction ? (<><AiOutlineLoading className="inline-block animate-spin mr-1" />処理中</>) : 'アカウント承認'}
            </button>
          )}
          {user.approved && onUnapprove && user.id && (
            <button
              onClick={handleUnapproveClick}
              disabled={loadingAction || isProcessingPayment}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm
                ${loadingAction || isProcessingPayment ? 'bg-slate-500 cursor-not-allowed' : 'bg-yellow-600 hover:bg-yellow-700'}`}
            >
              {loadingAction ? (<><AiOutlineLoading className="inline-block animate-spin mr-1" />処理中</>) : '承認取消'}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loadingAction || isProcessingPayment}
            type="button"
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md shadow-sm disabled:opacity-70"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailsModal;