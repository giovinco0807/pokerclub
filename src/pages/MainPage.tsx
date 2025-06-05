// src/pages/MainPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { UserData, Order, WithdrawalRequest, OrderStatus, WithdrawalRequestStatus, WaitingListEntry, WaitingListEntryWithDetails, GameTemplate, WaitingListEntryStatus } from '../types';
import { signOut } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import { createWithdrawalRequest } from '../services/withdrawalService';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, FieldValue, getDocs, orderBy, addDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Checkbox, FormGroup, FormControlLabel, List, ListItem, ListItemText, Collapse, IconButton, ListSubheader, Button as MuiButton, CircularProgress, Box, Alert, Typography, Paper } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';

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
  const [loadingWaitingList, setLoadingWaitingList] = useState(true);
  const [waitingListError, setWaitingListError] = useState<string | null>(null);
  const [selectedGameTemplateIds, setSelectedGameTemplateIds] = useState<string[]>([]);
  const [showGameTemplateList, setShowGameTemplateList] = useState(false);
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

  const fetchGameTemplatesAndUserEntries = useCallback(async () => {
    console.log("MainPage: fetchGameTemplatesAndUserEntries called. UID:", currentUser?.uid);
    if (!currentUser?.uid) {
      setLoadingWaitingList(false);
      setUserWaitingListEntries([]);
      setAvailableGameTemplates([]);
      return;
    }
    setLoadingWaitingList(true);
    setWaitingListError(null);

    try {
      const templatesQuery = query(collection(db, "gameTemplates"), where("isActive", "==", true), orderBy("sortOrder", "asc"));
      const templatesSnapshot = await getDocs(templatesQuery);
      const activeTemplates = templatesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as GameTemplate);
      setAvailableGameTemplates(activeTemplates);
      console.log("MainPage: Fetched active templates:", activeTemplates.length);


      const entriesQuery = query(
        collection(db, "waitingListEntries"),
        where("userId", "==", currentUser.uid),
        orderBy("requestedAt", "asc")
      );
      const entriesSnapshot = await getDocs(entriesQuery);
      console.log("MainPage: Fetched user entries snapshot, docs count:", entriesSnapshot.docs.length);

      const entriesPromises = entriesSnapshot.docs.map(async (docSnapshot) => {
        const entryData = { id: docSnapshot.id, ...docSnapshot.data() } as WaitingListEntry;
        let gameTemplateDetails: GameTemplate | null = null;
        if (entryData.gameTemplateId && activeTemplates.length > 0) {
            gameTemplateDetails = activeTemplates.find(t => t.id === entryData.gameTemplateId) || null;
            if (!gameTemplateDetails) {
                const templateDocSnap = await getDoc(doc(db, 'gameTemplates', entryData.gameTemplateId));
                if (templateDocSnap.exists()) {
                    gameTemplateDetails = { id: templateDocSnap.id, ...templateDocSnap.data() } as GameTemplate;
                }
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
      console.log("MainPage: Set userWaitingListEntries:", filteredEntries.length);

    } catch (err: any) {
      console.error("ユーザーのウェイティングリスト取得エラー:", err); // エラーログの行番号(144)はここ
      setWaitingListError("ウェイティング状況の取得に失敗しました。");
    } finally {
      setLoadingWaitingList(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (currentUser?.uid) { // AppContextからcurrentUserがセットされてから実行
        fetchGameTemplatesAndUserEntries();
    }
  }, [currentUser?.uid, fetchGameTemplatesAndUserEntries]); // currentUser.uidも依存配列に追加


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

  const handleGameTemplateSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const templateId = event.target.name;
    const isChecked = event.target.checked;

    setSelectedGameTemplateIds(prevSelectedIds => {
      if (isChecked) {
        return [...prevSelectedIds, templateId];
      } else {
        return prevSelectedIds.filter(id => id !== templateId);
      }
    });
  };

  const handleJoinWaitingList = async () => {
    if (!currentUser?.uid || selectedGameTemplateIds.length === 0) {
      setWaitingListError("ウェイティングに参加するゲームを1つ以上選択してください。");
      return;
    }
    setLoadingWaitingList(true);
    setWaitingListError(null);
    const hidePokerName = currentUser?.firestoreData?.privacySettings?.hidePokerNameInPublicLists || false;

    let successCount = 0;
    const errorMessages: string[] = [];

    for (const templateId of selectedGameTemplateIds) {
      const selectedTemplate = availableGameTemplates.find(t => t.id === templateId);
      if (!selectedTemplate) {
        errorMessages.push(`ID: ${templateId} のゲームテンプレートが見つかりません。`);
        continue;
      }

      const existingEntry = userWaitingListEntries.find(
        entry => entry.gameTemplateId === templateId && (entry.status === 'waiting' || entry.status === 'called' || entry.status === 'confirmed')
      );
      if (existingEntry) {
        console.log(`${selectedTemplate.templateName} には既にウェイティング登録済みのためスキップします。`);
        successCount++;
        continue;
      }

      try {
        const entryData: Omit<WaitingListEntry, 'id' | 'requestedAt' | 'lastStatusUpdatedAt'> = {
          userId: currentUser.uid,
          userPokerNameSnapshot: currentUser.firestoreData?.pokerName || currentUser.email?.split('@')[0],
          userAvatarUrlSnapshot: currentUser.firestoreData?.avatarUrl || null,
          gameTemplateId: templateId,
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
        successCount++;
      } catch (e: any) {
        console.error(`ゲーム「${selectedTemplate.templateName}」のウェイティングリスト登録エラー:`, e);
        errorMessages.push(`「${selectedTemplate.templateName}」の登録に失敗しました: ${e.message}`);
      }
    }

    if (successCount > 0) {
      alert(`${successCount}件のゲームのウェイティングリストに登録しました。${errorMessages.length > 0 ? `\n一部エラー:\n${errorMessages.join('\n')}` : ''}`);
      fetchGameTemplatesAndUserEntries();
    } else if (errorMessages.length > 0) {
      setWaitingListError(`登録に失敗しました:\n${errorMessages.join('\n')}`);
    }

    setSelectedGameTemplateIds([]);
    setWaitingListNotes('');
    // setLoadingWaitingList(false); // fetchGameTemplatesAndUserEntries内でfalseになるので不要
    setShowGameTemplateList(false);
  };

  const handleCancelWaitingEntry = async (entryId: string | undefined) => {
    if (!entryId) {
      alert("キャンセル対象のエントリーIDが見つかりません。");
      return;
    }
    if (!window.confirm("このウェイティング登録をキャンセルしますか？")) {
      return;
    }

    setLoadingWaitingList(true);
    try {
      const entryDocRef = doc(db, "waitingListEntries", entryId);
      await updateDoc(entryDocRef, {
        status: "cancelled_by_user" as WaitingListEntryStatus,
        cancelledAt: serverTimestamp(),
        lastStatusUpdatedAt: serverTimestamp(),
      });
      alert("ウェイティング登録をキャンセルしました。");
      fetchGameTemplatesAndUserEntries();
    } catch (e: any) {
      console.error("ウェイティングリストのキャンセルエラー:", e);
      alert(`キャンセル処理に失敗しました: ${e.message}`);
      setWaitingListError(`キャンセル処理に失敗: ${e.message}`);
    } finally {
      // setLoadingWaitingList(false); // fetchGameTemplatesAndUserEntries内でfalseになる
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
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'primary.contrastText', mb: { xs: 1, sm: 0 } }}>
            ようこそ、
            <Typography component="span" sx={{ color: 'sky.300' }}>
              {displayUserData?.pokerName || currentUser.email?.split('@')[0] || 'プレイヤー'}
            </Typography>
            さん
          </Typography>
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
                <Typography sx={{ color: 'white', fontWeight: 'medium' }}>注文(ドリンク等): {order.items.filter(i=>i.itemType==='drink').map(i => i.itemName).join(', ') || "詳細確認中"}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'slate.400' }}>合計: {order.totalOrderPrice.toLocaleString()}円 / 提供日時: {formatTimestamp(order.adminDeliveredAt)}</Typography>
              </div>
              <MuiButton
                onClick={() => order.id && handleUserConfirm(order.id, 'order')}
                disabled={!order.id || confirmationActionLoading[`order-${order.id!}`]}
                variant="contained"
                size="small"
                sx={{bgcolor:'green.600', '&:hover': {bgcolor:'green.700'}}}
              >
                {confirmationActionLoading[`order-${order.id!}`] ? <CircularProgress size={20} color="inherit"/> : "受け取りました"}
              </MuiButton>
            </div>
          ))}
          {pendingConfirmationWithdrawals.map(withdrawal => (
            <div key={`confirm-withdrawal-${withdrawal.id}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <Typography sx={{ color: 'white', fontWeight: 'medium' }}>チップ引き出し: {withdrawal.requestedChipsAmount.toLocaleString()} チップ</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'slate.400' }}>ステータス: {withdrawal.status} / 提供日時(管理): {formatTimestamp(withdrawal.adminDeliveredAt)}</Typography>
              </div>
              <MuiButton
                onClick={() => withdrawal.id && handleUserConfirm(withdrawal.id, 'withdrawal')}
                disabled={!withdrawal.id || confirmationActionLoading[`withdrawal-${withdrawal.id!}`]}
                variant="contained"
                size="small"
                sx={{bgcolor:'green.600', '&:hover': {bgcolor:'green.700'}}}
              >
                {confirmationActionLoading[`withdrawal-${withdrawal.id!}`] ? <CircularProgress size={20} color="inherit"/> : "チップ受け取り"}
              </MuiButton>
            </div>
          ))}
          {displayUserData?.pendingChipSettlement && (
            <div key={`confirm-settlement-${currentUser!.uid}`} className="mb-3 p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                <Typography sx={{ color: 'white', fontWeight: 'medium' }}>テーブルチップ精算: {displayUserData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'slate.400' }}>テーブル: T{displayUserData.pendingChipSettlement.tableId} - S{displayUserData.pendingChipSettlement.seatNumber} / 受付日時: {formatTimestamp(displayUserData.pendingChipSettlement.initiatedAt)}</Typography>
              </div>
               <MuiButton
                onClick={() => handleUserConfirm(currentUser!.uid, 'chip_settlement')}
                disabled={confirmationActionLoading[`settlement-${currentUser!.uid}`]}
                variant="contained"
                size="small"
                sx={{bgcolor:'green.600', '&:hover': {bgcolor:'green.700'}}}
              >
                {confirmationActionLoading[`settlement-${currentUser!.uid}`] ? <CircularProgress size={20} color="inherit"/> : "精算内容確認"}
              </MuiButton>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <section className="md:col-span-2 bg-slate-800 p-6 rounded-lg shadow">
           <h2 className="text-2xl font-semibold text-red-400 mb-4 border-b border-slate-700 pb-2">プレイヤー情報</h2>
           <div className="space-y-3 text-lg mb-6">
            <p><span className="font-medium text-slate-400">ポーカーネーム:</span> <Typography component="span" sx={{ color: 'sky.300', fontWeight: 'medium' }}>{displayUserData?.pokerName || '未設定'}</Typography></p>
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
        <h2 className="text-2xl font-semibold text-teal-400 mb-4 border-b border-slate-700 pb-2">ウェイティングリストに参加</h2>
        {loadingWaitingList && !appContextLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
            <CircularProgress color="inherit" />
            <Typography sx={{ ml: 2 }}>処理中...</Typography>
          </Box>
        ) : waitingListError ? (
          <Alert severity="error" sx={{ mb: 2 }}>{waitingListError}</Alert>
        ) : null}

        <div className="space-y-4">
          <div>
            <MuiButton
                onClick={() => setShowGameTemplateList(!showGameTemplateList)}
                fullWidth
                variant="outlined"
                sx={{
                    color: 'sky.400',
                    borderColor: 'sky.600',
                    '&:hover': { borderColor: 'sky.400', bgcolor: 'sky.900/30' },
                    justifyContent: 'space-between',
                    textTransform: 'none',
                    py: 1.5,
                }}
                endIcon={showGameTemplateList ? <ExpandLess /> : <ExpandMore />}
            >
                参加希望ゲームを選択 (複数選択可)
            </MuiButton>
            <Collapse in={showGameTemplateList} timeout="auto" unmountOnExit>
                <Paper sx={{ maxHeight: 300, overflow: 'auto', mt: 1, bgcolor: 'slate.700/50', p:1, border: '1px solid', borderColor: 'slate.600' }}>
                    <FormGroup>
                    {availableGameTemplates.length > 0 ? availableGameTemplates.map((template) => (
                        <FormControlLabel
                        key={template.id}
                        control={
                            <Checkbox
                            checked={selectedGameTemplateIds.includes(template.id!)}
                            onChange={handleGameTemplateSelectionChange}
                            name={template.id!}
                            sx={{ color: 'sky.400', '&.Mui-checked': { color: 'sky.300' } }}
                            />
                        }
                        label={`${template.templateName} (${template.gameType} - ${template.blindsOrRate || 'N/A'})`}
                        sx={{ color: 'slate.200', borderBottom: '1px solid', borderColor: 'slate.600/70', '&:last-child': { borderBottom: 'none'}, py: 0.5, px:1, '&:hover': {bgcolor: 'slate.600/50'} }}
                        />
                    )) : (
                        <Typography sx={{p:2, textAlign:'center', color:'slate.400'}}>現在参加可能なゲームテンプレートはありません。</Typography>
                    )}
                    </FormGroup>
                </Paper>
            </Collapse>
          </div>

          <div>
            <label htmlFor="waitingListNotes" className="block text-sm font-medium text-slate-300 mb-1">
              スタッフへの備考 (全ゲーム共通・任意):
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
          <MuiButton
            onClick={handleJoinWaitingList}
            disabled={loadingWaitingList || selectedGameTemplateIds.length === 0}
            variant="contained"
            fullWidth
            sx={{
              py: 1.5,
              bgcolor: (loadingWaitingList || selectedGameTemplateIds.length === 0) ? 'slate.600' : 'teal.600',
              '&:hover': { bgcolor: (loadingWaitingList || selectedGameTemplateIds.length === 0) ? 'slate.600' : 'teal.700' },
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            {loadingWaitingList ? '登録処理中...' : `${selectedGameTemplateIds.length}件のゲームにウェイティング登録する`}
          </MuiButton>
        </div>

        {userWaitingListEntries.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-700">
            <h3 className="text-lg font-semibold text-slate-200 mb-3">現在のあなたの待ち状況:</h3>
            <ul className="space-y-2">
              {userWaitingListEntries.map((entry: WaitingListEntryWithDetails) => (
                <li key={entry.id} className="p-3 bg-slate-700 rounded-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <Typography sx={{ color: 'sky.200', fontWeight: 'medium' }}>
                      {entry.gameTemplateNameSnapshot || entry.gameTemplate?.templateName || '不明なゲーム'}
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                        entry.status === 'waiting' ? 'bg-yellow-500 text-black' :
                        entry.status === 'called' ? 'bg-sky-500 text-white' :
                        entry.status === 'confirmed' ? 'bg-blue-500 text-white' :
                        'bg-slate-600 text-slate-200'
                      }`}>
                        {entry.status}
                      </span>
                    </Typography>
                    {entry.notesForStaff && <p className="text-xs text-slate-400 mt-1">備考: {entry.notesForStaff}</p>}
                  </div>
                  {(entry.status === 'waiting' || entry.status === 'called' || entry.status === 'confirmed') && (
                    <MuiButton
                      variant="outlined"
                      size="small"
                      onClick={() => handleCancelWaitingEntry(entry.id)}
                      sx={{
                        color: 'red.400',
                        borderColor: 'red.600',
                        '&:hover': { borderColor: 'red.400', bgcolor: 'red.900/30' },
                        mt: { xs: 1, sm: 0 },
                        alignSelf: { xs: 'flex-end', sm: 'center'}
                      }}
                      disabled={loadingWaitingList}
                    >
                      キャンセル
                    </MuiButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
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