// src/pages/AdminUserManagementPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../services/firebase';
import { collection, getDocs, doc, updateDoc, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import UserDetailsModal, { StatusBadge } from '../components/admin/UserDetailsModal';
import type { UserDetailsModalProps } from '../components/admin/UserDetailsModal'; 
import SeatSelectionModal from '../components/admin/SeatSelectionModal';
import type { SeatSelectionModalProps } from '../components/admin/SeatSelectionModal'; 
import ChipSettlementModal from '../components/admin/ChipSettlementModal';
import type { ChipSettlementModalProps } from '../components/admin/ChipSettlementModal';
import { UserData, UserWithId, Table, Seat } from '../types';
import { getAllTables, getSeatsForTable } from '../services/tableService';
import { getFunctions, httpsCallable } from 'firebase/functions';

type UserListViewMode = 'checkedIn' | 'unapproved' | 'all';

const AdminUserManagementPage: React.FC = () => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<UserListViewMode>('all');

  const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserWithId | null>(null);

  const [tables, setTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [isSeatSelectionModalOpen, setIsSeatSelectionModalOpen] = useState(false);
  const [userForSeating, setUserForSeating] = useState<UserWithId | null>(null);

  const [isChipSettlementModalOpen, setIsChipSettlementModalOpen] = useState(false);
  const [userForChipSettlement, setUserForChipSettlement] = useState<UserWithId | null>(null);
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true); setError(null);
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('pokerName'), orderBy('email'));
      const querySnapshot = await getDocs(q);
      const usersList = querySnapshot.docs.map(docSnapshot => {
        const firestoreData = docSnapshot.data();
        return { id: docSnapshot.id, ...(firestoreData as UserData) } as UserWithId;
      });
      setUsers(usersList);
    } catch (err: any) { 
      console.error("ユーザー一覧取得失敗 (AdminUserManagementPage):", err);
      setError(`ユーザー一覧の取得に失敗: ${err.message}`); 
    } 
    finally { setLoadingUsers(false); }
  }, []);

  const fetchAllTableDataWithSeats = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const tablesFromService = await getAllTables(); 
      const tablesWithSeatsPromises = tablesFromService.map(async (tableData) => {
        const currentTableId = tableData.id;
        if (!currentTableId) {
            console.error("fetchAllTableDataWithSeats: Table ID is missing for tableData:", tableData);
            return { ...tableData, id: `unknown-${Math.random().toString(36).substring(7)}`, seats: [] } as Table; 
        }
        const seats = await getSeatsForTable(currentTableId);
        return { ...tableData, id: currentTableId, seats: seats || [] } as Table;
      });
      const resolvedTables = await Promise.all(tablesWithSeatsPromises);
      setTables(resolvedTables);
    } catch (err: any) { 
      console.error("テーブルデータ取得失敗 (AdminUserManagementPage):", err);
      setError(`テーブルデータ取得失敗: ${err.message}`); 
    }
    finally { setLoadingTables(false); }
  }, []); 

  useEffect(() => {
    if (!appContextLoading && currentUser && currentUser.isAdmin) {
      fetchUsers();
      fetchAllTableDataWithSeats();
    } else if (!appContextLoading && (!currentUser || !currentUser.isAdmin)) {
      setError("このページへのアクセス権限がありません。"); 
      setLoadingUsers(false); 
      setLoadingTables(false);
    }
  }, [appContextLoading, currentUser, fetchUsers, fetchAllTableDataWithSeats]);

  const handleApproveUser = async (userId: string) => {
    if (!window.confirm(`ユーザーID: ${userId.substring(0,8)}... のアカウントを承認しますか？`)) return;
    const loadingKey = `approve-${userId}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      await updateDoc(doc(db, 'users', userId), { approved: true, updatedAt: serverTimestamp() });
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, approved: true } : u));
      if (selectedUserForDetails?.id === userId) {
        setSelectedUserForDetails(prevSelectedUser => prevSelectedUser ? {...prevSelectedUser, approved: true} : null);
      }
      alert('アカウントを承認しました。');
    } catch (e: any) { 
      console.error("アカウント承認失敗:", e);
      alert(`承認処理に失敗しました: ${e.message}`); 
    }
    finally { setActionLoading(prev => ({ ...prev, [loadingKey]: false }));}
  };

  const handleUnapproveUser = async (userId: string) => {
     if (!window.confirm(`ユーザーID: ${userId.substring(0,8)}... のアカウントの承認を取り消しますか？`)) return;
    const loadingKey = `unapprove-${userId}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      await updateDoc(doc(db, 'users', userId), { approved: false, updatedAt: serverTimestamp() });
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, approved: false } : u));
      if (selectedUserForDetails?.id === userId) {
        setSelectedUserForDetails(prevSelectedUser => prevSelectedUser ? {...prevSelectedUser, approved: false} : null);
      }
      alert('アカウントの承認を取り消しました。');
    } catch (e: any) { 
      console.error("アカウント承認取消失敗:", e);
      alert(`承認取消処理に失敗しました: ${e.message}`); 
    }
    finally { setActionLoading(prev => ({ ...prev, [loadingKey]: false }));}
  };

  const handleRowClick = (user: UserWithId) => {
      const userForModal: UserWithId = { ...user, isAdminClientSide: user.id === currentUser?.uid ? currentUser?.isAdmin : undefined };
      setSelectedUserForDetails(userForModal); 
      setIsUserDetailsModalOpen(true);
  };
  const handleCloseUserDetailsModal = () => { setIsUserDetailsModalOpen(false); setSelectedUserForDetails(null); };

  const openSeatSelectionModal = (user: UserWithId) => { 
    if (!user.approved) {
      alert("未承認のユーザーは着席させられません。まずアカウントを承認してください。");
      return;
    }
    setUserForSeating(user); 
    setIsSeatSelectionModalOpen(true); 
  };
  
  const handleSeatUser = async (targetUser: UserWithId, newTableId: string, newSeatNumber: number, amountToPlayInput?: number) => {
    if (!currentUser?.uid) { 
      alert("エラー: 操作を実行するユーザー情報が取得できませんでした。"); 
      return; 
    }
    if (!targetUser || !targetUser.id) {
        alert("エラー: 対象ユーザー情報が不完全です。");
        return;
    }

    const loadingKeyForSeatAction = `seat-${targetUser.id}`; 
    setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: true }));

    try {
      const previousTableId = targetUser.currentTableId;
      let previousTableInfo: Table | undefined;

      if (targetUser.isCheckedIn && previousTableId) { 
        previousTableInfo = tables.find(t => t.id === previousTableId);
      }

      const destinationTableInfo = tables.find(t => t.id === newTableId);
      if (!destinationTableInfo) {
        throw new Error("移動先のテーブル情報が見つかりません。ページを再読み込みしてください。");
      }

      if (targetUser.isCheckedIn && targetUser.currentTableId === newTableId && targetUser.currentSeatNumber === newSeatNumber) {
        alert("同じテーブルの同じ座席には移動できません。");
        setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
        setIsSeatSelectionModalOpen(false); 
        setUserForSeating(null);
        return;
      }

      const needsSettlementDueToGameChange = previousTableInfo && targetUser.isCheckedIn &&
        (previousTableInfo.gameType !== destinationTableInfo.gameType || 
         previousTableInfo.blindsOrRate !== destinationTableInfo.blindsOrRate);

      if (needsSettlementDueToGameChange) {
        if (targetUser.pendingChipSettlement) {
            alert(`ユーザー「${targetUser.pokerName || targetUser.email}」は既にチップ精算の確認待ちです。\nまずユーザー側の確認を完了させてください。`);
            setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
            setIsSeatSelectionModalOpen(false); 
            setUserForSeating(null);
            return;
        }

        const confirmSettlement = window.confirm(
          `ユーザー「${targetUser.pokerName || targetUser.email}」を異なるゲーム/レートのテーブルに移動します。\n` +
          `現在のテーブル (${previousTableInfo?.name} - ${previousTableInfo?.gameType} ${previousTableInfo?.blindsOrRate || ''}) でのチップを一度精算する必要があります。\n` +
          `チップ精算を開始しますか？\n(精算完了後、改めて新しいテーブルへの着席操作を行ってください)`
        );

        if (confirmSettlement) {
          handleOpenChipSettlementModal(targetUser); 
          setIsSeatSelectionModalOpen(false);      
          setUserForSeating(null);
          setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
          return; 
        } else {
          alert("テーブル移動をキャンセルしました。チップ精算が必要です。");
          setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
          setIsSeatSelectionModalOpen(false); 
          setUserForSeating(null);
          return;
        }
      }
      
      let chipsToPlay: number; 
      const currentOwnedChips = targetUser.chips ?? 0; 

      if (amountToPlayInput === undefined || typeof amountToPlayInput !== 'number' || amountToPlayInput < 0) {
          const currentChipsInPlay = targetUser.chipsInPlay ?? 0;
          const defaultChipAmountStr = String( currentChipsInPlay > 0 && !targetUser.isCheckedIn ? 0 : 
                                                currentChipsInPlay > 0 && targetUser.isCheckedIn ? currentChipsInPlay : 
                                                (currentOwnedChips > 20000 ? 20000 : (currentOwnedChips >=0 ? currentOwnedChips : 0) ));
          const amountStr = window.prompt(
            `${targetUser.pokerName || targetUser.email} さんをテーブル ${destinationTableInfo.name} (座席 ${newSeatNumber}) に着席させます。\n持ち込むチップ額を入力してください (保有チップ: ${currentOwnedChips.toLocaleString()}):`, 
            defaultChipAmountStr
          );
          if (amountStr === null) { 
            alert("着席処理をキャンセルしました。"); 
            setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
            return; 
          }
          const amount = parseInt(amountStr, 10);
          if (isNaN(amount) || amount < 0) { 
            alert("無効なチップ額です。0以上の数値を入力してください。"); 
            setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
            return; 
          }
          if (amount > currentOwnedChips) { 
              alert(`保有チップ(${currentOwnedChips.toLocaleString()})を超える額は持ち込めません。`); 
              setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
              return; 
          }
          chipsToPlay = amount;
      } else {
          chipsToPlay = amountToPlayInput;
      }
      
      const functions = getFunctions(undefined, 'asia-northeast1');
      const checkInFn = httpsCallable<
          { userId: string; tableId: string; seatNumber: number; amountToPlay: number; },
          { status: string; message: string; }
      >(functions, 'checkInUserWithChips');

      const result = await checkInFn({
          userId: targetUser.id,
          tableId: newTableId,
          seatNumber: newSeatNumber,
          amountToPlay: chipsToPlay, 
      });

      if (result.data.status === 'success') {
          alert(result.data.message || `${targetUser.pokerName || targetUser.email} さんを着席/チェックインさせました。`);
          fetchUsers(); 
          fetchAllTableDataWithSeats(); 
          if (refreshCurrentUser && typeof refreshCurrentUser === 'function') {
            await refreshCurrentUser();
          }
      } else {
          throw new Error(result.data.message || "着席処理でエラーが発生しました。");
      }
    } catch (e: any) {
        console.error("着席/テーブル移動エラー (AdminUserManagementPage):", e);
        alert(`着席/テーブル移動処理に失敗しました: ${e.message}`);
    } finally {
        setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: false }));
        setIsSeatSelectionModalOpen(false); 
        setUserForSeating(null);
    }
  };

  const handleOpenChipSettlementModal = (user: UserWithId) => {
    if (!user.isCheckedIn || !user.currentTableId || typeof user.currentSeatNumber !== 'number') { 
      alert("このユーザーはチェックインしていないか、テーブル/座席が不明です。");
      return;
    }
    if (user.pendingChipSettlement) {
        alert("このユーザーには既に確認待ちのチップ精算があります。まずそれを処理またはユーザーに確認を促してください。");
        return;
    }
    setUserForChipSettlement(user);
    setIsChipSettlementModalOpen(true);
  };

  const handleSubmitChipSettlement = async (denominationsCount: { [key: string]: number }, totalChips: number) => {
    if (!userForChipSettlement || !userForChipSettlement.id || !userForChipSettlement.currentTableId || typeof userForChipSettlement.currentSeatNumber !== 'number') {
      alert("精算対象のユーザー、テーブルID、または座席番号の情報が不完全です。");
      setIsSubmittingSettlement(false); // ★ ローディング解除
      if(userForChipSettlement?.id) { // ★ nullでないことを確認
          setActionLoading(prev => ({ ...prev, [`settle-${userForChipSettlement!.id}`]: false })); 
      }
      return;
    }
    if (!currentUser?.uid) { 
        alert("エラー: 操作を実行するユーザー情報が取得できませんでした。"); 
        setIsSubmittingSettlement(false); // ★ ローディング解除
        setActionLoading(prev => ({ ...prev, [`settle-${userForChipSettlement.id}`]: false })); // ★ ローディング解除
        return;
    }

    setIsSubmittingSettlement(true);
    const loadingKey = `settle-${userForChipSettlement.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true })); 

    try {
      const functions = getFunctions(undefined, 'asia-northeast1');
      const initiateSettlementFn = httpsCallable<
        { userId: string; tableId: string; seatNumber: number; denominationsCount: { [key: string]: number }; totalAdminEnteredChips: number },
        { status: string; message: string }
      >(functions, 'initiateChipSettlementByAdmin');

      const result = await initiateSettlementFn({
        userId: userForChipSettlement.id, 
        tableId: userForChipSettlement.currentTableId, 
        seatNumber: userForChipSettlement.currentSeatNumber, 
        denominationsCount: denominationsCount,
        totalAdminEnteredChips: totalChips,
      });
      if (result && result.data && typeof result.data.status === 'string') {
    if (result.data.status === 'success') {
      alert(result.data.message || "チップ精算リクエストをユーザー確認待ちにしました。");
      setIsChipSettlementModalOpen(false); 
      setUserForChipSettlement(null);     
      fetchUsers();                       
      if (refreshCurrentUser && typeof refreshCurrentUser === 'function') {
          await refreshCurrentUser(); 
      }
    } else {
      // Functionが status !== 'success' だが、期待したデータ構造で返した場合
      console.error("チップ精算開始処理エラー (Function Response):", result.data);
      throw new Error(result.data.message || "チップ精算開始処理でサーバーがエラーを返しました。");
    }
  } else {
    // result.data が期待した形でない場合 (例: CORSエラーでレスポンスが空、Functionがクラッシュしたなど)
    console.error("Firebase Functionからのレスポンスが無効、またはデータがありません:", result);
    throw new Error("サーバーからの応答が無効か、データがありませんでした。FunctionのログやCORS設定を確認してください。");
  }
} catch (e: any) {
  console.error("チップ精算開始エラー (AdminUserManagementPage):", e);
  let errorMessage = `チップ精算の開始に失敗しました。`;
  if (e?.message) { // e や e.message が存在するか確認
    errorMessage += ` (${e.message})`;
  }
  // Firebase HttpsError の場合、e.code や e.details を含めることも検討
  if (e?.code) {
    errorMessage += ` (コード: ${e.code})`;
  }
  alert(errorMessage);
    } finally {
      setIsSubmittingSettlement(false);
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const filteredUsers = useMemo(() => {
    const usersArray = users || []; 
    return usersArray
      .filter(user => filterApproved === null || user.approved === filterApproved)
      .filter(user => {
        if (viewMode === 'checkedIn') return user.isCheckedIn === true;
        if (viewMode === 'unapproved') return user.approved === false;
        return true;
      })
      .filter(user => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return (
          user.pokerName?.toLowerCase().includes(term) ||
          user.fullName?.toLowerCase().includes(term) ||
          user.email?.toLowerCase().includes(term)
        );
      });
  }, [users, filterApproved, viewMode, searchTerm]);

  const unapprovedUserCount = useMemo(() => (users || []).filter(user => !user.approved).length, [users]);

  if (appContextLoading) { return <div className="text-center p-10 text-xl text-neutral-lightest">アプリ情報読込中...</div>; }
  if (!currentUser || !currentUser.isAdmin) { return <div className="text-center p-10 text-xl text-yellow-500">{error || "このページへのアクセス権限がありません。"}</div>; }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-red-500">ユーザー管理</h1>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">← 管理ダッシュボードへ</Link>
      </div>

      <div className="mb-6 p-4 bg-slate-800 rounded-lg shadow">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div><label htmlFor="userViewMode" className="block text-sm font-medium text-slate-300 mb-1">表示モード:</label><select id="userViewMode" value={viewMode} onChange={(e) => setViewMode(e.target.value as UserListViewMode)} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10"><option value="all">全ユーザー</option><option value="checkedIn">チェックイン中</option><option value="unapproved">未承認</option></select></div>
            <div><label htmlFor="userSearchTerm" className="block text-sm font-medium text-slate-300 mb-1">検索:</label><input type="text" id="userSearchTerm" placeholder="名前, メール等" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10" /></div>
            <div><label htmlFor="userFilterApproved" className="block text-sm font-medium text-slate-300 mb-1">承認状態:</label><select id="userFilterApproved" value={filterApproved === null ? 'all' : String(filterApproved)} onChange={(e) => { const val = e.target.value; setFilterApproved(val === 'all' ? null : val === 'true');}} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10"><option value="all">すべて</option><option value="true">承認済み</option><option value="false">未承認</option></select></div>
            <button onClick={() => { fetchUsers(); fetchAllTableDataWithSeats(); }} disabled={loadingUsers || loadingTables} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded h-10 disabled:opacity-50">
                { (loadingUsers || loadingTables) ? "読込中..." : "リスト再読込"}
            </button>
        </div>
        {unapprovedUserCount > 0 && viewMode !== 'unapproved' && ( <div className="mt-4 p-3 bg-yellow-700/50 text-yellow-200 rounded-md text-sm"><p>現在、{unapprovedUserCount}人の未承認ユーザーがいます。<button onClick={() => setViewMode('unapproved')} className="ml-2 underline hover:text-yellow-100 font-semibold">未承認ユーザー表示</button></p></div>)}
      </div>

      {(error && !(loadingUsers || loadingTables)) && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md text-center">{error}</div>}

      <div className="overflow-x-auto bg-slate-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-700">
                <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">ID</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">ポーカーネーム</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">氏名</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">承認</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">状態</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">保有チップ</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">使用中</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider min-w-[150px]">アクション</th>
                </tr>
            </thead>
            <tbody className="bg-slate-800 divide-y divide-slate-700">
              {(loadingUsers || loadingTables) ? ( 
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">ユーザー一覧を読み込み中...</td></tr>
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((user: UserWithId) => (
                  <tr key={user.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-300 font-mono cursor-pointer hover:underline" title={user.id} onClick={() => handleRowClick(user)}>{user.id.substring(0, 6)}...</td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-200 cursor-pointer hover:underline" onClick={() => handleRowClick(user)}>{user.pokerName || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-200 cursor-pointer hover:underline" onClick={() => handleRowClick(user)}>{user.fullName || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm">
                        {user.approved ? <StatusBadge color="green" text="承認済" /> : <button onClick={(e) => { e.stopPropagation(); if(user.id) handleApproveUser(user.id); }} disabled={!user.id || actionLoading[`approve-${user.id}`]} className="text-green-400 hover:text-green-300 disabled:opacity-50 text-xs p-1">{actionLoading[`approve-${user.id}`] ? "処理中" : "承認する"}</button>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm">
                        {user.isCheckedIn ? 
                            <StatusBadge color="sky" text={`IN (T${user.currentTableId || '?'}-S${user.currentSeatNumber ?? '?'})`} /> : 
                            <StatusBadge color="slate" text="OUT" />}
                        {user.pendingChipSettlement && <StatusBadge color="purple" text="精算確認中" />}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-slate-200 text-right">{(user.chips ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-sky-300 text-right">{(user.chipsInPlay ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs font-medium space-x-1">
                      {user.approved && !user.isCheckedIn && !user.pendingChipSettlement && (
                        <button onClick={(e) => { e.stopPropagation(); openSeatSelectionModal(user); }} title="着席/チェックイン" className="text-sky-400 hover:text-sky-300 disabled:opacity-50 p-1" disabled={actionLoading[`seat-${user.id}`] || actionLoading[`move-${user.id}`]}>
                          {actionLoading[`seat-${user.id}`] || actionLoading[`move-${user.id}`] ? "処理中..." : "着席"}
                        </button>
                      )}
                      {user.approved && user.isCheckedIn && !user.pendingChipSettlement && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openSeatSelectionModal(user); }} 
                            title="座席を移動する" 
                            className="text-yellow-400 hover:text-yellow-300 disabled:opacity-50 p-1"
                            disabled={actionLoading[`move-${user.id}`] || actionLoading[`seat-${user.id}`]}
                          >
                            {actionLoading[`move-${user.id}`] || actionLoading[`seat-${user.id}`] ? "処理中..." : "座席移動"}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenChipSettlementModal(user); }} 
                            title="チップ精算を開始する" 
                            className="text-amber-500 hover:text-amber-400 disabled:opacity-50 p-1" 
                            disabled={actionLoading[`settle-${user.id}`]}
                          >
                            {actionLoading[`settle-${user.id}`] ? "処理中..." : "精算開始"}
                          </button>
                        </>
                      )}
                      {user.pendingChipSettlement && (
                        <span className="text-purple-400 italic text-xs">ユーザー確認待ち</span>
                      )}
                       <button onClick={(e) => { e.stopPropagation(); handleRowClick(user); }} title="詳細表示" className="text-slate-400 hover:text-slate-300 p-1">詳細</button>
                    </td>
                  </tr>
                ))
              ) : ( 
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">表示条件に該当するユーザーがいません。</td></tr>
              )}
            </tbody>
          </table>
      </div>

      {selectedUserForDetails && (
        <UserDetailsModal 
          user={selectedUserForDetails} 
          isOpen={isUserDetailsModalOpen} 
          onClose={handleCloseUserDetailsModal} 
          onApprove={handleApproveUser}    
          onUnapprove={handleUnapproveUser} 
        />
      )}

      {userForSeating && (
        <SeatSelectionModal
          isOpen={isSeatSelectionModalOpen}
          onClose={() => { setIsSeatSelectionModalOpen(false); setUserForSeating(null); }}
          onSeatSelect={(tableId: string, seatNumber: number, amountToPlay?: number) => { 
            if (userForSeating) {
                handleSeatUser(userForSeating, tableId, seatNumber, amountToPlay); 
            }
          }}
          targetUser={userForSeating}
          currentTables={tables}
          isLoadingTables={loadingTables}
          needsChipInput={true} 
        />
      )}
      {userForChipSettlement && (
        <ChipSettlementModal
          isOpen={isChipSettlementModalOpen}
          onClose={() => { setIsChipSettlementModalOpen(false); setUserForChipSettlement(null);}}
          user={userForChipSettlement}
          onSubmitSettlement={handleSubmitChipSettlement}
          isSubmitting={isSubmittingSettlement}
        />
      )}
    </div>
  );
};

export default AdminUserManagementPage;