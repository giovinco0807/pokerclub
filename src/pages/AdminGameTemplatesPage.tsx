// src/pages/AdminGameTemplatesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Switch,
  FormControlLabel, Box, MenuItem, Select, InputLabel, FormControl,
  Grid, CircularProgress // CircularProgress をインポート
} from '@mui/material';
import { Add, Edit, Delete, Loop as LoopIcon } from '@mui/icons-material';
import { SelectChangeEvent } from '@mui/material/Select';
import { db } from '../services/firebase';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { GameTemplate, GameName, GAME_NAME_OPTIONS } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import { StatusBadge } from '../components/admin/UserDetailsModal';

const gameTemplatesCollectionRef = collection(db, 'gameTemplates');

const formComponentStyles = {
  label: {
    color: 'slate.400',
    '&.Mui-focused': {
      color: 'sky.400',
    },
  },
  inputBase: {
    color: 'neutral.lightest',
    backgroundColor: 'slate.700',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: 'slate.600',
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: 'slate.500',
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: 'sky.500',
    },
    '& .MuiSelect-icon': {
        color: 'slate.400',
    }
  },
  menuPaper: {
    bgcolor: 'slate.700',
    color: 'neutral.lightest',
    border: '1px solid',
    borderColor: 'slate.600',
    '& .MuiMenuItem-root:hover': {
      backgroundColor: 'slate.600',
    },
  },
  switchControl: {
    '& .MuiSwitch-switchBase.Mui-checked': {
      color: 'indigo.500',
    },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
      backgroundColor: 'indigo.500',
    },
    '& .MuiSwitch-switchBase': {
        color: 'slate.500',
      },
    '& .MuiSwitch-track': {
        backgroundColor: 'slate.600',
    },
  },
  formControlLabel: {
    color: 'slate.300',
  }
};


const AdminGameTemplatesPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [gameTemplates, setGameTemplates] = useState<GameTemplate[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const initialFormState: Partial<GameTemplate> = {
    templateName: '',
    gameType: GAME_NAME_OPTIONS[0],
    blindsOrRate: '',
    description: '',
    minPlayers: undefined,
    maxPlayers: undefined,
    estimatedDurationMinutes: undefined,
    notesForUser: '',
    isActive: true,
    sortOrder: 0,
  };
  const [currentTemplate, setCurrentTemplate] = useState<Partial<GameTemplate>>(initialFormState);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  const fetchGameTemplates = useCallback(async () => {
    setLoadingData(true); setError(null);
    try {
      const q = query(gameTemplatesCollectionRef, orderBy('sortOrder', 'asc'), orderBy('templateName', 'asc'));
      const snapshot = await getDocs(q);
      const fetchedTemplates = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return {
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
        } as GameTemplate;
      });
      setGameTemplates(fetchedTemplates);
    } catch (err: any) {
      console.error("ゲームテンプレートの取得に失敗:", err);
      setError(`テンプレート取得エラー: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading) {
      if (currentUser?.isAdmin) {
        fetchGameTemplates();
      } else {
        setError(currentUser ? "このページへのアクセス権限がありません。" : "ログインしていません。");
        setLoadingData(false);
      }
    }
  }, [appContextLoading, currentUser, fetchGameTemplates]);

  const handleOpenCreateDialog = () => {
    setIsEditing(false);
    setCurrentTemplate(initialFormState);
    setFormError(null);
    setOpenDialog(true);
  };

  const handleOpenEditDialog = (template: GameTemplate) => {
    setIsEditing(true);
    setCurrentTemplate({
      ...template,
      createdAt: template.createdAt instanceof Timestamp ? template.createdAt.toDate() : template.createdAt,
      updatedAt: template.updatedAt instanceof Timestamp ? template.updatedAt.toDate() : template.updatedAt,
    });
    setFormError(null);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setFormError(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const isNumericField = ['minPlayers', 'maxPlayers', 'estimatedDurationMinutes', 'sortOrder'].includes(name);
    let processedValue: string | number | undefined = value;
    if (isNumericField) {
        processedValue = value === '' ? undefined : Number(value);
        if (value !== '' && isNaN(Number(processedValue))) {
            return;
        }
    }
    setCurrentTemplate(prev => ({ ...prev, [name]: processedValue }));
  };

  const handleSelectChange = (event: SelectChangeEvent<GameName>) => {
    const { name, value } = event.target;
    setCurrentTemplate(prev => ({ ...prev, [name as string]: value as GameName }));
  };

  const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTemplate(prev => ({ ...prev, isActive: event.target.checked }));
  };

  const handleSubmit = async () => {
    if (!currentTemplate.templateName?.trim() || !currentTemplate.gameType) {
      setFormError("テンプレート名とゲームタイプは必須です。");
      return;
    }
    setIsFormSubmitting(true); setFormError(null);

    const dataToSave: Omit<GameTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      templateName: currentTemplate.templateName.trim(),
      gameType: currentTemplate.gameType,
      blindsOrRate: currentTemplate.blindsOrRate?.trim() || undefined,
      description: currentTemplate.description?.trim() || '',
      minPlayers: currentTemplate.minPlayers !== undefined && !isNaN(currentTemplate.minPlayers) ? Number(currentTemplate.minPlayers) : undefined,
      maxPlayers: currentTemplate.maxPlayers !== undefined && !isNaN(currentTemplate.maxPlayers) ? Number(currentTemplate.maxPlayers) : undefined,
      estimatedDurationMinutes: currentTemplate.estimatedDurationMinutes !== undefined && !isNaN(currentTemplate.estimatedDurationMinutes) ? Number(currentTemplate.estimatedDurationMinutes) : undefined,
      notesForUser: currentTemplate.notesForUser?.trim() || '',
      isActive: currentTemplate.isActive === undefined ? true : currentTemplate.isActive,
      sortOrder: currentTemplate.sortOrder !== undefined && !isNaN(currentTemplate.sortOrder) ? Number(currentTemplate.sortOrder) : 0,
    };

    try {
      if (isEditing && currentTemplate.id) {
        const templateDocRef = doc(db, 'gameTemplates', currentTemplate.id);
        await updateDoc(templateDocRef, {
          ...(dataToSave as Partial<GameTemplate>),
          updatedAt: serverTimestamp(),
        });
        alert('ゲームテンプレートを更新しました。');
      } else {
        await addDoc(gameTemplatesCollectionRef, {
          ...dataToSave,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        alert('新しいゲームテンプレートを作成しました。');
      }
      fetchGameTemplates();
      handleCloseDialog();
    } catch (err: any) {
      console.error("ゲームテンプレートの保存に失敗:", err);
      setFormError(`保存エラー: ${err.message}`);
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDelete = async (id: string | undefined, templateName?: string) => {
    if (!id) { console.error("削除対象のIDがありません。"); return; }
    if (!window.confirm(`テンプレート「${templateName || id}」を本当に削除しますか？この操作は元に戻せません。`)) return;

    const loadingKey = `delete-${id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    setError(null);
    try {
      await deleteDoc(doc(db, 'gameTemplates', id));
      alert(`テンプレート「${templateName || id}」を削除しました。`);
      fetchGameTemplates();
    } catch (err: any) {
      console.error("ゲームテンプレートの削除に失敗:", err);
      setError(`削除エラー: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const formatDisplayTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (appContextLoading) {
    return <AdminLayout><Container maxWidth="lg" sx={{ mt: 4 }}><Typography className="text-center text-xl text-neutral-lightest">アプリ情報読込中...</Typography></Container></AdminLayout>;
  }
  if (!currentUser?.isAdmin) {
    return <AdminLayout><Container maxWidth="lg" sx={{ mt: 4 }}><Typography color="error" className="text-center text-red-500">{error || "アクセス権限がありません。"}</Typography></Container></AdminLayout>;
  }

  return (
    <AdminLayout>
      <Container maxWidth="lg" sx={{ mt: 4, color: 'neutral.lightest' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, pb: 2, borderBottom: 1, borderColor: 'slate.700' }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'red.500' }}>
            ゲームテンプレート管理
          </Typography>
          <Button component={Link} to="/admin" sx={{ color: 'sky.400', '&:hover': { textDecoration: 'underline' } }}>
            ← 管理Dashboardへ
          </Button>
        </Box>

        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleOpenCreateDialog}
          sx={{ mb: 3, bgcolor: 'indigo.600', '&:hover': { bgcolor: 'indigo.700' } }}
        >
          新規テンプレート作成
        </Button>

        {error && <Typography color="error" sx={{ mb: 2, p: 2, bgcolor: 'red.900', borderRadius: 1 }}>{error}</Typography>}
        {loadingData && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress sx={{color: 'sky.400'}} /></Box>} {/* ローディングアイコンの色調整 */}

        {!loadingData && gameTemplates.length === 0 && !error && (
          <Typography sx={{ py: 5, textAlign: 'center', color: 'slate.400' }}>
            登録されているゲームテンプレートがありません。
          </Typography>
        )}

        {!loadingData && gameTemplates.length > 0 && (
          <TableContainer component={Paper} sx={{ bgcolor: 'slate.800', boxShadow: 3, borderRadius: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="ゲームテンプレート一覧">
              <TableHead sx={{ bgcolor: 'slate.700' }}>
                <TableRow>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>テンプレート名</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>タイプ</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>レート/ブラインド</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold', minWidth:120 }}>最小/最大人数</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>受付状態</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>表示順</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold', minWidth:150 }}>説明</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>最終更新</TableCell>
                  <TableCell sx={{ color: 'slate.300', fontWeight: 'bold' }}>アクション</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gameTemplates.map((template) => (
                  <TableRow key={template.id} hover sx={{ '&:hover': { bgcolor: 'slate.700/50' } }}>
                    {/* ★★★ テンプレート名の文字色を調整 ★★★ */}
                    <TableCell sx={{ color: 'sky.300', borderBottomColor: 'slate.700', fontWeight: 'medium' }}>{template.templateName}</TableCell>
                    <TableCell sx={{ color: 'slate.200', borderBottomColor: 'slate.700' }}>{template.gameType}</TableCell>
                    <TableCell sx={{ color: 'slate.200', borderBottomColor: 'slate.700' }}>{template.blindsOrRate || '-'}</TableCell>
                    <TableCell sx={{ color: 'slate.200', borderBottomColor: 'slate.700' }}>{template.minPlayers ?? '-'}/{template.maxPlayers ?? '-'}</TableCell>
                    <TableCell sx={{ color: 'slate.200', borderBottomColor: 'slate.700' }}>
                      <StatusBadge color={template.isActive ? "green" : "slate"} text={template.isActive ? "受付中" : "停止中"} />
                    </TableCell>
                    <TableCell sx={{ color: 'slate.200', borderBottomColor: 'slate.700', textAlign: 'center' }}>{template.sortOrder ?? '-'}</TableCell>
                    <TableCell sx={{ color: 'slate.400', borderBottomColor: 'slate.700', maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem' }}>{template.description || '-'}</TableCell>
                    <TableCell sx={{ color: 'slate.400', borderBottomColor: 'slate.700', fontSize: '0.75rem' }}>{formatDisplayTimestamp(template.updatedAt)}</TableCell>
                    <TableCell sx={{ borderBottomColor: 'slate.700' }}>
                      <IconButton size="small" sx={{color: 'sky.400', '&:hover': {color: 'sky.300'}}} onClick={() => handleOpenEditDialog(template)} disabled={!!actionLoading[template.id!]}>
                        <Edit fontSize="small"/>
                      </IconButton>
                      <IconButton size="small" sx={{color: 'red.400', '&:hover': {color: 'red.300'}}} onClick={() => handleDelete(template.id, template.templateName)} disabled={!!actionLoading[template.id!]}>
                        {actionLoading[template.id!] ? <CircularProgress size={18} color="inherit" /> : <Delete fontSize="small"/>}
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" PaperProps={{ sx: { bgcolor: 'slate.800', color: 'neutral.lightest' } }}>
          <DialogTitle sx={{ color: 'red.400', borderBottom: 1, borderColor: 'slate.700', pb:2 }}>
            {isEditing ? 'ゲームテンプレート編集' : '新規ゲームテンプレート作成'}
          </DialogTitle>
          <DialogContent dividers sx={{ py: 3, bgcolor: 'slate.800' }}>
            {formError && <Typography color="error" sx={{ mb: 2, bgcolor: 'red.900', p:1, borderRadius:1, fontSize: '0.875rem' }}>{formError}</Typography>}
            <Box component="form" noValidate autoComplete="off" className="space-y-4">
              <TextField fullWidth label="テンプレート名 *" name="templateName" value={currentTemplate.templateName || ''} onChange={handleInputChange} required InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase }} variant="outlined"/>
              <FormControl fullWidth variant="outlined">
                <InputLabel id="gameType-label-dialog" sx={formComponentStyles.label}>ゲームタイプ *</InputLabel>
                <Select labelId="gameType-label-dialog" name="gameType" value={currentTemplate.gameType || ''} label="ゲームタイプ *" onChange={handleSelectChange} sx={formComponentStyles.inputBase} MenuProps={{ PaperProps: { sx: formComponentStyles.menuPaper } }}>
                  {GAME_NAME_OPTIONS.map(option => <MenuItem key={option} value={option} sx={{ '&:hover': { backgroundColor: 'slate.600' } }}>{option}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField fullWidth label="レート/ブラインド (例: 100/200)" name="blindsOrRate" value={currentTemplate.blindsOrRate || ''} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase }} variant="outlined"/>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField fullWidth label="最小人数" name="minPlayers" type="number" value={currentTemplate.minPlayers === undefined ? '' : currentTemplate.minPlayers} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase, type: 'number' }} variant="outlined"/>
                </Grid>
                <Grid item xs={6}>
                  <TextField fullWidth label="最大人数" name="maxPlayers" type="number" value={currentTemplate.maxPlayers === undefined ? '' : currentTemplate.maxPlayers} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase, type: 'number' }} variant="outlined"/>
                </Grid>
              </Grid>
              <TextField fullWidth label="想定プレイ時間(分)" name="estimatedDurationMinutes" type="number" value={currentTemplate.estimatedDurationMinutes === undefined ? '' : currentTemplate.estimatedDurationMinutes} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase, type: 'number' }} variant="outlined"/>
              <TextField fullWidth label="説明 (任意)" name="description" multiline rows={3} value={currentTemplate.description || ''} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase }} variant="outlined"/>
              <TextField fullWidth label="ユーザー向け補足 (任意)" name="notesForUser" multiline rows={2} value={currentTemplate.notesForUser || ''} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase }} variant="outlined"/>
              <TextField fullWidth label="表示順 (任意、整数、小さいほど先)" name="sortOrder" type="number" value={currentTemplate.sortOrder === undefined ? '' : currentTemplate.sortOrder} onChange={handleInputChange} InputLabelProps={{ sx: formComponentStyles.label }} InputProps={{ sx: formComponentStyles.inputBase, type: 'number' }} variant="outlined"/>
              <FormControlLabel
                control={<Switch checked={currentTemplate.isActive === undefined ? true : currentTemplate.isActive} onChange={handleSwitchChange} name="isActive" sx={formComponentStyles.switchControl} />}
                label={<Typography sx={formComponentStyles.formControlLabel}>ウェイティング受付中</Typography>}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ borderTop: 1, borderColor: 'slate.700', pt: 2, pb:2, px:3, bgcolor: 'slate.800' }}>
            <Button onClick={handleCloseDialog} sx={{ color: 'slate.300', '&:hover': { bgcolor: 'slate.700' } }}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={isFormSubmitting} variant="contained" sx={{ bgcolor: 'indigo.600', '&:hover': { bgcolor: 'indigo.700' } }}>
              {isFormSubmitting ? <CircularProgress size={22} color="inherit" /> : (isEditing ? '更新' : '作成')}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </AdminLayout>
  );
};

export default AdminGameTemplatesPage;