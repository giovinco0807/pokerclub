// src/components/admin/DrinkMenuForm.tsx
import React, { useState, useEffect } from 'react'; // useEffect, useState をインポート
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DrinkMenuItem } from '../../services/menuService'; // DrinkMenuItem型 (imageUrlはstring)

// カテゴリの選択肢
const CATEGORY_OPTIONS = ["ソフトドリンク", "アルコール", "軽食", "チップ"] as const;
type CategoryTuple = typeof CATEGORY_OPTIONS;
type Category = CategoryTuple[number];

// 画像ファイルのバリデーション設定
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// Zodスキーマ
const drinkMenuSchema = z.object({
  name: z.string().min(1, '商品名は必須です'),
  category: z.enum(CATEGORY_OPTIONS, {
    errorMap: () => ({ message: "有効なカテゴリーを選択してください。" }),
  }),
  price: z.number().min(0, '価格は0以上である必要があります'),
  description: z.string().optional(),
  imageFile: z.custom<FileList>() // FileList型を期待
    .refine(files => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE, `画像サイズは${MAX_FILE_SIZE / 1024 / 1024}MB以下にしてください。`)
    .refine(files => !files || files.length === 0 || ACCEPTED_IMAGE_TYPES.includes(files[0]?.type), `対応形式: ${ACCEPTED_IMAGE_TYPES.map(t => t.split('/')[1]).join(', ')}`)
    .optional(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int('整数で入力してください').optional(),
});

// フォームデータの型
export type DrinkMenuFormDataWithFile = z.infer<typeof drinkMenuSchema>;

interface DrinkMenuFormProps {
  onSubmitForm: (data: DrinkMenuFormDataWithFile, imageToUpload?: File) => Promise<void>;
  initialData?: DrinkMenuItem | null; // DrinkMenuItem の imageUrl は string (既存画像のURL)
  isSubmitting: boolean;
}

const DrinkMenuForm: React.FC<DrinkMenuFormProps> = ({ onSubmitForm, initialData, isSubmitting }) => {
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<DrinkMenuFormDataWithFile>({
    resolver: zodResolver(drinkMenuSchema),
    defaultValues: {
      name: initialData?.name || '',
      category: (initialData?.category as Category) || CATEGORY_OPTIONS[0],
      price: initialData?.price || 0,
      description: initialData?.description || '',
      // imageFile は FileList のため、defaultValues では直接設定しにくい
      isAvailable: initialData?.isAvailable !== undefined ? initialData.isAvailable : true,
      sortOrder: initialData?.sortOrder || undefined,
    },
  });

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(initialData?.imageUrl || null);
  const imageFileWatch = watch("imageFile");

  useEffect(() => {
    if (imageFileWatch && imageFileWatch.length > 0) {
      const file = imageFileWatch[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else if (initialData?.imageUrl) { // ファイル選択がクリアされたら既存の画像に戻す (編集時)
      setPreviewImageUrl(initialData.imageUrl);
    } else { // 新規でファイル選択もない場合
      setPreviewImageUrl(null);
    }
  }, [imageFileWatch, initialData?.imageUrl]);


  const handleFormSubmit: SubmitHandler<DrinkMenuFormDataWithFile> = async (data) => {
    const imageToUpload = data.imageFile && data.imageFile.length > 0 ? data.imageFile[0] : undefined;
    try {
      await onSubmitForm(data, imageToUpload);
      if (!initialData) { // 新規追加の場合のみフォーム全体をリセット
        reset();
        setPreviewImageUrl(null); // プレビューもクリア
      } else {
         // 編集成功後、ファイル入力のみクリアする（任意）
        setValue('imageFile', undefined as any, { shouldValidate: false });
        // プレビューは送信成功後のURLで更新されるか、既存の画像に戻る
        if (!imageToUpload && initialData?.imageUrl) {
            setPreviewImageUrl(initialData.imageUrl);
        } else if (!imageToUpload && !initialData?.imageUrl){
            setPreviewImageUrl(null);
        }
        // 親コンポーネントでfetchMenuItemsが呼ばれ、initialDataが更新されるとプレビューも更新されるはず
      }
    } catch (error) {
      console.error("DrinkMenuForm: Error in onSubmitForm:", error);
    }
  };

  const selectedCategory = watch("category");
  const isChipCategory = selectedCategory === "チップ";

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-sm">
      <div>
        <label htmlFor="name" className="block font-medium text-slate-300 mb-1">商品名</label>
        <input type="text" id="name" {...register('name')} className="mt-1 w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-red-500 focus:border-red-500" />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="category" className="block font-medium text-slate-300 mb-1">カテゴリー</label>
        <select id="category" {...register('category')} className="mt-1 w-full p-2 bg-slate-700 border border-slate-600 rounded text-white focus:ring-red-500 focus:border-red-500">
          {CATEGORY_OPTIONS.map(option => (<option key={option} value={option}>{option}</option>))}
        </select>
        {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category.message}</p>}
      </div>

      <div>
        <label htmlFor="price" className="block font-medium text-slate-300 mb-1">価格 (円)</label>
        <input type="number" id="price" {...register('price', { valueAsNumber: true, disabled: isChipCategory })} className={`mt-1 w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-red-500 focus:border-red-500 ${isChipCategory ? 'bg-slate-600 cursor-not-allowed' : ''}`} />
        {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block font-medium text-slate-300 mb-1">説明 (任意)</label>
        <textarea id="description" {...register('description')} rows={3} className="mt-1 w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-red-500 focus:border-red-500"></textarea>
      </div>

      <div>
        <label htmlFor="imageFile" className="block font-medium text-slate-300 mb-1">画像ファイル (任意)</label>
        <input type="file" id="imageFile" {...register('imageFile')} accept={ACCEPTED_IMAGE_TYPES.join(',')} className="mt-1 w-full p-2 text-slate-300 border border-slate-600 rounded file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700" />
        {errors.imageFile && <p className="text-red-400 text-xs mt-1">{typeof errors.imageFile.message === 'string' ? errors.imageFile.message : 'ファイルエラー'}</p>}
        {previewImageUrl && (
          <div className="mt-2">
            <p className="text-xs text-slate-400 mb-1">現在の画像 / プレビュー:</p>
            <img src={previewImageUrl} alt="プレビュー" className="max-h-32 rounded border border-slate-600 object-contain" />
          </div>
        )}
      </div>

      <div>
        <label htmlFor="sortOrder" className="block font-medium text-slate-300 mb-1">表示順 (任意、整数)</label>
        <input type="number" id="sortOrder" {...register('sortOrder', { valueAsNumber: true })} step="1" className="mt-1 w-full p-2 bg-slate-700 border border-slate-600 rounded focus:ring-red-500 focus:border-red-500" />
        {errors.sortOrder && <p className="text-red-400 text-xs mt-1">{errors.sortOrder.message}</p>}
      </div>

      <div className="flex items-center">
        <input type="checkbox" id="isAvailable" {...register('isAvailable')} className="h-4 w-4 text-red-600 border-slate-600 rounded bg-slate-700 focus:ring-red-500" />
        <label htmlFor="isAvailable" className="ml-2 block font-medium text-slate-300">提供中</label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full px-4 py-2 font-semibold rounded transition-colors h-10
                    ${isSubmitting ? 'bg-slate-500 text-slate-400 cursor-not-allowed'
                                     : 'bg-green-600 hover:bg-green-700 text-white'}`}
      >
        {isSubmitting ? '処理中...' : (initialData ? '更新する' : '追加する')}
      </button>
    </form>
  );
};

export default DrinkMenuForm;