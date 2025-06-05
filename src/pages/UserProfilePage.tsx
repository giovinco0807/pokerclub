// src/pages/UserProfilePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Link, useNavigate } from 'react-router-dom';
import { UserData, Order, WithdrawalRequest, GameSession } from '../types';
import { getUser } from '../services/userService';
import { auth, db, storage } from '../services/firebase';
import { doc, updateDoc, onSnapshot, query, collection, where, orderBy, Timestamp, FieldValue, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StatusBadge } from '../components/admin/UserDetailsModal';
import { Switch, FormControlLabel, Typography, Box, CircularProgress, Alert, Grid, TextField, Button as MuiButton, Container, Paper, Tabs, Tab } from '@mui/material';
// ★★★ date-fns v3 用の Adapter をインポート ★★★
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ja } from 'date-fns/locale/ja';
// ★★★ FileUploadProps を名前付きインポート ★★★
import FileUpload, { FileUploadProps } from '../components/common/FileUpload';


// ファイルサイズとタイプバリデーション (変更なし)
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_TYPES_STRING = ".jpg, .jpeg, .png, .webp, .gif";
const MAX_AVATAR_FILE_SIZE_MB = 2;
const MAX_AVATAR_FILE_SIZE_BYTES = MAX_AVATAR_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPTED_AVATAR_TYPES_STRING = ".jpg, .jpeg, .png, .gif, .webp";


const userProfileSchema = z.object({
  pokerName: z.string().min(1, 'ポーカーネームは必須です').max(50, '50文字以内で入力してください'),
  fullName: z.string().min(1, '氏名は必須です').max(50, '50文字以内で入力してください'),
  address: z.string().min(1, '住所は必須です').max(100, '100文字以内で入力してください'),
  phone: z.string().min(10, '有効な電話番号を入力してください').max(15, '電話番号が長すぎます').regex(/^[0-9]+$/, "電話番号は数字のみで入力してください"),
  birthDate: z.string().length(8, '生年月日は8桁の数字で入力 (例: 19900101)').regex(/^\d{8}$/, "生年月日は8桁の数字 (例: 19900101)").optional().or(z.literal('')),
  idFront: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE_BYTES, `画像サイズは${MAX_FILE_SIZE_MB}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`)
    .optional(),
  idBack: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE_BYTES, `画像サイズは${MAX_FILE_SIZE_MB}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`)
    .optional(),
  avatarFile: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_AVATAR_FILE_SIZE_BYTES, `アイコン画像は${MAX_AVATAR_FILE_SIZE_MB}MB以下にしてください。`)
    .refine(files => !files || files.length === 0 || ACCEPTED_AVATAR_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_AVATAR_TYPES_STRING}`)
    .optional(),
});

type UserProfileFormData = z.infer<typeof userProfileSchema>;

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


const UserProfilePage: React.FC = () => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const navigate = useNavigate();

  const [firestoreUserData, setFirestoreUserData] = useState<UserData | null>(null);
  const [editableUserData, setEditableUserData] = useState<Partial<UserData>>({});

  const [isEditing, setIsEditing] = useState(false);
  const [loadingLocalData, setLoadingLocalData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [gameSessions, setGameSessions] = useState<GameSession[]>([]);
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
  });

  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFileToUpload, setAvatarFileToUpload] = useState<File | null>(null); // アバターファイル専用のstate


  const fetchAndInitializeUserData = useCallback(async () => {
    if (!currentUser?.uid) {
      setLoadingLocalData(false);
      setError("ユーザーが特定できません。");
      return;
    }
    setLoadingLocalData(true);
    setError(null);
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        setFirestoreUserData(data);
        setEditableUserData(JSON.parse(JSON.stringify(data)));
        reset({
          pokerName: data.pokerName || '',
          fullName: data.fullName || '',
          address: data.address || '',
          phone: data.phone || '',
          birthDate: data.birthDate || '',
        });
        setIdFrontPreview(data.idFrontUrl || null);
        setIdBackPreview(data.idBackUrl || null);
        setAvatarPreview(data.avatarUrl || data.pendingAvatarUrl || null);
      } else {
        setError("ユーザーデータが見つかりませんでした。");
        setFirestoreUserData(null);
        setEditableUserData({});
      }
    } catch (err: any) {
      console.error("ユーザーデータ取得エラー:", err);
      setError("ユーザー情報の読み込みに失敗しました。");
    } finally {
      setLoadingLocalData(false);
    }
  }, [currentUser?.uid, reset]);

  useEffect(() => {
    if (!appContextLoading && currentUser) {
      fetchAndInitializeUserData();
    } else if (!appContextLoading && !currentUser) {
      setLoadingLocalData(false);
      setFirestoreUserData(null);
      setEditableUserData({});
      setError("プロフィールを表示するにはログインが必要です。");
    }
  }, [appContextLoading, currentUser, fetchAndInitializeUserData]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setOrders([]);
      setWithdrawalRequests([]);
      setGameSessions([]);
      return;
    }
    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', currentUser.uid), orderBy('orderedAt', 'desc')),
      (snapshot) => setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order))),
      (err) => console.error("注文履歴取得エラー:", err)
    );
    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('userId', '==', currentUser.uid), orderBy('requestedAt', 'desc')),
      (snapshot) => setWithdrawalRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest))),
      (err) => console.error("チップ引き出し履歴取得エラー:", err)
    );
    const unsubGameSessions = onSnapshot(
      query(collection(db, 'gameSessions'), where('userId', '==', currentUser.uid), orderBy('sessionStartTime', 'desc')),
      (snapshot) => setGameSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as GameSession))),
      (err) => console.error("ゲームセッション履歴取得エラー:", err)
    );
    return () => { unsubOrders(); unsubWithdrawals(); unsubGameSessions(); };
  }, [currentUser]);

  const watchIdFront = watch("idFront");
  const watchIdBack = watch("idBack");
  const watchedAvatarFileHookForm = watch("avatarFile"); // react-hook-formからの監視

  useEffect(() => {
    if (watchIdFront && watchIdFront.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdFrontPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdFront[0]);
    } else if (firestoreUserData?.idFrontUrl && isEditing) {
      setIdFrontPreview(firestoreUserData.idFrontUrl);
    } else if (!isEditing && firestoreUserData?.idFrontUrl){
      setIdFrontPreview(firestoreUserData.idFrontUrl);
    }
     else {
       setIdFrontPreview(null)
    }
  }, [watchIdFront, firestoreUserData?.idFrontUrl, isEditing]);

  useEffect(() => {
    if (watchIdBack && watchIdBack.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdBackPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdBack[0]);
    } else if (firestoreUserData?.idBackUrl && isEditing) {
      setIdBackPreview(firestoreUserData.idBackUrl);
    } else if (!isEditing && firestoreUserData?.idBackUrl){
        setIdBackPreview(firestoreUserData.idBackUrl);
    } else {
      setIdBackPreview(null);
    }
  }, [watchIdBack, firestoreUserData?.idBackUrl, isEditing]);

  // アバターファイルのプレビューとファイル自体の保持
  useEffect(() => {
    if (watchedAvatarFileHookForm && watchedAvatarFileHookForm.length > 0) {
      const file = watchedAvatarFileHookForm[0];
      setAvatarFileToUpload(file); // 実際にアップロードするファイルをstateに保持
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setAvatarFileToUpload(null); // ファイル選択がクリアされたらnullに
      // 編集モードでない場合、またはファイルが選択されていない場合は既存の画像を表示
      if (firestoreUserData?.avatarUrl || firestoreUserData?.pendingAvatarUrl) {
        setAvatarPreview(firestoreUserData.avatarUrl || firestoreUserData.pendingAvatarUrl || null);
      } else {
        setAvatarPreview(null);
      }
    }
  }, [watchedAvatarFileHookForm, firestoreUserData?.avatarUrl, firestoreUserData?.pendingAvatarUrl]);


  const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditableUserData(prev => ({ ...prev, [name]: value }));
    setValue(name as keyof UserProfileFormData, value, { shouldValidate: true });
    setSuccessMessage(null);
  };

  const handleBirthDateChange = (date: Date | null) => {
    let newBirthDateString = '';
    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      newBirthDateString = `${year}${month}${day}`;
    }
    setEditableUserData(prev => ({ ...prev, birthDate: newBirthDateString }));
    setValue('birthDate', newBirthDateString, { shouldValidate: true }); // スキーマに合わせて空文字許容
    setSuccessMessage(null);
  };

  const handlePrivacyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setEditableUserData(prev => ({
      ...prev,
      privacySettings: {
        ...prev?.privacySettings,
        [name]: checked,
      }
    }));
    setSuccessMessage(null);
  };

  const onSubmit: SubmitHandler<UserProfileFormData> = async (formDataFromHook) => {
    if (!currentUser?.uid || !firestoreUserData) {
      setError("ユーザー情報がありません。ログインしてください。");
      return;
    }
    setIsSubmitting(true);
    setSuccessMessage(null);
    setError(null);

    const userDocRef = doc(db, 'users', currentUser.uid);
    const updates: Partial<UserData> = {};
    let hasChanges = false;

    // editableUserData (ローカルステート) と firestoreUserData (DBからの初期値) を比較
    Object.keys(editableUserData).forEach(key => {
        const typedKey = key as keyof UserData;
        if (typedKey === 'privacySettings') {
            if (JSON.stringify(editableUserData.privacySettings) !== JSON.stringify(firestoreUserData.privacySettings)) {
                updates.privacySettings = editableUserData.privacySettings;
                hasChanges = true;
            }
        } else if (editableUserData[typedKey] !== firestoreUserData[typedKey]) {
            updates[typedKey] = editableUserData[typedKey] as any;
            hasChanges = true;
        }
    });

    try {
      const idFrontFile = watchIdFront && watchIdFront.length > 0 ? watchIdFront[0] : null;
      const idBackFile = watchIdBack && watchIdBack.length > 0 ? watchIdBack[0] : null;
      // アバターファイルは avatarFileToUpload state から取得
      // const avatarFileToUpload = watchAvatarFile && watchAvatarFile.length > 0 ? watchAvatarFile[0] : null;

      if (idFrontFile) {
        const frontUrl = await uploadImage(idFrontFile, `idImages/${currentUser.uid}/front_${Date.now()}_${idFrontFile.name}`);
        updates.idFrontUrl = frontUrl; hasChanges = true;
      } else if (idFrontPreview === null && firestoreUserData?.idFrontUrl) {
        updates.idFrontUrl = null; hasChanges = true;
      }

      if (idBackFile) {
        const backUrl = await uploadImage(idBackFile, `idImages/${currentUser.uid}/back_${Date.now()}_${idBackFile.name}`);
        updates.idBackUrl = backUrl; hasChanges = true;
      } else if (idBackPreview === null && firestoreUserData?.idBackUrl) {
        updates.idBackUrl = null; hasChanges = true;
      }

      if (avatarFileToUpload) { // avatarFileToUpload state を使用
        const avatarUrl = await uploadImage(avatarFileToUpload, `avatars/${currentUser.uid}/avatar_${Date.now()}_${avatarFileToUpload.name}`);
        updates.pendingAvatarUrl = avatarUrl;
        updates.avatarApproved = false;
        updates.avatarApprovalStatus = 'pending';
        hasChanges = true;
      } else if (avatarPreview === null && (firestoreUserData?.avatarUrl || firestoreUserData?.pendingAvatarUrl)) {
        updates.avatarUrl = null;
        updates.pendingAvatarUrl = null;
        updates.avatarApproved = false;
        updates.avatarApprovalStatus = null;
        hasChanges = true;
      }

      if (hasChanges) {
        await updateDoc(userDocRef, { ...updates, updatedAt: serverTimestamp() });
        setSuccessMessage("プロフィールが正常に更新されました！");
        await refreshCurrentUser();
        await fetchAndInitializeUserData();
      } else {
        setSuccessMessage("プロフィールに変更はありませんでした。");
      }

      setIsEditing(false);
      setTimeout(() => setSuccessMessage(null), 4000);

    } catch (e: any) {
      console.error("プロフィール更新エラー:", e);
      setError(`プロフィールの更新に失敗しました: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadImage = async (file: File, path: string): Promise<string> => {
    const imageRef = storageRef(storage, path);
    const snapshot = await uploadBytes(imageRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  if (appContextLoading || loadingLocalData) {
    return <div className="text-center p-10 text-xl text-neutral-lightest">ユーザー情報を読み込み中...</div>;
  }
  if (error && !firestoreUserData) {
    return <div className="text-center p-10 text-xl text-red-400 bg-red-900/30 rounded-md">{error}</div>;
  }
  if (!currentUser || !firestoreUserData) {
    return <div className="text-center p-10 text-xl text-yellow-400">ログインが必要です。</div>;
  }

  const birthDateForPicker = editableUserData.birthDate && editableUserData.birthDate.length === 8
    ? new Date(Number(editableUserData.birthDate.substring(0,4)), Number(editableUserData.birthDate.substring(4,6)) - 1, Number(editableUserData.birthDate.substring(6,8)))
    : null;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja}>
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-8 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-sky-400">マイプロフィール</h1>
        <Link to="/" className="text-red-400 hover:text-red-300 hover:underline text-sm">
          ← メインページに戻る
        </Link>
      </div>

      {successMessage && <div className="mb-4 p-3 bg-green-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{successMessage}</div>}
      {error && <div className="mb-4 p-3 bg-red-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn" onClick={() => setError(null)}>{error}</div>}

      <Tabs value={tabValue} onChange={handleTabChange} centered
        sx={{ mb: 3, '& .MuiTabs-indicator': { backgroundColor: 'sky.400' }, '& .MuiTab-root': { color: 'slate.400', '&.Mui-selected': { color: 'sky.300' } } }}
      >
        <Tab label="基本情報" />
        <Tab label="注文履歴" />
        <Tab label="チップ引き出し履歴" />
        <Tab label="ゲームプレイ履歴" />
      </Tabs>

      {tabValue === 0 && (
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
        <h2 className="text-2xl font-semibold text-amber-400 mb-4 border-b border-slate-700 pb-2">基本情報</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isEditing ? (
            <>
              <TextField fullWidth label="ポーカーネーム" name="pokerName" value={editableUserData.pokerName || ''} onChange={handleFormInputChange} error={!!errors.pokerName} helperText={errors.pokerName?.message} required InputLabelProps={{ sx: { color: 'slate.400' } }} InputProps={{ sx: { color: 'white', bgcolor: 'slate.700' } }} />
              <TextField fullWidth label="氏名" name="fullName" value={editableUserData.fullName || ''} onChange={handleFormInputChange} error={!!errors.fullName} helperText={errors.fullName?.message} required InputLabelProps={{ sx: { color: 'slate.400' } }} InputProps={{ sx: { color: 'white', bgcolor: 'slate.700' } }}/>
              <TextField fullWidth label="住所" name="address" value={editableUserData.address || ''} onChange={handleFormInputChange} error={!!errors.address} helperText={errors.address?.message} required InputLabelProps={{ sx: { color: 'slate.400' } }} InputProps={{ sx: { color: 'white', bgcolor: 'slate.700' } }}/>
              <TextField fullWidth label="電話番号 (ハイフンなし)" name="phone" value={editableUserData.phone || ''} onChange={handleFormInputChange} error={!!errors.phone} helperText={errors.phone?.message} required InputLabelProps={{ sx: { color: 'slate.400' } }} InputProps={{ sx: { color: 'white', bgcolor: 'slate.700' } }}/>
               <DatePicker
                  label="生年月日 (YYYYMMDD)"
                  value={birthDateForPicker}
                  onChange={handleBirthDateChange}
                  format="yyyy/MM/dd"
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      variant: 'outlined',
                      error: !!errors.birthDate,
                      helperText: errors.birthDate?.message,
                      InputLabelProps: { sx: { color: 'slate.400' } },
                      sx: { '& .MuiInputBase-input': { color: 'white', bgcolor: 'slate.700' }, '& .MuiOutlinedInput-root': {'& fieldset': { borderColor: 'slate.600'}, '&:hover fieldset': {borderColor: 'slate.500'}, '&.Mui-focused fieldset': {borderColor: 'sky.500'}}}
                    }
                  }}
                />
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label htmlFor="avatarFile-input" className="block text-sm font-medium text-slate-300 mb-1">アイコン画像 ({MAX_AVATAR_FILE_SIZE_MB}MBまで)</label>
                 <input type="file" id="avatarFile-input" {...register('avatarFile')} accept={ACCEPTED_AVATAR_TYPES_STRING} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700" />
                {errors.avatarFile && <p className="text-red-400 mt-1 text-xs">{typeof errors.avatarFile.message === 'string' ? errors.avatarFile.message : 'ファイルエラー'}</p>}
                {avatarPreview && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1">現在のアイコン / プレビュー:</p>
                    <img src={avatarPreview} alt="アイコンプレビュー" className="max-h-32 rounded-full object-cover border border-slate-600" />
                    {firestoreUserData.avatarApprovalStatus === 'pending' && <p className="text-yellow-400 text-xs mt-1">承認待ちです。</p>}
                    {firestoreUserData.avatarApprovalStatus === 'rejected' && <p className="text-red-400 text-xs mt-1">このアイコンは承認されませんでした。</p>}
                    {firestoreUserData.avatarUrl && firestoreUserData.avatarApproved && <p className="text-green-400 text-xs mt-1">承認済みアイコンです。</p>}
                    <MuiButton size="small" onClick={() => { setValue('avatarFile', undefined as any); setAvatarFileToUpload(null); setAvatarPreview(firestoreUserData.avatarUrl || null); }} sx={{textTransform: 'none', color: 'sky.400', '&:hover': {textDecoration: 'underline'}, mt: 0.5 }}>アイコンをクリア</MuiButton>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <Typography variant="subtitle1" gutterBottom sx={{ color: 'slate.300', fontWeight:'medium' }}>プライバシー設定</Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editableUserData.privacySettings?.hidePokerNameInPublicLists || false}
                      onChange={handlePrivacyChange}
                      name="hidePokerNameInPublicLists"
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: 'sky.500' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'sky.500' },
                      }}
                    />
                  }
                  label={<span className="text-sm text-slate-300">公開ウェイティングリスト等でポーカーネームを非表示にする</span>}
                />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 mb-2">身分証画像は再アップロードできます（スタッフによる再確認が必要です）。</p>
                <div>
                  <label htmlFor="idFront-input" className="block text-sm font-medium text-slate-300 mb-1">身分証（表） ({MAX_FILE_SIZE_MB}MBまで)</label>
                  <input id="idFront-input" type="file" {...register('idFront')} accept={ACCEPTED_IMAGE_TYPES_STRING} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700" />
                  {idFrontPreview && <img src={idFrontPreview} alt="身分証(表)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
                  {errors.idFront && <p className="text-red-400 mt-1 text-xs">{typeof errors.idFront.message === 'string' ? errors.idFront.message : 'ファイルエラー'}</p>}
                </div>
                <div className="mt-4">
                  <label htmlFor="idBack-input" className="block text-sm font-medium text-slate-300 mb-1">身分証（裏・任意） ({MAX_FILE_SIZE_MB}MBまで)</label>
                  <input id="idBack-input" type="file" {...register('idBack')} accept={ACCEPTED_IMAGE_TYPES_STRING} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700" />
                  {idBackPreview && <img src={idBackPreview} alt="身分証(裏)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
                  {errors.idBack && <p className="text-red-400 mt-1 text-xs">{typeof errors.idBack.message === 'string' ? errors.idBack.message : 'ファイルエラー'}</p>}
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                <MuiButton variant="outlined" onClick={() => { setIsEditing(false); setError(null); setSuccessMessage(null); fetchAndInitializeUserData(); }} disabled={isSubmitting} sx={{color: 'slate.300', borderColor: 'slate.500', '&:hover': {borderColor: 'slate.400', bgcolor: 'slate.700'}}}>キャンセル</MuiButton>
                <MuiButton type="submit" variant="contained" disabled={isSubmitting} sx={{bgcolor: 'sky.600', '&:hover': {bgcolor: 'sky.700'}}}>{isSubmitting ? <CircularProgress size={22} color="inherit"/> : '変更を保存'}</MuiButton>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center space-x-4 mb-4 md:col-span-2">
                <div className="flex-shrink-0">
                  {firestoreUserData.avatarUrl && firestoreUserData.avatarApproved ? (
                    <img src={firestoreUserData.avatarUrl} alt="アバター" className="w-20 h-20 rounded-full object-cover border-2 border-green-500" />
                  ) : firestoreUserData.pendingAvatarUrl ? (
                    <div className="relative">
                      <img src={firestoreUserData.pendingAvatarUrl} alt="申請中アバター" className="w-20 h-20 rounded-full object-cover border-2 border-yellow-500 opacity-70" />
                      <span className="absolute top-0 right-0 bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-full">確認中</span>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-3xl font-bold">
                      {(firestoreUserData.pokerName || firestoreUserData.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{firestoreUserData.pokerName || '未設定'}</p>
                  <p className="text-sm text-slate-400">{firestoreUserData.fullName || '未設定'}</p>
                  <p className="text-sm text-slate-400">{firestoreUserData.email}</p>
                </div>
              </div>
              <div><p className="text-slate-400">住所:</p><p className="font-semibold">{firestoreUserData.address || '未設定'}</p></div>
              <div><p className="text-slate-400">電話番号:</p><p className="font-semibold">{firestoreUserData.phone || '未設定'}</p></div>
              <div><p className="text-slate-400">生年月日:</p><p className="font-semibold">{firestoreUserData.birthDate || '未設定'}</p></div>
              <div>
                <p className="text-slate-400">アカウント状態:</p>
                <div className="flex items-center space-x-2 mt-1">
                  <StatusBadge color={firestoreUserData.approved ? "green" : "yellow"} text={firestoreUserData.approved ? "承認済" : "未承認"} />
                  <StatusBadge color={firestoreUserData.isCheckedIn ? "sky" : "slate"} text={firestoreUserData.isCheckedIn ? "チェックイン中" : "チェックアウト済"} />
                  {firestoreUserData.isStaff && <StatusBadge color="purple" text="スタッフ" />}
                </div>
              </div>
              <div className="md:col-span-2 mt-2 pt-2 border-t border-slate-700">
                <p className="text-slate-400">公開リストでの名前表示:</p>
                <p className="font-semibold">{firestoreUserData.privacySettings?.hidePokerNameInPublicLists ? "非表示" : "表示"}</p>
              </div>
              <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 mb-2">身分証画像:</p>
                <div className="flex space-x-4">
                  {firestoreUserData.idFrontUrl ? (<a href={firestoreUserData.idFrontUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">身分証（表）を見る</a>) : (<span className="text-slate-500">身分証（表）未提出</span>)}
                  {firestoreUserData.idBackUrl ? (<a href={firestoreUserData.idBackUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">身分証（裏）を見る</a>) : (<span className="text-slate-500">身分証（裏）未提出</span>)}
                </div>
              </div>
              <div className="md:col-span-2 mt-6 pt-4 border-t border-slate-700 flex justify-end">
                <MuiButton variant="contained" onClick={() => setIsEditing(true)} sx={{bgcolor: 'sky.600', '&:hover': {bgcolor: 'sky.700'}}}>プロフィールを編集</MuiButton>
              </div>
            </div>
          )}
        </form>
      </div>
      )}

      {tabValue === 1 && (
        <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
          <h2 className="text-2xl font-semibold text-lime-400 mb-4 border-b border-slate-700 pb-2">注文履歴</h2>
          {orders.length === 0 && !loadingLocalData ? (
            <p className="text-slate-400">過去の注文履歴はありません。</p>
          ) : loadingLocalData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
          ) : (
            <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {orders.map(order => (
                <li key={order.id} className="p-3 bg-slate-700 rounded-md">
                  <div className="flex justify-between items-center">
                    <p className="text-white text-lg font-semibold">合計: {order.totalOrderPrice.toLocaleString()}円</p>
                    <StatusBadge
                      color={order.orderStatus === 'completed' ? 'green' : order.orderStatus === 'cancelled' ? 'red' : order.orderStatus === 'delivered_awaiting_confirmation' ? 'sky' : 'yellow'}
                      text={order.orderStatus === 'pending' ? '新規受付' : order.orderStatus === 'preparing' ? '準備中' : order.orderStatus === 'delivered_awaiting_confirmation' ? '提供済/確認待ち' : order.orderStatus === 'completed' ? '完了' : order.orderStatus === 'cancelled' ? 'キャンセル' : order.orderStatus}
                    />
                  </div>
                  <p className="text-sm text-slate-300">注文日時: {formatTimestamp(order.orderedAt)}</p>
                  <ul className="list-disc list-inside text-xs text-slate-400 mt-1">
                    {order.items.map((item, index) => ( <li key={index}>{item.itemName} x {item.quantity} ({item.totalItemPrice.toLocaleString()}円)</li>))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
       {tabValue === 2 && (
        <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
            <h2 className="text-2xl font-semibold text-orange-400 mb-4 border-b border-slate-700 pb-2">チップ引き出し履歴</h2>
            {withdrawalRequests.length === 0 && !loadingLocalData ? (
                <p className="text-slate-400">過去のチップ引き出しリクエストはありません。</p>
            ) : loadingLocalData ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
            ) : (
                <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                {withdrawalRequests.map(req => (
                    <li key={req.id} className="p-3 bg-slate-700 rounded-md">
                    <div className="flex justify-between items-center">
                        <p className="text-white text-lg font-semibold">希望額: {req.requestedChipsAmount.toLocaleString()} チップ</p>
                        <StatusBadge
                        color={req.status === 'completed' ? 'green' : req.status === 'denied' ? 'red' : req.status === 'delivered_awaiting_confirmation' ? 'sky' : 'yellow'}
                        text={req.status === 'pending_approval' ? '承認待ち' : req.status === 'approved_preparing' ? '準備中' : req.status === 'delivered_awaiting_confirmation' ? '提供済/確認待ち' : req.status === 'completed' ? '完了' : req.status === 'denied' ? '拒否済' : req.status}
                        />
                    </div>
                    <p className="text-sm text-slate-300">申請日時: {formatTimestamp(req.requestedAt)}</p>
                    {req.notes && <p className="text-xs text-slate-400 mt-1">備考: {req.notes}</p>}
                    </li>
                ))}
                </ul>
            )}
        </div>
      )}
      {tabValue === 3 && (
         <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
            <h2 className="text-2xl font-semibold text-purple-400 mb-4 border-b border-slate-700 pb-2">ゲームセッション履歴</h2>
            {gameSessions.length === 0 && !loadingLocalData ? (
                <p className="text-slate-400">過去のゲームセッション記録はありません。</p>
            ) : loadingLocalData ? (
                 <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
            ) : (
                <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                {gameSessions.map(session => (
                    <li key={session.id} className="p-3 bg-slate-700 rounded-md">
                    <div className="flex justify-between items-center text-white text-lg font-semibold">
                        <span>{session.tableName || `テーブル${session.tableId}`} / S{session.seatNumber}</span>
                        <span className={typeof session.profit === 'number' && session.profit >= 0 ? "text-green-300" : "text-red-300"}>
                        {typeof session.profit === 'number' ? `(${session.profit.toLocaleString()})` : 'N/A'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-300">ゲーム: {session.gameTypePlayed} ({session.ratePlayed || 'N/A'})</p>
                    <p className="text-xs text-slate-400">開始: {formatTimestamp(session.sessionStartTime)} - 終了: {formatTimestamp(session.sessionEndTime)}</p>
                    <p className="text-xs text-slate-400">持ち込み: {session.chipsIn.toLocaleString()}P {typeof session.additionalChipsIn === 'number' && session.additionalChipsIn > 0 ? ` (+${session.additionalChipsIn.toLocaleString()}P)` : ''} / 持ち出し: {typeof session.chipsOut === 'number' ? session.chipsOut.toLocaleString() + 'P' : 'N/A'}</p>
                    {typeof session.playFeeCalculated === 'number' && (<p className="text-xs text-slate-400">プレイ代: {session.playFeeCalculated.toLocaleString()}円 {session.playFeeAppliedToBill ? "(会計済)" : "(未計上)"}</p>)}
                    </li>
                ))}
                </ul>
            )}
        </div>
      )}

      {!isEditing && firestoreUserData && (
        <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
            <h2 className="text-2xl font-semibold text-green-400 mb-4 border-b border-slate-700 pb-2">チップ・会計情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <div><p className="text-slate-400">現在の保有チップ:</p><p className="text-3xl font-bold text-amber-300">{(firestoreUserData.chips ?? 0).toLocaleString()} チップ</p></div>
            <div><p className="text-slate-400">テーブル使用中チップ:</p><p className="text-3xl font-bold text-blue-300">{(firestoreUserData.chipsInPlay ?? 0).toLocaleString()} チップ</p></div>
            <div className="md:col-span-2"><p className="text-slate-400">お支払い残高:</p><p className="text-3xl font-bold text-red-400">{(firestoreUserData.bill ?? 0).toLocaleString()} 円</p>{firestoreUserData.bill > 0 && (<Link to="/payment" className="text-yellow-400 hover:underline text-sm mt-2 inline-block">お支払いへ</Link>)}</div>
            {firestoreUserData.pendingChipSettlement && (
                <div className="md:col-span-2 mt-4 p-3 bg-orange-700/50 rounded-md border border-orange-500">
                    <p className="text-orange-200 font-semibold">チップ精算確認待ち:</p>
                    <p className="text-white text-lg">テーブル {firestoreUserData.pendingChipSettlement.tableId}-座席{firestoreUserData.pendingChipSettlement.seatNumber} から</p>
                    <p className="text-orange-300 text-2xl font-bold">{firestoreUserData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</p>
                    <p className="text-xs text-orange-400">内訳: {Object.entries(firestoreUserData.pendingChipSettlement.denominationsCount).map(([d,c]) => `${d}P x${c}`).join(' / ')}</p>
                    <p className="text-xs text-orange-500">精算が完了したら、メインページで「精算額を確認しました」ボタンを押してください。</p>
                </div>
            )}
            </div>
        </div>
      )}
    </div>
    </LocalizationProvider>
  );
};

export default UserProfilePage;