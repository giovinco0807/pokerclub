// src/pages/WaitingListsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp, getDocs, doc, getDoc } from 'firebase/firestore';
import { WaitingListEntry, GameTemplate, UserData, WaitingListEntryWithDetails } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { Container, Typography, Box, Paper, Grid, CircularProgress, Alert, Chip } from '@mui/material';

// formatTimestamp関数は不要になる可能性がありますが、他の箇所で使われていなければ削除してもOKです。
// 今回はウェイティングリストの時刻表示のみ削除なので、一旦残します。
const formatTimestamp = (timestamp?: Timestamp | Date | null, includeSeconds: boolean = false): string => {
  if (!timestamp) return 'N/A';
  let dateToFormat: Date;
  if (timestamp instanceof Timestamp) dateToFormat = timestamp.toDate();
  else if (timestamp instanceof Date) dateToFormat = timestamp;
  else return '日付エラー';

  try {
    return dateToFormat.toLocaleString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined
    });
  } catch (e) {
    console.error("formatTimestamp: toLocaleStringでエラー:", e, "元の値:", dateToFormat);
    return '表示エラー';
  }
};

interface GroupedWaitingList {
  gameTemplate: GameTemplate;
  entries: WaitingListEntryWithDetails[];
  myPosition?: number;
}

const WaitingListsPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [groupedWaitingLists, setGroupedWaitingLists] = useState<GroupedWaitingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWaitingListData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const templatesQuery = query(collection(db, "gameTemplates"), where("isActive", "==", true), orderBy("sortOrder", "asc"));
      const templatesSnapshot = await getDocs(templatesQuery);
      const activeTemplates = templatesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as GameTemplate);

      if (activeTemplates.length === 0) {
        setGroupedWaitingLists([]);
        setLoading(false);
        return;
      }

      const waitingEntriesQuery = query(collection(db, "waitingListEntries"), where("status", "==", "waiting"), orderBy("requestedAt", "asc"));
      const entriesSnapshot = await getDocs(waitingEntriesQuery);
      const allWaitingEntries = entriesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as WaitingListEntry);

      const userCache = new Map<string, UserData | null>();
      const fetchUserDetailsOptimized = async (userId: string): Promise<UserData | null> => {
        if (userCache.has(userId)) {
          return userCache.get(userId) || null;
        }
        const userDocSnap = await getDoc(doc(db, 'users', userId));
        const userData = userDocSnap.exists() ? userDocSnap.data() as UserData : null;
        userCache.set(userId, userData);
        return userData;
      };

      const newGroupedLists: GroupedWaitingList[] = await Promise.all(
        activeTemplates.map(async (template) => {
          const entriesForTemplate = allWaitingEntries.filter(entry => entry.gameTemplateId === template.id);
          let myPositionInList: number | undefined = undefined;

          const detailedEntries: WaitingListEntryWithDetails[] = await Promise.all(
            entriesForTemplate.map(async (entry, index) => {
              const userDetails = await fetchUserDetailsOptimized(entry.userId);
              if (currentUser?.uid === entry.userId) {
                myPositionInList = index + 1;
              }
              return {
                ...entry,
                user: userDetails ? { id: entry.userId, ...userDetails } : undefined,
                gameTemplate: template,
              };
            })
          );

          return {
            gameTemplate: template,
            entries: detailedEntries,
            myPosition: myPositionInList,
          };
        })
      );

      setGroupedWaitingLists(newGroupedLists.filter(group => group.entries.length > 0));

    } catch (err: any) {
      console.error("ウェイティングリスト一覧取得エラー:", err);
      setError("ウェイティングリスト情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!appContextLoading) {
      if (currentUser && currentUser.uid) {
        fetchWaitingListData();
      } else {
        setError("ウェイティングリストを表示するにはログインが必要です。");
        setLoading(false);
      }
    }
  }, [appContextLoading, currentUser, fetchWaitingListData]); // currentUser.uid を削除 (currentUserで十分)


  if (appContextLoading || loading) {
    return (
      <Container sx={{ py: 4, display: 'flex', justifyContent: 'center', color: 'neutral.lightest' }}>
        <CircularProgress color="inherit" />
        <Typography sx={{ ml: 2 }}>ウェイティングリストを読み込み中...</Typography>
      </Container>
    );
  }

  if (error) {
    return <Container sx={{ py: 4 }}><Alert severity="error">{error}</Alert></Container>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, color: 'neutral.lightest' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, pb: 2, borderBottom: 1, borderColor: 'slate.700' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'teal.400' }}>
          現在のウェイティング状況
        </Typography>
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← メインページへ戻る
        </Link>
      </Box>

      {groupedWaitingLists.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'slate.800', color: 'slate.400' }}>
          <Typography variant="h6">現在、ウェイティングリストに登録されているゲームはありません。</Typography>
          <Typography sx={{mt: 1}}>メインページからゲームを選択してウェイティングに参加できます。</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {groupedWaitingLists.map(({ gameTemplate, entries, myPosition }) => (
            <Grid item xs={12} md={6} lg={4} key={gameTemplate.id}>
              <Paper sx={{ p: 2.5, bgcolor: 'slate.800', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" component="h2" sx={{ color: 'amber.400', fontWeight: 'semibold', mb: 1 }}>
                  {gameTemplate.templateName}
                </Typography>
                <Typography variant="body2" sx={{ color: 'slate.400', mb: 0.5 }}>
                  ゲームタイプ: {gameTemplate.gameType}
                </Typography>
                {gameTemplate.blindsOrRate && (
                  <Typography variant="body2" sx={{ color: 'slate.400', mb: 0.5 }}>
                    レート/ブラインド: {gameTemplate.blindsOrRate}
                  </Typography>
                )}
                {gameTemplate.notesForUser && (
                    <Typography variant="caption" sx={{ color: 'slate.500', mb: 1.5, fontStyle: 'italic' }}>
                        {gameTemplate.notesForUser}
                    </Typography>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Chip label={`現在の待ち人数: ${entries.length}人`} color="primary" size="small" sx={{ bgcolor: 'sky.600', color: 'white' }}/>
                  {myPosition && (
                    <Chip label={`あなたの順位: ${myPosition}番目`} color="secondary" size="small" sx={{ bgcolor: 'green.600', color: 'white' }} />
                  )}
                </Box>

                <Box sx={{ flexGrow: 1, maxHeight: '300px', overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'slate.600', borderRadius: '3px' } }}>
                  {entries.map((entry, index) => (
                    <Box
                      key={entry.id}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        bgcolor: entry.userId === currentUser?.uid ? 'slate.600' : 'slate.700',
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        borderLeft: entry.userId === currentUser?.uid ? '3px solid' : 'none',
                        borderColor: entry.userId === currentUser?.uid ? 'teal.400' : 'transparent'
                      }}
                    >
                      <Typography sx={{ color: 'slate.400', mr: 1.5, fontWeight: 'medium' }}>{index + 1}.</Typography>
                      {entry.userAvatarUrlSnapshot && !entry.isPokerNameHiddenSnapshot && (
                        <img src={entry.userAvatarUrlSnapshot} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%', marginRight: 8 }}/>
                      )}
                      <Typography sx={{ color: 'slate.200', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.isPokerNameHiddenSnapshot || entry.user?.privacySettings?.hidePokerNameInPublicLists
                          ? `プレイヤー ${index + 1}`
                          : entry.userPokerNameSnapshot || '参加者'}
                      </Typography>
                      {/* ★★★ 受付時間の表示を削除 ★★★ */}
                      {/*
                      <Typography sx={{ color: 'slate.500', fontSize: '0.75rem' }}>
                        {formatTimestamp(entry.requestedAt)}
                      </Typography>
                      */}
                    </Box>
                  ))}
                </Box>
                 {entries.length === 0 && (
                    <Typography sx={{ color: 'slate.500', textAlign: 'center', py:2 }}>現在このゲームの待ちはありません。</Typography>
                )}
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default WaitingListsPage;