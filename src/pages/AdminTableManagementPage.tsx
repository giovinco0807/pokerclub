// src/pages/AdminTableManagementPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { SelectChangeEvent } from '@mui/material/Select'; // ★追加
import { db } from '../services/firebase'; // Firestoreのdbインスタンスをインポート
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import {
  Table as PokerTable, // TableはHTML要素と被るのでPokerTableとエイリアス
  TableData,
  Seat,
  TABLE_STATUS_OPTIONS,
  TableStatus,
  GameName,
  GAME_NAME_OPTIONS,
  GameTemplate, // GameTemplateもインポート
} from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { getSeatsForTable } from '../services/tableService'; // getSeatsForTableをインポート

// Firestoreコレクションへの参照
const tablesCollection = collection(db, 'tables');
const gameTemplatesCollection = collection(db, 'gameTemplates'); // ゲームテンプレート用

const AdminTableManagementPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [tables, setTables] = useState<PokerTable[]>([]);
  const [gameTemplates, setGameTemplates] = useState<GameTemplate[]>([]); // ゲームテンプレートの状態
  const [loadingData, setLoadingData] = useState<boolean>(true); // テーブルとテンプレート両方のローディングを管理
  const [error, setError] = useState<string | null>(null);

  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [currentTable, setCurrentTable] = useState<Partial<PokerTable>>({ // ★修正
    name: '',
    maxSeats: 9, // capacity から maxSeats に変更
    status: 'active',
    gameType: 'NLH',
    blindsOrRate: '',
    currentGameTemplateId: null, // 初期値
    minBuyIn: 0, // types.tsに合わせて追加
    maxBuyIn: 0, // types.tsに合わせて追加
  });
  const [isFormSubmitting, setIsFormSubmitting] = useState(false); // フォーム送信中フラグ

  const fetchAllData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const [tablesSnapshot, gameTemplatesSnapshot] = await Promise.all([
        getDocs(query(tablesCollection, orderBy('name'))),
        getDocs(query(gameTemplatesCollection, orderBy('templateName', 'asc'))),
      ]);

      const fetchedGameTemplates = gameTemplatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<GameTemplate, 'id'>),
        createdAt: (doc.data().createdAt instanceof Timestamp) ? doc.data().createdAt.toDate() : doc.data().createdAt,
        updatedAt: (doc.data().updatedAt instanceof Timestamp) ? doc.data().updatedAt.toDate() : doc.data().updatedAt,
      } as GameTemplate));
      setGameTemplates(fetchedGameTemplates);

      const tablesDataPromises = tablesSnapshot.docs.map(async (tableDoc) => {
        const tableData = { id: tableDoc.id, ...(tableDoc.data() as TableData) };
        const seats = await getSeatsForTable(tableDoc.id); // tableServiceから取得
        return {
          ...tableData,
          seats: seats || [], // seatsがnullやundefinedの場合に空配列を設定
          createdAt: (tableData.createdAt instanceof Timestamp) ? tableData.createdAt.toDate() : tableData.createdAt,
          updatedAt: (tableData.updatedAt instanceof Timestamp) ? tableData.updatedAt.toDate() : tableData.updatedAt,
        } as PokerTable;
      });
      const resolvedTables = await Promise.all(tablesDataPromises);
      setTables(resolvedTables);
    } catch (err: any) {
      console.error("テーブル/ゲームテンプレートの取得に失敗:", err);
      setError(`データの取得に失敗しました: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading) {
      if (currentUser && currentUser.isAdmin) {
        fetchAllData();
      } else if (currentUser && !currentUser.isAdmin) {
        setError("このページへのアクセス権限がありません。");
        setLoadingData(false);
      } else if (!currentUser) {
        setError("ログインしていません。");
        setLoadingData(false);
      }
    }
  }, [appContextLoading, currentUser, fetchAllData]);


  const handleOpenCreateDialog = () => {
    setIsEditing(false);
    setCurrentTable({
      name: '',
      maxSeats: 9,
      status: 'active',
      gameType: 'NLH', // デフォルト値
      blindsOrRate: '',
      currentGameTemplateId: null,
      minBuyIn: 0,
      maxBuyIn: 0,
    });
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (table: PokerTable) => {
    setIsEditing(true);
    setCurrentTable({
      ...table,
      createdAt: table.createdAt instanceof Timestamp ? table.createdAt.toDate() : table.createdAt,
      updatedAt: table.updatedAt instanceof Timestamp ? table.updatedAt.toDate() : table.updatedAt,
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError(null);
  };

  // TextField用のhandleChange
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { // ★修正
    const { name, value } = e.target;
    // 数値型への変換が必要なフィールドを特定
    const numericFields = ['maxSeats', 'minBuyIn', 'maxBuyIn'];
    setCurrentTable((prev) => ({
      ...prev,
      [name as string]: numericFields.includes(name as string) ? Number(value) : value,
    }));
  };

  // Material-UI Select 用の汎用ハンドラ
  const handleMuiSelectChange = (event: SelectChangeEvent<string | number>) => { // ★追加
    const { name, value } = event.target;
    setCurrentTable((prev) => ({
      ...prev,
      [name as string]: value,
    }));
  };

  // ゲームテンプレート選択時のハンドラ
  const handleGameTemplateChange = (e: SelectChangeEvent<string>) => { // ★引数の型を修正
    const templateId = e.target.value as string;
    const selectedTemplate = gameTemplates.find(t => t.id === templateId);

    if (selectedTemplate) {
      setCurrentTable(prev => ({
        ...prev,
        currentGameTemplateId: templateId,
        gameType: selectedTemplate.gameType,
        blindsOrRate: selectedTemplate.blindsOrRate,
        // minBuyIn, maxBuyIn は GameTemplate に定義されていないので直接操作しない
        // もしGameTemplateに含めるなら、ここに追加する
      }));
    } else {
      // "未設定" またはテンプレートが見つからない場合
      setCurrentTable(prev => ({
        ...prev,
        currentGameTemplateId: null,
        // 手動入力フィールドをクリアまたはデフォルトに戻す
        gameType: 'NLH', // デフォルトに戻す
        blindsOrRate: '',
        minBuyIn: 0,
        maxBuyIn: 0,
      }));
    }
  };


  const handleSubmit = async () => {
    setIsFormSubmitting(true);
    setError(null);

    const { id, createdAt, updatedAt, seats, ...dataToSend } = currentTable; // ★修正
    const finalData = {
        ...dataToSend,
        maxSeats: Number(dataToSend.maxSeats), // 必ず数値に変換
        status: dataToSend.status || 'active',
        gameType: dataToSend.gameType || 'Other',
        blindsOrRate: dataToSend.blindsOrRate || null,
        minBuyIn: Number(dataToSend.minBuyIn) || 0,
        maxBuyIn: Number(dataToSend.maxBuyIn) || 0,
        currentGameTemplateId: dataToSend.currentGameTemplateId || null,
    } as Omit<TableData, 'createdAt' | 'updatedAt'>;


    try {
      if (isEditing && currentTable.id) {
        const tableDocRef = doc(db, 'tables', currentTable.id);
        await updateDoc(tableDocRef, {
          ...finalData,
          updatedAt: serverTimestamp(),
        });
        alert('テーブル情報を更新しました。');
      } else {
        // 新規作成時は createTableWithSeats を使用
        const newTableRef = doc(tablesCollection); // IDを事前に取得
        const batch = writeBatch(db);

        batch.set(newTableRef, {
          ...finalData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const maxSeats = Number(finalData.maxSeats); // maxSeatsは必ず数値であるはず
        for (let i = 1; i <= maxSeats; i++) {
          const seatDocRef = doc(db, 'tables', newTableRef.id, 'seats', String(i));
          const seatDocumentData: Seat = { // Seat型を使用
            id: String(i), // FirestoreのDoc IDとして
            seatNumber: i,
            userId: null,
            userPokerName: null,
            status: 'empty',
            occupiedAt: null,
            currentStack: 0,
          };
          batch.set(seatDocRef, seatDocumentData);
        }
        await batch.commit();
        alert('新しいテーブルを作成しました。');
      }
      fetchAllData(); // テーブルとゲームテンプレートを再取得
      handleCloseDialog();
    } catch (err: any) {
      console.error("テーブルの保存に失敗:", err);
      setError('操作中にエラーが発生しました。入力内容を確認してください。');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDelete = async (id: string | undefined, tableName: string) => {
    if (!id) return;
    if (!window.confirm(`テーブル「${tableName}」を削除してもよろしいですか？この操作は元に戻せません。関連する座席データは自動では削除されません（Functionsでの実装を推奨）。`)) {
      return;
    }
    setActionLoading(prev => ({ ...prev, [id]: true })); // アクションローディング
    try {
      const tableDocRef = doc(db, 'tables', id);
      await deleteDoc(tableDocRef);
      alert(`テーブル「${tableName}」を削除しました。`);
      fetchAllData();
    } catch (err: any) {
      console.error("テーブルの削除に失敗:", err);
      setError('削除に失敗しました。');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const getGameTemplateInfo = (templateId: string | null | undefined) => { // ★引数の型を修正
    if (!templateId) return '未設定';
    const template = gameTemplates.find(gt => gt.id === templateId);
    return template ? `${template.templateName} (${template.gameType} / ${template.blindsOrRate || 'N/A'})` : '不明';
  };
  
  const formatTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({}); // 個別アクションのローディング状態


  if (appContextLoading || loadingData) {
    return <Container maxWidth="md" sx={{ mt: 4 }}><Typography className="text-center text-xl text-neutral-lightest">読み込み中...</Typography></Container>;
  }

  if (error && !openDialog) {
    return <Container maxWidth="md" sx={{ mt: 4 }}><Typography color="error" className="text-center text-red-400">{error}</Typography></Container>;
  }

  // 権限チェック (ローディング完了後)
  if (!currentUser || !currentUser.isAdmin) {
    return <Container maxWidth="md" sx={{ mt: 4 }}><Typography color="error" className="text-center text-red-500">{error || "このページへのアクセス権限がありません。"}</Typography></Container>;
  }


  return (
    <Container maxWidth="md" sx={{ mt: 4 }} className="text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <Typography variant="h4" gutterBottom component="h1" className="text-lime-400 font-bold">
          テーブル管理
        </Typography>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={handleOpenCreateDialog}
        sx={{ mb: 2, bgcolor: 'lime.600', '&:hover': { bgcolor: 'lime.700' } }}
        className="bg-lime-600 hover:bg-lime-700 text-white font-semibold py-2 px-4 rounded"
      >
        新しいテーブルを追加
      </Button>

      {tables.length === 0 ? (
        <Typography className="text-slate-400 py-10 text-center">登録されているテーブルがありません。</Typography>
      ) : (
        <TableContainer component={Paper} className="bg-slate-800 shadow-lg rounded-lg">
          <Table>
            <TableHead className="bg-slate-700">
              <TableRow>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>テーブル名</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>最大席数</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>状態</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>適用ゲーム</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>空席</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>最終更新</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>アクション</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tables.map((table) => (
                <TableRow key={table.id} className="hover:bg-slate-700/50">
                  <TableCell sx={{ color: 'white' }}>{table.name}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{table.maxSeats}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{table.status}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{getGameTemplateInfo(table.currentGameTemplateId)}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{table.seats ? table.maxSeats - table.seats.filter(s => s.userId).length : table.maxSeats} / {table.maxSeats}</TableCell>
                  <TableCell sx={{ color: 'slate.400' }}>{formatTimestamp(table.updatedAt)}</TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => handleOpenEditDialog(table)} disabled={actionLoading[table.id!]}>
                      <Edit />
                    </IconButton>
                    <IconButton color="secondary" onClick={() => handleDelete(table.id, table.name)} disabled={actionLoading[table.id!]}>
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm" PaperProps={{ className: 'bg-slate-800 text-neutral-lightest' }}>
        <DialogTitle className="text-lime-400 border-b border-slate-700 pb-3">
          {isEditing ? 'テーブルを編集' : '新しいテーブルを追加'}
        </DialogTitle>
        <DialogContent dividers className="py-4">
          {error && <Typography color="error" sx={{ mb: 2 }} className="text-red-400 text-sm">{error}</Typography>}
          <TextField
            autoFocus
            margin="dense"
            name="name"
            label="テーブル名"
            type="text"
            fullWidth
            variant="outlined"
            value={currentTable.name}
            onChange={handleChange}
            sx={{ mb: 2 }}
            InputLabelProps={{ style: { color: '#a0a0a0' } }}
            InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
          />
          <TextField
            margin="dense"
            name="maxSeats"
            label="最大席数"
            type="number"
            fullWidth
            variant="outlined"
            value={currentTable.maxSeats}
            onChange={handleChange}
            inputProps={{ min: 1 }}
            disabled={isEditing} // 編集時は変更不可
            sx={{ mb: 2 }}
            InputLabelProps={{ style: { color: '#a0a0a0' } }}
            InputProps={{ style: { color: 'white' }, className: `bg-slate-700 border-slate-600 ${isEditing ? 'opacity-70 cursor-not-allowed' : ''}` }}
            helperText={isEditing ? "※ 既存テーブルの席数は変更できません。" : ""}
          />
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel id="status-label" sx={{ color: '#a0a0a0' }}>状態</InputLabel>
            <Select
              labelId="status-label"
              id="status"
              name="status"
              value={currentTable.status || ''} // ★修正
              label="状態"
              onChange={handleMuiSelectChange} // ★修正
              sx={{ color: 'white', '& .MuiSelect-select': { backgroundColor: '#4a5568' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' } }}
            >
              {TABLE_STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* ゲームテンプレート選択ドロップダウンの追加 */}
          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel id="game-template-label" sx={{ color: '#a0a0a0' }}>適用するゲームテンプレート</InputLabel>
            <Select
              labelId="game-template-label"
              id="game-template"
              name="currentGameTemplateId"
              value={currentTable.currentGameTemplateId || ''}
              label="適用するゲームテンプレート"
              onChange={handleGameTemplateChange} // ★修正
              sx={{ color: 'white', '& .MuiSelect-select': { backgroundColor: '#4a5568' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' } }}
            >
              <MenuItem value="">
                <em>未設定 / 手動で設定</em>
              </MenuItem>
              {gameTemplates.map((template) => (
                <MenuItem key={template.id} value={template.id}>
                  {template.templateName} ({template.gameType} / {template.blindsOrRate || 'N/A'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* ゲームテンプレートが選択されていない場合のフォールバックとして、直接ゲームタイプとレートを入力するフィールド */}
          {!currentTable.currentGameTemplateId && (
            <Box sx={{ mt: 3, p: 2, border: '1px dashed #616161', borderRadius: '8px' }}>
              <Typography variant="subtitle1" className="text-slate-400 mb-2">
                テンプレート未設定時の手動設定:
              </Typography>
              <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
                <InputLabel id="game-type-manual-label" sx={{ color: '#a0a0a0' }}>ゲームタイプ (手動)</InputLabel>
                <Select
                  labelId="game-type-manual-label"
                  id="game-type-manual"
                  name="gameType"
                  value={currentTable.gameType || ''} // ★修正
                  label="ゲームタイプ (手動)"
                  onChange={handleMuiSelectChange} // ★修正
                  sx={{ color: 'white', '& .MuiSelect-select': { backgroundColor: '#4a5568' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' } }}
                >
                  {GAME_NAME_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                margin="dense"
                name="blindsOrRate"
                label="ブラインド/レート (手動, 例: 100/200)"
                type="text"
                fullWidth
                variant="outlined"
                value={currentTable.blindsOrRate || ''}
                onChange={handleChange}
                sx={{ mb: 2 }}
                InputLabelProps={{ style: { color: '#a0a0a0' } }}
                InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
              />
              <TextField
                margin="dense"
                name="minBuyIn"
                label="最小バイイン (手動)"
                type="number"
                fullWidth
                variant="outlined"
                value={currentTable.minBuyIn}
                onChange={handleChange}
                sx={{ mb: 2 }}
                InputLabelProps={{ style: { color: '#a0a0a0' } }}
                InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
              />
              <TextField
                margin="dense"
                name="maxBuyIn"
                label="最大バイイン (手動)"
                type="number"
                fullWidth
                variant="outlined"
                value={currentTable.maxBuyIn}
                onChange={handleChange}
                sx={{ mb: 2 }}
                InputLabelProps={{ style: { color: '#a0a0a0' } }}
                InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
              />
            </Box>
          )}

        </DialogContent>
        <DialogActions className="border-t border-slate-700 pt-3">
          <Button onClick={handleCloseDialog} color="primary" sx={{ color: 'slate.300', '&:hover': { bgcolor: 'slate.700' } }}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} color="primary" variant="contained" disabled={isFormSubmitting} sx={{ bgcolor: 'lime.600', '&:hover': { bgcolor: 'lime.700' } }}>
            {isFormSubmitting ? '処理中...' : (isEditing ? '更新' : '作成')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminTableManagementPage;