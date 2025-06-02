// src/pages/TableStatusPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp,getDocs } from 'firebase/firestore';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
// Table と Seat の型定義は src/types.ts からインポートする想定
import { Table, Seat } from '../types'; // パスを調整してください

const TableStatusPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [tables, setTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTableData = useCallback(() => {
    setLoadingTables(true);
    setError(null);

    const tablesCollectionRef = collection(db, 'tables');
    const qTables = query(tablesCollectionRef, orderBy('name')); // テーブル名でソート

    const unsubscribe = onSnapshot(qTables, async (tablesSnapshot) => {
      const tablesDataPromises = tablesSnapshot.docs.map(async (tableDoc) => {
        const tableData = { id: tableDoc.id, ...tableDoc.data() } as Omit<Table, 'seats'>;
        const seatsCollectionRef = collection(db, 'tables', tableDoc.id, 'seats');
        const seatsQuery = query(seatsCollectionRef, orderBy('seatNumber'));
        const seatsSnapshot = await getDocs(seatsQuery); // onSnapshotではなくgetDocsで一度取得
        const seats = seatsSnapshot.docs.map(seatDoc => ({ id: seatDoc.id, ...seatDoc.data() } as Seat));
        return { ...tableData, seats };
      });
      try {
        const resolvedTablesData = await Promise.all(tablesDataPromises);
        setTables(resolvedTablesData);
      } catch (err: any) {
        console.error("卓状況の座席データ取得エラー:", err);
        setError("座席情報の取得中にエラーが発生しました。");
      } finally {
        setLoadingTables(false);
      }
    }, (err) => {
      console.error("卓状況のテーブルデータ取得エラー:", err);
      setError("テーブル情報の取得に失敗しました。");
      setLoadingTables(false);
    });

    return unsubscribe;
  }, []);


  useEffect(() => {
    if (!appContextLoading && currentUser) { // ログインしていればテーブルデータを取得
        const unsubscribe = fetchTableData();
        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    } else if (!appContextLoading && !currentUser) {
        setError("テーブル状況を見るにはログインしてください。");
        setLoadingTables(false);
    }
  }, [appContextLoading, currentUser, fetchTableData]);


  if (appContextLoading || loadingTables) {
    return <div className="text-center p-10 text-xl text-neutral-lightest">テーブル情報を読み込み中...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-xl text-red-400 bg-red-900/30 rounded-md">{error}</div>;
  }

  if (!currentUser) { // ルートガードがあるはずだが念のため
    return <div className="text-center p-10 text-xl text-yellow-400">ログインが必要です。</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-8 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-sky-400">現在の卓状況</h1>
        <Link to="/" className="text-red-400 hover:text-red-300 hover:underline text-sm">
          ← メインページに戻る
        </Link>
      </div>

      {tables.length === 0 && !loadingTables && (
        <p className="text-slate-400 text-center py-10">現在稼働中のテーブルはありません。</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tables.filter(table => table.status !== 'inactive').map(table => ( // 非アクティブは表示しない例
          <div key={table.id} className="bg-slate-800 p-5 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold text-amber-400 mb-3">{table.name}</h2>
            <p className="text-sm text-slate-400 mb-1">ゲーム: {table.gameType || '未設定'}</p>
            <p className="text-sm text-slate-400 mb-4">状態:
              <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full
                ${table.status === 'active' ? 'bg-green-600 text-green-100' :
                  table.status === 'full' ? 'bg-red-600 text-red-100' : 'bg-slate-600 text-slate-100'}`}>
                {table.status === 'active' ? 'プレイヤー募集中' : table.status === 'full' ? '満席' : table.status || '不明'}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: table.maxSeats || 0 }, (_, i) => i + 1).map(seatNum => {
                const seat = table.seats?.find(s => s.seatNumber === seatNum);
                const isOccupied = seat && seat.userId;
                return (
                  <div
                    key={seatNum}
                    className={`p-3 rounded border h-20 flex flex-col items-center justify-center text-center
                      ${isOccupied ? 'bg-red-700/30 border-red-600' : 'bg-green-700/20 border-green-600'}`}
                    title={isOccupied ? `Seat ${seatNum}: ${seat.userPokerName || '不明'}` : `Seat ${seatNum}: 空席`}
                  >
                    <p className="font-semibold text-lg">S{seatNum}</p>
                    {isOccupied ? (
                      <p className="text-xs text-red-200 truncate w-full">{seat.userPokerName || 'プレイヤー'}</p>
                    ) : (
                      <p className="text-xs text-green-300">(空席)</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableStatusPage;