// src/pages/AdminOrderManagementPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db, auth } from '../services/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { Order, OrderItemData, WithdrawalRequest, WithdrawalRequestStatus, OrderStatus } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';

type OrderStatusFilter = "pending" | "preparing" | "completed" | "cancelled" | "active" | "all" | "delivered_awaiting_confirmation" | "failed"; // failed を追加
type WithdrawalRequestFilter = "active_withdrawals" | "all_withdrawals";

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


const AdminOrderManagementPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("active");

  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [withdrawalRequestFilter, setWithdrawalRequestFilter] = useState<WithdrawalRequestFilter>("active_withdrawals");

  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  // --- Drink Orders Fetching ---
  useEffect(() => {
    if (!appContextLoading && currentUser && (currentUser.isAdmin || currentUser.firestoreData?.isStaff)) { // スタッフもアクセス可能に
      setLoadingOrders(true);
      setOrderError(null);
      const ordersCollectionRef = collection(db, "orders");
      let qOrders;
      if (orderStatusFilter === "active") {
        qOrders = query(ordersCollectionRef, where("orderStatus", "in", ["pending", "preparing", "delivered_awaiting_confirmation"]), orderBy("orderedAt", "asc"));
      } else if (orderStatusFilter === "all") {
        qOrders = query(ordersCollectionRef, orderBy("orderedAt", "desc"));
      } else {
        qOrders = query(ordersCollectionRef, where("orderStatus", "==", orderStatusFilter), orderBy("orderedAt", "desc"));
      }
      const unsubscribeOrders = onSnapshot(qOrders, (querySnapshot) => {
        const fetchedOrders = querySnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as Order));
        setOrders(fetchedOrders);
        setLoadingOrders(false);
      }, (error) => {
        console.error("AdminOrderManagementPage: ドリンク注文の取得に失敗: ", error);
        setOrderError(`ドリンク注文の取得に失敗: ${error.message}`);
        setLoadingOrders(false);
      });
      return () => unsubscribeOrders();
    } else if (!appContextLoading && (!currentUser || (!currentUser.isAdmin && !currentUser.firestoreData?.isStaff))) { // スタッフ権限も考慮
      setOrderError("このページへのアクセス権限がありません。");
      setLoadingOrders(false);
    }
  }, [appContextLoading, currentUser, orderStatusFilter]);

  // --- Chip Withdrawal Requests Fetching ---
  useEffect(() => {
    if (!appContextLoading && currentUser && (currentUser.isAdmin || currentUser.firestoreData?.isStaff)) { // スタッフもアクセス可能に
      setLoadingWithdrawals(true);
      setWithdrawalError(null);
      const requestsCollectionRef = collection(db, "withdrawalRequests");
      let qWithdrawals;
      if (withdrawalRequestFilter === "active_withdrawals") {
        qWithdrawals = query(requestsCollectionRef,
                              where("status", "in", ["pending_approval", "approved_preparing", "delivered_awaiting_confirmation"]),
                              orderBy("requestedAt", "asc"));
      } else {
        qWithdrawals = query(requestsCollectionRef, orderBy("requestedAt", "desc"));
      }
      const unsubscribeWithdrawals = onSnapshot(qWithdrawals, (querySnapshot) => {
        const fetchedRequests = querySnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as WithdrawalRequest));
        setWithdrawalRequests(fetchedRequests);
        setLoadingWithdrawals(false);
      }, (error) => {
        console.error("AdminOrderManagementPage: チップ引き出しリクエストの取得に失敗: ", error);
        setWithdrawalError(`チップ引き出しリクエストの取得に失敗: ${error.message}`);
        setLoadingWithdrawals(false);
      });
      return () => unsubscribeWithdrawals();
    } else if (!appContextLoading && (!currentUser || (!currentUser.isAdmin && !currentUser.firestoreData?.isStaff))) { // スタッフ権限も考慮
      setWithdrawalError("このページへのアクセス権限がありません。");
      setLoadingWithdrawals(false);
    }
  }, [appContextLoading, currentUser, withdrawalRequestFilter]);

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (!currentUser?.uid) { alert("ログイン情報がありません。"); return; }
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) { alert("対象の注文が見つかりません。"); return; }

    const statusLabels: Record<OrderStatus, string> = {
        pending: "新規受付", preparing: "準備中",
        delivered_awaiting_confirmation: "提供済み(ユーザー確認待ち)",
        completed: "完了", cancelled: "キャンセル",
        failed: "失敗", // failed を追加
    };
    const confirmMessage = `${orderToUpdate.userPokerName || '注文'} のステータスを「${statusLabels[newStatus] || newStatus}」にしますか？`;
    if (!window.confirm(confirmMessage)) return;

    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const orderDocRef = doc(db, "orders", orderId);
      const updateData: any = {
        orderStatus: newStatus,
        updatedAt: serverTimestamp()
      };
      if (newStatus === "delivered_awaiting_confirmation") {
        updateData.adminDeliveredAt = serverTimestamp();
      }
      if (newStatus === "completed" || newStatus === "cancelled" || newStatus === "failed") { // failed も追加
        updateData.completedAt = serverTimestamp();
      }
      await updateDoc(orderDocRef, updateData);
      alert(`注文ステータスを「${statusLabels[newStatus] || newStatus}」に更新しました。`);
    } catch (e: any) {
      console.error("注文ステータス更新エラー:", e);
      alert(`ステータス更新に失敗: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleApproveWithdrawal = async (requestId: string) => {
    if (!currentUser?.uid) { alert("ログイン情報がありません。"); return;}
    if (!window.confirm(`リクエストID: ${requestId.substring(0,8)}... を「承認して準備開始」状態にしますか？`)) return;

    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      const requestDocRef = doc(db, "withdrawalRequests", requestId);
      const updateData: any = {
        status: "approved_preparing" as WithdrawalRequestStatus,
        adminProcessedAt: serverTimestamp(),
        processedBy: currentUser.uid,
        updatedAt: serverTimestamp(), // updatedAtを追加
      };
      await updateDoc(requestDocRef, updateData);
      alert("リクエストを「承認して準備開始」状態に更新しました。");
    } catch (e: any) {
      console.error("チップ引き出しリクエスト承認エラー:", e);
      alert(`承認処理に失敗しました: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleMarkWithdrawalAsDelivered = async (requestId: string) => {
    if (!currentUser?.uid) { alert("ログイン情報がありません。"); return;}
    const requestToProcess = withdrawalRequests.find(r => r.id === requestId);
    if (!requestToProcess) { alert("対象のリクエストが見つかりません。"); return; }

    if (!window.confirm(
      `リクエストID: ${requestId.substring(0,8)}... (${requestToProcess.requestedChipsAmount.toLocaleString()}チップ) を「提供済み(ユーザー確認待ち)」にし、実際にチップをユーザーのプレイ用チップに移動しますか？`
    )) {
      return;
    }

    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      const functions = getFunctions(undefined, 'asia-northeast1');
      const dispenseChipsFunction = httpsCallable<{withdrawalRequestId: string}, {status: string, message: string }>(
        functions,
        'dispenseApprovedChipsAndMarkAsDelivered'
      );

      const result = await dispenseChipsFunction({ withdrawalRequestId: requestId });

      if (result.data.status === 'success') {
        alert(result.data.message || "チップの提供処理が完了し、ステータスが更新されました。");
      } else {
        throw new Error(result.data.message || "チップ提供処理でエラーが発生しました（Functionからのエラー）。");
      }
    } catch (e: any) {
      console.error("チップ提供処理エラー (AdminOrderManagementPage):", e);
      alert(`チップ提供処理に失敗しました: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleDenyWithdrawal = async (requestId: string) => {
    if (!currentUser?.uid) { alert("ログイン情報がありません。"); return; }
    const reason = window.prompt("リクエストを拒否します。理由を入力してください（任意）：");
    if (reason === null) { alert("拒否処理をキャンセルしました。"); return; }
    if (!window.confirm(`リクエストID: ${requestId.substring(0,8)}... を「拒否」しますか？\n理由: ${reason || '(理由なし)'}`)) return;

    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      const requestDocRef = doc(db, "withdrawalRequests", requestId);
      const updateData: any = {
        status: "denied" as WithdrawalRequestStatus,
        adminProcessedAt: serverTimestamp(),
        processedBy: currentUser.uid,
        notes: reason || "",
        updatedAt: serverTimestamp(), // updatedAtを追加
      };
      await updateDoc(requestDocRef, updateData);
      alert("リクエストを「拒否」状態に更新しました。");
    } catch (e: any) {
      console.error("チップ引き出しリクエスト拒否エラー:", e);
      alert(`拒否処理に失敗しました: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const formatTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    let dateToFormat: Date;
    if (timestamp instanceof Timestamp) dateToFormat = timestamp.toDate();
    else if (timestamp instanceof Date) dateToFormat = timestamp;
    else { console.warn("formatTimestamp: 無効な型:", timestamp); return '日付エラー'; }
    try {
      return dateToFormat.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { console.error("formatTimestamp: 表示エラー:", e); return '表示エラー';}
  };

  if (appContextLoading) return <div className="text-center p-10 text-xl text-neutral-lightest">権限情報を読み込み中...</div>;
  if (!currentUser || (!currentUser.isAdmin && !currentUser.firestoreData?.isStaff)) return <div className="text-center p-10 text-xl text-yellow-400">{orderError || withdrawalError || "アクセス権限がありません。"}</div>;


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 pb-3 border-b border-slate-700 gap-2">
        <h1 className="text-3xl font-bold text-cyan-400">オーダー及びチップ引き出し管理</h1>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <label htmlFor="orderStatusFilter" className="block text-xs font-medium text-slate-300 mb-0.5 text-right sm:text-left">ドリンク注文表示:</label>
            <select
              id="orderStatusFilter"
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value as OrderStatusFilter)}
              className="p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-cyan-500 focus:border-cyan-500 text-sm h-10"
            >
              <option value="active">対応中</option>
              <option value="pending">新規受付</option>
              <option value="preparing">準備中</option>
              <option value="delivered_awaiting_confirmation">提供済/確認待ち</option>
              <option value="completed">完了</option>
              <option value="cancelled">キャンセル</option>
              <option value="failed">失敗</option>
              <option value="all">全オーダー</option>
            </select>
          </div>
          <Link to="/admin" className="text-sky-400 hover:text-sky-300 hover:underline text-sm self-end pb-1 whitespace-nowrap">
            ← 管理者トップへ
          </Link>
        </div>
      </div>

      {/* チップ引き出しリクエスト表示セクション */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-amber-400 mb-4 border-b-2 border-amber-500 pb-2">チップ引き出しリクエスト (要対応)</h2>
        {loadingWithdrawals ? ( <p className="text-slate-300 text-center py-6">リクエスト読込中...</p> ) :
         withdrawalError ? ( <p className="text-red-400 bg-red-900/30 p-3 rounded-md text-center">エラー: {withdrawalError}</p> ) :
         withdrawalRequests.length === 0 ? ( <p className="text-slate-400 text-center py-6">対応が必要なリクエストはありません。</p> ) :
        (
          <div className="space-y-4">
            {withdrawalRequests.map(req => (
              <div key={req.id} className="p-4 bg-slate-800 rounded-lg shadow-md border border-amber-600/50">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                  <div className="mb-2 sm:mb-0 flex-grow">
                    <p className="text-xs text-slate-500 font-mono" title={req.id}>ID: {req.id?.substring(0,8)}...</p>
                    <p className="text-lg font-semibold text-white">申請者: {req.userPokerName || req.userEmail || 'N/A'}</p>
                    <p className="text-md font-bold text-amber-300">希望額: {req.requestedChipsAmount.toLocaleString()}チップ</p>
                    <p className="text-xs text-slate-400">申請日時: {formatTimestamp(req.requestedAt)}</p>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full mt-1 inline-block ${
                        req.status === 'pending_approval' ? 'bg-yellow-600 text-yellow-100' :
                        req.status === 'approved_preparing' ? 'bg-blue-600 text-blue-100' :
                        req.status === 'delivered_awaiting_confirmation' ? 'bg-sky-600 text-sky-100' :
                        req.status === 'completed' ? 'bg-green-600 text-green-100' :
                        req.status === 'denied' ? 'bg-red-600 text-red-100' : 'bg-gray-600 text-gray-100'}`}>
                      {req.status === 'pending_approval' ? '承認待ち' :
                       req.status === 'approved_preparing' ? 'チップ準備中' :
                       req.status === 'delivered_awaiting_confirmation' ? '提供済/ユーザー確認待ち' :
                       req.status === 'completed' ? '完了' :
                       req.status === 'denied' ? '拒否済' : req.status}
                    </span>
                    {req.processedBy && <p className="text-xs text-slate-500 mt-1">処理者: {currentUser?.uid === req.processedBy ? "あなた" : req.processedBy.substring(0,6)+"..."}</p>}
                    {req.notes && <p className="text-xs text-slate-500 mt-1 italic">メモ: {req.notes}</p>}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                  {req.id && req.status === 'pending_approval' && (
                    <>
                      <button onClick={() => handleApproveWithdrawal(req.id!)} disabled={actionLoading[req.id!]} className="px-3 py-1 bg-green-600 hover:bg-green-500 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                        {actionLoading[req.id!] ? '処理中...' : '承認して準備開始'}
                      </button>
                      <button onClick={() => handleDenyWithdrawal(req.id!)} disabled={actionLoading[req.id!]} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                        {actionLoading[req.id!] ? '処理中...' : '拒否する'}
                      </button>
                    </>
                  )}
                  {req.id && req.status === 'approved_preparing' && (
                    <button onClick={() => handleMarkWithdrawalAsDelivered(req.id!)} disabled={actionLoading[req.id!]} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                      {actionLoading[req.id!] ? '処理中...' : '提供済み(ユーザー確認待ち)にする'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ドリンク注文表示セクション */}
      <section>
        <h2 className="text-2xl font-semibold text-cyan-300 mb-4 border-b-2 border-cyan-500 pb-2">ドリンク等オーダー</h2>
        {loadingOrders ? ( <p className="text-slate-300 text-center py-6">オーダー読込中...</p> ) :
         orderError && !withdrawalError ? ( <p className="text-red-400 bg-red-900/30 p-3 rounded-md text-center">エラー: {orderError}</p> ) :
         orders.length === 0 ? ( <p className="text-slate-400 text-center py-6">表示するオーダーはありません。</p> ) :
        (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="p-4 bg-slate-800 rounded-lg shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                  <div className="mb-2 sm:mb-0 flex-grow">
                    <p className="text-xs text-slate-500 font-mono" title={order.id}>ID: {order.id?.substring(0,8)}...</p>
                    <p className="text-lg font-semibold text-white">注文者: {order.userPokerName || 'N/A'} <span className="text-xs text-slate-400">({order.userEmail})</span></p>
                    <p className="text-xs text-slate-400">注文日時: {formatTimestamp(order.orderedAt)}</p>
                    {order.adminDeliveredAt && <p className="text-xs text-slate-400">提供日時(管理): {formatTimestamp(order.adminDeliveredAt)}</p>}
                    {order.customerConfirmedAt && <p className="text-xs text-slate-400">受取確認日時(客): {formatTimestamp(order.customerConfirmedAt)}</p>}
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <p className="text-xl font-bold text-cyan-300">{order.totalOrderPrice.toLocaleString()}円</p>
                     <span className={`px-2 py-1 text-xs font-semibold rounded-full mt-1 inline-block ${
                        order.orderStatus === 'pending' ? 'bg-yellow-600 text-yellow-100' :
                        order.orderStatus === 'preparing' ? 'bg-blue-600 text-blue-100' :
                        order.orderStatus === 'delivered_awaiting_confirmation' ? 'bg-sky-600 text-sky-100' :
                        order.orderStatus === 'completed' ? 'bg-green-600 text-green-100' :
                        order.orderStatus === 'cancelled' ? 'bg-red-600 text-red-100' :
                        order.orderStatus === 'failed' ? 'bg-red-700 text-red-200' : // failed のスタイル
                        'bg-gray-600 text-gray-100'}`}>
                      {order.orderStatus === 'pending' ? '新規受付' :
                       order.orderStatus === 'preparing' ? '準備中' :
                       order.orderStatus === 'delivered_awaiting_confirmation' ? '提供済/確認待ち' :
                       order.orderStatus === 'completed' ? '完了' :
                       order.orderStatus === 'cancelled' ? 'キャンセル' :
                       order.orderStatus === 'failed' ? '失敗' : // failed の表示名
                       order.orderStatus}
                    </span>
                  </div>
                </div>
                <div className="mb-3">
                  <p className="text-sm font-medium text-slate-300 mb-1">注文内容 (ドリンクのみ表示):</p>
                  <ul className="list-disc list-inside text-sm space-y-0.5 pl-4 text-slate-300">
                    {order.items.filter(item => item.itemType === 'drink').map((item, index) => (
                      <li key={`${item.itemId}-${index}`}>
                        {item.itemName} ({item.itemCategory || item.itemType})
                        x {item.quantity} - <span className="text-amber-300">{item.totalItemPrice.toLocaleString()}円</span>
                      </li>
                    ))}
                    {order.items.filter(item => item.itemType === 'drink').length === 0 && <li className="text-slate-500 text-xs">（この注文にドリンクはありません）</li>}
                  </ul>
                </div>
                {order.notes && <p className="text-xs text-slate-400 italic mt-1">備考: {order.notes}</p>}
                <div className="mt-4 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                  {order.id && order.orderStatus === 'pending' && (
                    <button onClick={() => handleUpdateOrderStatus(order.id!, 'preparing')} disabled={actionLoading[order.id!]} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                      {actionLoading[order.id!] ? '処理中...' : '準備中にする'}
                    </button>
                  )}
                  {order.id && order.orderStatus === 'preparing' && (
                    <button onClick={() => handleUpdateOrderStatus(order.id!, 'delivered_awaiting_confirmation')} disabled={actionLoading[order.id!]} className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                      {actionLoading[order.id!] ? '処理中...' : '提供済み(ユーザー確認待ち)にする'}
                    </button>
                  )}
                  {order.id && (order.orderStatus === 'pending' || order.orderStatus === 'preparing' || order.orderStatus === 'delivered_awaiting_confirmation') && (
                     <button onClick={() => handleUpdateOrderStatus(order.id!, 'cancelled')} disabled={actionLoading[order.id!]} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-xs text-white font-semibold rounded transition-colors disabled:opacity-50">
                       {actionLoading[order.id!] ? '処理中...' : 'キャンセルする'}
                     </button>
                   )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminOrderManagementPage;