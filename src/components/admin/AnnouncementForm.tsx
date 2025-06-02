// src/components/admin/AnnouncementForm.tsx
import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StoreAnnouncement } from '../../types'; // types.tsからインポート (パスを調整)
import { storage } from '../../services/firebase'; // 画像アップロード用 (パスを調整)
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// 画像ファイルのバリデーション設定 (DrinkMenuFormと同様)
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const announcementSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(100, 'タイトルは100文字以内です'),
  text: z.string().max(1000, '本文は1000文字以内です').optional(),
  imageFile: z.custom<FileList>()
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE, `画像は${MAX_FILE_SIZE / 1024 / 1024}MB以下`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), "対応形式: jpg, png, webp")
    .optional(),
  link: z.string().url('有効なURL形式で入力してください').optional().or(z.literal('')),
  isPublished: z.boolean(),
  sortOrder: z.number().int('整数で入力').optional(),
});

export type AnnouncementFormData = z.infer<typeof announcementSchema>;

interface AnnouncementFormProps {
  onSubmitForm: (data: AnnouncementFormData, newImageUrl?: string) => Promise<void>;
  initialData?: StoreAnnouncement | null;
  isSubmitting: boolean;
  onCancel?: () => void;
}

const AnnouncementForm: React.FC<AnnouncementFormProps> = ({ onSubmitForm, initialData, isSubmitting, onCancel }) => {
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: initialData?.title || '',
      text: initialData?.text || '',
      // imageFileは初期値なし
      link: initialData?.link || '',
      isPublished: initialData?.isPublished !== undefined ? initialData.isPublished : true,
      sortOrder: initialData?.sortOrder || undefined,
    },
  });

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(initialData?.imageUrl || null);
  const imageFileWatch = watch("imageFile");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);


  useEffect(() => {
    if (imageFileWatch && imageFileWatch.length > 0) {
      const file = imageFileWatch[0];
      const reader = new FileReader();
      reader.onloadend = () => setPreviewImageUrl(reader.result as string);
      reader.readAsDataURL(file);
    } else if (initialData?.imageUrl) {
      setPreviewImageUrl(initialData.imageUrl);
    } else {
      setPreviewImageUrl(null);
    }
  }, [imageFileWatch, initialData?.imageUrl]);

  const handleFormSubmit: SubmitHandler<AnnouncementFormData> = async (formData) => {
    let newImageUrl = initialData?.imageUrl || ''; // 編集時は既存のURLを保持
    setImageUploadError(null);

    if (formData.imageFile && formData.imageFile.length > 0) {
      setIsUploadingImage(true);
      const imageToUpload = formData.imageFile[0];
      try {
        // 既存画像があれば削除 (編集時かつ新しい画像が選択された場合)
        if (initialData && initialData.imageUrl && initialData.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
          const oldImageRef = storageRef(storage, initialData.imageUrl);
          await deleteObject(oldImageRef);
        }
        const imageFileName = `announcements/${Date.now()}_${imageToUpload.name}`;
        const newImageRef = storageRef(storage, imageFileName);
        await uploadBytes(newImageRef, imageToUpload);
        newImageUrl = await getDownloadURL(newImageRef);
      } catch (uploadError: any) {
        console.error("画像アップロード失敗:", uploadError);
        setImageUploadError(`画像アップロード失敗: ${uploadError.message}`);
        setIsUploadingImage(false);
        return; // 画像アップロード失敗時はフォーム送信を中断
      }
      setIsUploadingImage(false);
    } else if (!formData.imageFile && initialData && initialData.imageUrl && !previewImageUrl) {
      // 画像がクリアされた場合 (プレビューがnullだがinitialData.imageUrlは存在する場合)
      // → 既存の画像を削除する処理 (もし「画像削除」ボタンがない場合、この検知は難しい)
      // 今回は、ファイルが選択されなければ既存のURLを維持するか、新規なら空のまま。
      // 「既存の画像を削除」のUIが必要なら、別途フラグ管理する。
      // newImageUrl = ''; // 画像を削除する場合
    }


    await onSubmitForm(formData, newImageUrl);

    if (!initialData) { // 新規追加時のみフォームをリセット
      reset();
      setPreviewImageUrl(null);
    } else {
      // 編集時はファイル入力をクリア (任意)
      setValue('imageFile', undefined as any, { shouldValidate: false });
      // プレビューは送信成功後のURLで更新されるか、既存の画像に戻る
      if (!newImageUrl && initialData?.imageUrl) setPreviewImageUrl(initialData.imageUrl);
      else if(newImageUrl) setPreviewImageUrl(newImageUrl);
      else setPreviewImageUrl(null);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-sm p-4 bg-slate-700 rounded-md">
      <div>
        <label htmlFor="announcementTitle" className="block font-medium text-slate-300 mb-1">タイトル</label>
        <input type="text" id="announcementTitle" {...register('title')} className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white" />
        {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title.message}</p>}
      </div>
      <div>
        <label htmlFor="announcementText" className="block font-medium text-slate-300 mb-1">本文 (任意)</label>
        <textarea id="announcementText" {...register('text')} rows={5} className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white"></textarea>
        {errors.text && <p className="text-red-400 text-xs mt-1">{errors.text.message}</p>}
      </div>
      <div>
        <label htmlFor="announcementImageFile" className="block font-medium text-slate-300 mb-1">画像ファイル (任意)</label>
        <input type="file" id="announcementImageFile" {...register('imageFile')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700" />
        {errors.imageFile && <p className="text-red-400 text-xs mt-1">{typeof errors.imageFile.message === 'string' ? errors.imageFile.message : 'ファイルエラー'}</p>}
        {imageUploadError && <p className="text-red-400 text-xs mt-1">{imageUploadError}</p>}
        {previewImageUrl && (
          <div className="mt-2">
            <p className="text-xs text-slate-400 mb-1">プレビュー:</p>
            <img src={previewImageUrl} alt="プレビュー" className="max-h-40 rounded border border-slate-600 object-contain" />
          </div>
        )}
      </div>
      <div>
        <label htmlFor="announcementLink" className="block font-medium text-slate-300 mb-1">関連リンクURL (任意)</label>
        <input type="url" id="announcementLink" {...register('link')} className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white" />
        {errors.link && <p className="text-red-400 text-xs mt-1">{errors.link.message}</p>}
      </div>
      <div>
        <label htmlFor="announcementSortOrder" className="block font-medium text-slate-300 mb-1">表示順 (任意、整数、小さいほど先)</label>
        <input type="number" id="announcementSortOrder" {...register('sortOrder', { valueAsNumber: true })} step="1" className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white" />
        {errors.sortOrder && <p className="text-red-400 text-xs mt-1">{errors.sortOrder.message}</p>}
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="isPublished" {...register('isPublished')} className="h-4 w-4 text-sky-600 border-slate-600 rounded bg-slate-700 focus:ring-sky-500" />
        <label htmlFor="isPublished" className="ml-2 block font-medium text-slate-300">公開する</label>
      </div>
      <div className="flex justify-end space-x-3 pt-3">
        {onCancel && <button type="button" onClick={onCancel} disabled={isSubmitting || isUploadingImage} className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 rounded-md">キャンセル</button>}
        <button type="submit" disabled={isSubmitting || isUploadingImage} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${isSubmitting || isUploadingImage ? 'bg-slate-500 text-slate-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}>
          {(isSubmitting || isUploadingImage) ? '処理中...' : (initialData?.id ? 'お知らせを更新' : 'お知らせを作成')}
        </button>
      </div>
    </form>
  );
};

export default AnnouncementForm;