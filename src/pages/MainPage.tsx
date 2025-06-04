// src/pages/MainPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { UserData, Order, WithdrawalRequest, OrderStatus, WithdrawalRequestStatus } from '../types';
import { getUser } from '../services/userService';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { createWithdrawalRequest } from '../services/withdrawalService';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// MainPage.tsx のスコープに formatTimestamp を定義 (他のページと共通化も検討可)
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
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const navigate = useNavigate();

  // ローカルのuserDataはAppContextのfirestoreDataのコピーとして、または初期値として持つ
  const [userData, setUserData] = useState<UserData | null>(currentUser?.firestoreData || null);
  const [loadingLocalUserData, setLoadingLocalUserData] = useState(false); // fetchUserData専用のローディング
  const [localUserDataError, setLocalUserDataError] = useState<string | null>(null); // fetchUserData専用のエラー

  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');
  const [isRequestingWithdrawal, setIsRequestingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<string | null>(null);

  const [pendingConfirmationOrders, setPendingConfirmationOrders] = useState<Order[]>([]);
  const [pendingConfirmationWithdrawals, setPendingConfirmationWithdrawals] = useState<WithdrawalRequest[]>([]);
  // pendingChipSettlementToConfirm は AppContext の currentUser.firestoreData.pendingChipSettlement を直接参照する
  const [loadingConfirmations, setLoadingConfirmations] = useState(true);
  const [confirmationActionLoading, setConfirmationActionLoading] = useState<{[key: string]: boolean}>({});

  // AppContextのcurrentUser.firestoreDataが更新されたらローカルのuserDataにも反映
  useEffect(() => {
    if (currentUser?.firestoreData) {
      setUserData(currentUser.firestoreData);
    }
  }, [currentUser?.firestoreData]);

  // この関数は、AppContextにfirestoreDataがない場合のフォールバックとしてのみ使用するか、
  // もしくはAppContextのrefreshCurrentUserで完全に代替する。
  const fetchLocalUserData = useCallback(async () => {
    if (!currentUser?.uid) {
      setLoadingLocalUserData(false);
      return;
    }
    if (currentUser.firestoreData) { // AppContextにデータがあればそれを使う
        setUserData(currentUser.firestoreData);
        setLoadingLocalUserData(false);
        return;
    }
    setLoadingLocalUserData(true);
    setLocalUserDataError(null);
    try {
      const userDoc = await getUser(currentUser.uid);
      if (userDoc) {
        setUserData(userDoc);
      } else {
        console.warn('MainPage: fetchLocalUserData - Firestoreにユーザーデータが存在しませんでした。');
        // setLocalUserDataError("ユーザーデータが見つかりませんでした。");
      }
    } catch (err: any) {
      console.error("MainPage: ローカルユーザー情報の取得に失敗:", err);
      setLocalUserDataError("ユーザー情報の読み込みに失敗しました。");
    } finally {
      setLoadingLocalUserData(false);
    }
  }, [currentUser?.uid, currentUser?.firestoreData]);

  useEffect(() => {
    if (!appContextLoading && currentUser) {
        fetchLocalUserData(); // AppContextのロード後、またはcurrentUser変更時にローカルデータを更新
    } else if (!appContextLoading && !currentUser) {
        setLoadingLocalUserData(false);
        setUserData(null);
    }
  }, [appContextLoading, currentUser, fetchLocalUserData]);

  // ユーザーの確認待ちアイテム（注文、チップ引き出し）のリアルタイム取得
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
      }, (error) => { console.error("確認待ちチップ引き出し取得エラー:", error); listenerLoaded();});

      // pendingChipSettlementはAppContextのcurrentUser.firestoreDataから直接取得するので、ここではリスナー不要
      // もしAppContextのfirestoreDataがリアルタイム更新でないなら、ここでuserドキュメントを監視する
      // この例ではAppContextのデータが最新であると仮定し、追加のリスナーは設定しない
      // ただし、refreshCurrentUserが呼ばれたときにAppContextが更新されることを期待

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


  const handleLogout = async () => {
    try {
      await signOut(auth);
      // AppContext側でcurrentUserがnullになり、リダイレクトされることを期待
      // navigate('/login'); // App.tsxのガードで処理されるため、ここでは不要な場合が多い
    } catch (error) {
      console.error("ログアウト失敗:", error);
      alert("ログアウトに失敗しました。");
    }
  };

  const handleWithdrawalRequest = async () => {
    if (!currentUser?.uid || !currentUser.firestoreData) {
      setWithdrawalError("ユーザー情報が完全に読み込まれていません。"); return;
    }
    const currentChipBalance = currentUser.firestoreData.chips ?? 0;
    const userPokerName = currentUser.firestoreData.pokerName;
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
      loadingKey = `settlement-${currentUser.uid}`; // 精算はユーザーID基準
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
        const result = await confirmSettlementFn(); // 引数なし
        if (result.data.status === 'success') success = true;
        else throw new Error(result.data.message || "チップ精算処理でエラーが発生しました。");
      }

      if (success) {
        alert("確認処理が完了しました。");
        if (refreshCurrentUser && typeof refreshCurrentUser === 'function') {
          await refreshCurrentUser(); // AppContextのユーザーデータと表示を最新に
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

  // ローディング表示の優先順位: AppContext -> MainPageローカル
  if (appContextLoading) {
    return <div className="flex justify-center items-center min-h-screen bg-slate-900"><p className="text-xl text-neutral-lightest">アプリケーション読込中...</p></div>;
  }
  if (loadingLocalUserData && !currentUser?.firestoreData) { // AppContextにデータがなく、ローカルで取得中の場合
    return <div className="flex justify-center items-center min-h-screen bg-slate-900"><p className="text-xl text-neutral-lightest">ユーザー情報読込中...</p></div>;
  }

  const pageError = localUserDataError || ( (!currentUser && !appContextLoading) ? "ログインしていません。" : null);
  if (pageError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-slate-900 text-yellow-400 p-8">
        <p className="text-xl mb-4">エラー</p>
        <p className="mb-4">{pageError}</p>
        {!currentUser && <Link to="/login" className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded">ログインページへ</Link>}
        {currentUser && <button onClick={handleLogout} className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded">ログアウト</button>}
      </div>
    );
  }

  if (!currentUser || !currentUser.firestoreData) {
    // この条件は、appContextLoadingがfalseで、かつcurrentUser.firestoreDataもない場合に該当
    // 通常、AppContext側でログインページへのリダイレクト等が行われるはず
    return <div className="text-center p-10 text-xl text-yellow-400">ユーザー情報が取得できませんでした。再度ログインしてください。</div>;
  }

  const displayUserData = currentUser.firestoreData; // AppContextの最新のfirestoreDataを使用

  return (
    <div className="min-h-screen bg-slate-900 text-neutral-lightest font-sans p-4 md:p-8">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-red-500 mb-2 sm:mb-0">
            ようこそ、{displayUserData?.pokerName || currentUser.email?.split('@')[0] || 'プレイヤー'} さん
          </h1>
          <div className="flex items-center space-x-3"> {/* 変更箇所: ヘッダーにマイプロフィールリンクを追加 */}
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

      {/* ユーザー確認待ちアイテム表示セクション */}
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

          {pendingConfirmationWithdrawals.map(req => (
            <div key={`confirm-withdrawal-${req.id}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <p className="text-white font-medium">チップ引き出し: {req.requestedChipsAmount.toLocaleString()} チップ</p>
                <p className="text-xs text-slate-400">提供日時: {formatTimestamp(req.adminDeliveredAt)}</p>
              </div>
              <button
                onClick={() => req.id && handleUserConfirm(req.id, 'withdrawal')}
                disabled={!req.id || confirmationActionLoading[`withdrawal-${req.id!}`]}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50 whitespace-nowrap"
              >
                {confirmationActionLoading[`withdrawal-${req.id!}`] ? "処理中..." : "受け取りました"}
              </button>
            </div>
          ))}

          {displayUserData?.pendingChipSettlement && currentUser?.uid && (
             <div key={`confirm-chip-settlement-${currentUser.uid}`} className="mb-3 p-3 bg-orange-700/80 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2 border border-orange-500">
               <div>
                 <p className="text-white font-medium">チップ精算の確認</p>
                 <p className="text-sm text-orange-200">テーブル {displayUserData.pendingChipSettlement.tableId}-座席{displayUserData.pendingChipSettlement.seatNumber} より</p>
                 <p className="text-lg font-bold text-white">{displayUserData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</p>
                 {displayUserData.pendingChipSettlement.denominationsCount && Object.keys(displayUserData.pendingChipSettlement.denominationsCount).length > 0 && (
                    <p className="text-xs text-orange-300">
                        内訳:
                        {Object.entries(displayUserData.pendingChipSettlement.denominationsCount)
                            .map(([denom, count]) => `${parseInt(denom).toLocaleString()}P x${count}`)
                            .join(' / ')}
                    </p>
                 )}
                 <p className="text-xs text-orange-300">管理者処理日時: {formatTimestamp(displayUserData.pendingChipSettlement.initiatedAt)}</p>
               </div>
               <button
                 onClick={() => handleUserConfirm(currentUser.uid, 'chip_settlement')}
                 disabled={confirmationActionLoading[`settlement-${currentUser.uid}`] || !displayUserData.pendingChipSettlement}
                 className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded disabled:opacity-50 whitespace-nowrap"
               >
                 {confirmationActionLoading[`settlement-${currentUser.uid}`] ? "処理中..." : "精算額を確認しました"}
               </button>
             </div>
          )}

          {(pendingConfirmationOrders.length === 0 && pendingConfirmationWithdrawals.length === 0 && !displayUserData?.pendingChipSettlement && !loadingConfirmations) &&
            <p className="text-slate-400 text-sm">現在、受け取り/精算 確認待ちのアイテムはありません。</p>
          }
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
            {/* 変更箇所: プロフィール編集へのリンクをボタンとして追加 */}
            <Link to="/profile" className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out">
              プロフィールを編集
            </Link>
           </div>
        </section>

        <aside className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">お知らせ</h2>
          <div className="space-y-3 text-sm">
            <p className="text-slate-400">(お知らせは現在準備中です)</p>
            {/* ここにお知らせリストを表示するロジック */}
          </div>
        </aside>
      </div>

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
    </div>
  );
};

export default MainPage;