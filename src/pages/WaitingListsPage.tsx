// src/pages/WaitingListsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, Timestamp, getDocs, doc, getDoc } from 'firebase/firestore'; // onSnapshot はリアルタイム更新が不要な場合は削除可
import { WaitingListEntry, GameTemplate, UserData, WaitingListEntryWithDetails } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { Container, Typography, Box, Paper, Grid, CircularProgress, Alert, Chip } from '@mui/material';

// formatTimestamp関数 (MainPage.tsxにも同様の関数があるため、共通化を検討)
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
  myPosition?: number; // ログインユーザーの待ち順位
}

const WaitingListsPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [groupedWaitingLists, setGroupedWaitingLists] = useState<GroupedWaitingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWaitingListData = useCallback(async () => {
    console.log("WaitingListsPage: fetchWaitingListData called. UID:", currentUser?.uid); // ログ追加
    setLoading(true);
    setError(null);

    try {
      // 1. アクティブなゲームテンプレートを取得
      const templatesQuery = query(collection(db, "gameTemplates"), where("isActive", "==", true), orderBy("sortOrder", "asc"));
      const templatesSnapshot = await getDocs(templatesQuery);
      const activeTemplates = templatesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as GameTemplate);
      console.log("WaitingListsPage: Fetched active templates:", activeTemplates.length);


      if (activeTemplates.length === 0) {
        setGroupedWaitingLists([]);
        setLoading(false);
        console.log("WaitingListsPage: No active templates found.");
        return;
      }

      // 2. 全ての "waiting" ステータスのウェイティングリストエントリーを取得
      const waitingEntriesQuery = query(collection(db, "waitingListEntries"), where("status", "==", "waiting"), orderBy("requestedAt", "asc"));
      const entriesSnapshot = await getDocs(waitingEntriesQuery); // Line 101 / 105 (approx.)
      const allWaitingEntries = entriesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as WaitingListEntry);
      console.log("WaitingListsPage: Fetched all waiting entries:", allWaitingEntries.length);


      // 3. ユーザー情報を取得するためのヘルパー（キャッシュや最適化を検討）
      const userCache = new Map<string, UserData | null>();
      const fetchUserDetailsOptimized = async (userId: string): Promise<UserData | null> => {
        if (userCache.has(userId)) {
          return userCache.get(userId) || null;
        }
        try {
            const userDocSnap = await getDoc(doc(db, 'users', userId));
            const userData = userDocSnap.exists() ? userDocSnap.data() as UserData : null;
            userCache.set(userId, userData);
            return userData;
        } catch (userError) {
            console.warn(`WaitingListsPage: Failed to fetch user details for ${userId}`, userError);
            userCache.set(userId, null); // エラーでもキャッシュして再試行を防ぐ
            return null;
        }
      };

      // 4. ゲームテンプレートごとにエントリーをグループ化し、ユーザー情報を付加
      let newGroupedLists: GroupedWaitingList[] = await Promise.all(
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
                gameTemplate: template, // 親のテンプレート情報を付加
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

      // 待ち人数が多い順にソート
      newGroupedLists.sort((a, b) => b.entries.length - a.entries.length);

      setGroupedWaitingLists(newGroupedLists.filter(group => group.entries.length > 0)); // エントリーがあるもののみ表示
      console.log("WaitingListsPage: Grouped lists processed:", newGroupedLists.filter(group => group.entries.length > 0).length);


    } catch (err: any) {
      console.error("ウェイティングリスト一覧取得エラー:", err); // Line 111 / 115 (approx.)
      setError("ウェイティングリスト情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]); // currentUser.uid に変更 (もしcurrentUserオブジェクト全体を監視すると無限ループの可能性)

  useEffect(() => {
    console.log("WaitingListsPage: useEffect triggered. appContextLoading:", appContextLoading, "currentUser UID:", currentUser?.uid);
    if (!appContextLoading) {
      if (currentUser && currentUser.uid) {
        fetchWaitingListData();
      } else {
        setError("ウェイティングリストを表示するにはログインが必要です。");
        setLoading(false);
      }
    }
  }, [appContextLoading, currentUser, fetchWaitingListData]); // fetchWaitingListData を依存配列に追加


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
                      {entry.userAvatarUrlSnapshot && !entry.isPokerNameHiddenSnapshot && !(entry.user?.privacySettings?.hidePokerNameInPublicLists) && (
                        <img src={entry.userAvatarUrlSnapshot} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%', marginRight: 8 }}/>
                      )}
                      <Typography sx={{ color: 'text.primary', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.isPokerNameHiddenSnapshot || entry.user?.privacySettings?.hidePokerNameInPublicLists
                          ? `プレイヤー ${index + 1}`
                          : entry.userPokerNameSnapshot || '参加者'}
                      </Typography>
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