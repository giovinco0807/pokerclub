// src/pages/UserProfilePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { UserData, Order, WithdrawalRequest, GameSession } from '../types';
import { uploadIdImage, getUser } from '../services/userService'; // ID画像アップロードサービスをインポート
import { auth, db, storage } from '../services/firebase'; // 変更箇所: '=>' を 'from' に修正
import { doc, updateDoc, onSnapshot, query, collection, where, orderBy, Timestamp, FieldValue } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StatusBadge } from '../components/admin/UserDetailsModal'; // 管理画面のバッジを流用

// ファイルサイズとタイプバリデーション (RegisterPageから流用)
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_TYPES_STRING = ".jpg, .jpeg, .png, .webp, .gif";
const MAX_AVATAR_FILE_SIZE_MB = 2;
const MAX_AVATAR_FILE_SIZE_BYTES = MAX_AVATAR_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPTED_AVATAR_TYPES_STRING = ".jpg, .jpeg, .png, .gif, .webp";


// フォームのスキーマ定義
const userProfileSchema = z.object({
  pokerName: z.string().min(1, 'ポーカーネームは必須です').max(50, '50文字以内で入力してください'),
  fullName: z.string().min(1, '氏名は必須です').max(50, '50文字以内で入力してください'),
  address: z.string().min(1, '住所は必須です').max(100, '100文字以内で入力してください'),
  phone: z.string().min(10, '有効な電話番号を入力してください').max(15, '電話番号が長すぎます').regex(/^[0-9]+$/, "電話番号は数字のみで入力してください"),
  birthDate: z.string().length(8, '生年月日は8桁の数字で入力 (例: 19900101)').regex(/^\d{8}$/, "生年月日は8桁の数字 (例: 19900101)"),

  // 身分証画像は optional にし、更新時のみチェック
  idFront: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE_BYTES, `画像サイズは${MAX_FILE_SIZE_MB}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`)
    .optional(),
  idBack: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE_BYTES, `画像サイズは${MAX_FILE_SIZE_MB}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`)
    .optional(),

  // アバター画像も optional にし、更新時のみチェック
  avatarFile: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_AVATAR_FILE_SIZE_BYTES, `アイコン画像は${MAX_AVATAR_FILE_SIZE_MB}MB以下にしてください。`)
    .refine(files => !files || files.length === 0 || ACCEPTED_AVATAR_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_AVATAR_TYPES_STRING}`)
    .optional(),
});

type UserProfileFormData = z.infer<typeof userProfileSchema>;

const formatTimestamp = (timestamp?: Timestamp | Date | null): string => {
  if (!timestamp) return 'N/A';
  let dateToFormat: Date;
  if (timestamp instanceof Timestamp) dateToFormat = timestamp.toDate();
  else if (timestamp instanceof Date) dateToFormat = timestamp;
  else return '日付エラー'; // 無効な型の場合

  try {
    return dateToFormat.toLocaleString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) {
    console.error("formatTimestamp: toLocaleStringでエラー:", e, "元の値:", dateToFormat);
    return '表示エラー';
  }
};


const UserProfilePage: React.FC = () => {
  const { currentUser, loading: appContextLoading, refreshCurrentUser } = useAppContext();
  const [userData, setUserData] = useState<UserData | null>(currentUser?.firestoreData || null);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingLocalData, setLoadingLocalData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [gameSessions, setGameSessions] = useState<GameSession[]>([]);

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
  });

  // 画像プレビューのState
  const [idFrontPreview, setIdFrontPreview] = useState<string | null | undefined>(undefined);
  const [idBackPreview, setIdBackPreview] = useState<string | null | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = useState<string | null | undefined>(undefined);

  // ユーザーデータが更新されたらフォームのデフォルト値をリセット
  useEffect(() => {
    if (userData) {
      reset({
        pokerName: userData.pokerName || '',
        fullName: userData.fullName || '',
        address: userData.address || '',
        phone: userData.phone || '',
        birthDate: userData.birthDate || '',
        // idFront, idBack, avatarFile は FileList 型なので直接セットしない
      });
      // userData.idFrontUrl が string | undefined なので、string | null の setIdFrontPreview に渡す前に nullish coalescing (??) を使用して string | null に変換
      setIdFrontPreview(userData.idFrontUrl ?? null); // 変更箇所: `?? null` を追加
      // setIdBackPreview にも ?? null を適用
      setIdBackPreview(userData.idBackUrl ?? null); // 変更箇所: `?? null` を追加
      setAvatarPreview(userData.avatarUrl ?? userData.pendingAvatarUrl ?? null); // 変更箇所: `?? null` を追加
    }
  }, [userData, reset]);

  // ローカルユーザーデータ（Firestoreから）の取得
  const fetchUserData = useCallback(async () => {
    if (!currentUser?.uid) {
      setLoadingLocalData(false);
      return;
    }
    setLoadingLocalData(true);
    setError(null);
    try {
      const userDoc = await getUser(currentUser.uid); // userServiceから取得
      if (userDoc) {
        setUserData(userDoc);
      } else {
        setError("ユーザーデータが見つかりませんでした。");
      }
    } catch (err: any) {
      console.error("ユーザーデータ取得エラー:", err);
      setError("ユーザー情報の読み込みに失敗しました。");
    } finally {
      setLoadingLocalData(false);
    }
  }, [currentUser]);

  // ログイン状態とユーザーデータ変更を監視
  useEffect(() => {
    if (!appContextLoading && currentUser) {
      fetchUserData();
    } else if (!appContextLoading && !currentUser) {
      setLoadingLocalData(false);
      setUserData(null);
      setError("プロフィールを表示するにはログインが必要です。");
    }
  }, [appContextLoading, currentUser, fetchUserData]);

  // 各種履歴のリアルタイムリスナー
  useEffect(() => {
    if (!currentUser?.uid) {
      setOrders([]);
      setWithdrawalRequests([]);
      setGameSessions([]);
      return;
    }

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', currentUser.uid), orderBy('orderedAt', 'desc')),
      (snapshot) => {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      },
      (err) => console.error("注文履歴取得エラー:", err)
    );

    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('userId', '==', currentUser.uid), orderBy('requestedAt', 'desc')),
      (snapshot) => {
        setWithdrawalRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest)));
      },
      (err) => console.error("チップ引き出し履歴取得エラー:", err)
    );

    const unsubGameSessions = onSnapshot(
      query(collection(db, 'gameSessions'), where('userId', '==', currentUser.uid), orderBy('sessionStartTime', 'desc')),
      (snapshot) => {
        setGameSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameSession)));
      },
      (err) => console.error("ゲームセッション履歴取得エラー:", err)
    );

    return () => {
      unsubOrders();
      unsubWithdrawals();
      unsubGameSessions();
    };
  }, [currentUser]);


  // watchでファイルの変更を監視
  const watchIdFront = watch("idFront");
  const watchIdBack = watch("idBack");
  const watchAvatarFile = watch("avatarFile");

  // ID Front Preview
  useEffect(() => {
    if (watchIdFront && watchIdFront.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdFrontPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdFront[0]);
    } else if (userData?.idFrontUrl && !isEditing) { // 編集モードでなく、既存のURLがある場合
      setIdFrontPreview(userData.idFrontUrl);
    } else {
      setIdFrontPreview(null);
    }
  }, [watchIdFront, userData?.idFrontUrl, isEditing]);

  // ID Back Preview
  useEffect(() => {
    if (watchIdBack && watchIdBack.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdBackPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdBack[0]);
    } else if (userData?.idBackUrl && !isEditing) { // 編集モードでなく、既存のURLがある場合
      setIdBackPreview(userData.idBackUrl);
    } else {
      setIdBackPreview(null);
    }
  }, [watchIdBack, userData?.idBackUrl, isEditing]);

  // Avatar Preview
  useEffect(() => {
    if (watchAvatarFile && watchAvatarFile.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setAvatarPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchAvatarFile[0]);
    } else if (userData?.avatarUrl && !isEditing) { // 編集モードでなく、承認済みアバターがある場合
      setAvatarPreview(userData.avatarUrl);
    } else if (userData?.pendingAvatarUrl && !isEditing) { // 編集モードでなく、承認待ちアバターがある場合
      setAvatarPreview(userData.pendingAvatarUrl);
    } else {
      setAvatarPreview(null);
    }
  }, [watchAvatarFile, userData?.avatarUrl, userData?.pendingAvatarUrl, isEditing]);


  const onSubmit: SubmitHandler<UserProfileFormData> = async (data) => {
    if (!currentUser?.uid) {
      setError("ユーザー情報がありません。ログインしてください。");
      return;
    }
    setIsSubmitting(true);
    setSuccessMessage(null);
    setError(null);

    const userDocRef = doc(db, 'users', currentUser.uid);
    let updates: Partial<UserData> = {};
    let hasChanges = false;

    // テキストフィールドの変更チェック
    if (data.pokerName !== userData?.pokerName) { updates.pokerName = data.pokerName; hasChanges = true; }
    if (data.fullName !== userData?.fullName) { updates.fullName = data.fullName; hasChanges = true; }
    if (data.address !== userData?.address) { updates.address = data.address; hasChanges = true; }
    if (data.phone !== userData?.phone) { updates.phone = data.phone; hasChanges = true; }
    if (data.birthDate !== userData?.birthDate) { updates.birthDate = data.birthDate; hasChanges = true; }

    try {
      // ID画像アップロード
      if (data.idFront && data.idFront.length > 0) {
        const frontUrl = await uploadImage(data.idFront[0], `idImages/${currentUser.uid}/front_${Date.now()}_${data.idFront[0].name}`);
        updates.idFrontUrl = frontUrl;
        hasChanges = true;
      } else if (!data.idFront && userData?.idFrontUrl && idFrontPreview === null) {
        // ID Front 画像がクリアされた場合
        updates.idFrontUrl = null; // Partial<UserData>なので、nullも許容される
        hasChanges = true;
      }

      if (data.idBack && data.idBack.length > 0) {
        const backUrl = await uploadImage(data.idBack[0], `idImages/${currentUser.uid}/back_${Date.now()}_${data.idBack[0].name}`);
        updates.idBackUrl = backUrl;
        hasChanges = true;
      } else if (!data.idBack && userData?.idBackUrl && idBackPreview === null) {
        // ID Back 画像がクリアされた場合
        updates.idBackUrl = null; // Partial<UserData>なので、nullも許容される
        hasChanges = true;
      }

      // アバター画像アップロード
      if (data.avatarFile && data.avatarFile.length > 0) {
        const avatarUrl = await uploadImage(data.avatarFile[0], `avatars/${currentUser.uid}/avatar_${Date.now()}_${data.avatarFile[0].name}`);
        updates.pendingAvatarUrl = avatarUrl; // 承認待ちとして設定
        updates.avatarApproved = false;
        updates.avatarApprovalStatus = 'pending';
        hasChanges = true;
      } else if (!data.avatarFile && (userData?.avatarUrl || userData?.pendingAvatarUrl) && avatarPreview === null) {
        // アバター画像がクリアされた場合
        updates.avatarUrl = null; // Partial<UserData>なので、nullも許容される
        updates.pendingAvatarUrl = null; // Partial<UserData>なので、nullも許容される
        updates.avatarApproved = false;
        updates.avatarApprovalStatus = null;
        hasChanges = true;
      }

      if (hasChanges) {
        await updateDoc(userDocRef, { ...updates, updatedAt: Timestamp.now() });
        setSuccessMessage("プロフィールが正常に更新されました！");
        await refreshCurrentUser(); // AppContextのcurrentUserも更新
        fetchUserData(); // ローカルのuserDataも最新に
      } else {
        setSuccessMessage("プロフィールに変更はありませんでした。");
      }

      setIsEditing(false); // 編集モードを終了
      setTimeout(() => setSuccessMessage(null), 4000);

    } catch (e: any) {
      console.error("プロフィール更新エラー:", e);
      setError(`プロフィールの更新に失敗しました: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 画像アップロードヘルパー関数
  const uploadImage = async (file: File, path: string): Promise<string> => {
    // 既存のファイルがStorageにあれば削除（同じパスのファイル名を生成するなら必要）
    // 今回はファイル名にDate.now()を含めるので、既存ファイル削除は不要だが、
    // ユーザーがアバターを再アップロードした場合、古いアバター画像はStorageに残ってしまう。
    // それを避けるには、ユーザーのFirestoreデータに格納されている古いURLを取得し、
    // そのURLからStorageのパスを特定してdeleteObjectを呼び出す必要がある。
    // 今回の例では、古いファイルの削除は省略し、新しいURLをFirestoreに保存する。

    const imageRef = storageRef(storage, path);
    const snapshot = await uploadBytes(imageRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  // ユーザーデータ、ローディング状態の確認
  if (appContextLoading || loadingLocalData) {
    return <div className="text-center p-10 text-xl text-neutral-lightest">ユーザー情報を読み込み中...</div>;
  }
  if (error && !userData) { // ユーザーデータが全く取得できなかった場合
    return <div className="text-center p-10 text-xl text-red-400 bg-red-900/30 rounded-md">{error}</div>;
  }
  if (!currentUser || !userData) { // ログインしていない、またはデータが不明な場合
    return <div className="text-center p-10 text-xl text-yellow-400">ログインが必要です。</div>;
  }


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-8 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-sky-400">マイプロフィール</h1>
        <Link to="/" className="text-red-400 hover:text-red-300 hover:underline text-sm">
          ← メインページに戻る
        </Link>
      </div>

      {successMessage && <div className="mb-4 p-3 bg-green-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn">{successMessage}</div>}
      {error && <div className="mb-4 p-3 bg-red-700/80 text-white rounded-md text-sm fixed top-20 right-5 z-50 shadow-lg animate-fadeIn" onClick={() => setError(null)}>{error}</div>}

      <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
        <h2 className="text-2xl font-semibold text-amber-400 mb-4 border-b border-slate-700 pb-2">基本情報</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isEditing ? (
            <>
              <div>
                <label htmlFor="pokerName" className="block text-sm font-medium text-slate-300 mb-1">ポーカーネーム <span className="text-red-500">*</span></label>
                <input id="pokerName" type="text" {...register('pokerName')} className="w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500" placeholder="例: Poker Taro"/>
                {errors.pokerName && <p className="text-red-400 mt-1 text-xs">{errors.pokerName.message}</p>}
              </div>
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-1">氏名 <span className="text-red-500">*</span></label>
                <input id="fullName" type="text" {...register('fullName')} className="w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500" placeholder="例: 山田 太郎"/>
                {errors.fullName && <p className="text-red-400 mt-1 text-xs">{errors.fullName.message}</p>}
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-slate-300 mb-1">住所 <span className="text-red-500">*</span></label>
                <input id="address" type="text" {...register('address')} className="w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500" placeholder="例: 東京都千代田区1-1-1"/>
                {errors.address && <p className="text-red-400 mt-1 text-xs">{errors.address.message}</p>}
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">電話番号 <span className="text-red-500">*</span> (ハイフンなし)</label>
                <input id="phone" type="tel" {...register('phone')} className="w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500" placeholder="例: 09012345678"/>
                {errors.phone && <p className="text-red-400 mt-1 text-xs">{errors.phone.message}</p>}
              </div>
              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-slate-300 mb-1">生年月日 (8桁) <span className="text-red-500">*</span></label>
                <input id="birthDate" type="text" {...register('birthDate')} maxLength={8} className="w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500" placeholder="例: 19900101"/>
                {errors.birthDate && <p className="text-red-400 mt-1 text-xs">{errors.birthDate.message}</p>}
              </div>

              {/* アバター画像アップロード */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label htmlFor="avatarFile" className="block text-sm font-medium text-slate-300 mb-1">アイコン画像 ({MAX_AVATAR_FILE_SIZE_MB}MBまで)</label>
                <input type="file" id="avatarFile" {...register('avatarFile')} accept={ACCEPTED_AVATAR_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700" />
                {errors.avatarFile && <p className="text-red-400 mt-1 text-xs">{typeof errors.avatarFile.message === 'string' ? errors.avatarFile.message : 'ファイルエラー'}</p>}
                {avatarPreview && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1">現在のアイコン / プレビュー:</p>
                    <img src={avatarPreview} alt="アイコンプレビュー" className="max-h-32 rounded-full object-cover border border-slate-600" />
                    {userData.avatarApprovalStatus === 'pending' && <p className="text-yellow-400 text-xs mt-1">承認待ちです。承認されるまで表示されません。</p>}
                    {userData.avatarApprovalStatus === 'rejected' && <p className="text-red-400 text-xs mt-1">このアイコンは承認されませんでした。</p>}
                    {userData.avatarUrl && userData.avatarApproved && <p className="text-green-400 text-xs mt-1">承認済みアイコンです。</p>}
                    <button type="button" onClick={() => { setValue('avatarFile', undefined as any); setAvatarPreview(null); }} className="text-sky-400 hover:underline text-xs mt-1">アイコンをクリア</button>
                  </div>
                )}
              </div>

              {/* 身分証画像アップロード */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 mb-2">身分証画像は再アップロードできます（スタッフによる再確認が必要です）。</p>
                <div>
                  <label htmlFor="idFront" className="block text-sm font-medium text-slate-300 mb-1">身分証（表） ({MAX_FILE_SIZE_MB}MBまで)</label>
                  <input id="idFront" type="file" {...register('idFront')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700" />
                  {idFrontPreview && <img src={idFrontPreview} alt="身分証(表)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
                  {errors.idFront && <p className="text-red-400 mt-1 text-xs">{typeof errors.idFront.message === 'string' ? errors.idFront.message : 'ファイルエラー'}</p>}
                </div>
                <div className="mt-4">
                  <label htmlFor="idBack" className="block text-sm font-medium text-slate-300 mb-1">身分証（裏・任意） ({MAX_FILE_SIZE_MB}MBまで)</label>
                  <input id="idBack" type="file" {...register('idBack')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700" />
                  {idBackPreview && <img src={idBackPreview} alt="身分証(裏)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
                  {errors.idBack && <p className="text-red-400 mt-1 text-xs">{typeof errors.idBack.message === 'string' ? errors.idBack.message : 'ファイルエラー'}</p>}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setError(null); setSuccessMessage(null); fetchUserData(); }}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md transition-colors"
                  disabled={isSubmitting}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                    isSubmitting ? 'bg-slate-500 text-slate-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 text-white'
                  }`}
                >
                  {isSubmitting ? '保存中...' : '変更を保存'}
                </button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center space-x-4 mb-4 md:col-span-2">
                <div className="flex-shrink-0">
                  {userData.avatarUrl && userData.avatarApproved ? (
                    <img src={userData.avatarUrl} alt="アバター" className="w-20 h-20 rounded-full object-cover border-2 border-green-500" />
                  ) : userData.pendingAvatarUrl ? (
                    <div className="relative">
                      <img src={userData.pendingAvatarUrl} alt="申請中アバター" className="w-20 h-20 rounded-full object-cover border-2 border-yellow-500 opacity-70" />
                      <span className="absolute top-0 right-0 bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-full">確認中</span>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-3xl font-bold">
                      {(userData.pokerName || userData.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{userData.pokerName || '未設定'}</p>
                  <p className="text-sm text-slate-400">{userData.fullName || '未設定'}</p>
                  <p className="text-sm text-slate-400">{userData.email}</p>
                </div>
              </div>

              <div>
                <p className="text-slate-400">住所:</p>
                <p className="font-semibold">{userData.address || '未設定'}</p>
              </div>
              <div>
                <p className="text-slate-400">電話番号:</p>
                <p className="font-semibold">{userData.phone || '未設定'}</p>
              </div>
              <div>
                <p className="text-slate-400">生年月日:</p>
                <p className="font-semibold">{userData.birthDate || '未設定'}</p>
              </div>
              <div>
                <p className="text-slate-400">アカウント状態:</p>
                <div className="flex items-center space-x-2 mt-1">
                  <StatusBadge color={userData.approved ? "green" : "yellow"} text={userData.approved ? "承認済" : "未承認"} />
                  <StatusBadge color={userData.isCheckedIn ? "sky" : "slate"} text={userData.isCheckedIn ? "チェックイン中" : "チェックアウト済"} />
                  {userData.isStaff && <StatusBadge color="purple" text="スタッフ" />}
                </div>
              </div>
              <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 mb-2">身分証画像:</p>
                <div className="flex space-x-4">
                  {userData.idFrontUrl ? (
                    <a href={userData.idFrontUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">身分証（表）を見る</a>
                  ) : (
                    <span className="text-slate-500">身分証（表）未提出</span>
                  )}
                  {userData.idBackUrl ? (
                    <a href={userData.idBackUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">身分証（裏）を見る</a>
                  ) : (
                    <span className="text-slate-500">身分証（裏）未提出</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 mt-6 pt-4 border-t border-slate-700 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors"
                >
                  プロフィールを編集
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* チップ・会計情報 */}
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
        <h2 className="text-2xl font-semibold text-green-400 mb-4 border-b border-slate-700 pb-2">チップ・会計情報</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="text-slate-400">現在の保有チップ:</p>
            <p className="text-3xl font-bold text-amber-300">{(userData.chips ?? 0).toLocaleString()} チップ</p>
          </div>
          <div>
            <p className="text-slate-400">テーブル使用中チップ:</p>
            <p className="text-3xl font-bold text-blue-300">{(userData.chipsInPlay ?? 0).toLocaleString()} チップ</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-slate-400">お支払い残高:</p>
            <p className="text-3xl font-bold text-red-400">{(userData.bill ?? 0).toLocaleString()} 円</p>
            {userData.bill > 0 && (
              <Link to="/payment" className="text-yellow-400 hover:underline text-sm mt-2 inline-block">お支払いへ</Link>
            )}
          </div>
          {userData.pendingChipSettlement && (
            <div className="md:col-span-2 mt-4 p-3 bg-orange-700/50 rounded-md border border-orange-500">
                <p className="text-orange-200 font-semibold">チップ精算確認待ち:</p>
                <p className="text-white text-lg">テーブル {userData.pendingChipSettlement.tableId}-座席{userData.pendingChipSettlement.seatNumber} から</p>
                <p className="text-orange-300 text-2xl font-bold">{userData.pendingChipSettlement.adminEnteredTotalChips.toLocaleString()} チップ</p>
                <p className="text-xs text-orange-400">内訳: {Object.entries(userData.pendingChipSettlement.denominationsCount).map(([d,c]) => `${d}P x${c}`).join(' / ')}</p>
                <p className="text-xs text-orange-500">精算が完了したら、メインページで「精算額を確認しました」ボタンを押してください。</p>
            </div>
          )}
        </div>
      </div>

      {/* ゲームセッション履歴 */}
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
        <h2 className="text-2xl font-semibold text-purple-400 mb-4 border-b border-slate-700 pb-2">ゲームセッション履歴</h2>
        {gameSessions.length === 0 ? (
          <p className="text-slate-400">過去のゲームセッション記録はありません。</p>
        ) : (
          <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {gameSessions.map(session => (
              <li key={session.id} className="p-3 bg-slate-700 rounded-md">
                <div className="flex justify-between items-center text-white text-lg font-semibold">
                  <span>{session.tableName || `テーブル${session.tableId}`} / S{session.seatNumber}</span>
                  {/* session.profit が undefined の可能性に対応 */}
                  <span className={typeof session.profit === 'number' && session.profit >= 0 ? "text-green-300" : "text-red-300"}>
                    {typeof session.profit === 'number' ? `(${session.profit.toLocaleString()})` : 'N/A'}
                  </span>
                </div>
                <p className="text-sm text-slate-300">
                  ゲーム: {session.gameTypePlayed} ({session.ratePlayed || 'N/A'})
                </p>
                <p className="text-xs text-slate-400">
                  開始: {formatTimestamp(session.sessionStartTime)} - 終了: {formatTimestamp(session.sessionEndTime)}
                </p>
                <p className="text-xs text-slate-400">
                  持ち込み: {session.chipsIn.toLocaleString()}P
                  {/* session.additionalChipsIn が undefined の可能性に対応 */}
                  {typeof session.additionalChipsIn === 'number' && session.additionalChipsIn > 0 ? ` (+${session.additionalChipsIn.toLocaleString()}P)` : ''} /
                  持ち出し: {typeof session.chipsOut === 'number' ? session.chipsOut.toLocaleString() + 'P' : 'N/A'}
                </p>
                {/* session.playFeeCalculated が undefined の可能性に対応 */}
                {typeof session.playFeeCalculated === 'number' && (
                  <p className="text-xs text-slate-400">プレイ代: {session.playFeeCalculated.toLocaleString()}円 {session.playFeeAppliedToBill ? "(会計済)" : "(未計上)"}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 注文履歴 */}
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl mb-8">
        <h2 className="text-2xl font-semibold text-lime-400 mb-4 border-b border-slate-700 pb-2">注文履歴</h2>
        {orders.length === 0 ? (
          <p className="text-slate-400">過去の注文履歴はありません。</p>
        ) : (
          <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {orders.map(order => (
              <li key={order.id} className="p-3 bg-slate-700 rounded-md">
                <div className="flex justify-between items-center">
                  <p className="text-white text-lg font-semibold">
                    合計: {order.totalOrderPrice.toLocaleString()}円
                  </p>
                  <StatusBadge
                    color={order.orderStatus === 'completed' ? 'green' :
                           order.orderStatus === 'cancelled' ? 'red' :
                           order.orderStatus === 'delivered_awaiting_confirmation' ? 'sky' : 'yellow'}
                    text={order.orderStatus === 'pending' ? '新規受付' :
                          order.orderStatus === 'preparing' ? '準備中' :
                          order.orderStatus === 'delivered_awaiting_confirmation' ? '提供済/確認待ち' :
                          order.orderStatus === 'completed' ? '完了' :
                          order.orderStatus === 'cancelled' ? 'キャンセル' : order.orderStatus}
                  />
                </div>
                <p className="text-sm text-slate-300">注文日時: {formatTimestamp(order.orderedAt)}</p>
                <ul className="list-disc list-inside text-xs text-slate-400 mt-1">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      {item.itemName} x {item.quantity} ({item.totalItemPrice.toLocaleString()}円)
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* チップ引き出し履歴 */}
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-semibold text-orange-400 mb-4 border-b border-slate-700 pb-2">チップ引き出し履歴</h2>
        {withdrawalRequests.length === 0 ? (
          <p className="text-slate-400">過去のチップ引き出しリクエストはありません。</p>
        ) : (
          <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {withdrawalRequests.map(req => (
              <li key={req.id} className="p-3 bg-slate-700 rounded-md">
                <div className="flex justify-between items-center">
                  <p className="text-white text-lg font-semibold">
                    希望額: {req.requestedChipsAmount.toLocaleString()} チップ
                  </p>
                  <StatusBadge
                    color={req.status === 'completed' ? 'green' :
                           req.status === 'denied' ? 'red' :
                           req.status === 'delivered_awaiting_confirmation' ? 'sky' : 'yellow'}
                    text={req.status === 'pending_approval' ? '承認待ち' :
                          req.status === 'approved_preparing' ? '準備中' :
                          req.status === 'delivered_awaiting_confirmation' ? '提供済/確認待ち' :
                          req.status === 'completed' ? '完了' :
                          req.status === 'denied' ? '拒否済' : req.status}
                  />
                </div>
                <p className="text-sm text-slate-300">申請日時: {formatTimestamp(req.requestedAt)}</p>
                {req.notes && <p className="text-xs text-slate-400 mt-1">備考: {req.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default UserProfilePage;