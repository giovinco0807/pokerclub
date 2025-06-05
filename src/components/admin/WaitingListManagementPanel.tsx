// src/components/admin/WaitingListManagementPanel.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../services/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { WaitingListEntry, WaitingListEntryWithDetails, WaitingListEntryStatus, UserData, GameTemplate, UserWithId } from '../../types';
import { useAppContext } from '../../contexts/AppContext';
import { StatusBadge } from './UserDetailsModal';

// formatTimestamp関数は不要になる可能性がありますが、他の箇所で使われていなければ削除してもOKです。
// 今回はウェイティングリストの時刻表示のみ削除なので、一旦残します。
const formatTimestamp = (timestamp?: Timestamp | Date | null): string => {
  if (!timestamp) return '-';
  const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
};


const WaitingListManagementPanel: React.FC = () => {
  const { currentUser } = useAppContext();
  const [waitingList, setWaitingList] = useState<WaitingListEntryWithDetails[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<WaitingListEntryStatus | 'all'>('waiting');

  const fetchUserDetails = useCallback(async (userId: string): Promise<UserWithId | null> => {
    const userDocSnap = await getDoc(doc(db, 'users', userId));
    return userDocSnap.exists() ? { id: userId, ...userDocSnap.data() } as UserWithId : null;
  }, []);

  const fetchGameTemplateDetails = useCallback(async (templateId: string): Promise<GameTemplate | null> => {
    const templateDocSnap = await getDoc(doc(db, 'gameTemplates', templateId));
    return templateDocSnap.exists() ? { id: templateDocSnap.id, ...templateDocSnap.data() } as GameTemplate : null;
  }, []);

  useEffect(() => {
    if (!currentUser?.isAdmin && !currentUser?.firestoreData?.isStaff) {
      setError("アクセス権限がありません。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const waitingListCollectionRef = collection(db, 'waitingListEntries');
    let q;
    if (filterStatus === 'all') {
      q = query(waitingListCollectionRef, orderBy('requestedAt', 'asc'));
    } else {
      q = query(waitingListCollectionRef, where('status', '==', filterStatus), orderBy('requestedAt', 'asc'));
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const entriesPromises = snapshot.docs.map(async (docSnapshot) => {
        const entryData = { id: docSnapshot.id, ...docSnapshot.data() } as WaitingListEntry;
        const userDetails = await fetchUserDetails(entryData.userId);
        const gameTemplateDetails = await fetchGameTemplateDetails(entryData.gameTemplateId);
        return {
          ...entryData,
          user: userDetails || undefined,
          gameTemplate: gameTemplateDetails || undefined,
        } as WaitingListEntryWithDetails;
      });
      const detailedEntries = await Promise.all(entriesPromises);
      setWaitingList(detailedEntries);
      setLoading(false);
    }, (err) => {
      console.error("ウェイティングリスト取得エラー:", err);
      setError("ウェイティングリストの取得に失敗しました。");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, filterStatus, fetchUserDetails, fetchGameTemplateDetails]);


  const handleUpdateStatus = async (entryId: string, newStatus: WaitingListEntryStatus, currentStatus?: WaitingListEntryStatus) => {
    if (!entryId) return;

    let confirmMessage = `ID: ${entryId.substring(0,6)}... のステータスを「${newStatus}」に変更しますか？`;
    if (newStatus === 'called' && currentStatus === 'waiting') {
        // 追加の確認や処理
    } else if (newStatus === 'seated' && (currentStatus === 'called' || currentStatus === 'confirmed')) {
        confirmMessage = `ID: ${entryId.substring(0,6)}... を「着席済み」にしますか？\n（この操作は通常、ユーザーのチェックイン/着席処理と連動します）`;
    }

    if (!window.confirm(confirmMessage)) return;

    const entryDocRef = doc(db, 'waitingListEntries', entryId);
    const updateData: Partial<WaitingListEntry> = {
      status: newStatus,
      lastStatusUpdatedAt: serverTimestamp() as Timestamp,
    };
    if (newStatus === 'called') updateData.calledAt = serverTimestamp() as Timestamp;
    if (newStatus === 'seated') updateData.seatedAt = serverTimestamp() as Timestamp;
    if (newStatus === 'cancelled_by_admin' || newStatus === 'cancelled_by_user' || newStatus === 'no_show') {
      updateData.cancelledAt = serverTimestamp() as Timestamp;
    }

    try {
      await updateDoc(entryDocRef, updateData);
    } catch (err) {
      console.error("ステータス更新エラー:", err);
      alert("ステータスの更新に失敗しました。");
    }
  };

  // formatTimestamp関数は時間表示が不要なら、このコンポーネント内では削除しても良い
  // const formatTimestamp = (timestamp?: Timestamp | Date | null): string => { ... };


  if (loading) return <p className="text-center text-slate-300 p-4">ウェイティングリストを読み込み中...</p>;
  if (error) return <p className="text-center text-red-400 p-4 bg-red-900/30 rounded">{error}</p>;

  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-sky-400">ウェイティングリスト</h3>
        <div>
          <label htmlFor="statusFilter" className="text-sm text-slate-300 mr-2">表示ステータス:</label>
          <select
            id="statusFilter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as WaitingListEntryStatus | 'all')}
            className="p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500 text-sm"
          >
            <option value="all">全て</option>
            <option value="waiting">待機中</option>
            <option value="called">呼び出し中</option>
            <option value="confirmed">呼び出し確認済</option>
            <option value="seated">着席済</option>
            <option value="cancelled_by_user">ユーザーキャンセル</option>
            <option value="cancelled_by_admin">管理者キャンセル</option>
            <option value="no_show">No Show</option>
          </select>
        </div>
      </div>

      {waitingList.length === 0 ? (
        <p className="text-slate-400 text-center py-4">表示対象のウェイティングエントリーはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-700/50">
              <tr>
                {/* ★★★ 受付日時の列を削除 ★★★ */}
                {/* <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">受付日時</th> */}
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">プレイヤー</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">希望ゲーム</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">ステータス</th>
                {/* ★★★ 呼出/確認/着席の時間の列を削除 (または時間表示部分のみ削除) ★★★ */}
                {/* <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">呼出/確認/着席</th> */}
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-slate-800 divide-y divide-slate-700">
              {waitingList.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-700/30">
                  {/* ★★★ 受付日時のセルを削除 ★★★ */}
                  {/* <td className="px-3 py-2 whitespace-nowrap text-slate-300">{formatTimestamp(entry.requestedAt)}</td> */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center">
                      {entry.userAvatarUrlSnapshot && (
                        <img src={entry.userAvatarUrlSnapshot} alt="" className="w-6 h-6 rounded-full mr-2" />
                      )}
                      <span className="text-white">{entry.userPokerNameSnapshot || entry.user?.pokerName || entry.userId.substring(0,6)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-300">{entry.gameTemplateNameSnapshot || entry.gameTemplate?.templateName || entry.gameTemplateId.substring(0,6)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge
                        color={
                            entry.status === 'seated' ? 'green' :
                            entry.status === 'called' || entry.status === 'confirmed' ? 'sky' :
                            entry.status === 'waiting' ? 'yellow' :
                            entry.status.startsWith('cancelled') || entry.status === 'no_show' ? 'red' :
                            'slate'
                        }
                        text={entry.status}
                    />
                  </td>
                  {/* ★★★ 呼出/確認/着席の時間のセルを削除 (または時間表示部分のみ削除) ★★★ */}
                  {/*
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-400">
                    {entry.calledAt && `呼:${formatTimestamp(entry.calledAt)}`} {entry.confirmedAt && `確:${formatTimestamp(entry.confirmedAt)}`} {entry.seatedAt && `席:${formatTimestamp(entry.seatedAt)}`}
                  </td>
                  */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {entry.status === 'waiting' && (
                      <button onClick={() => entry.id && handleUpdateStatus(entry.id, 'called', entry.status)} className="text-sky-400 hover:underline text-xs mr-2">呼出</button>
                    )}
                    {(entry.status === 'called' || entry.status === 'confirmed') && (
                      <button onClick={() => entry.id && handleUpdateStatus(entry.id, 'seated', entry.status)} className="text-green-400 hover:underline text-xs mr-2">着席</button>
                    )}
                    {(entry.status === 'waiting' || entry.status === 'called' || entry.status === 'confirmed') && (
                      <>
                        <button onClick={() => entry.id && handleUpdateStatus(entry.id, 'no_show', entry.status)} className="text-orange-400 hover:underline text-xs mr-2">NoShow</button>
                        <button onClick={() => entry.id && handleUpdateStatus(entry.id, 'cancelled_by_admin', entry.status)} className="text-red-400 hover:underline text-xs">取消</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WaitingListManagementPanel;