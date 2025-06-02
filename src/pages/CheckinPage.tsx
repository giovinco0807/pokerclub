// src/pages/CheckinPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { doc, updateDoc, getDoc, getDocs, collection, writeBatch, serverTimestamp, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
// UserData と UserWithId は types.ts からインポートすることを推奨
// ここでは仮にインポートパスを指定
import { UserData, UserWithId,Table,Seat } from '../types'; // あなたの型定義ファイルのパスに合わせてください
import { useAppContext } from '../contexts/AppContext';




const CheckinPage: React.FC = () => {
  const { currentUser: operatorUser, loading: appContextLoading } = useAppContext();
  const [targetUid, setTargetUid] = useState('');
  const [searchedUser, setSearchedUser] = useState<UserWithId | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false); // ユーザー検索時のローディング
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [tables, setTables] = useState<Table[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null);

  // 利用可能なテーブルと各テーブルの座席状況を取得する関数
  const fetchTablesWithSeats = useCallback(async () => {
    setLoadingTables(true);
    setErrorMessage(''); // エラーをリセット
    try {
      const tablesCollectionRef = collection(db, 'tables');
      const qTables = query(tablesCollectionRef, orderBy('name')); // テーブル名でソート
      const tablesSnapshot = await getDocs(qTables);
      console.log("CheckinPage: tablesSnapshot.docs.length:", tablesSnapshot.docs.length);
      if (tablesSnapshot.empty) {
      console.log("CheckinPage: No tables found in snapshot."); // ★ 空の場合のログ
      setTables([]);
      setLoadingTables(false);
      return;
    }
      const tablesDataPromises = tablesSnapshot.docs.map(async (tableDoc) => {
        const tableData = { id: tableDoc.id, ...tableDoc.data() } as Omit<Table, 'seats'>; // seatsを除いた型
        const seatsCollectionRef = collection(db, 'tables', tableDoc.id, 'seats');
        const seatsQuery = query(seatsCollectionRef, orderBy('seatNumber')); // 座席番号でソート
        const seatsSnapshot = await getDocs(seatsQuery);
        const seats = seatsSnapshot.docs.map(seatDoc => ({ id: seatDoc.id, ...seatDoc.data() } as Seat));
        return { ...tableData, seats }; // テーブルデータに座席情報を追加
      });
      const resolvedTablesData = await Promise.all(tablesDataPromises);
      console.log("CheckinPage: resolvedTablesData:", resolvedTablesData); // ★ 解決後のデータをログ出力
      setTables(resolvedTablesData);
    } catch (error: any) {
      console.error("テーブル情報の取得エラー:", error);
      setErrorMessage("テーブル情報の取得に失敗しました。");
    } finally {
      setLoadingTables(false);
    }
  }, []);

  // 初回および操作者情報が変わったときにテーブル情報を取得
  useEffect(() => {
    // 管理者またはスタッフ権限がある場合のみテーブル情報を読み込む
    if (operatorUser && (operatorUser.isAdmin || operatorUser.firestoreData?.isStaff)) {
      fetchTablesWithSeats();
    }
  }, [operatorUser, fetchTablesWithSeats]); // operatorUserの変更も検知


  // UIDでユーザーを検索する関数
  const fetchUserByUid = useCallback(async (uid: string) => {
    if (!uid.trim()) {
      setSearchedUser(null);
      return;
    }
    setIsLoadingUser(true);
    setErrorMessage('');
    setSuccessMessage('');
    setSelectedTableId(null); // ユーザーが変わったら選択をリセット
    setSelectedSeatNumber(null);
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        setSearchedUser({ id: userSnap.id, ...(userSnap.data() as UserData) } as UserWithId);
      } else {
        setErrorMessage('指定されたUIDのユーザーが見つかりません。');
        setSearchedUser(null);
      }
    } catch (error: any) {
      console.error("ユーザー検索エラー:", error);
      setErrorMessage(`ユーザー検索中にエラーが発生しました: ${error.message}`);
      setSearchedUser(null);
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  // targetUidが変更されたらユーザーを検索 (debounce処理付き)
  useEffect(() => {
    if (targetUid) {
      const timer = setTimeout(() => {
        fetchUserByUid(targetUid);
      }, 700); // 700msのディレイ後検索
      return () => clearTimeout(timer);
    } else {
      setSearchedUser(null);
    }
  }, [targetUid, fetchUserByUid]);


  // チェックインと同時にテーブル・座席に割り当てる関数
  const handleCheckInAndSeat = async () => {
    if (!searchedUser || !selectedTableId || selectedSeatNumber === null) {
      setErrorMessage("ユーザー、テーブル、および座席を選択してください。");
      return;
    }
    if (searchedUser.isCheckedIn && searchedUser.currentTableId && searchedUser.currentSeatNumber !== null) {
        setErrorMessage(`${searchedUser.pokerName || searchedUser.email}さんは既にテーブル${searchedUser.currentTableId}の座席${searchedUser.currentSeatNumber}にチェックイン済みです。`);
        return;
    }

    setSuccessMessage(''); setErrorMessage(''); setIsLoadingUser(true);
    const batch = writeBatch(db);
    try {
      const userDocRef = doc(db, 'users', searchedUser.id);
      batch.update(userDocRef, {
        isCheckedIn: true, checkedInAt: serverTimestamp(),
        currentTableId: selectedTableId, currentSeatNumber: selectedSeatNumber,
      });

      const seatDocRef = doc(db, 'tables', selectedTableId, 'seats', String(selectedSeatNumber));
      batch.update(seatDocRef, {
        userId: searchedUser.id,
        userPokerName: searchedUser.pokerName || searchedUser.email?.split('@')[0] || '不明',
        occupiedAt: serverTimestamp(), status: "occupied",
      });

      await batch.commit();

      setSearchedUser(prev => prev ? { ...prev, isCheckedIn: true, checkedInAt: new Date(), currentTableId: selectedTableId, currentSeatNumber: selectedSeatNumber } : null);
      fetchTablesWithSeats(); // 座席状況を更新
      setSuccessMessage(`${searchedUser.pokerName || searchedUser.email} さんをチェックインし、着席させました。`);
      setTargetUid(''); setSelectedTableId(null); setSelectedSeatNumber(null);
    } catch (error: any) {
      console.error("チェックイン・着席エラー:", error);
      setErrorMessage(`処理中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsLoadingUser(false);
    }
  };

  // チェックアウトと同時にテーブル・座席から離席させる関数
  const handleCheckOutAndUnseat = async () => {
    if (!searchedUser || !searchedUser.isCheckedIn) { // isCheckedInも確認
        setErrorMessage("チェックアウト対象のユーザーがチェックインしていません。");
        return;
    }
    if (!searchedUser.currentTableId || searchedUser.currentSeatNumber === null) {
        // もしテーブル情報がないがチェックイン状態なら、単純なチェックアウト処理を促すか、エラー表示
        if (window.confirm(`${searchedUser.pokerName || searchedUser.email} さんはテーブルに割り当てられていません。チェックアウトのみ行いますか？`)) {
            // 単純なチェックアウト処理 (isCheckedIn: false, checkedOutAt のみ更新)
            try {
                setIsLoadingUser(true);
                const userDocRef = doc(db, 'users', searchedUser.id);
                await updateDoc(userDocRef, { isCheckedIn: false, checkedOutAt: serverTimestamp(), currentTableId: null, currentSeatNumber: null });
                setSearchedUser(prev => prev ? { ...prev, isCheckedIn: false, checkedOutAt: new Date(), currentTableId: null, currentSeatNumber: null } : null);
                setSuccessMessage(`${searchedUser.pokerName || searchedUser.email} さんをチェックアウトしました。`);
                setTargetUid('');
            } catch (e:any) { setErrorMessage(`チェックアウトエラー: ${e.message}`); }
            finally { setIsLoadingUser(false); }
            return;
        } else {
            return;
        }
    }

    setSuccessMessage(''); setErrorMessage(''); setIsLoadingUser(true);
    const batch = writeBatch(db);
    try {
        const userDocRef = doc(db, 'users', searchedUser.id);
        batch.update(userDocRef, {
            isCheckedIn: false, checkedOutAt: serverTimestamp(),
            currentTableId: null, currentSeatNumber: null,
        });

        const seatDocRef = doc(db, 'tables', searchedUser.currentTableId, 'seats', String(searchedUser.currentSeatNumber));
        batch.update(seatDocRef, { userId: null, userPokerName: null, occupiedAt: null, status: "empty" });

        await batch.commit();
        setSearchedUser(prev => prev ? { ...prev, isCheckedIn: false, checkedOutAt: new Date(), currentTableId: null, currentSeatNumber: null } : null);
        fetchTablesWithSeats(); // 座席状況を更新
        setSuccessMessage(`${searchedUser.pokerName || searchedUser.email} さんをチェックアウトし、離席させました。`);
        setTargetUid('');
    } catch (error: any) {
        console.error("チェックアウト・離席エラー:", error);
        setErrorMessage(`処理中にエラーが発生しました: ${error.message}`);
    } finally {
        setIsLoadingUser(false);
    }
  };


  if (appContextLoading) {
    return <div className="p-4 text-center text-slate-300">権限情報を読み込み中...</div>;
  }
  const canAccessPage = operatorUser && (operatorUser.isAdmin || operatorUser.firestoreData?.isStaff === true);
  if (!canAccessPage) {
    return <div className="p-4 text-red-500 text-center">このページへのアクセス権限がありません。</div>;
  }


  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-red-500">チェックイン / 着席・離席処理</h1>
        <Link to="/admin" className="text-sky-400 hover:text-sky-300 hover:underline text-sm">
            ← 管理コンソールトップへ
        </Link>
      </div>


      {successMessage && <div className="mb-4 p-3 bg-green-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{successMessage}</div>}
      {errorMessage && <div className="mb-4 p-3 bg-red-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{errorMessage}</div>}


      <div className="max-w-2xl mx-auto bg-slate-800 p-6 rounded-lg shadow-md">
        <div className="mb-6">
          <label htmlFor="targetUid" className="block text-sm font-medium text-slate-300 mb-1">
            ユーザーUID (QRコード情報 / 手入力):
          </label>
          <input
            type="text"
            id="targetUid"
            value={targetUid}
            onChange={(e) => setTargetUid(e.target.value)}
            placeholder="スキャンまたはUIDを入力"
            className="mt-1 block w-full p-2 border border-slate-600 rounded-md shadow-sm bg-slate-700 text-white focus:ring-red-500 focus:border-red-500 sm:text-sm"
          />
        </div>

        {isLoadingUser && <p className="text-sky-400 my-2 text-center">ユーザー情報を検索中...</p>}

        {searchedUser && (
          <div className="mt-4 p-4 border border-slate-700 rounded-md bg-slate-700/50">
            <h2 className="text-xl font-semibold mb-3 text-red-400 border-b border-slate-600 pb-2">対象ユーザー情報</h2>
            <div className="space-y-1 text-slate-300 mb-4">
                <p>ポーカーネーム: <span className="font-medium text-white">{searchedUser.pokerName || '未設定'}</span></p>
                <p>メール: <span className="font-medium text-white">{searchedUser.email}</span></p>
                <p>状態: {searchedUser.isCheckedIn ? <span className="font-semibold text-sky-300">チェックイン中</span> : <span className="font-semibold text-slate-400">チェックアウト済</span>}</p>
                {searchedUser.isCheckedIn && searchedUser.currentTableId && searchedUser.currentSeatNumber !== null && (
                    <p>現在地: <span className="font-medium text-white">テーブル {tables.find(t=>t.id === searchedUser.currentTableId)?.name || searchedUser.currentTableId} / Seat {searchedUser.currentSeatNumber}</span></p>
                )}
            </div>

            {!searchedUser.isCheckedIn && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3 text-amber-400">テーブル・座席選択</h3>
                {loadingTables ? <p className="text-slate-400">テーブル情報読み込み中...</p> : tables.length === 0 ? <p className="text-slate-400">利用可能なテーブルがありません。</p> : (
                  <div className="space-y-4">
                    {tables.filter(t => t.status !== 'inactive').map(table => ( // 非アクティブなテーブルは表示しない例
                      <div key={table.id}>
                        <h4 className="text-md font-medium text-slate-200 mb-1">{table.name} <span className="text-xs text-slate-400">({table.gameType || 'N/A'})</span></h4>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                          {Array.from({ length: table.maxSeats || 0 }, (_, i) => i + 1).map(seatNum => {
                            const seat = table.seats?.find(s => s.seatNumber === seatNum);
                            const isOccupied = seat && seat.userId;
                            const isSelected = selectedTableId === table.id && selectedSeatNumber === seatNum;
                            return (
                              <button
                                key={seatNum}
                                onClick={() => { if (!isOccupied) { setSelectedTableId(table.id); setSelectedSeatNumber(seatNum); }}}
                                disabled={!!isOccupied}
                                className={`p-2 rounded border text-xs h-16 flex flex-col items-center justify-center transition-all duration-150
                                  ${isSelected ? 'bg-green-500 border-green-400 text-white ring-2 ring-green-300 scale-105' :
                                    isOccupied ? 'bg-slate-600 border-slate-500 text-slate-400 cursor-not-allowed opacity-70' :
                                                 'bg-slate-700 border-slate-500 hover:bg-slate-600 text-slate-200 hover:border-sky-400'}`}
                                title={isOccupied ? `使用中: ${seat.userPokerName || '不明'}` : `座席 ${seatNum}`}
                              >
                                <span className="font-semibold">S{seatNum}</span>
                                {isOccupied && <span className="text-xxs truncate block w-full">{seat.userPokerName || '不明'}</span>}
                                {!isOccupied && <span className="text-xxs text-green-400">(空席)</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedTableId && selectedSeatNumber !== null && (
                  <div className="mt-4 text-center">
                    <p className="text-green-400 font-semibold">選択中: {tables.find(t=>t.id === selectedTableId)?.name} / Seat {selectedSeatNumber}</p>
                  </div>
                )}
                <button
                  onClick={handleCheckInAndSeat}
                  disabled={isLoadingUser || !searchedUser || !selectedTableId || selectedSeatNumber === null}
                  className="mt-6 w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-slate-500 transition-colors text-base"
                >
                  選択した席にチェックイン
                </button>
              </div>
            )}

            {searchedUser.isCheckedIn && (
              <button
                onClick={handleCheckOutAndUnseat}
                disabled={isLoadingUser}
                className="mt-6 w-full px-4 py-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 disabled:bg-slate-500 transition-colors text-base"
              >
                チェックアウトして離席する
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckinPage;