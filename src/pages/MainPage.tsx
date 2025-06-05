// src/pages/MainPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { UserData, Order, WithdrawalRequest, OrderStatus, WithdrawalRequestStatus, WaitingListEntry, WaitingListEntryWithDetails, GameTemplate } from '../types';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { createWithdrawalRequest } from '../services/withdrawalService';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, FieldValue, getDocs, orderBy, addDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const formatTimestamp = (timestamp?: Timestamp | Date): string => {
  if (!timestamp) return 'N/A';
  let dateToFormat: Date;
  if (timestamp instanceof Timestamp) dateToFormat = timestamp.toDate();
  else if (timestamp instanceof Date) dateToFormat = timestamp;
  else {
    console.warn("formatTimestamp: 無効な型のタイムスタンプが渡されました:", timestamp);
    return '日付エラー';
  }
  try {
    return dateToFormat.toLocaleString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    console.error("formatTimestamp: toLocaleStringでエラー:", e, "元の値:", dateToFormat);
    return '表示エラー';
  }
};

const MainPage: React.FC<{ isStaffMode: boolean }> = ({ isStaffMode }) => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser, error: appContextError } = useAppContext();
  const navigate = useNavigate();

  const displayUserData = currentUser?.firestoreData;

  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');
  const [isRequestingWithdrawal, setIsRequestingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<string | null>(null);

  const [pendingConfirmationOrders, setPendingConfirmationOrders] = useState<Order[]>([]);
  const [pendingConfirmationWithdrawals, setPendingConfirmationWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loadingConfirmations, setLoadingConfirmations] = useState(true);
  const [confirmationActionLoading, setConfirmationActionLoading] = useState<{[key: string]: boolean}>({});

  const [availableGameTemplates, setAvailableGameTemplates] = useState<GameTemplate[]>([]);
  const [userWaitingListEntries, setUserWaitingListEntries] = useState<WaitingListEntryWithDetails[]>([]);
  const [loadingWaitingList, setLoadingWaitingList] = useState(false);
  const [waitingListError, setWaitingListError] = useState<string | null>(null);
  const [selectedGameTemplateId, setSelectedGameTemplateId] = useState<string>('');
  const [waitingListNotes, setWaitingListNotes] = useState('');

  useEffect(() => {
    if (currentUser?.uid) {
      setLoadingConfirmations(true);
      let activeListenersCount = 0;
      const listenerLoaded = () => {
        activeListenersCount--;
        if (activeListenersCount === 0) {
          setLoadingConfirmations(false);
        }
      };

      activeListenersCount++;
      const ordersRef = collection(db, "orders");
      const qOrders = query(ordersRef,
        where("userId", "==", currentUser.uid),
        where("orderStatus", "==", "delivered_awaiting_confirmation")
      );
      const unsubOrders = onSnapshot(qOrders, (snapshot) => {
        setPendingConfirmationOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
        listenerLoaded();
      }, (error) => { console.error("確認待ち注文取得エラー:", error); listenerLoaded(); });

      activeListenersCount++;
      const withdrawalsRef = collection(db, "withdrawalRequests");
      const qWithdrawals = query(withdrawalsRef,
        where("userId", "==", currentUser.uid),
        where("status", "==", "delivered_awaiting_confirmation")
      );
      const unsubWithdrawals = onSnapshot(qWithdrawals, (snapshot) => {
        setPendingConfirmationWithdrawals(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest)));
        listenerLoaded();
      }, (error) => { console.error("確認待ちチップ引き出し履歴取得エラー:", error); listenerLoaded();});

      return () => {
        unsubOrders();
        unsubWithdrawals();
      };
    } else {
      setPendingConfirmationOrders([]);
      setPendingConfirmationWithdrawals([]);
      setLoadingConfirmations(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (currentUser?.uid) {
      setLoadingWaitingList(true);
      setWaitingListError(null);

      const fetchTemplates = async () => {
        try {
          const templatesSnapshot = await getDocs(query(collection(db, "gameTemplates"), where("isActive", "==", true), orderBy("sortOrder", "asc")));
          const templates = templatesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as GameTemplate);
          setAvailableGameTemplates(templates);
        } catch (err: any) {
          console.error("利用可能なゲームテンプレート取得エラー:", err);
          setWaitingListError("ゲームテンプレートの取得に失敗しました。");
        }
      };

      const fetchUserEntries = async () => {
        try {
          // ユーザー自身のウェイティングリストエントリを取得 (statusに関わらず)
          const entriesQuery = query(
            collection(db, "waitingListEntries"),
            where("userId", "==", currentUser.uid),
            orderBy("requestedAt", "asc")
          );
          const entriesSnapshot = await getDocs(entriesQuery);
          const entriesPromises = entriesSnapshot.docs.map(async (docSnapshot) => {
            const entryData = { id: docSnapshot.id, ...docSnapshot.data() } as WaitingListEntry;
            let gameTemplateDetails: GameTemplate | null = null;
            if (entryData.gameTemplateId) {
                const templateDocSnap = await getDoc(doc(db, 'gameTemplates', entryData.gameTemplateId));
                if (templateDocSnap.exists()) {
                    gameTemplateDetails = { id: templateDocSnap.id, ...templateDocSnap.data() } as GameTemplate;
                }
            }
            return {
              ...entryData,
              gameTemplate: gameTemplateDetails || undefined,
            } as WaitingListEntryWithDetails;
          });
          const allUserEntries = await Promise.all(entriesPromises);
          // クライアント側で表示するステータスをフィルタリング
          const filteredEntries = allUserEntries.filter(entry =>
            ["waiting", "called", "confirmed"].includes(entry.status)
          );
          setUserWaitingListEntries(filteredEntries);
        } catch (err: any) {
          console.error("ユーザーのウェイティングリスト取得エラー:", err); // エラーログの行番号(144)はここ
          setWaitingListError((prev) => prev ? `${prev}\nウェイティング状況の取得に失敗しました。` : "ウェイティング状況の取得に失敗しました。");
        }
      };

      Promise.all([fetchTemplates(), fetchUserEntries()]).finally(() => {
        setLoadingWaitingList(false);
      });
    }
  }, [currentUser?.uid]);


  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("ログアウト失敗:", error);
      alert("ログアウトに失敗しました。");
    }
  };

  const handleWithdrawalRequest = async () => {
    if (!currentUser?.uid || !displayUserData) {
      setWithdrawalError("ユーザー情報が完全に読み込まれていません。"); return;
    }
    const currentChipBalance = displayUserData.chips ?? 0;
    const userPokerName = displayUserData.pokerName;
    const amount = parseInt(withdrawalAmount, 10);

    if (isNaN(amount) || amount <= 0) { setWithdrawalError("有効な引き出し額を正の整数で入力してください。"); return; }
    if (amount > currentChipBalance) { setWithdrawalError(`保有チップ(${currentChipBalance.toLocaleString()}チップ)を超える額は引き出せません。`); return; }

    setIsRequestingWithdrawal(true); setWithdrawalError(null); setWithdrawalSuccess(null);
    try {
      await createWithdrawalRequest({
        userId: currentUser.uid,
        userPokerName: userPokerName || currentUser.email?.split('@')[0] || '不明',
        userEmail: currentUser.email || '',
        requestedChipsAmount: amount,
      });
      setWithdrawalSuccess(`${amount.toLocaleString()}チップの引き出しをリクエストしました。管理者の承認をお待ちください。`);
      setWithdrawalAmount('');
      if (typeof refreshCurrentUser === 'function') {
        await refreshCurrentUser();
      }
    } catch (e: any) {
      console.error("チップ引き出しリクエスト失敗 (MainPage):", e);
      setWithdrawalError(`リクエストに失敗しました: ${e.message}`);
    } finally {
      setIsRequestingWithdrawal(false);
    }
  };

  const handleUserConfirm = async (itemIdOrUserId: string, itemType: 'order' | 'withdrawal' | 'chip_settlement') => {
    if (!currentUser?.uid) { alert("ログインしていません。"); return; }
    let confirmMessage = "";
    let loadingKey = "";

    if (itemType === 'order') {
      confirmMessage = "商品の受け取りを確定しますか？";
      loadingKey = `order-${itemIdOrUserId}`;
    } else if (itemType === 'withdrawal') {
      confirmMessage = "引き出したチップの受け取りを確定しますか？";
      loadingKey = `withdrawal-${itemIdOrUserId}`;
    } else if (itemType === 'chip_settlement') {
      confirmMessage = "チップの精算額を確認し、完了しますか？";
      loadingKey = `settlement-${currentUser.uid}`;
    } else {
      console.error("handleUserConfirm: 無効なitemTypeです:", itemType);
      return;
    }

    if (!window.confirm(confirmMessage)) return;

    setConfirmationActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      let success = false;
      if (itemType === 'order') {
        const functions = getFunctions(undefined, 'asia-northeast1');
        const finalizeOrderFn = httpsCallable<
          { orderId: string },
          { status: string; message: string }
        >(functions, 'finalizeDrinkOrderAndBill');
        const result = await finalizeOrderFn({ orderId: itemIdOrUserId });
        if (result.data.status === 'success') success = true;
        else throw new Error(result.data.message || "注文確定処理でエラーが発生しました。");

      } else if (itemType === 'withdrawal') {
        const docRef = doc(db, "withdrawalRequests", itemIdOrUserId);
        await updateDoc(docRef, {
          status: "completed" as WithdrawalRequestStatus,
          customerConfirmedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        success = true;
      } else if (itemType === 'chip_settlement') {
        const functions = getFunctions(undefined, 'asia-northeast1');
        const confirmSettlementFn = httpsCallable< {}, { status: string; message: string }>(
          functions,
          'confirmAndFinalizeChipSettlement'
        );
        const result = await confirmSettlementFn();
        if (result.data.status === 'success') success = true;
        else throw new Error(result.data.message || "チップ精算処理でエラーが発生しました。");
      }

      if (success) {
        alert("確認処理が完了しました。");
        if (refreshCurrentUser && typeof refreshCurrentUser === 'function') {
          await refreshCurrentUser();
        }
      }
    } catch (e: any) {
      console.error(`${itemType} 確認エラー (MainPage):`, e);
      let displayError = `確認処理に失敗しました: ${e.message || '不明なエラー'}`;
      if (e.details) {
        displayError += ` 詳細: ${JSON.stringify(e.details)}`;
      }
      alert(displayError);
    } finally {
      setConfirmationActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleJoinWaitingList = async () => {
    if (!currentUser?.uid || !selectedGameTemplateId) {
      setWaitingListError("ゲームを選択してください。");
      return;
    }
    setLoadingWaitingList(true);
    setWaitingListError(null);
    const selectedTemplate = availableGameTemplates.find(t => t.id === selectedGameTemplateId);
    const hidePokerName = currentUser?.firestoreData?.privacySettings?.hidePokerNameInPublicLists || false;

    try {
      const entryData: Omit<WaitingListEntry, 'id' | 'requestedAt' | 'lastStatusUpdatedAt'> = {
        userId: currentUser.uid,
        userPokerNameSnapshot: currentUser.firestoreData?.pokerName || currentUser.email?.split('@')[0],
        userAvatarUrlSnapshot: currentUser.firestoreData?.avatarUrl || null,
        gameTemplateId: selectedGameTemplateId,
        gameTemplateNameSnapshot: selectedTemplate?.templateName,
        status: 'waiting',
        notesForStaff: waitingListNotes,
        isPokerNameHiddenSnapshot: hidePokerName,
      };
      const waitingListCollectionRef = collection(db, "waitingListEntries");
      await addDoc(waitingListCollectionRef, {
        ...entryData,
        requestedAt: serverTimestamp(),
        lastStatusUpdatedAt: serverTimestamp()
      });

      alert("ウェイティングリストに登録しました。");
      setSelectedGameTemplateId('');
      setWaitingListNotes('');
      // ユーザーのウェイティングリストを再取得 (成功後)
      const entriesQuery = query(
        collection(db, "waitingListEntries"),
        where("userId", "==", currentUser.uid),
        orderBy("requestedAt", "asc")
      );
      const entriesSnapshot = await getDocs(entriesQuery);
      const entriesPromises = entriesSnapshot.docs.map(async (docSnapshot) => {
        const entryData = { id: docSnapshot.id, ...docSnapshot.data() } as WaitingListEntry;
        let gameTemplateDetails: GameTemplate | null = null;
        if (entryData.gameTemplateId) {
            const templateDoc = await getDoc(doc(db, 'gameTemplates', entryData.gameTemplateId));
            if (templateDoc.exists()) {
                gameTemplateDetails = { id: templateDoc.id, ...templateDoc.data() } as GameTemplate;
            }
        }
        return {
          ...entryData,
          gameTemplate: gameTemplateDetails || undefined,
        } as WaitingListEntryWithDetails;
      });
      const allUserEntries = await Promise.all(entriesPromises);
      const filteredEntries = allUserEntries.filter(entry =>
        ["waiting", "called", "confirmed"].includes(entry.status)
      );
      setUserWaitingListEntries(filteredEntries);

    } catch (e: any) {
      console.error("ウェイティングリスト登録エラー:", e);
      setWaitingListError(`登録に失敗: ${e.message}`);
    } finally {
      setLoadingWaitingList(false);
    }
  };


  if (appContextLoading) {
    return <div className="flex justify-center items-center min-h-screen bg-slate-900"><p className="text-xl text-neutral-lightest">アプリケーション読込中...</p></div>;
  }

  if (appContextError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-slate-900 text-yellow-400 p-8">
        <p className="text-xl mb-4">エラー</p>
        <p className="mb-4">{appContextError}</p>
        {!currentUser && <Link to="/login" className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded">ログインページへ</Link>}
        {currentUser && <button onClick={handleLogout} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded">ログアウト</button>}
      </div>
    );
  }

  if (!currentUser || !displayUserData) {
    return <div className="text-center p-10 text-xl text-yellow-400">ユーザー情報を取得できませんでした。再読み込みするか、再度ログインしてください。</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-neutral-lightest font-sans p-4 md:p-8">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-red-500 mb-2 sm:mb-0">
            ようこそ、{displayUserData?.pokerName || currentUser.email?.split('@')[0] || 'プレイヤー'} さん
          </h1>
          <div className="flex items-center space-x-3">
            <Link to="/profile" className="text-sky-400 hover:text-sky-300 hover:underline text-sm whitespace-nowrap">
              マイプロフィール
            </Link>
            <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded text-sm">
              ログアウト
            </button>
          </div>
        </div>
        {isStaffMode && ( <div className="bg-yellow-500 text-black p-2 rounded text-center font-semibold">スタッフモードで動作中</div> )}
      </header>

      {withdrawalSuccess && <div className="mb-4 p-3 bg-green-600/90 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn" onClick={() => setWithdrawalSuccess(null)}>{withdrawalSuccess}</div>}
      {withdrawalError && <div className="mb-4 p-3 bg-red-600/90 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn" onClick={() => setWithdrawalError(null)}>{withdrawalError}</div>}

      {!loadingConfirmations && (pendingConfirmationOrders.length > 0 || pendingConfirmationWithdrawals.length > 0 || displayUserData?.pendingChipSettlement) && (
        <section className="my-8 p-6 bg-sky-800/70 rounded-lg shadow-lg border border-sky-600">
          <h2 className="text-2xl font-semibold text-sky-300 mb-4">受け取り/精算 確認待ちのアイテム</h2>
           {pendingConfirmationOrders.map(order => (
            <div key={`confirm-order-${order.id}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <p className="text-white font-medium">注文(ドリンク等): {order.items.filter(i=>i.itemType==='drink').map(i => i.itemName).join(', ') || "詳細確認中"}</p>
                <p className="text-xs text-slate-400">合計: {order.totalOrderPrice.toLocaleString()}円 / 提供日時: {formatTimestamp(order.adminDeliveredAt)}</p>
              </div>
              <button
                onClick={() => order.id && handleUserConfirm(order.id, 'order')}
                disabled={!order.id || confirmationActionLoading[`order-${order.id!}`]}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50 whitespace-nowrap"
              >
                {confirmationActionLoading[`order-${order.id!}`] ? "処理中..." : "受け取りました"}
              </button>
            </div>
          ))}
          {pendingConfirmationWithdrawals.map(withdrawal => (
            <div key={`confirm-withdrawal-${withdrawal.id}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <p className="text-white font-medium">チップ引き出し: {withdrawal.requestedChipsAmount.toLocaleString()} チップ</p>
                <p className="text-xs text-slate-400">ステータス: {withdrawal.status} / 提供日時(管理): {formatTimestamp(withdrawal.adminDeliveredAt)}</p>
              </div>
              <button
                onClick={() => withdrawal.id && handleUserConfirm(withdrawal.id, 'withdrawal')}
                disabled={!withdrawal.id || confirmationActionLoading[`withdrawal-${withdrawal.id!}`]}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50 whitespace-nowrap"
              >
                {confirmationActionLoading[`withdrawal-${withdrawal.id!}`] ? "処理中..." : "チップ受け取りました"}
              </button>
            </div>
          ))}
          {displayUserData?.pendingChipSettlement && (
            <div key={`confirm-settlement-${currentUser!.uid}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <p className="text-white font-medium">テーブルチップ精算: {displayUserData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</p>
                <p className="text-xs text-slate-400">テーブル: T{displayUserData.pendingChipSettlement.tableId} - S{displayUserData.pendingChipSettlement.seatNumber} / 受付日時: {formatTimestamp(displayUserData.pendingChipSettlement.initiatedAt)}</p>
              </div>
               <button
                onClick={() => handleUserConfirm(currentUser!.uid, 'chip_settlement')}
                disabled={confirmationActionLoading[`settlement-${currentUser!.uid}`]}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50 whitespace-nowrap"
              >
                {confirmationActionLoading[`settlement-${currentUser!.uid}`] ? "処理中..." : "精算内容を確認しました"}
              </button>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <section className="md:col-span-2 bg-slate-800 p-6 rounded-lg shadow">
           <h2 className="text-2xl font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">プレイヤー情報</h2>
           <div className="space-y-3 text-lg mb-6">
            <p><span className="font-medium text-slate-400">ポーカーネーム:</span> {displayUserData?.pokerName || '未設定'}</p>
            <p><span className="font-medium text-slate-400">現在の保有チップ:</span> <span className="font-bold text-amber-300">{(displayUserData?.chips ?? 0).toLocaleString()}</span> チップ</p>
            {displayUserData && typeof displayUserData.chipsInPlay === 'number' && displayUserData.chipsInPlay > 0 && (
                 <p><span className="font-medium text-slate-400">テーブル使用中チップ:</span> <span className="font-semibold text-sky-300">{displayUserData.chipsInPlay.toLocaleString()}</span> チップ</p>
            )}
            {displayUserData?.pendingChipSettlement && (
                <p className="text-sm text-orange-400">
                    <span className="font-bold">精算確認待ち:</span> {displayUserData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ (T{displayUserData.pendingChipSettlement.tableId}-S{displayUserData.pendingChipSettlement.seatNumber}より)
                </p>
            )}
            {displayUserData && displayUserData.bill > 0 && (
                <p><span className="font-medium text-slate-400">お支払い残高:</span> <span className="text-yellow-400 font-semibold">{displayUserData.bill.toLocaleString()} 円</span> <span className="text-xs text-yellow-500 ml-2">(未払いがあります)</span></p>
            )}
          </div>
           <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-xl font-semibold text-sky-400 mb-3">チップ引き出しリクエスト</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="withdrawalAmount" className="block text-sm font-medium text-slate-300 mb-1">
                  引き出し希望チップ額:
                </label>
                <input
                  type="number"
                  id="withdrawalAmount"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  placeholder="例: 10000"
                  min="1"
                  className="w-full sm:w-1/2 p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500"
                  disabled={isRequestingWithdrawal}
                />
              </div>
              <button
                onClick={handleWithdrawalRequest}
                disabled={isRequestingWithdrawal || !withdrawalAmount || parseInt(withdrawalAmount, 10) <= 0 || parseInt(withdrawalAmount, 10) > (displayUserData?.chips ?? 0)}
                className={`px-6 py-2 font-semibold rounded-lg transition-colors
                  ${isRequestingWithdrawal || !withdrawalAmount || parseInt(withdrawalAmount, 10) <= 0 || parseInt(withdrawalAmount, 10) > (displayUserData?.chips ?? 0)
                    ? 'bg-slate-500 text-slate-400 cursor-not-allowed'
                    : 'bg-sky-600 hover:bg-sky-700 text-white shadow-md'}`}
              >
                {isRequestingWithdrawal ? 'リクエスト処理中...' : 'リクエスト送信'}
              </button>
            </div>
           </div>
           <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/qr" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out">マイQRコード</Link>
            {displayUserData && displayUserData.bill > 0 && (<Link to="/payment" className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out">お支払いへ</Link>)}
            <Link to="/profile" className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out">
              プロフィールを編集
            </Link>
           </div>
        </section>

        <aside className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">お知らせ</h2>
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">(お知らせは現在準備中です)</p>
          </div>
        </aside>
      </div>

      <section className="mb-8 bg-slate-800 p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-semibold text-teal-400 mb-4 border-b border-slate-700 pb-2">ウェイティングリスト</h2>
        {loadingWaitingList ? (
          <p className="text-slate-300">ウェイティング情報を読み込み中...</p>
        ) : waitingListError ? (
          <p className="text-yellow-400 bg-yellow-900/30 p-3 rounded">{waitingListError}</p>
        ) : (
          <>
            {userWaitingListEntries.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">現在のあなたの待ち状況:</h3>
                <ul className="space-y-2">
                  {userWaitingListEntries.map((entry: WaitingListEntryWithDetails) => (
                    <li key={entry.id} className="p-3 bg-slate-700 rounded-md">
                      <p className="text-white font-medium">
                        {entry.gameTemplateNameSnapshot || entry.gameTemplate?.templateName || '不明なゲーム'}
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                          entry.status === 'waiting' ? 'bg-yellow-500 text-black' :
                          entry.status === 'called' ? 'bg-sky-500 text-white' :
                          entry.status === 'confirmed' ? 'bg-blue-500 text-white' :
                          'bg-slate-600 text-slate-200'
                        }`}>
                          {entry.status}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">受付: {formatTimestamp(entry.requestedAt)}</p>
                      {entry.notesForStaff && <p className="text-xs text-slate-400 mt-1">備考: {entry.notesForStaff}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="gameTemplateSelect" className="block text-sm font-medium text-slate-300 mb-1">
                  参加希望ゲーム:
                </label>
                <select
                  id="gameTemplateSelect"
                  value={selectedGameTemplateId}
                  onChange={(e) => setSelectedGameTemplateId(e.target.value)}
                  className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-teal-500 focus:border-teal-500"
                  disabled={loadingWaitingList}
                >
                  <option value="">-- ゲームを選択してください --</option>
                  {availableGameTemplates.map((template: GameTemplate) => (
                    <option key={template.id} value={template.id!}>
                      {template.templateName} ({template.gameType} - {template.blindsOrRate || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="waitingListNotes" className="block text-sm font-medium text-slate-300 mb-1">
                  スタッフへの備考 (任意):
                </label>
                <textarea
                  id="waitingListNotes"
                  value={waitingListNotes}
                  onChange={(e) => setWaitingListNotes(e.target.value)}
                  rows={2}
                  className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-teal-500 focus:border-teal-500"
                  placeholder="例: 友人と同卓希望、あと30分ほどで到着予定など"
                  disabled={loadingWaitingList}
                />
              </div>
              <button
                onClick={handleJoinWaitingList}
                disabled={loadingWaitingList || !selectedGameTemplateId}
                className={`w-full sm:w-auto px-6 py-2 font-semibold rounded-lg transition-colors
                  ${loadingWaitingList || !selectedGameTemplateId
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md'}`}
              >
                {loadingWaitingList ? '処理中...' : 'ウェイティングリストに参加'}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="mb-8 bg-gradient-to-r from-red-700 via-red-600 to-orange-600 p-8 rounded-lg shadow-xl text-center hover:shadow-2xl transition-shadow duration-300">
        <h2 className="text-3xl font-bold text-white mb-4 drop-shadow-md">ドリンク & チップ注文</h2>
        <p className="text-red-100 mb-6 text-lg drop-shadow-sm">メニューを見て注文したり、チップを購入できます。</p>
        <Link to="/order" className="inline-block bg-white hover:bg-red-50 text-red-700 font-bold text-lg py-3 px-8 rounded-lg shadow-md transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-amber-300">注文画面へ</Link>
      </section>

      <section className="mt-8 bg-gradient-to-r from-sky-600 via-cyan-500 to-teal-500 p-8 rounded-lg shadow-xl text-center hover:shadow-2xl transition-shadow duration-300">
        <h2 className="text-3xl font-bold text-white mb-4 drop-shadow-md">現在の卓状況を確認</h2>
        <p className="text-sky-100 mb-6 text-lg drop-shadow-sm">各テーブルの空席状況やプレイヤーを確認できます。</p>
        <Link to="/tables" className="inline-block bg-white hover:bg-sky-50 text-sky-700 font-bold text-lg py-3 px-8 rounded-lg shadow-md transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-300">卓状況を見る</Link>
      </section>

      <section className="mt-8 bg-gradient-to-r from-teal-600 via-emerald-500 to-green-500 p-8 rounded-lg shadow-xl text-center hover:shadow-2xl transition-shadow duration-300">
        <h2 className="text-3xl font-bold text-white mb-4 drop-shadow-md">ゲーム別ウェイティング状況</h2>
        <p className="text-teal-100 mb-6 text-lg drop-shadow-sm">各ゲームの現在の待ち人数や自分の順番を確認できます。</p>
        <Link to="/waiting-lists" className="inline-block bg-white hover:bg-teal-50 text-teal-700 font-bold text-lg py-3 px-8 rounded-lg shadow-md transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-emerald-300">ウェイティング一覧を見る</Link>
      </section>
    </div>
  );
};

export default MainPage;