// src/components/admin/UserDetailsModal.tsx
import React, { useState, useEffect, useMemo } from 'react'; // useState, useEffect, useMemoを追加
import { UserWithId } from '../../types';
import { Timestamp, doc, updateDoc } from 'firebase/firestore'; // doc, updateDoc, Timestampを追加
import { db, auth } from '../../services/firebase'; // db, authを追加
import { getFunctions, httpsCallable } from 'firebase/functions'; // functions関連を追加
import { AiOutlineLoading } from 'react-icons/ai'; // ローディングアイコンを追加

const functions = getFunctions();

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

// ChipDenominationの定義 (AdminUserManagementPage.tsxから移動)
interface ChipDenomination {
  value: number;
  label: string;
}

const DEFAULT_CHIP_DENOMINATIONS: ChipDenomination[] = [
  { value: 10000, label: '10kP' },
  { value: 5000, label: '5kP' },
  { value: 1000, label: '1kP' },
  { value: 500, label: '500P' },
  { value: 100, label: '100P' },
  { value: 25, label: '25P' },
];

// ★★★ UserDetailsModalProps を export する ★★★
export interface UserDetailsModalProps {
  user: UserWithId | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (userId: string) => Promise<void>;
  onUnapprove?: (userId: string) => Promise<void>;
  onUserUpdateSuccess?: (message: string) => void; // 更新成功メッセージをAdminUserManagementPageに伝えるためのコールバック
  onUserUpdateError?: (message: string) => void;   // 更新失敗メッセージをAdminUserManagementPageに伝えるためのコールバック
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
  onUserUpdateSuccess,
  onUserUpdateError,
}) => {
  // 支払い関連のstate
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // チップ精算関連のstate
  const [isProcessingSettlement, setIsProcessingSettlement] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null);
  const [adminEnteredTotalChips, setAdminEnteredTotalChips] = useState<string>('');
  const [denominationsCount, setDenominationsCount] = useState<{ [value: string]: number }>({});

  // モーダルが開かれるたびに状態をリセット
  useEffect(() => {
    if (isOpen) {
      setPaymentAmount('');
      setPaymentError(null);
      setPaymentSuccess(null);
      setAdminEnteredTotalChips('');
      setDenominationsCount({});
      setSettlementError(null);
      setSettlementSuccess(null);
    }
  }, [isOpen, user]); // userが変わるたびにもリセット

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
        onUserUpdateError?.("アカウント承認に失敗しました。");
      }
    }
  };

  const handleUnapproveClick = async () => {
    if (onUnapprove && user.id) {
      try {
        await onUnapprove(user.id);
      } catch (error) {
        console.error("UserDetailsModal: onUnapprove failed", error);
        onUserUpdateError?.("承認取り消しに失敗しました。");
      }
    }
  };

  const calculateTotalChips = useMemo(() => {
    return Object.entries(denominationsCount).reduce((total, [value, count]) => {
      return total + (parseInt(value, 10) * count);
    }, 0);
  }, [denominationsCount]);

  useEffect(() => {
    // 管理者が入力したチップ合計値と、金種内訳の合計値が一致するか確認し、管理者が入力した値を自動更新
    // ただし、管理者入力が手動で行われた場合は自動更新しないようにする
    if (adminEnteredTotalChips === '' || parseInt(adminEnteredTotalChips, 10) !== calculateTotalChips) {
      setAdminEnteredTotalChips(calculateTotalChips.toString());
    }
  }, [calculateTotalChips]);


  // ★追加: 支払い処理ハンドラー (UserDetailsModalの内部に移動)
  const handleProcessPayment = async () => {
    if (!user) {
      setPaymentError("ユーザー情報がありません。");
      return;
    }
    const amount = parseInt(paymentAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError("有効な支払い金額を正の整数で入力してください。");
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const userRef = doc(db, 'users', user.id);
      const newBill = Math.max(0, user.bill - amount); // 支払い残高を減らす（0以下にはしない）

      await updateDoc(userRef, {
        bill: newBill,
        latestPaymentAmount: amount, // 今回の支払い金額を記録
        latestPaymentTimestamp: Timestamp.now(), // 支払い日時を記録
        updatedAt: Timestamp.now(),
      });

      // 成功メッセージ
      setPaymentSuccess(`${amount.toLocaleString()}円の支払いを処理しました。残高: ${newBill.toLocaleString()}円`);
      onUserUpdateSuccess?.(`${user.pokerName || user.email} さんの支払いを処理しました。`);
      setPaymentAmount(''); // 入力欄をクリア
    } catch (err: any) {
      console.error("支払い処理失敗:", err);
      setPaymentError(`支払い処理に失敗しました: ${err.message}`);
      onUserUpdateError?.(`支払い処理に失敗しました: ${err.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // ★追加: チップ精算開始ハンドラー (UserDetailsModalの内部に移動)
  const handleInitiateChipSettlement = async () => {
    if (!user?.id || !user.currentTableId || user.currentSeatNumber === null) {
      setSettlementError("ユーザーがテーブルにチェックインしていません、または情報が不足しています。");
      return;
    }
    const totalChips = parseInt(adminEnteredTotalChips, 10);
    if (isNaN(totalChips) || totalChips <= 0) {
      setSettlementError("有効なチップ精算額を正の整数で入力してください。");
      return;
    }

    setIsProcessingSettlement(true);
    setSettlementError(null);
    setSettlementSuccess(null);

    try {
      const initiateSettlementFn = httpsCallable<{
        userId: string;
        tableId: string;
        seatNumber: number;
        adminEnteredTotalChips: number;
        denominationsCount: { [denominationValue: string]: number };
      }, { status: string; message: string }>(functions, 'initiateChipSettlement');

      const result = await initiateSettlementFn({
        userId: user.id,
        tableId: user.currentTableId,
        seatNumber: user.currentSeatNumber!,
        adminEnteredTotalChips: totalChips,
        denominationsCount: denominationsCount,
      });

      if (result.data.status === 'success') {
        setSettlementSuccess(`チップ精算(${totalChips.toLocaleString()}P)を開始しました。ユーザーの確認待ちです。`);
        onUserUpdateSuccess?.(`${user.pokerName || user.email} さんのチップ精算を開始しました。`);
        setAdminEnteredTotalChips(''); // 入力欄をクリア
        setDenominationsCount({}); // 金種内訳をクリア
      } else {
        throw new Error(result.data.message || "チップ精算開始処理でエラーが発生しました。");
      }
    } catch (err: any) {
      console.error("チップ精算開始失敗:", err);
      setSettlementError(`チップ精算開始に失敗しました: ${err.message}`);
      onUserUpdateError?.(`チップ精算開始に失敗しました: ${err.message}`);
    } finally {
      setIsProcessingSettlement(false);
    }
  };

  // 金種内訳の入力ハンドラー (UserDetailsModalの内部に移動)
  const handleDenominationChange = (value: number, count: number) => {
    setDenominationsCount(prev => {
      const newCounts = { ...prev };
      if (count <= 0) {
        delete newCounts[value.toString()];
      } else {
        newCounts[value.toString()] = count;
      }
      return newCounts;
    });
  };

  // チップ精算強制完了ハンドラー (UserDetailsModalの内部に移動)
  const handleForceCompleteSettlement = async () => {
    if (!user?.id || !user.pendingChipSettlement) {
      setSettlementError("精算待ちのチップがありません。");
      return;
    }

    if (!window.confirm("ユーザー確認をスキップして、このチップ精算を強制的に完了しますか？この操作は取り消せません。")) {
      return;
    }

    setIsProcessingSettlement(true);
    setSettlementError(null);
    setSettlementSuccess(null);

    try {
      const forceCompleteSettlementFn = httpsCallable<{ userId: string }, { status: string; message: string }>(
        functions,
        'adminForceCompleteChipSettlement'
      );
      const result = await forceCompleteSettlementFn({ userId: user.id });

      if (result.data.status === 'success') {
        setSettlementSuccess("チップ精算を強制完了しました。");
        onUserUpdateSuccess?.(`${user.pokerName || user.email} さんのチップ精算を強制完了しました。`);
      } else {
        throw new Error(result.data.message || "チップ精算強制完了処理でエラーが発生しました。");
      }
    } catch (err: any) {
      console.error("チップ精算強制完了失敗:", err);
      setSettlementError(`チップ精算強制完了に失敗しました: ${err.message}`);
      onUserUpdateError?.(`チップ精算強制完了に失敗しました: ${err.message}`);
    } finally {
      setIsProcessingSettlement(false);
    }
  };

  // チップ精算キャンセルハンドラー (UserDetailsModalの内部に移動)
  const handleCancelSettlement = async () => {
    if (!user?.id || !user.pendingChipSettlement) {
      setSettlementError("キャンセルする精算待ちのチップがありません。");
      return;
    }

    if (!window.confirm("この精算待ちのチップをキャンセルしますか？")) {
      return;
    }

    setIsProcessingSettlement(true);
    setSettlementError(null);
    setSettlementSuccess(null);

    try {
      const cancelSettlementFn = httpsCallable<{ userId: string }, { status: string; message: string }>(
        functions,
        'adminCancelChipSettlement'
      );
      const result = await cancelSettlementFn({ userId: user.id });

      if (result.data.status === 'success') {
        setSettlementSuccess("チップ精算をキャンセルしました。");
        onUserUpdateSuccess?.(`${user.pokerName || user.email} さんのチップ精算をキャンセルしました。`);
      } else {
        throw new Error(result.data.message || "チップ精算キャンセル処理でエラーが発生しました。");
      }
    } catch (err: any) {
      console.error("チップ精算キャンセル失敗:", err);
      setSettlementError(`チップ精算キャンセルに失敗しました: ${err.message}`);
      onUserUpdateError?.(`チップ精算キャンセルに失敗しました: ${err.message}`);
    } finally {
      setIsProcessingSettlement(false);
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

        {/* ★追加: 支払い処理セクション (UserDetailsModalの内部に移動) */}
        <div className="mt-6 pt-4 border-t border-neutral-700">
          <h3 className="text-xl font-semibold text-sky-400 mb-3">会計処理</h3>
          <div className="flex flex-col gap-2 mb-4">
            <p className="text-neutral-300">
              現在の会計残高: <span className="font-bold text-red-400">{user.bill.toLocaleString()}</span> 円
            </p>
            {user.latestPaymentTimestamp && user.latestPaymentAmount !== undefined && user.latestPaymentAmount !== null && (
              <p className="text-neutral-400 text-sm">
                最新支払い: {user.latestPaymentAmount.toLocaleString()} 円 ({formatTimestamp(user.latestPaymentTimestamp)})
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <input
              type="number"
              placeholder="支払い金額 (円)"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full sm:w-auto flex-grow p-2 bg-neutral-700 text-neutral-lightest border border-neutral-600 rounded-md focus:ring-sky-500 focus:border-sky-500"
              min="1"
              disabled={isProcessingPayment}
            />
            <button
              onClick={handleProcessPayment}
              disabled={isProcessingPayment || parseInt(paymentAmount, 10) <= 0 || parseInt(paymentAmount, 10) > user.bill}
              className={`px-4 py-2 rounded-md font-semibold transition-colors flex items-center justify-center
                ${isProcessingPayment || parseInt(paymentAmount, 10) <= 0 || parseInt(paymentAmount, 10) > user.bill
                  ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
            >
              {isProcessingPayment ? (
                <>
                  <AiOutlineLoading className="inline-block animate-spin mr-2" size={18} />
                  処理中...
                </>
              ) : '支払い完了 (残高から減額)'}
            </button>
          </div>
          {paymentError && <p className="text-red-400 text-sm mt-2">{paymentError}</p>}
          {paymentSuccess && <p className="text-green-400 text-sm mt-2">{paymentSuccess}</p>}
        </div>

        {/* ★追加: チップ精算開始セクション (UserDetailsModalの内部に移動) */}
        <div className="mt-6 pt-4 border-t border-neutral-700">
          <h3 className="text-xl font-semibold text-orange-400 mb-3">チップ精算開始</h3>
          {user.isCheckedIn && user.currentTableId && user.currentSeatNumber !== null ? (
            <>
              <p className="text-neutral-300 mb-2">
                現在、テーブル <span className="font-bold">{user.currentTableId}</span> の座席 <span className="font-bold">{user.currentSeatNumber}</span> にチェックイン中。
              </p>
              {user.pendingChipSettlement ? (
                <div className="p-3 bg-orange-700/50 rounded-md border border-orange-500 mb-4">
                  <p className="text-orange-200 font-semibold">精算確認待ちです。</p>
                  <p className="text-white text-lg">管理者入力額: {user.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</p>
                  <p className="text-xs text-orange-400">開始日時: {formatTimestamp(user.pendingChipSettlement.initiatedAt)}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleForceCompleteSettlement}
                      disabled={isProcessingSettlement}
                      className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors
                        ${isProcessingSettlement
                          ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                    >
                      {isProcessingSettlement ? "処理中..." : "強制完了"}
                    </button>
                    <button
                      onClick={handleCancelSettlement}
                      disabled={isProcessingSettlement}
                      className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors
                        ${isProcessingSettlement
                          ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                          : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        }`}
                    >
                      {isProcessingSettlement ? "処理中..." : "キャンセル"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-neutral-300 mb-3">
                    管理者が集計した精算チップの総額と金種内訳を入力し、精算を開始します。
                  </p>
                  <div className="mb-3">
                    <label htmlFor="adminEnteredTotalChips" className="block text-sm font-medium text-neutral-300 mb-1">
                      管理者入力によるチップ総額 (P):
                    </label>
                    <input
                      type="number"
                      id="adminEnteredTotalChips"
                      value={adminEnteredTotalChips}
                      onChange={(e) => setAdminEnteredTotalChips(e.target.value)}
                      placeholder="例: 10000"
                      min="1"
                      className="w-full p-2 bg-neutral-700 text-neutral-lightest border border-neutral-600 rounded-md focus:ring-orange-500 focus:border-orange-500"
                      disabled={isProcessingSettlement}
                    />
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-medium text-neutral-300 mb-2">金種内訳 (P):</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {DEFAULT_CHIP_DENOMINATIONS.map((denom) => (
                        <div key={denom.value} className="flex items-center space-x-2">
                          <label className="text-neutral-400 whitespace-nowrap">{denom.label}:</label>
                          <input
                            type="number"
                            min="0"
                            value={denominationsCount[denom.value.toString()] || ''}
                            onChange={(e) => handleDenominationChange(denom.value, parseInt(e.target.value || '0', 10))}
                            className="w-full p-1 bg-neutral-700 text-neutral-lightest border border-neutral-600 rounded-md text-center"
                            disabled={isProcessingSettlement}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-neutral-400 text-sm mt-2">
                      金種内訳合計: <span className="font-bold">{calculateTotalChips.toLocaleString()}</span> チップ
                    </p>
                    {parseInt(adminEnteredTotalChips, 10) !== calculateTotalChips && adminEnteredTotalChips !== '' && (
                      <p className="text-yellow-400 text-xs mt-1">
                        チップ総額と金種内訳の合計が一致していません。
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleInitiateChipSettlement}
                    disabled={isProcessingSettlement || parseInt(adminEnteredTotalChips, 10) <= 0 || (parseInt(adminEnteredTotalChips, 10) !== calculateTotalChips && adminEnteredTotalChips !== '')}
                    className={`px-4 py-2 rounded-md font-semibold transition-colors flex items-center justify-center
                      ${isProcessingSettlement || parseInt(adminEnteredTotalChips, 10) <= 0 || (parseInt(adminEnteredTotalChips, 10) !== calculateTotalChips && adminEnteredTotalChips !== '')
                        ? 'bg-neutral-600 text-neutral-400 cursor-not-allowed'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                      }`}
                  >
                    {isProcessingSettlement ? (
                      <>
                        <AiOutlineLoading className="inline-block animate-spin mr-2" size={18} />
                        処理中...
                      </>
                    ) : '精算開始 (ユーザー確認待ち)'}
                  </button>
                </>
              )}
              {settlementError && <p className="text-red-400 text-sm mt-2">{settlementError}</p>}
              {settlementSuccess && <p className="text-green-400 text-sm mt-2">{settlementSuccess}</p>}
            </>
          ) : (
            <p className="text-neutral-400 text-sm">ユーザーはチェックインしていません。精算開始できません。</p>
          )}
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