// src/pages/AdminTableManagementPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../services/firebase'; // ★ db をインポート
import {
  collection,
  getDocs,     // ★ インポート
  doc,
  updateDoc,
  deleteDoc,
  addDoc,      // createTableWithSeats で使う
  query,       // ★ インポート
  orderBy,     // ★ インポート
  serverTimestamp,
  writeBatch,  // createTableWithSeats で使う
  Timestamp,
  // QueryDocumentSnapshot, DocumentData // 必要であれば
} from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { Table, TableData, Seat } from '../types'; // types.ts からインポート
import { getAllTables, createTableWithSeats, updateTable, deleteTable, getSeatsForTable } from '../services/tableService';
import TableEditForm, { TableFormData } from '../components/admin/TableEditForm';

const AdminTableManagementPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [tables, setTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<(TableData & { id?: string }) | null>(null);
  const [isTableFormSubmitting, setIsTableFormSubmitting] = useState(false);

  const fetchAllTableDataWithSeats = useCallback(async () => {
    console.log("AdminTableMgmtPage: fetchAllTableDataWithSeats CALLED");
    setLoadingTables(true); setError(null);
    try {
      const tablesCollectionRef = collection(db, 'tables'); // db を使用
      const qTables = query(tablesCollectionRef, orderBy('name')); // query, orderBy を使用
      const tablesSnapshot = await getDocs(qTables); // getDocs を使用
      console.log("AdminTableMgmtPage: Fetched tables snapshot. Docs found:", tablesSnapshot.docs.length);
      if (tablesSnapshot.empty) {
        setTables([]); setLoadingTables(false); return;
      }
      const tablesDataPromises = tablesSnapshot.docs.map(async (tableDoc) => { // tableDoc の型は推論されるはず
        const firestoreData = tableDoc.data();
        const seats = await getSeatsForTable(tableDoc.id);
        return {
          ...(firestoreData as Omit<Table, 'id' | 'seats'>),
          id: tableDoc.id,
          seats: seats,
        } as Table;
      });
      const resolvedTables = await Promise.all(tablesDataPromises);
      setTables(resolvedTables);
      console.log("AdminTableMgmtPage: Table and seat data processed.", resolvedTables);
    } catch (err: any) {
      console.error("AdminTableMgmtPage: fetchAllTableDataWithSeats FAILED:", err);
      setError(`テーブルデータ取得失敗: ${err.message}`);
    } finally {
      setLoadingTables(false);
      console.log("AdminTableMgmtPage: fetchAllTableDataWithSeats FINALLY, loadingTables set to false.");
    }
  }, [getSeatsForTable]); // getSeatsForTable を依存配列に追加 (もしこれが外部からpropsで渡される等で変わる場合)
                          // 通常は services からインポートされるので、依存配列は空でも良いことが多い

  useEffect(() => {
    if (!appContextLoading && currentUser && currentUser.isAdmin) {
      fetchAllTableDataWithSeats();
    } else if (!appContextLoading && (!currentUser || !currentUser.isAdmin)) {
      setError("アクセス権限がありません。"); setLoadingTables(false);
    }
  }, [appContextLoading, currentUser, fetchAllTableDataWithSeats]);

  const handleTableFormSubmit = async (data: TableFormData) => {
    setIsTableFormSubmitting(true);
    try {
      if (editingTable && editingTable.id) {
        const { maxSeats, ...updateData } = data;
        await updateTable(editingTable.id, updateData as Partial<TableData>); // キャストを追加
        alert('テーブル情報を更新しました。');
      } else {
        const tableDataToCreate: TableData = {
            name: data.name,
            maxSeats: data.maxSeats,
            status: data.status || 'active',
            gameType: data.gameType || '',
        };
        await createTableWithSeats(tableDataToCreate, data.maxSeats);
        alert('新しいテーブルを作成しました。');
      }
      setEditingTable(null);
      fetchAllTableDataWithSeats();
    } catch (error: any) {
      console.error("テーブルの保存に失敗:", error);
      alert("テーブルの保存に失敗しました。");
    } finally {
      setIsTableFormSubmitting(false);
    }
  };

  const handleDeleteTable = async (tableId: string, tableName: string) => {
    if (!window.confirm(`テーブル「${tableName}」を削除してもよろしいですか？この操作は元に戻せません。関連する座席データは自動では削除されません。`)) return;
    try {
      await deleteTable(tableId);
      alert(`テーブル「${tableName}」を削除しました。`);
      fetchAllTableDataWithSeats();
    } catch (error: any) {
      console.error("テーブルの削除に失敗:", error);
      alert("テーブルの削除に失敗しました。");
    }
  };

  if (appContextLoading) { return <div className="p-10 text-center">アプリ情報読込中...</div>; }
  if (!currentUser || !currentUser.isAdmin) { return <div className="p-10 text-center text-red-500">{error || "アクセス権限なし"}</div>; }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-lime-400">テーブル管理</h1>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">← 管理ダッシュボードへ</Link>
      </div>

      {error && !loadingTables && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md text-center">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-lime-300 mb-4 border-b border-slate-700 pb-2">
            {editingTable ? 'テーブル編集' : '新規テーブル作成'}
          </h3>
          <TableEditForm
            onSubmitForm={handleTableFormSubmit}
            initialData={editingTable || undefined}
            isSubmitting={isTableFormSubmitting}
            onCancel={editingTable ? () => setEditingTable(null) : undefined}
            key={editingTable ? editingTable.id : 'new-table'}
          />
        </div>

        <div className="md:col-span-2">
          <h3 className="text-xl font-semibold text-lime-300 mb-4">登録済みテーブル</h3>
          {loadingTables ? (
            <p className="text-slate-400 py-10 text-center">テーブル情報を読み込み中...</p>
          ) : tables.length === 0 && !error ? ( // エラーがない場合のみ「登録なし」
            <p className="text-slate-400 py-10 text-center">登録されているテーブルはありません。</p>
          ) : !error && tables.length > 0 ? ( // エラーがなくテーブルがある場合
            <ul className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {tables.map(table => (
                <li key={table.id} className="p-4 bg-slate-700 rounded-lg shadow flex justify-between items-start hover:bg-slate-600/50 transition-colors">
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-white text-lg truncate">{table.name} ({table.maxSeats}席)</p>
                    <p className="text-sm text-slate-300 truncate">
                      状態: <span className={`font-medium ${table.status === 'active' ? 'text-green-400' : table.status === 'full' ? 'text-red-400' : 'text-slate-400'}`}>{table.status || 'N/A'}</span>
                      <span className="mx-1 text-slate-500">|</span>
                      ゲーム: {table.gameType || 'N/A'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      空席: {table.seats ? table.maxSeats - table.seats.filter(s => s.userId).length : table.maxSeats} / {table.maxSeats}
                      <span className="ml-2 text-slate-500" title={`Table ID: ${table.id}`}>ID: {table.id.substring(0,6)}...</span>
                    </p>
                  </div>
                  <div className="space-y-1 flex-shrink-0 ml-3 mt-1 text-right">
                    <button onClick={() => setEditingTable(table)} className="block w-full text-sky-400 hover:text-sky-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-600">編集</button>
                    <button onClick={() => handleDeleteTable(table.id, table.name)} className="block w-full text-red-400 hover:text-red-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-600">削除</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null } {/* エラー時はエラーメッセージが表示されるので、ここではnull */}
        </div>
      </div>
    </div>
  );
};

export default AdminTableManagementPage;