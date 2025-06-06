// src/pages/TableStatusPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore'; // getDocを追加
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { GameName, Table as PokerTable, Seat, UserData } from '../types';
import PokerTableSVG from '../components/common/PokerTableSVG'; // 作成したコンポーネントをインポート
import PlayerInfoPopover from '../components/common/PlayerInfoPopover'; // 作成したポップオーバーをインポート
import AdminLayout from '../components/admin/AdminLayout';
import { Typography, Container, Grid, CircularProgress, Alert } from '@mui/material';

const TableStatusPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const [tables, setTables] = useState<PokerTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlayer, setSelectedPlayer] = useState<Partial<UserData> | null>(null);
  // ★★★ popoverAnchorEl の型を Element | null に変更 ★★★
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<Element | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      try {
        const tablesDataPromises = snapshot.docs.map(async (tableDoc) => {
          const tableData = { id: tableDoc.id, ...tableDoc.data() } as PokerTable;
          const seatsCollectionRef = collection(db, 'tables', tableDoc.id, 'seats');
          const seatsSnapshot = await getDocs(query(seatsCollectionRef, orderBy('seatNumber', 'asc')));
          tableData.seats = seatsSnapshot.docs.map(seatDoc => ({ id: seatDoc.id, ...seatDoc.data() } as Seat));
          return tableData;
        });
        const resolvedTables = await Promise.all(tablesDataPromises);
        setTables(resolvedTables);
        setError(null);
      } catch (err: any) {
        console.error("Error fetching table statuses:", err);
        setError("テーブル情報の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error("Snapshot error for table statuses:", err);
      setError("テーブル情報のリアルタイム更新中にエラーが発生しました。");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ★★★ handleSeatClick の第3引数の型を Element | null に変更 ★★★
  const handleSeatClick = async (seatNumber: number, userId: string | null, anchorElement: Element | null) => {
    if (userId && anchorElement) { // anchorElement が null でないことも確認
      try {
        const userDocRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserData;
          setSelectedPlayer({
            pokerName: userData.pokerName,
            chips: userData.chips,
          });
          setPopoverAnchorEl(anchorElement); // ★ anchorElement をそのままセット
        } else {
          console.warn(`User document not found for userId: ${userId}`);
          setSelectedPlayer({ pokerName: '(情報なし)' });
          setPopoverAnchorEl(anchorElement);
        }
      } catch (err) {
        console.error("Error fetching user data for popover:", err);
        setSelectedPlayer({ pokerName: '(エラー)' });
        setPopoverAnchorEl(anchorElement);
      }
    } else {
      console.log(`Seat ${seatNumber} is empty.`);
      setSelectedPlayer(null);
      setPopoverAnchorEl(null);
    }
  };

  const handleClosePopover = () => {
    setSelectedPlayer(null);
    setPopoverAnchorEl(null);
  };


  if (loading && tables.length === 0) {
    return (
      <Container sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      </Container>
    );
  }

  return (
    // AdminLayout を使うか、通常のレイアウトにするか選択
    // <AdminLayout>
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ color: 'primary.main', textAlign: 'center', mb:4 }}>
        テーブル状況
      </Typography>
      {tables.length === 0 && !loading && (
        <Typography sx={{ textAlign: 'center', color: 'text.secondary', mt: 5 }}>
          現在利用可能なテーブルはありません。
        </Typography>
      )}
      <Grid container spacing={4} justifyContent="center">
        {tables.map((table) => (
          <Grid item xs={12} lg={6} key={table.id}>
            <PokerTableSVG
              seats={table.seats || []}
              maxSeats={table.maxSeats}
              tableName={table.name}
              gameType={table.gameType as GameName} // types.tsからインポートした型を使用
              blindsOrRate={table.blindsOrRate}
              // ★★★ onSeatClick に渡す関数の引数を修正 ★★★
              onSeatClick={(seatNumber, uId, eventTarget) => handleSeatClick(seatNumber, uId, eventTarget as Element | null)}
            />
          </Grid>
        ))}
      </Grid>
      <PlayerInfoPopover
        isOpen={!!selectedPlayer}
        onClose={handleClosePopover}
        playerData={selectedPlayer}
        anchorEl={popoverAnchorEl as HTMLElement | null} // ★ Popover側がHTMLElementを期待する場合はアサーション
      />
    </Container>
    // </AdminLayout>
  );
};

export default TableStatusPage;