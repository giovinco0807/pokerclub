// src/pages/AdminUserManagementPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../services/firebase'; // パスを確認
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  where,
  limit,
  startAfter
} from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext'; // パスを確認
import { Link } from 'react-router-dom';
import UserDetailsModal, { StatusBadge } from '../components/admin/UserDetailsModal'; // パスを確認
import type { UserDetailsModalProps } from '../components/admin/UserDetailsModal';
import SeatSelectionModal from '../components/admin/SeatSelectionModal'; // パスを確認
import type { SeatSelectionModalProps } from '../components/admin/SeatSelectionModal';
import ChipSettlementModal from '../components/admin/ChipSettlementModal'; // パスを確認
import type { ChipSettlementModalProps } from '../components/admin/ChipSettlementModal';
import { UserData, UserWithId, Table, Seat } from '../types'; // パスを確認
import { getAllTables, getSeatsForTable } from '../services/tableService'; // パスを確認
import { getFunctions, httpsCallable } from 'firebase/functions';
import AdminLayout from '../components/admin/AdminLayout'; // パスを確認
import { AiOutlineSearch, AiOutlineCloseCircle, AiOutlineLoading } from 'react-icons/ai';
import { format } from 'date-fns';

const formatTimestamp = (timestamp: Timestamp | Date | undefined | null, includeSeconds: boolean = false): string => {
  if (!timestamp) return 'N/A';
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'Invalid Date';
  }
  const formatStr = `yyyy/MM/dd HH:mm${includeSeconds ? ':ss' : ''}`;
  try {
    return format(date, formatStr);
  } catch (e) {
    console.error("Error formatting timestamp:", e, "Original value:", timestamp);
    return 'Date Format Error';
  }
};

type BillingStatusFilter = 'all' | 'pendingPayment' | 'paid';

const AdminUserManagementPage: React.FC = () => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [filterCheckedIn, setFilterCheckedIn] = useState<boolean | null>(null);
  const [filterStaff, setFilterStaff] = useState<boolean | null>(null);
  const [filterBillingStatus, setFilterBillingStatus] = useState<BillingStatusFilter>('all');

  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const usersPerPage = 20;

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

  const fetchAllTableDataWithSeats = useCallback(async () => {
    console.log('%c--- fetchAllTableDataWithSeats CALLED ---', 'color: purple;');
    setLoadingTables(true);
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
      console.error("テーブルデータ取得失敗 (fetchAllTableDataWithSeats):", err);
      setError(prevError => prevError ? `${prevError}\nテーブルデータ取得失敗: ${err.message}` : `テーブルデータ取得失敗: ${err.message}`);
    }
    finally { setLoadingTables(false); console.log('%c--- fetchAllTableDataWithSeats FINISHED ---', 'color: purple;'); }
  }, []);


  // ★★★ `useCallback` の依存配列から `hasMore` を削除 ★★★
  const fetchUsersWithFilters = useCallback(async (isLoadMore: boolean = false, currentLastVisibleDocParam: any = null) => {
    console.log(`%c--- fetchUsersWithFilters CALLED (isLoadMore: ${isLoadMore}) ---`, 'color: blue; font-weight: bold;');
    console.log('Using Filters FOR QUERY:', {
        approved: filterApproved,
        checkedIn: filterCheckedIn,
        staff: filterStaff,
        billing: filterBillingStatus,
        search: searchTerm
    });
    if (isLoadMore) console.log('Current lastVisible Document ID (from param):', currentLastVisibleDocParam ? currentLastVisibleDocParam.id : null);

    if (!isLoadMore) {
      setLoadingUsers(true);
    } else {
      // isLoadMore が true の場合、hasMore state を直接参照して判断
      if (!hasMore) {
        console.log('fetchUsersWithFilters: No more data to load (hasMore is false). Aborting.');
        setLoadingMore(false);
        return;
      }
      setLoadingMore(true);
    }

    try {
      const usersCollectionRef = collection(db, 'users');
      let qry = query(usersCollectionRef);
      let appliedFirestoreFiltersInfo: string[] = [];

      if (filterApproved !== null) {
        qry = query(qry, where('approved', '==', filterApproved));
        appliedFirestoreFiltersInfo.push(`approved == ${filterApproved}`);
      }
      if (filterCheckedIn !== null) {
        qry = query(qry, where('isCheckedIn', '==', filterCheckedIn));
        appliedFirestoreFiltersInfo.push(`isCheckedIn == ${filterCheckedIn}`);
      }
      let applyClientSideStaffFilter = false;
      if (filterStaff === true) {
          qry = query(qry, where('isStaff', '==', true));
          appliedFirestoreFiltersInfo.push('isStaff == true');
      } else if (filterStaff === false) {
          applyClientSideStaffFilter = true;
      }

      if (filterBillingStatus === 'pendingPayment') {
        qry = query(qry, where('bill', '>', 0));
        appliedFirestoreFiltersInfo.push('bill > 0');
      } else if (filterBillingStatus === 'paid') {
        qry = query(qry, where('bill', '==', 0));
        appliedFirestoreFiltersInfo.push('bill == 0');
      }

      console.log('Applied Firestore Filters:', appliedFirestoreFiltersInfo.join(', ') || 'None (except order/limit)');

      if (filterBillingStatus === 'pendingPayment' || filterBillingStatus === 'paid') {
        qry = query(qry, orderBy('bill'), orderBy('createdAt', 'desc'), limit(usersPerPage));
      } else {
        qry = query(qry, orderBy('createdAt', 'desc'), limit(usersPerPage));
      }

      if (isLoadMore && currentLastVisibleDocParam) {
        qry = query(qry, startAfter(currentLastVisibleDocParam));
      }

      const documentSnapshots = await getDocs(qry);
      console.log('Firestore getDocs result count:', documentSnapshots.docs.length);

      let fetchedUsersFromFirestore: UserWithId[] = documentSnapshots.docs.map(docSnapshot => {
        const data = docSnapshot.data() as UserData;
        return { id: docSnapshot.id, ...data };
      });
      // console.log('Fetched users from Firestore (before client-side search/staff filtering):', fetchedUsersFromFirestore.length);
      // fetchedUsersFromFirestore.forEach(u => console.log(`  FS User: ${u.pokerName}, Approved: ${u.approved}, Bill: ${u.bill}, isStaff: ${u.isStaff}, createdAt: ${u.createdAt?.toDate()}`));

      let usersAfterClientSideFilters = fetchedUsersFromFirestore;
      const searchQueryLower = searchTerm.trim().toLowerCase();
      if (searchQueryLower) {
        usersAfterClientSideFilters = usersAfterClientSideFilters.filter(user =>
          user.pokerName?.toLowerCase().includes(searchQueryLower) ||
          user.email?.toLowerCase().includes(searchQueryLower) ||
          user.fullName?.toLowerCase().includes(searchQueryLower)
        );
      }

      if (applyClientSideStaffFilter) {
          usersAfterClientSideFilters = usersAfterClientSideFilters.filter(user => !(user.isStaff === true));
      }
      console.log('Final users to be set/appended (after ALL filters):', usersAfterClientSideFilters.length);

      if (isLoadMore) {
        setUsers(prev => [...prev, ...usersAfterClientSideFilters]);
      } else {
        setUsers(usersAfterClientSideFilters);
      }

      const newLastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      setLastVisible(newLastVisibleDoc);

      const newHasMore = documentSnapshots.docs.length === usersPerPage;
      setHasMore(newHasMore);

    } catch (err: any) {
      console.error("ユーザーデータの取得に失敗しました (fetchUsersWithFilters):", err);
      setError(`ユーザーデータ取得失敗: ${err.message} (Code: ${err.code || 'N/A'})`);
    } finally {
      setLoadingUsers(false);
      setLoadingMore(false);
      console.log(`%c--- fetchUsersWithFilters FINISHED ---`, 'color: blue; font-weight: bold;');
    }
  // ★★★ useCallback 依存配列から hasMore を削除。usersPerPage は定数なので実質フィルター条件のみに依存 ★★★
  }, [searchTerm, filterApproved, filterCheckedIn, filterStaff, filterBillingStatus, usersPerPage]);


  // フィルター、検索語が変更された場合にデータ取得をトリガー
  useEffect(() => {
    console.log('%cuseEffect [Filters] triggered. Resetting pagination and fetching.', 'color: green;');
    console.log('Filters causing re-fetch:', { searchTerm, filterApproved, filterCheckedIn, filterStaff, filterBillingStatus });
    setLastVisible(null);
    setHasMore(true);
    setUsers([]);
    // fetchUsersWithFilters が再生成されたときにこの useEffect がトリガーされるわけではない。
    // この useEffect はフィルターの state が変わったときに実行される。
    // その際、最新のフィルター state を参照する fetchUsersWithFilters (useCallbackでメモ化されている) を呼び出す。
    fetchUsersWithFilters(false, null);
  }, [searchTerm, filterApproved, filterCheckedIn, filterStaff, filterBillingStatus, fetchUsersWithFilters]); // ★ fetchUsersWithFilters を依存配列に含める


  // アプリコンテキスト（ユーザーログイン状態、管理者権限）の変更を監視
  useEffect(() => {
    console.log('%cuseEffect [AppContext] triggered.', 'color: orange;');
    if (!appContextLoading && currentUser?.isAdmin) {
        console.log('AppContext: Admin user detected. Fetching table data.');
        fetchAllTableDataWithSeats();
        // ユーザーデータの初期取得は上記のフィルター用useEffectが担当する
        // (フィルターの初期値で一度実行されるため)
    } else if (!appContextLoading && (!currentUser || !currentUser.isAdmin)) {
        if (!error && window.location.pathname.startsWith('/admin')) { // 管理者ページにいる場合のみエラー表示
             setError("このページへのアクセス権限がありません。");
        }
        setLoadingTables(false); // テーブル取得は行われない
        setLoadingUsers(false); // ユーザー取得も行われない（または既に完了している）
        setUsers([]); // 権限がない場合はユーザーリストをクリア
    }
  }, [appContextLoading, currentUser, fetchAllTableDataWithSeats, error]); // error を依存配列に追加


  const handleLoadMore = () => {
    console.log('%chandleLoadMore called. Current hasMore:', hasMore, 'Current loadingMore:', loadingMore);
    if (hasMore && !loadingMore) {
      fetchUsersWithFilters(true, lastVisible);
    }
  };

  // (handleApproveUser, handleUnapproveUser, ...その他のハンドラは変更なし)
  const handleApproveUser = async (userId: string) => {
    if (!window.confirm(`ユーザーID: ${userId.substring(0,8)}... のアカウントを承認しますか？`)) return;
    const loadingKey = `approve-${userId}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    setError(null); setSuccessMessage(null);
    try {
      await updateDoc(doc(db, 'users', userId), { approved: true, updatedAt: serverTimestamp() });
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, approved: true, updatedAt: Timestamp.now() } : u));
      if (selectedUserForDetails?.id === userId) {
        setSelectedUserForDetails(prevSelectedUser => prevSelectedUser ? {...prevSelectedUser, approved: true, updatedAt: Timestamp.now()} : null);
      }
      setSuccessMessage('アカウントを承認しました。');
    } catch (e: any) {
      console.error("アカウント承認失敗:", e);
      setError(`承認処理に失敗: ${e.message}`);
    }
    finally { setActionLoading(prev => ({ ...prev, [loadingKey]: false }));}
  };

  const handleUnapproveUser = async (userId: string) => {
     if (!window.confirm(`ユーザーID: ${userId.substring(0,8)}... のアカウントの承認を取り消しますか？`)) return;
    const loadingKey = `unapprove-${userId}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    setError(null); setSuccessMessage(null);
    try {
      await updateDoc(doc(db, 'users', userId), { approved: false, updatedAt: serverTimestamp() });
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, approved: false, updatedAt: Timestamp.now() } : u));
      if (selectedUserForDetails?.id === userId) {
        setSelectedUserForDetails(prevSelectedUser => prevSelectedUser ? {...prevSelectedUser, approved: false, updatedAt: Timestamp.now()} : null);
      }
      setSuccessMessage('アカウントの承認を取り消しました。');
    } catch (e: any) {
      console.error("アカウント承認取消失敗:", e);
      setError(`承認取消処理に失敗: ${e.message}`);
    }
    finally { setActionLoading(prev => ({ ...prev, [loadingKey]: false }));}
  };

  const handleRowClick = (user: UserWithId) => {
      const userForModal: UserWithId = { ...user, isAdminClientSide: user.id === currentUser?.uid ? currentUser?.isAdmin : undefined };
      setSelectedUserForDetails(userForModal);
      setIsUserDetailsModalOpen(true);
  };
  const handleCloseUserDetailsModal = () => {
    setIsUserDetailsModalOpen(false);
    setSelectedUserForDetails(null);
    console.log('UserDetailsModal closed. Resetting pagination and fetching user list.');
    setLastVisible(null);
    setHasMore(true);
    setUsers([]);
    fetchUsersWithFilters(false, null);
  };

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
    if (!targetUser?.id) {
        alert("エラー: 対象ユーザー情報が不完全です。");
        return;
    }
    const loadingKeyForSeatAction = `seat-${targetUser.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKeyForSeatAction]: true }));
    setError(null); setSuccessMessage(null);

    try {
      const functions = getFunctions(undefined, 'asia-northeast1');
      const checkInFn = httpsCallable<
          { userId: string; tableId: string; seatNumber: number; amountToPlay: number; },
          { status: string; message: string; }
      >(functions, 'checkInUserWithChips');

      const result = await checkInFn({
          userId: targetUser.id,
          tableId: newTableId,
          seatNumber: newSeatNumber,
          amountToPlay: amountToPlayInput ?? 0,
      });

      if (result.data.status === 'success') {
          setSuccessMessage(result.data.message || `${targetUser.pokerName || targetUser.email} さんを着席/チェックインさせました。`);
          fetchUsersWithFilters(false, null);
          fetchAllTableDataWithSeats();
          if (refreshCurrentUser) await refreshCurrentUser();
      } else {
          throw new Error(result.data.message || "着席処理でエラーが発生しました。");
      }
    } catch (e: any) {
        console.error("着席/テーブル移動エラー (AdminUserManagementPage):", e);
        setError(`着席/テーブル移動処理に失敗: ${e.message}`);
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
    if (!userForChipSettlement?.id || !userForChipSettlement.currentTableId || typeof userForChipSettlement.currentSeatNumber !== 'number') {
      alert("精算対象のユーザー、テーブルID、または座席番号の情報が不完全です。");
      setIsSubmittingSettlement(false);
      if(userForChipSettlement?.id) {
          setActionLoading(prev => ({ ...prev, [`settle-${userForChipSettlement!.id}`]: false }));
      }
      return;
    }
    if (!currentUser?.uid) {
        alert("エラー: 操作を実行するユーザー情報が取得できませんでした。");
        setIsSubmittingSettlement(false);
        setActionLoading(prev => ({ ...prev, [`settle-${userForChipSettlement.id}`]: false }));
        return;
    }

    setIsSubmittingSettlement(true);
    const loadingKey = `settle-${userForChipSettlement.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    setError(null); setSuccessMessage(null);

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
      if (result?.data?.status === 'success') {
        setSuccessMessage(result.data.message || "チップ精算リクエストをユーザー確認待ちにしました。");
        setIsChipSettlementModalOpen(false);
        setUserForChipSettlement(null);
        fetchUsersWithFilters(false, null);
        if (refreshCurrentUser) await refreshCurrentUser();
      } else {
        console.error("チップ精算開始処理エラー (Function Response):", result.data);
        throw new Error(result?.data?.message || "チップ精算開始処理でサーバーがエラーを返しました。");
      }
    } catch (e: any) {
      console.error("チップ精算開始エラー (AdminUserManagementPage):", e);
      setError(`チップ精算の開始に失敗: ${e.message} (Code: ${e.code || 'N/A'})`);
    } finally {
      setIsSubmittingSettlement(false);
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  useEffect(() => {
    const messageElement = document.getElementById('admin-page-message');
    if (!messageElement) return;

    if (successMessage) {
      messageElement.textContent = successMessage;
      messageElement.className = 'p-3 mb-4 rounded-md text-white font-semibold bg-green-500 transition-opacity duration-300 opacity-100';
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        if (messageElement) messageElement.className += ' opacity-0 hidden';
      }, 3000);
      return () => clearTimeout(timer);
    } else if (error) {
      messageElement.textContent = error;
      messageElement.className = 'p-3 mb-4 rounded-md text-white font-semibold bg-red-700 transition-opacity duration-300 opacity-100';
      const timer = setTimeout(() => {
        // setError(null);
        if (messageElement) messageElement.className += ' opacity-0 hidden';
      }, 7000);
      return () => clearTimeout(timer);
    } else {
      messageElement.className = 'hidden opacity-0';
    }
  }, [successMessage, error]);

  const filteredUsers = useMemo(() => {
    const usersArray = users || [];
    let tempUsers = usersArray;

    const term = searchTerm.toLowerCase();
    if (term) {
      tempUsers = tempUsers.filter(user =>
        user.pokerName?.toLowerCase().includes(term) ||
        user.fullName?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term)
      );
    }
    return tempUsers;
  }, [users, searchTerm]);

  const unapprovedUserCount = useMemo(() => (users || []).filter(user => !user.approved).length, [users]);

  // useEffect(() => {
  //   console.log("AppContext Loading:", appContextLoading);
  //   console.log("Current Admin User:", currentUser?.email, "Is Admin:", currentUser?.isAdmin);
  // }, [appContextLoading, currentUser]);

  useEffect(() => {
    console.log("Users state updated (length):", users.length);
  }, [users]);

  useEffect(() => {
    console.log("FilteredUsers updated (length):", filteredUsers.length);
  }, [filteredUsers]);

  // useEffect(() => {
  //   console.log("Loading/Error states:", { loadingUsers, error, loadingTables });
  // }, [loadingUsers, error, loadingTables]);


  if (appContextLoading) {
    return <AdminLayout><div className="p-10 text-center text-xl text-neutral-lightest">アプリ情報読込中...</div></AdminLayout>;
  }
  if (!currentUser || !currentUser.isAdmin) {
    return (
      <AdminLayout>
        <div className="p-10 text-center text-xl text-yellow-500">
          {error || "このページへのアクセス権限がありません。"}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
        <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
          <h1 className="text-3xl font-bold text-red-500">ユーザー管理</h1>
          <Link to="/admin" className="text-sm text-sky-400 hover:underline">← 管理ダッシュボードへ</Link>
        </div>

        <div id="admin-page-message" className="hidden opacity-0 transition-opacity duration-300 ease-in-out"></div>

        <div className="mb-6 p-4 bg-slate-800 rounded-lg shadow">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
              <div>
                <label htmlFor="userSearchTerm" className="block text-sm font-medium text-slate-300 mb-1">検索:</label>
                <div className="relative">
                    <input type="text" id="userSearchTerm" placeholder="名前, メール等" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 pl-10 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10" />
                    <AiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
                    {searchTerm && (<AiOutlineCloseCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 cursor-pointer hover:text-neutral-200" size={20} onClick={() => setSearchTerm('')}/> )}
                </div>
              </div>
              <div>
                <label htmlFor="userFilterApproved" className="block text-sm font-medium text-slate-300 mb-1">承認状態:</label>
                <select id="userFilterApproved" value={filterApproved === null ? 'all' : String(filterApproved)} onChange={(e) => { const val = e.target.value; setFilterApproved(val === 'all' ? null : val === 'true');}} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10">
                    <option value="all">すべて</option><option value="true">承認済み</option><option value="false">未承認</option>
                </select>
              </div>
              <div>
                <label htmlFor="userFilterCheckedIn" className="block text-sm font-medium text-slate-300 mb-1">チェックイン状態:</label>
                <select id="userFilterCheckedIn" value={filterCheckedIn === null ? 'all' : String(filterCheckedIn)} onChange={(e) => { const val = e.target.value; setFilterCheckedIn(val === 'all' ? null : val === 'true');}} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10">
                    <option value="all">すべて</option><option value="true">チェックイン中</option><option value="false">チェックアウト済</option>
                </select>
              </div>
              <div>
                <label htmlFor="userFilterStaff" className="block text-sm font-medium text-slate-300 mb-1">権限:</label>
                <select id="userFilterStaff" value={filterStaff === null ? 'all' : String(filterStaff)} onChange={(e) => { const val = e.target.value; setFilterStaff(val === 'all' ? null : val === 'true');}} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10">
                    <option value="all">すべて</option><option value="true">スタッフ</option><option value="false">一般</option>
                </select>
              </div>
              <div>
                <label htmlFor="userFilterBillingStatus" className="block text-sm font-medium text-slate-300 mb-1">会計状態:</label>
                <select
                  id="userFilterBillingStatus"
                  className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10"
                  value={filterBillingStatus}
                  onChange={(e) => {
                    setFilterBillingStatus(e.target.value as BillingStatusFilter);
                  }}
                >
                  <option value="all">全て</option>
                  <option value="pendingPayment">会計前 (残高あり)</option>
                  <option value="paid">会計済み (残高0)</option>
                </select>
              </div>
          </div>
          {unapprovedUserCount > 0 && filterApproved !== false && ( <div className="mt-4 p-3 bg-yellow-700/50 text-yellow-200 rounded-md text-sm"><p>現在、{unapprovedUserCount}人の未承認ユーザーがいます。<button onClick={() => setFilterApproved(false)} className="ml-2 underline hover:text-yellow-100 font-semibold">未承認ユーザー表示</button></p></div>)}
        </div>

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
                      <th className="px-3 py-3 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">会計残高</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider min-w-[150px]">アクション</th>
                  </tr>
              </thead>
              <tbody className="bg-slate-800 divide-y divide-slate-700">
                {(loadingUsers && users.length === 0) ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400"><AiOutlineLoading className="inline-block animate-spin mr-2" />ユーザー一覧を読み込み中...</td></tr>
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
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-yellow-400 text-right">¥{(user.bill ?? 0).toLocaleString()}</td>
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
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">表示条件に該当するユーザーがいません。</td></tr>
                )}
              </tbody>
            </table>
        </div>

         {!loadingUsers && !loadingMore && hasMore && users.length > 0 && (
          <div className="text-center mt-6">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200"
            >
              {loadingMore ? (<><AiOutlineLoading className="inline-block animate-spin mr-2" />読み込み中...</>) : 'さらに読み込む'}
            </button>
          </div>
        )}
        {loadingMore && (
            <div className="text-center mt-6">
                <AiOutlineLoading className="inline-block animate-spin mr-2" size={18} />
                読み込み中...
            </div>
        )}

        {selectedUserForDetails && (
          <UserDetailsModal
            user={selectedUserForDetails}
            isOpen={isUserDetailsModalOpen}
            onClose={handleCloseUserDetailsModal}
            onApprove={handleApproveUser}
            onUnapprove={handleUnapproveUser}
            onUserUpdateSuccess={setSuccessMessage}
            onUserUpdateError={setError}
            onBalanceResetSuccess={(userId, newBill) => {
              setSuccessMessage(`ユーザー (ID: ${userId.substring(0,6)}...) の会計残高を ¥${newBill.toLocaleString()} にリセットしました。`);
              setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, bill: newBill, updatedAt: Timestamp.now() } : u));
              if (selectedUserForDetails && selectedUserForDetails.id === userId) {
                setSelectedUserForDetails(prev => prev ? { ...prev, bill: newBill, updatedAt: Timestamp.now() } : null);
              }
            }}
            onBalanceResetError={setError}
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
            isSubmitting={isSubmittingSettlement || !!actionLoading[`settle-${userForChipSettlement.id}`]}
          />
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUserManagementPage;