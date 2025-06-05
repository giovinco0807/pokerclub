// src/pages/AdminConsoleView.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db, storage } from '../services/firebase';
import {
  collection, getDocs, doc, updateDoc, query, orderBy, serverTimestamp, Timestamp,
  addDoc, deleteDoc, writeBatch
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAppContext } from '../contexts/AppContext';
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';

// 型定義とコンポーネントのインポートパスは実際のプロジェクト構造に合わせてください
import UserDetailsModal, { StatusBadge } from '../components/admin/UserDetailsModal';
import { getAllDrinkMenuItems, addDrinkMenuItem, updateDrinkMenuItem, deleteDrinkMenuItem } from '../services/menuService';
import DrinkMenuForm, { DrinkMenuFormDataWithFile } from '../components/admin/DrinkMenuForm';
import { UserData,UserWithId,DrinkMenuItem,ChipPurchaseOption,Category,Table, Seat, TableData, SeatData, WaitingListEntry } from '../types'; // WaitingListEntry をインポート
import { getAllTables, createTableWithSeats, updateTable, deleteTable, getSeatsForTable } from '../services/tableService';
import TableEditForm, { TableFormData } from '../components/admin/TableEditForm';
import SeatSelectionModal from '../components/admin/SeatSelectionModal';
import { SetAdminClaimResponse } from '../types';

interface AdminDashboardLinkProps {
  to: string;
  title: string;
  description: string;
  color: 'red' | 'amber' | 'lime' | 'cyan' | 'purple' | 'sky' | 'slate';
}


type UserListViewMode = 'checkedIn' | 'unapproved' | 'all';

const AdminConsoleView: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  // User Management States
  const [users, setUsers] = useState<UserWithId[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<UserListViewMode>('checkedIn');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithId | null>(null);

  // Admin Grant States
  const [targetEmailForAdmin, setTargetEmailForAdmin] = useState('');
  const [adminSetMessage, setAdminSetMessage] = useState('');
  const [adminSetError, setAdminSetError] = useState('');
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const [isAdminGrantSectionOpen, setIsAdminGrantSectionOpen] = useState(false);

  // Drink Menu States
  const [drinkMenuItems, setDrinkMenuItems] = useState<DrinkMenuItem[]>([]);
  const [loadingDrinks, setLoadingDrinks] = useState(true);
  const [editingDrinkItem, setEditingDrinkItem] = useState<DrinkMenuItem | null>(null);
  const [isDrinkFormSubmitting, setIsDrinkFormSubmitting] = useState(false);
  const [isDrinkMenuSectionOpen, setIsDrinkMenuSectionOpen] = useState(false);

  // Table Management States
  const [tables, setTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [editingTable, setEditingTable] = useState<(TableData & { id?: string }) | null>(null);
  const [isTableFormSubmitting, setIsTableFormSubmitting] = useState(false);
  const [isTableManagementSectionOpen, setIsTableManagementSectionOpen] = useState(false);

  // --- Data Fetching ---
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true); setError(null);
    try {
      const usersCollectionRef = collection(db, 'users');
      const q = query(usersCollectionRef, orderBy('email'));
      const querySnapshot = await getDocs(q);
      const usersList = querySnapshot.docs.map(docSnapshot => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as UserData),
      } as UserWithId));
      setUsers(usersList);
    } catch (err: any) { setError(`ユーザー一覧取得失敗: ${err.message}`);
    } finally { setLoadingUsers(false); }
  }, []);

  const fetchDrinkMenuItems = useCallback(async () => {
    setLoadingDrinks(true);
    try {
      const items = await getAllDrinkMenuItems();
      setDrinkMenuItems(items);
    } catch (err: any) { setError(`ドリンクメニュー取得失敗: ${err.message}`);
    } finally { setLoadingDrinks(false); }
  }, []);

  const fetchAllTableDataWithSeats = useCallback(async () => {
    setLoadingTables(true); setError(null);
    try {
      const tablesSnapshot = await getDocs(query(collection(db, 'tables'), orderBy('name')));
      const tablesDataPromises = tablesSnapshot.docs.map(async (tableDoc) => {
        const tableData = { id: tableDoc.id, ...(tableDoc.data() as TableData) };
        const seats = await getSeatsForTable(tableDoc.id);
        return { ...tableData, seats };
      });
      const resolvedTables = await Promise.all(tablesDataPromises);
      setTables(resolvedTables);
    } catch (err: any) { setError(`テーブルデータ取得失敗: ${err.message}`);
    } finally { setLoadingTables(false); }
  }, []);

  useEffect(() => {
    if (!appContextLoading && currentUser && currentUser.isAdmin) {
      fetchUsers();
      fetchDrinkMenuItems();
      fetchAllTableDataWithSeats();
    } else if (!appContextLoading && currentUser && !currentUser.isAdmin) {
      setError("アクセス権限がありません。"); setLoadingUsers(false); setLoadingDrinks(false); setLoadingTables(false);
    } else if (!appContextLoading && !currentUser) {
      setError("ログインしていません。"); setLoadingUsers(false); setLoadingDrinks(false); setLoadingTables(false);
    }
  }, [appContextLoading, currentUser, fetchUsers, fetchDrinkMenuItems, fetchAllTableDataWithSeats]);

  // --- User Management Handlers ---
  const handleApproveUser = async (userId: string) => {
    if (!window.confirm(`ユーザーID: ${userId}\nアカウントを承認しますか？`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { approved: true });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: true } : u));
      alert('アカウントを承認しました。');
    } catch (e: any) { alert(`承認失敗: ${e.message}`); }
  };

  const handleUnapproveUser = async (userId: string) => {
    if (!window.confirm(`ユーザーID: ${userId}\nアカウントの承認を取り消しますか？`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { approved: false });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: false } : u));
      alert('承認を取り消しました。');
    } catch (e: any) { alert(`承認取消失敗: ${e.message}`); }
  };

  const handleAdminCheckIn = async (user: UserWithId) => {
    const confirmName = user.pokerName || user.fullName || user.email;
    if (!window.confirm(`${confirmName} さんをチェックインしますか？`)) return;
    try {
      await updateDoc(doc(db, 'users', user.id), { isCheckedIn: true, checkedInAt: serverTimestamp() });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isCheckedIn: true, checkedInAt: new Date() } : u));
      alert(`${confirmName} さんをチェックインしました。`);
    } catch (e: any) { alert(`チェックイン失敗: ${e.message}`); }
  };

  const handleAdminCheckOut = async (user: UserWithId) => {
    const confirmName = user.pokerName || user.fullName || user.email;
    if (!window.confirm(`${confirmName} さんをチェックアウトしますか？`)) return;
    try {
      await updateDoc(doc(db, 'users', user.id), { isCheckedIn: false, checkedOutAt: serverTimestamp() });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isCheckedIn: false, checkedOutAt: new Date() } : u));
      alert(`${confirmName} さんをチェックアウトしました。`);
    } catch (e: any) { alert(`チェックアウト失敗: ${e.message}`); }
  };

  const handleRowClick = (user: UserWithId) => {
    const userForModal: UserWithId = {
      ...user,
      isAdminClientSide: user.id === currentUser?.uid ? currentUser?.isAdmin : undefined,
    };
    setSelectedUser(userForModal);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedUser(null); };

  // --- Admin Grant Handlers ---
  const handleSetUserAsAdmin = async () => {
    if (!targetEmailForAdmin.trim()) { setAdminSetError('対象のメールアドレスを入力してください。'); return; }
    if (!currentUser?.isAdmin) { setAdminSetError('この操作を実行する権限がありません。'); return; }
    setIsSubmittingAdmin(true); setAdminSetMessage(''); setAdminSetError('');
    try {
      const setAdminClaimFunction = httpsCallable< { email: string }, SetAdminClaimResponse>(getFunctions(), 'setAdminClaim');
      const result = await setAdminClaimFunction({ email: targetEmailForAdmin });
      setAdminSetMessage(result.data.message); setTargetEmailForAdmin('');
    } catch (err: any) {
      setAdminSetError(err.message || '管理者権限の付与に失敗しました。');
    } finally { setIsSubmittingAdmin(false); }
  };

  // --- Drink Menu Handlers ---
  const handleDrinkMenuFormSubmit = async (formData: DrinkMenuFormDataWithFile, imageToUpload?: File ) => {
    setIsDrinkFormSubmitting(true);
    let newImageUrl = editingDrinkItem?.imageUrl || '';
    try {
      if (imageToUpload) {
        if (editingDrinkItem && editingDrinkItem.imageUrl && editingDrinkItem.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
          try {
            const oldImageStorageRef = storageRef(storage, editingDrinkItem.imageUrl);
            await deleteObject(oldImageStorageRef);
          } catch (deleteError: any) { console.warn("古い画像の削除に失敗(無視):", deleteError); }
        }
        const imageFileName = `drink_${Date.now()}_${imageToUpload.name}`;
        const newImageStorageRef = storageRef(storage, `drinkMenuItemsImages/${imageFileName}`);
        const uploadTask = await uploadBytes(newImageStorageRef, imageToUpload);
        newImageUrl = await getDownloadURL(uploadTask.ref);
      }
      const dataToSave: Omit<DrinkMenuItem, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name, category: formData.category, price: formData.price,
        description: formData.description || '', imageUrl: newImageUrl,
        isAvailable: formData.isAvailable, sortOrder: Number(formData.sortOrder) || undefined,
      };
      if (editingDrinkItem && editingDrinkItem.id) {
        await updateDrinkMenuItem(editingDrinkItem.id, dataToSave);
        alert('ドリンクメニューを更新しました。');
      } else {
        await addDrinkMenuItem(dataToSave);
        alert('ドリンクメニューを追加しました。');
      }
      setEditingDrinkItem(null); fetchDrinkMenuItems();
    } catch (error: any) {
      alert(`処理に失敗しました: ${error.message}`);
    } finally { setIsDrinkFormSubmitting(false); }
  };

  const handleDeleteDrinkItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`「${itemName}」を削除しますか？`)) return;
    try {
      const itemToDelete = drinkMenuItems.find(item => item.id === itemId);
      if (itemToDelete && itemToDelete.imageUrl && itemToDelete.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
        try {
          const imageStorageRef = storageRef(storage, itemToDelete.imageUrl);
          await deleteObject(imageStorageRef);
        } catch (imageDeleteError: any) { console.warn("関連画像の削除に失敗(無視):", imageDeleteError); }
      }
      await deleteDrinkMenuItem(itemId);
      alert(`「${itemName}」を削除しました。`); fetchDrinkMenuItems();
    } catch (e: any) { alert(`削除失敗: ${e.message}`); }
  };

  // --- Table Management Handlers ---
  const handleTableFormSubmit = async (data: TableFormData) => {
    setIsTableFormSubmitting(true);
    try {
      if (editingTable && editingTable.id) {
        const { maxSeats, ...updateData } = data;
        await updateTable(editingTable.id, updateData);
        alert('テーブル情報を更新しました。');
      } else {
        const tableDataToCreate: TableData = {
            name: data.name, maxSeats: data.maxSeats,
            status: data.status || 'active', gameType: data.gameType || '',
        };
        await createTableWithSeats(tableDataToCreate, data.maxSeats);
        alert('新しいテーブルを作成しました。');
      }
      setEditingTable(null); fetchAllTableDataWithSeats();
    } catch (err: any) { alert(`テーブル保存失敗: ${err.message}`);
    } finally { setIsTableFormSubmitting(false); }
  };

  const handleDeleteTable = async (tableId: string, tableName: string) => {
    if (!window.confirm(`テーブル「${tableName}」を削除しますか？関連座席は自動削除されません(要Functions)。`)) return;
    try { await deleteTable(tableId); alert(`テーブル「${tableName}」を削除しました。`); fetchAllTableDataWithSeats();
    } catch (err: any) { alert(`テーブル削除失敗: ${err.message}`); }
  };

  // --- Memoized Filters ---
  const filteredUsers = useMemo(() => {
    return users
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

  const unapprovedUserCount = useMemo(() => users.filter(user => !user.approved).length, [users]);


  // --- Render Logic ---
  if (appContextLoading) { return <div className="text-center p-10">アプリ情報読込中...</div>; }
  if (!currentUser || !currentUser.isAdmin) { return <div className="text-center p-10 text-yellow-500">{error || "アクセス権限なし"}</div>; }
  if (loadingUsers || loadingDrinks || loadingTables) { return <div className="text-center p-10">データ読込中...</div>; }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 bg-slate-900 text-neutral-lightest rounded-lg shadow-xl min-h-[calc(100vh-200px)]">
      <h1 className="text-3xl font-bold text-red-500 mb-6 border-b border-slate-700 pb-3">管理コンソール</h1>

      {/* 管理者権限付与セクション */}
      <div className="mb-8">
        <button onClick={() => setIsAdminGrantSectionOpen(!isAdminGrantSectionOpen)} className="w-full flex justify-between items-center text-left px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg shadow focus:outline-none transition-colors duration-150">
          <h2 className="text-xl font-semibold text-red-400">管理者権限の操作</h2>
          <span className={`transform transition-transform duration-200 ${isAdminGrantSectionOpen ? 'rotate-180' : 'rotate-0'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></span>
        </button>
        {isAdminGrantSectionOpen && (
          <section className="mt-1 p-6 bg-slate-800 rounded-b-lg shadow">
            <div className="space-y-3">
              <div><label htmlFor="targetAdminEmail" className="block text-sm font-medium text-slate-300 mb-1">対象メールアドレス:</label><input type="email" id="targetAdminEmail" value={targetEmailForAdmin} onChange={(e) => setTargetEmailForAdmin(e.target.value)} placeholder="user@example.com" className="w-full sm:w-2/3 p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500" disabled={isSubmittingAdmin} /></div>
              <button onClick={handleSetUserAsAdmin} disabled={isSubmittingAdmin} className={`px-4 py-2 font-semibold rounded h-10 transition-colors ${isSubmittingAdmin ? 'bg-slate-500 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}>{isSubmittingAdmin ? '処理中...' : '管理者に設定'}</button>
              {adminSetMessage && <p className="mt-2 text-sm text-green-400 bg-green-900/30 p-2 rounded">{adminSetMessage}</p>}
              {adminSetError && <p className="mt-2 text-sm text-yellow-400 bg-yellow-900/30 p-2 rounded">{adminSetError}</p>}
            </div>
          </section>
        )}
      </div>

      {/* ドリンクメニュー管理セクション */}
      <div className="my-8">
        <button onClick={() => setIsDrinkMenuSectionOpen(!isDrinkMenuSectionOpen)} className="w-full flex justify-between items-center text-left px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg shadow focus:outline-none transition-colors duration-150 mb-1">
          <h2 className="text-2xl font-semibold text-amber-400">ドリンクメニュー管理</h2>
          <span className={`transform transition-transform duration-200 ${isDrinkMenuSectionOpen ? 'rotate-180' : 'rotate-0'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></span>
        </button>
        {isDrinkMenuSectionOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-800 rounded-b-lg shadow">
            <div className="md:col-span-1">
              <h3 className="text-xl font-semibold text-amber-300 mb-3">{editingDrinkItem ? 'メニュー編集' : '新規メニュー追加'}</h3>
              <DrinkMenuForm onSubmitForm={handleDrinkMenuFormSubmit} initialData={editingDrinkItem} isSubmitting={isDrinkFormSubmitting} key={editingDrinkItem ? editingDrinkItem.id : 'new-drink'} />
              {editingDrinkItem && (<button onClick={() => setEditingDrinkItem(null)} className="mt-3 text-sm text-sky-400 hover:underline">新規追加モードに戻る</button>)}
            </div>
            <div className="md:col-span-2">
              <h3 className="text-xl font-semibold text-amber-300 mb-3">登録済みメニュー</h3>
              {loadingDrinks ? (<p className="text-slate-400">読み込み中...</p>) : drinkMenuItems.length === 0 ? (<p className="text-slate-400">登録メニューなし</p>) : (
                <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                  {drinkMenuItems.map(item => (
                    <li key={item.id} className="p-3 bg-slate-700 rounded flex justify-between items-center text-sm">
                      <div className="flex items-center space-x-3 flex-grow min-w-0">
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-12 h-12 object-cover rounded flex-shrink-0" />}
                        <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{item.name} <span className="text-xs text-slate-400">({item.category})</span></p>
                            <p className="text-slate-300">{item.price.toLocaleString()}円 - {item.isAvailable ? <StatusBadge color="green" text="提供中"/> : <StatusBadge color="slate" text="停止中"/>}</p>
                            {item.description && <p className="text-xs text-slate-400 mt-1 truncate">{item.description}</p>}
                        </div>
                      </div>
                      <div className="space-x-2 flex-shrink-0 ml-2">
                        <button onClick={() => setEditingDrinkItem(item)} className="text-sky-400 hover:underline text-xs">編集</button>
                        <button onClick={() => item.id && handleDeleteDrinkItem(item.id, item.name)} className="text-red-400 hover:underline text-xs">削除</button>
                      </div>
                    </li>))}
                </ul>)}
            </div>
          </div>)}
      </div>

      {/* テーブル管理セクション */}
      <div className="my-8">
        <button
          onClick={() => setIsTableManagementSectionOpen(!isTableManagementSectionOpen)}
          className="w-full flex justify-between items-center text-left px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg shadow focus:outline-none transition-colors duration-150 mb-1"
        >
          <h2 className="text-2xl font-semibold text-lime-400">テーブル管理</h2>
          <span className={`transform transition-transform duration-200 ${isTableManagementSectionOpen ? 'rotate-180' : 'rotate-0'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </span>
        </button>
        {isTableManagementSectionOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-800 rounded-b-lg shadow">
            {/* 左側: テーブル追加/編集フォーム */}
            <div className="md:col-span-1">
              <h3 className="text-xl font-semibold text-lime-300 mb-3">
                {editingTable ? 'テーブル編集' : '新規テーブル作成'}
              </h3>
              <TableEditForm
                onSubmitForm={handleTableFormSubmit}
                initialData={editingTable || undefined}
                isSubmitting={isTableFormSubmitting}
                onCancel={editingTable ? () => setEditingTable(null) : undefined}
                key={editingTable ? editingTable.id : 'new-table'} // フォームリセット用
              />
            </div>

            {/* 右側: 登録済みテーブル一覧 */}
            <div className="md:col-span-2">
              <h3 className="text-xl font-semibold text-lime-300 mb-3">登録済みテーブル</h3>
              {loadingTables ? (
                <p className="text-slate-400">テーブル情報を読み込み中...</p>
              ) : tables.length === 0 ? (
                <p className="text-slate-400">登録されているテーブルはありません。</p>
              ) : (
                <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                  {tables.map(table => (
                    <li key={table.id} className="p-3 bg-slate-700 rounded flex justify-between items-center text-sm hover:bg-slate-600/50 transition-colors">
                      <div className="flex-grow min-w-0"> {/* テキストの省略のため */}
                        <p className="font-semibold text-white truncate">{table.name} ({table.maxSeats}席)</p>
                        <p className="text-slate-300 truncate">
                          状態: <span className={`font-medium ${table.status === 'active' ? 'text-green-400' : table.status === 'full' ? 'text-red-400' : 'text-slate-400'}`}>{table.status || 'N/A'}</span>
                          <span className="mx-1">|</span>
                          ゲーム: {table.gameType || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-400">
                          空席: {table.seats ? table.maxSeats - table.seats.filter(s => s.userId).length : 'N/A'} / {table.maxSeats}
                          <span className="ml-2" title={`Table ID: ${table.id}`}>ID: {table.id.substring(0,6)}...</span>
                        </p>
                      </div>
                      <div className="space-x-2 flex-shrink-0 ml-2">
                        <button
                          onClick={() => setEditingTable(table)}
                          className="text-sky-400 hover:text-sky-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-600"
                          title="編集"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteTable(table.id, table.name)}
                          className="text-red-400 hover:text-red-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-600"
                          title="削除"
                        >
                          削除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      {/* ユーザー管理セクション */}
      <div className="mb-1"><h2 className="text-2xl font-semibold text-red-400 px-6 py-3 bg-slate-800 rounded-t-lg shadow">ユーザー管理</h2></div>
      <div className="mb-6 p-4 bg-slate-800 rounded-b-lg shadow"> {/* フィルタセクション */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div><label htmlFor="viewMode" className="block text-sm font-medium text-slate-300 mb-1">表示モード:</label><select id="viewMode" value={viewMode} onChange={(e) => setViewMode(e.target.value as UserListViewMode)} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10"><option value="checkedIn">チェックイン中</option><option value="unapproved">未承認</option><option value="all">全ユーザー</option></select></div>
            <div><label htmlFor="searchTerm" className="block text-sm font-medium text-slate-300 mb-1">検索:</label><input type="text" id="searchTerm" placeholder="名前, メール等" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10" /></div>
            <div><label htmlFor="filterApproved" className="block text-sm font-medium text-slate-300 mb-1">承認状態:</label><select id="filterApproved" value={filterApproved === null ? 'all' : String(filterApproved)} onChange={(e) => { const val = e.target.value; setFilterApproved(val === 'all' ? null : val === 'true');}} className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 h-10"><option value="all">すべて</option><option value="true">承認済み</option><option value="false">未承認</option></select></div>
            <button onClick={fetchUsers} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded h-10" title="ユーザーリスト再読み込み">再読込</button>
        </div>
        {unapprovedUserCount > 0 && viewMode !== 'unapproved' && ( <div className="mt-4 p-3 bg-yellow-700/50 text-yellow-200 rounded-md text-sm"><p>現在、{unapprovedUserCount}人の未承認ユーザーがいます。<button onClick={() => setViewMode('unapproved')} className="ml-2 underline hover:text-yellow-100 font-semibold">未承認ユーザー表示</button></p></div>)}
      </div>

      {(error && !(loadingUsers || loadingDrinks || loadingTables)) && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md">{error}</div>} {/* エラーはローディング完了後に表示 */}

      <div className="overflow-x-auto bg-slate-800 rounded-lg shadow">
        {loadingUsers ? (<div className="p-10 text-center">ユーザー一覧を読み込み中...</div>) : (
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-700"><tr><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">ID</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">ポーカーネーム</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">氏名</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">承認</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">チェックイン</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">チップ</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">アクション</th></tr></thead>
            <tbody className="bg-slate-800 divide-y divide-slate-700">
              {filteredUsers.length > 0 ? (filteredUsers.map((user) => (<tr key={user.id} className="hover:bg-slate-700/50 transition-colors cursor-pointer" onClick={() => handleRowClick(user)}><td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 font-mono" title={user.id}>{user.id.substring(0, 8)}...</td><td className="px-4 py-3 whitespace-nowrap text-sm text-slate-200">{user.pokerName || '-'}</td><td className="px-4 py-3 whitespace-nowrap text-sm text-slate-200">{user.fullName || '-'}</td><td className="px-4 py-3 whitespace-nowrap text-sm">{user.approved ? <StatusBadge color="green" text="承認済" /> : <StatusBadge color="yellow" text="未承認" />}</td><td className="px-4 py-3 whitespace-nowrap text-sm">{user.isCheckedIn ? <StatusBadge color="sky" text="IN" /> : <StatusBadge color="slate" text="OUT" />}</td><td className="px-4 py-3 whitespace-nowrap text-sm text-slate-200 text-right">{user.chips.toLocaleString()}</td><td className="px-4 py-3 whitespace-nowrap text-sm font-medium space-x-2 flex items-center">{!user.approved && (<button onClick={(e) => { e.stopPropagation(); handleApproveUser(user.id); }} title="承認" className="p-1 text-green-500 hover:text-green-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>)}{user.approved && (user.isCheckedIn ? (<button onClick={(e) => { e.stopPropagation(); handleAdminCheckOut(user); }} title="Out" className="p-1 text-orange-500 hover:text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>) : (<button onClick={(e) => { e.stopPropagation(); handleAdminCheckIn(user); }} title="In" className="p-1 text-sky-500 hover:text-sky-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>))}</td></tr>))) : (<tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">{error && !(users.length > 0) ? "データ取得に失敗しました。" : "表示条件に該当するユーザーがいません。"}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>

      <UserDetailsModal user={selectedUser} isOpen={isModalOpen} onClose={handleCloseModal} />
    </div>
  );
};

export default AdminConsoleView;