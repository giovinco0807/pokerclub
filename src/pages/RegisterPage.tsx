// src/pages/RegisterPage.tsx
import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { auth, db, storage } from '../services/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Link, useNavigate } from 'react-router-dom';

const MAX_ID_FILE_SIZE_MB = 5;
const MAX_ID_FILE_SIZE_BYTES = MAX_ID_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_IMAGE_TYPES_STRING = ".jpg, .jpeg, .png, .webp, .gif";

export const registerSchema = z.object({
  pokerName: z.string().min(1, 'ポーカーネームは必須です').max(50, '50文字以内で入力してください'),
  fullName: z.string().min(1, '氏名は必須です').max(50, '50文字以内で入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  address: z.string().min(1, '住所は必須です').max(100, '100文字以内で入力してください'),
  phone: z.string().min(10, '有効な電話番号を入力してください').max(15, '電話番号が長すぎます').regex(/^[0-9]+$/, "電話番号は数字のみで入力してください"),
  birthDate: z.string().length(8, '生年月日は8桁の数字で入力 (例: 19900101)').regex(/^\d{8}$/, "生年月日は8桁の数字 (例: 19900101)"),
  idFront: z.custom<FileList>()
    .refine(files => files && files.length > 0, '身分証（表）の画像は必須です。')
    .refine(files => files && files[0]?.size <= MAX_ID_FILE_SIZE_BYTES, `画像サイズは${MAX_ID_FILE_SIZE_MB}MB以下`)
    .refine(files => files && ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`),
  idBack: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_ID_FILE_SIZE_BYTES, `画像サイズは${MAX_ID_FILE_SIZE_MB}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES_STRING}`)
    .optional(),
  // avatarFile のスキーマ定義を削除
});

export type RegisterFormData = z.infer<typeof registerSchema>;

const RegisterPage: React.FC = () => {
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null);
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null);
  // avatarPreview state を削除

  const watchIdFront = watch("idFront");
  const watchIdBack = watch("idBack");
  // watchAvatarFile を削除

  useEffect(() => {
    if (watchIdFront && watchIdFront.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdFrontPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdFront[0]);
    } else { setIdFrontPreview(null); }
  }, [watchIdFront]);

  useEffect(() => {
    if (watchIdBack && watchIdBack.length > 0) {
      const fileReader = new FileReader();
      fileReader.onload = (e) => setIdBackPreview(e.target?.result as string);
      fileReader.readAsDataURL(watchIdBack[0]);
    } else { setIdBackPreview(null); }
  }, [watchIdBack]);

  // avatarFile の useEffect を削除

  const onSubmit: SubmitHandler<RegisterFormData> = async (data) => {
    setIsSubmitting(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const password = data.birthDate;
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, password);
      const user = userCredential.user;

      const uploadImage = async (file: File, path: string): Promise<string> => {
        const imageRef = storageRef(storage, path);
        const snapshot = await uploadBytes(imageRef, file);
        return await getDownloadURL(snapshot.ref);
      };

      let frontUrl = '';
      if (data.idFront && data.idFront.length > 0) {
        frontUrl = await uploadImage(data.idFront[0], `idImages/${user.uid}/front_${Date.now()}_${data.idFront[0].name}`);
      }
      let backUrl: string | null = null;
      if (data.idBack && data.idBack.length > 0) {
        backUrl = await uploadImage(data.idBack[0], `idImages/${user.uid}/back_${Date.now()}_${data.idBack[0].name}`);
      }

      // avatarUploadUrl の処理を削除

      await setDoc(doc(db, 'users', user.uid), {
        pokerName: data.pokerName, fullName: data.fullName, email: user.email,
        address: data.address, phone: data.phone, birthDate: data.birthDate,
        idFrontUrl: frontUrl, idBackUrl: backUrl,
        chips: 0, bill: 0, isCheckedIn: false, approved: false, isStaff: false,
        // avatarUrl, pendingAvatarUrl, avatarApprovalStatus を削除
        isAdmin: false, // isAdminはカスタムクレームで管理するので、Firestoreにはfalseまたは含めない
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      setSuccessMessage('登録リクエスト完了。承認をお待ちください。\n3秒後にログインページへ。');
      reset(); setIdFrontPreview(null); setIdBackPreview(null); // setAvatarPreview(null)も削除
      setTimeout(() => { setSuccessMessage(''); navigate('/login'); }, 3000);
    } catch (error: any) {
      console.error("登録エラー:", error);
      if (error.code === 'auth/email-already-in-use') {
        setErrorMessage('このメールアドレスは既に使用されています。');
      } else if (error.code === 'permission-denied' || error.message?.includes('permission-denied')) {
        setErrorMessage('データベースへの書き込み権限がありません。設定を確認してください。');
      } else if (error.code) {
        setErrorMessage(`エラー (${error.code}): ${error.message}`);
      } else {
        setErrorMessage(`予期せぬエラーが発生しました: ${error.message}`);
      }
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-md mx-auto mt-8 mb-8 bg-slate-900 p-6 sm:p-8 rounded-lg shadow-xl text-neutral-lightest">
      <h2 className="text-red-500 text-3xl font-bold mb-6 text-center">新規会員登録</h2>
      {successMessage && <p className="text-green-400 bg-green-900/30 p-3 rounded mb-4 text-sm text-center">{successMessage}</p>}
      {errorMessage && <p className="text-red-400 bg-red-900/30 p-3 rounded mb-4 text-sm text-center">{errorMessage}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* ポーカーネーム */}
        <div>
          <label htmlFor="pokerNameReg" className="block text-sm font-medium text-slate-300 mb-1">ポーカーネーム <span className="text-red-500">*</span></label>
          <input id="pokerNameReg" type="text" {...register('pokerName')} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="例: Poker Taro"/>
          {errors.pokerName && <p className="text-yellow-400 mt-1 text-xs">{errors.pokerName.message}</p>}
        </div>
        {/* 氏名 */}
        <div>
          <label htmlFor="fullNameReg" className="block text-sm font-medium text-slate-300 mb-1">氏名 <span className="text-red-500">*</span></label>
          <input id="fullNameReg" type="text" {...register('fullName')} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="例: 山田 太郎"/>
          {errors.fullName && <p className="text-yellow-400 mt-1 text-xs">{errors.fullName.message}</p>}
        </div>
        {/* メールアドレス */}
        <div>
          <label htmlFor="emailReg" className="block text-sm font-medium text-slate-300 mb-1">メールアドレス <span className="text-red-500">*</span></label>
          <input id="emailReg" type="email" {...register('email')} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="email@example.com"/>
          {errors.email && <p className="text-yellow-400 mt-1 text-xs">{errors.email.message}</p>}
        </div>
        {/* 住所 */}
        <div>
          <label htmlFor="addressReg" className="block text-sm font-medium text-slate-300 mb-1">住所 <span className="text-red-500">*</span></label>
          <input id="addressReg" type="text" {...register('address')} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="例: 東京都千代田区1-1-1"/>
          {errors.address && <p className="text-yellow-400 mt-1 text-xs">{errors.address.message}</p>}
        </div>
        {/* 電話番号 */}
        <div>
          <label htmlFor="phoneReg" className="block text-sm font-medium text-slate-300 mb-1">電話番号 <span className="text-red-500">*</span> (ハイフンなし)</label>
          <input id="phoneReg" type="tel" {...register('phone')} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="例: 09012345678"/>
          {errors.phone && <p className="text-yellow-400 mt-1 text-xs">{errors.phone.message}</p>}
        </div>
        {/* 生年月日 */}
        <div>
          <label htmlFor="birthDateReg" className="block text-sm font-medium text-slate-300 mb-1">生年月日 (パスワードとして8桁) <span className="text-red-500">*</span></label>
          <input id="birthDateReg" type="text" {...register('birthDate')} maxLength={8} className="w-full p-2 bg-slate-800 border border-slate-700 rounded focus:ring-red-500 focus:border-red-500" placeholder="例: 19900101"/>
          {errors.birthDate && <p className="text-yellow-400 mt-1 text-xs">{errors.birthDate.message}</p>}
        </div>

        {/* アバター画像入力フィールドを削除 */}

        {/* 身分証（表） */}
        <div>
          <label htmlFor="idFrontReg" className="block text-sm font-medium text-slate-300 mb-1">身分証（表） <span className="text-red-500">*</span> ({MAX_ID_FILE_SIZE_MB}MBまで)</label>
          <input id="idFrontReg" type="file" {...register('idFront')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-700 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-600 file:text-slate-200 hover:file:bg-slate-500" />
          {idFrontPreview && <img src={idFrontPreview} alt="身分証(表)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
          {errors.idFront && <p className="text-yellow-400 mt-1 text-xs">{typeof errors.idFront.message === 'string' ? errors.idFront.message : 'ファイルエラー'}</p>}
        </div>
        {/* 身分証（裏） */}
        <div>
          <label htmlFor="idBackReg" className="block text-sm font-medium text-slate-300 mb-1">身分証（裏・任意） ({MAX_ID_FILE_SIZE_MB}MBまで)</label>
          <input id="idBackReg" type="file" {...register('idBack')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-700 rounded file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-600 file:text-slate-200 hover:file:bg-slate-500" />
          {idBackPreview && <img src={idBackPreview} alt="身分証(裏)プレビュー" className="mt-2 max-h-32 object-contain rounded border border-slate-600" />}
          {errors.idBack && <p className="text-yellow-400 mt-1 text-xs">{typeof errors.idBack.message === 'string' ? errors.idBack.message : 'ファイルエラー'}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className={`w-full font-bold py-3 px-4 rounded mt-6 transition-colors text-base ${isSubmitting ? 'bg-slate-500 cursor-not-allowed text-slate-400' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
          {isSubmitting ? '登録処理中...' : '登録する'}
        </button>
      </form>
      <p className="text-center text-sm text-slate-400 mt-6">
        既にアカウントをお持ちですか？{' '}
        <Link to="/login" className="font-medium text-sky-400 hover:text-sky-300 hover:underline">
          ログインはこちら
        </Link>
      </p>
    </div>
  );
};
export default RegisterPage;