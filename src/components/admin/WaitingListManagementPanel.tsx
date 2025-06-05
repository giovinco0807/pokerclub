// src/components/admin/WaitingListManagementPanel.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../services/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, getDocs, getDoc } from 'firebase/firestore';
import { WaitingListEntry, WaitingListEntryWithDetails, WaitingListEntryStatus, UserData, GameTemplate, UserWithId } from '../../types';
import { useAppContext } from '../../contexts/AppContext';
import { StatusBadge } from './UserDetailsModal';
import { Typography, Box, CircularProgress, Alert, Paper, Accordion, AccordionSummary, AccordionDetails, Button as MuiButton } from '@mui/material'; // MuiButton を追加
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// ... (formatTimestamp関数は変更なし、または削除検討) ...

interface GroupedAdminWaitingList {
  gameTemplate: GameTemplate;
  entries: WaitingListEntryWithDetails[];
}

const WaitingListManagementPanel: React.FC = () => {
  const { currentUser } = useAppContext();
  const [groupedWaitingLists, setGroupedWaitingLists] = useState<GroupedAdminWaitingList[]>([]);
  const [allGameTemplates, setAllGameTemplates] = useState<GameTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<WaitingListEntryStatus | 'all'>('waiting');
  const [expandedAccordion, setExpandedAccordion] = useState<string | false>(false);

  // ... (handleAccordionChange, fetchUserDetails, fetchAllGameTemplates は変更なし) ...
  const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedAccordion(isExpanded ? panel : false);
  };

  const fetchUserDetails = useCallback(async (userId: string): Promise<UserWithId | null> => {
    const userDocSnap = await getDoc(doc(db, 'users', userId));
    return userDocSnap.exists() ? { id: userId, ...userDocSnap.data() } as UserWithId : null;
  }, []);

  const fetchAllGameTemplates = useCallback(async () => {
    try {
      const templatesSnapshot = await getDocs(query(collection(db, "gameTemplates"), orderBy("sortOrder", "asc")));
      const templates = templatesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as GameTemplate);
      setAllGameTemplates(templates);
      return templates;
    } catch (err) {
      console.error("全ゲームテンプレート取得エラー:", err);
      setError(prev => prev ? `${prev}\nゲームテンプレート取得失敗` : "ゲームテンプレート取得失敗");
      return [];
    }
  }, []);


  useEffect(() => {
    if (!currentUser?.isAdmin && !currentUser?.firestoreData?.isStaff) {
      setError("アクセス権限がありません。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchData = async () => {
      const templates = await fetchAllGameTemplates();
      if (templates.length === 0 && !error) {
          setLoading(false);
          setGroupedWaitingLists([]);
          return;
      }
      if (error && templates.length === 0) {
          setLoading(false);
          return;
      }


      const waitingListCollectionRef = collection(db, 'waitingListEntries');
      let q;
      if (filterStatus === 'all') {
        q = query(waitingListCollectionRef, orderBy('requestedAt', 'asc'));
      } else {
        q = query(waitingListCollectionRef, where('status', '==', filterStatus), orderBy('requestedAt', 'asc'));
      }

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const allEntries = snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }) as WaitingListEntry);

        const detailedEntriesPromises = allEntries.map(async (entry) => {
          const userDetails = await fetchUserDetails(entry.userId);
          const gameTemplateDetails = templates.find(t => t.id === entry.gameTemplateId);
          return {
            ...entry,
            user: userDetails || undefined,
            gameTemplate: gameTemplateDetails || undefined,
          } as WaitingListEntryWithDetails;
        });

        const detailedEntries = await Promise.all(detailedEntriesPromises);

        const grouped: GroupedAdminWaitingList[] = templates
          .map(template => {
            const entriesForTemplate = detailedEntries.filter(
              entry => entry.gameTemplateId === template.id
            );
            return {
              gameTemplate: template,
              entries: entriesForTemplate,
            };
          })
          .filter(group => group.entries.length > 0);

        grouped.sort((a, b) => b.entries.length - a.entries.length);

        setGroupedWaitingLists(grouped);
        if (grouped.length > 0 && !expandedAccordion) {
            setExpandedAccordion(grouped[0].gameTemplate.id!);
        } else if (grouped.length === 0) {
            setExpandedAccordion(false);
        }

        setLoading(false);
      }, (err) => {
        console.error("ウェイティングリスト取得エラー:", err);
        setError(prev => prev ? `${prev}\nウェイティングリスト取得失敗` : "ウェイティングリスト取得失敗");
        setLoading(false);
      });
      return unsubscribe;
    };

    let unsubscribeSnapshot: (() => void) | undefined;
    fetchData().then(unsub => {
        unsubscribeSnapshot = unsub;
    });

    return () => {
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
        }
    };
  }, [currentUser, filterStatus, fetchUserDetails, fetchAllGameTemplates, error, expandedAccordion]);


  const handleUpdateStatus = async (entryId: string, newStatus: WaitingListEntryStatus, currentStatus?: WaitingListEntryStatus) => {
    // ... (変更なし)
    if (!entryId) return;
    let confirmMessage = `ID: ${entryId.substring(0,6)}... のステータスを「${newStatus}」に変更しますか？`;
    if (newStatus === 'called' && currentStatus === 'waiting') { }
    else if (newStatus === 'seated' && (currentStatus === 'called' || currentStatus === 'confirmed')) {
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


  if (loading && groupedWaitingLists.length === 0) return <Box sx={{p:2, textAlign:'center', color: 'slate.300'}}><CircularProgress color="inherit" sx={{mr:1}} size={20}/>ウェイティングリストを読み込み中...</Box>;
  if (error) return <Alert severity="error" sx={{m:2}}>{error}</Alert>;

  return (
    <Paper sx={{ p: 2, bgcolor: 'slate.800', color: 'neutral.lightest' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ color: 'sky.400' }}>ウェイティングリスト管理</Typography>
        <Box>
          <Typography component="label" htmlFor="statusFilterAdmin" sx={{ fontSize: '0.875rem', color: 'slate.300', mr: 1 }}>表示ステータス:</Typography>
          <select
            id="statusFilterAdmin"
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
        </Box>
      </Box>

      {groupedWaitingLists.length === 0 && !loading ? (
        <Typography sx={{ textAlign: 'center', py: 4, color: 'slate.400' }}>
          表示対象のウェイティングエントリーはありません。
        </Typography>
      ) : (
        groupedWaitingLists.map(({ gameTemplate, entries }) => (
          <Accordion
            key={gameTemplate.id}
            expanded={expandedAccordion === gameTemplate.id}
            onChange={handleAccordionChange(gameTemplate.id!)}
            sx={{ bgcolor: 'slate.700/70', color: 'neutral.lightest', mb: 1, '&:before': { display: 'none' }, boxShadow: 1 }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: 'slate.400' }} />}
              aria-controls={`${gameTemplate.id}-content`}
              id={`${gameTemplate.id}-header`}
              sx={{ '&:hover': { bgcolor: 'slate.600/50' } }}
            >
              <Typography sx={{ fontWeight: 'medium', color: 'amber.400' }}>
                {gameTemplate.templateName} ({gameTemplate.gameType}) - 待ち: {entries.length}人
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, bgcolor: 'slate.800' }}>
              {entries.length === 0 ? (
                <Typography sx={{p:2, textAlign: 'center', color: 'slate.400'}}>このゲームの{filterStatus === 'all' ? '' : `${filterStatus}ステータスの`}ウェイティングはありません。</Typography>
              ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <table className="min-w-full divide-y divide-slate-700 text-sm">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">プレイヤー</th>
                      {filterStatus === 'all' && <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">ステータス</th> }
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {entries.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-700/30">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {entry.userAvatarUrlSnapshot && (
                              <img src={entry.userAvatarUrlSnapshot} alt="" className="w-6 h-6 rounded-full mr-2" />
                            )}
                            {/* ★★★ プレイヤー名の文字色を調整 ★★★ */}
                            <Typography component="span" sx={{ color: 'text.primary' }}> {/* 例: text.primary または slate.100 など */}
                                {entry.userPokerNameSnapshot || entry.user?.pokerName || entry.userId.substring(0,6)}
                            </Typography>
                          </Box>
                        </td>
                        {filterStatus === 'all' &&
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
                        }
                        <td className="px-3 py-2 whitespace-nowrap">
                          {entry.status === 'waiting' && (
                            <MuiButton size="small" variant="outlined" sx={{mr:1, color:'sky.400', borderColor: 'sky.600'}} onClick={() => entry.id && handleUpdateStatus(entry.id, 'called', entry.status)}>呼出</MuiButton>
                          )}
                          {(entry.status === 'called' || entry.status === 'confirmed') && (
                            <MuiButton size="small" variant="outlined" sx={{mr:1, color:'green.400', borderColor: 'green.600'}} onClick={() => entry.id && handleUpdateStatus(entry.id, 'seated', entry.status)}>着席</MuiButton>
                          )}
                          {(entry.status === 'waiting' || entry.status === 'called' || entry.status === 'confirmed') && (
                            <>
                              <MuiButton size="small" variant="text" sx={{mr:1, color:'orange.400'}} onClick={() => entry.id && handleUpdateStatus(entry.id, 'no_show', entry.status)}>NoShow</MuiButton>
                              <MuiButton size="small" variant="text" sx={{color:'red.400'}} onClick={() => entry.id && handleUpdateStatus(entry.id, 'cancelled_by_admin', entry.status)}>取消</MuiButton>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Paper>
  );
};

export default WaitingListManagementPanel;