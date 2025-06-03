// src/pages/AdminGameTemplatesPage.tsx
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
  Switch,
  FormControlLabel,
  Box,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
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
  Timestamp, // Timestamp型をインポート
} from 'firebase/firestore';
import { GameTemplate, GameName, GAME_NAME_OPTIONS } from '../types'; // types.ts からインポート
import { useAppContext } from '../contexts/AppContext'; // AppContextをインポート
import { Link } from 'react-router-dom';

// Firestoreコレクションへの参照
const gameTemplatesCollection = collection(db, 'gameTemplates');

const AdminGameTemplatesPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext(); // AppContextからcurrentUserとloadingを取得
  const [gameTemplates, setGameTemplates] = useState<GameTemplate[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<GameTemplate>>({
    templateName: '',
    gameType: 'NLH', // デフォルト値
    rateOrMinBet: '',
    description: '',
    isActive: true,
  });
  const [isFormSubmitting, setIsFormSubmitting] = useState(false); // フォーム送信中フラグ

  const fetchGameTemplates = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const q = query(gameTemplatesCollection, orderBy('templateName', 'asc')); // templateName でソート
      const snapshot = await getDocs(q);
      const fetchedTemplates = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<GameTemplate, 'id'>;
        return {
          id: doc.id,
          ...data,
          // Firestore TimestampをDateオブジェクトに変換（表示のため）
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
        } as GameTemplate;
      });
      setGameTemplates(fetchedTemplates);
    } catch (err: any) {
      console.error("ゲームテンプレートの取得に失敗:", err);
      setError(`ゲームテンプレートの取得に失敗しました: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading) { // AppContextの読み込み完了後に実行
      if (currentUser && currentUser.isAdmin) {
        fetchGameTemplates();
      } else if (currentUser && !currentUser.isAdmin) {
        setError("このページへのアクセス権限がありません。");
        setLoadingData(false);
      } else if (!currentUser) {
        setError("ログインしていません。");
        setLoadingData(false);
      }
    }
  }, [appContextLoading, currentUser, fetchGameTemplates]);

  const handleOpenCreateDialog = () => {
    setIsEditing(false);
    setCurrentTemplate({
      templateName: '',
      gameType: 'NLH',
      rateOrMinBet: '',
      description: '',
      isActive: true,
    });
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (template: GameTemplate) => {
    setIsEditing(true);
    setCurrentTemplate({
      ...template,
      // Dateオブジェクトに変換されていることを確認
      createdAt: template.createdAt instanceof Timestamp ? template.createdAt.toDate() : template.createdAt,
      updatedAt: template.updatedAt instanceof Timestamp ? template.updatedAt.toDate() : template.updatedAt,
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError(null); // ダイアログを閉じる際にエラーをリセット
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | { name?: string; value: unknown }>) => {
    const { name, value, type, checked } = e.target;
    // Selectコンポーネントからの変更を考慮
    const val = type === 'checkbox' ? checked : value;

    setCurrentTemplate((prev) => ({
      ...prev,
      [name as string]: val,
    }));
  };

  const handleSubmit = async () => {
    setIsFormSubmitting(true);
    setError(null);
    // 送信するデータから不要なプロパティ（idなど）を除外
    const { id, createdAt, updatedAt, ...dataToSend } = currentTemplate;
    const finalData = {
      ...dataToSend,
      gameType: dataToSend.gameType || 'Other', // 必ずgameTypeを持つように
      templateName: dataToSend.templateName || '', // 必ずtemplateNameを持つように
      isActive: dataToSend.isActive ?? true, // undefinedの場合はtrue
      rateOrMinBet: dataToSend.rateOrMinBet || null, // 空文字列はnullに
      description: dataToSend.description || '', // 空文字列に
    } as Omit<GameTemplate, 'id' | 'createdAt' | 'updatedAt'>;

    try {
      if (isEditing && currentTemplate.id) {
        const templateDocRef = doc(db, 'gameTemplates', currentTemplate.id);
        await updateDoc(templateDocRef, {
          ...finalData,
          updatedAt: serverTimestamp(),
        });
        alert('ゲームテンプレートを更新しました。');
      } else {
        await addDoc(gameTemplatesCollection, {
          ...finalData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        alert('新しいゲームテンプレートを作成しました。');
      }
      fetchGameTemplates();
      handleCloseDialog();
    } catch (err: any) {
      console.error("ゲームテンプレートの保存に失敗:", err);
      setError('操作中にエラーが発生しました。入力内容を確認してください。');
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    if (!window.confirm('本当にこのゲームテンプレートを削除しますか？この操作は元に戻せません。')) {
      return;
    }
    setActionLoading(prev => ({ ...prev, [id]: true })); // アクションローディング
    try {
      const templateDocRef = doc(db, 'gameTemplates', id);
      await deleteDoc(templateDocRef);
      alert('ゲームテンプレートを削除しました。');
      fetchGameTemplates();
    } catch (err: any) {
      console.error("ゲームテンプレートの削除に失敗:", err);
      setError('削除に失敗しました。');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
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
        <Typography variant="h4" gutterBottom component="h1" className="text-indigo-400 font-bold">
          ゲームの種類とレート管理
        </Typography>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={handleOpenCreateDialog}
        sx={{ mb: 2, bgcolor: 'indigo.600', '&:hover': { bgcolor: 'indigo.700' } }}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded"
      >
        新しいテンプレートを追加
      </Button>

      {gameTemplates.length === 0 ? (
        <Typography className="text-slate-400 py-10 text-center">登録されているゲームテンプレートがありません。</Typography>
      ) : (
        <TableContainer component={Paper} className="bg-slate-800 shadow-lg rounded-lg">
          <Table>
            <TableHead className="bg-slate-700">
              <TableRow>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>テンプレート名</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>ゲームタイプ</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>レート/ミニマムベット</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>説明</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>有効</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>最終更新</TableCell>
                <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>アクション</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {gameTemplates.map((template) => (
                <TableRow key={template.id} className="hover:bg-slate-700/50">
                  <TableCell sx={{ color: 'white' }}>{template.templateName}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{template.gameType}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{template.rateOrMinBet || 'N/A'}</TableCell>
                  <TableCell sx={{ color: 'slate.400' }}>{template.description || 'なし'}</TableCell>
                  <TableCell sx={{ color: 'slate.200' }}>{template.isActive ? 'はい' : 'いいえ'}</TableCell>
                  <TableCell sx={{ color: 'slate.400' }}>{formatTimestamp(template.updatedAt)}</TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => handleOpenEditDialog(template)} disabled={actionLoading[template.id!]}>
                      <Edit />
                    </IconButton>
                    <IconButton color="secondary" onClick={() => handleDelete(template.id)} disabled={actionLoading[template.id!]}>
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
        <DialogTitle className="text-indigo-400 border-b border-slate-700 pb-3">
          {isEditing ? 'ゲームテンプレートを編集' : '新しいゲームテンプレートを追加'}
        </DialogTitle>
        <DialogContent dividers className="py-4">
          {error && <Typography color="error" sx={{ mb: 2 }} className="text-red-400 text-sm">{error}</Typography>}
          <TextField
            autoFocus
            margin="dense"
            name="templateName"
            label="テンプレート名"
            type="text"
            fullWidth
            variant="outlined"
            value={currentTemplate.templateName}
            onChange={handleChange}
            sx={{ mb: 2 }}
            InputLabelProps={{ style: { color: '#a0a0a0' } }}
            InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
          />

          <FormControl fullWidth margin="dense" sx={{ mb: 2 }}>
            <InputLabel id="game-type-label" sx={{ color: '#a0a0a0' }}>ゲームタイプ</InputLabel>
            <Select
              labelId="game-type-label"
              id="game-type"
              name="gameType"
              value={currentTemplate.gameType}
              label="ゲームタイプ"
              onChange={handleChange}
              sx={{ color: 'white', '& .MuiSelect-select': { backgroundColor: '#4a5568' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4a5568' } }}
            >
              {GAME_NAME_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            margin="dense"
            name="rateOrMinBet"
            label="レート / ミニマムベット (例: 100/200, 500)"
            type="text"
            fullWidth
            variant="outlined"
            value={currentTemplate.rateOrMinBet || ''}
            onChange={handleChange}
            sx={{ mb: 2 }}
            InputLabelProps={{ style: { color: '#a0a0a0' } }}
            InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
          />
          <TextField
            margin="dense"
            name="description"
            label="説明 (任意)"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={currentTemplate.description || ''}
            onChange={handleChange}
            sx={{ mb: 2 }}
            InputLabelProps={{ style: { color: '#a0a0a0' } }}
            InputProps={{ style: { color: 'white' }, className: 'bg-slate-700 border-slate-600' }}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={currentTemplate.isActive}
                onChange={handleChange}
                name="isActive"
                color="primary"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#6366f1' }, '& .MuiSwitch-track': { backgroundColor: '#a0a0a0' } }}
              />
            }
            label={<Typography style={{ color: '#a0a0a0' }}>現在有効</Typography>}
          />
        </DialogContent>
        <DialogActions className="border-t border-slate-700 pt-3">
          <Button onClick={handleCloseDialog} color="primary" sx={{ color: 'slate.300', '&:hover': { bgcolor: 'slate.700' } }}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} color="primary" variant="contained" disabled={isFormSubmitting} sx={{ bgcolor: 'indigo.600', '&:hover': { bgcolor: 'indigo.700' } }}>
            {isFormSubmitting ? '処理中...' : (isEditing ? '更新' : '作成')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminGameTemplatesPage;