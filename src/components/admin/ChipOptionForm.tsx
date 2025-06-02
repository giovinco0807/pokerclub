// src/components/admin/ChipOptionForm.tsx
import React, { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChipPurchaseOption } from '../../types'; // types.ts からインポート

// フォームデータの型定義
export const chipOptionFormSchema = z.object({
  name: z.string().min(1, 'オプション名は必須です。').max(100, '100文字以内で入力してください。'),
  priceYen: z.coerce.number().min(0, '価格は0円以上で入力してください。'), // coerceで数値に変換
  chipsAmount: z.coerce.number().min(1, 'チップ量は1以上で入力してください。'), // coerceで数値に変換
  description: z.string().max(500, '説明は500文字以内で入力してください。').optional(),
  sortOrder: z.coerce.number().min(0, '表示順は0以上で入力してください。').optional(),
  isAvailable: z.boolean(),
});

export type ChipOptionFormData = z.infer<typeof chipOptionFormSchema>;

interface ChipOptionFormProps {
  onSubmitForm: (data: ChipOptionFormData) => Promise<void>;
  initialData?: ChipPurchaseOption | null;
  isSubmitting: boolean;
  onCancel?: () => void;
}

const ChipOptionForm: React.FC<ChipOptionFormProps> = ({
  onSubmitForm,
  initialData,
  isSubmitting,
  onCancel,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChipOptionFormData>({
    resolver: zodResolver(chipOptionFormSchema),
    defaultValues: {
      name: initialData?.name || '',
      priceYen: initialData?.priceYen || 0,
      chipsAmount: initialData?.chipsAmount || 0,
      description: initialData?.description || '',
      sortOrder: initialData?.sortOrder || 0,
      isAvailable: initialData?.isAvailable === undefined ? true : initialData.isAvailable, // 新規時はデフォルトで提供中
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name,
        priceYen: initialData.priceYen,
        chipsAmount: initialData.chipsAmount,
        description: initialData.description || '',
        sortOrder: initialData.sortOrder || 0,
        isAvailable: initialData.isAvailable,
      });
    } else {
      // 新規作成モードの場合のデフォルト値 (特に isAvailable など)
      reset({
        name: '',
        priceYen: 0,
        chipsAmount: 0,
        description: '',
        sortOrder: 0,
        isAvailable: true,
      });
    }
  }, [initialData, reset]);

  const onSubmit: SubmitHandler<ChipOptionFormData> = async (data) => {
    await onSubmitForm(data);
    if (!initialData) { // 新規追加の場合のみフォームをリセット
      reset();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
          オプション名 <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          {...register('name')}
          className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
        />
        {errors.name && <p className="text-yellow-400 mt-1 text-xs">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="priceYen" className="block text-sm font-medium text-slate-300 mb-1">
          価格 (円) <span className="text-red-500">*</span>
        </label>
        <input
          id="priceYen"
          type="number"
          step="1" // 整数のみを想定
          {...register('priceYen')}
          className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
        />
        {errors.priceYen && <p className="text-yellow-400 mt-1 text-xs">{errors.priceYen.message}</p>}
      </div>

      <div>
        <label htmlFor="chipsAmount" className="block text-sm font-medium text-slate-300 mb-1">
          付与チップ数 <span className="text-red-500">*</span>
        </label>
        <input
          id="chipsAmount"
          type="number"
          step="1" // 整数のみを想定
          {...register('chipsAmount')}
          className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
        />
        {errors.chipsAmount && <p className="text-yellow-400 mt-1 text-xs">{errors.chipsAmount.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-1">
          説明 (任意)
        </label>
        <textarea
          id="description"
          rows={3}
          {...register('description')}
          className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
        />
        {errors.description && <p className="text-yellow-400 mt-1 text-xs">{errors.description.message}</p>}
      </div>
      
      <div>
        <label htmlFor="sortOrder" className="block text-sm font-medium text-slate-300 mb-1">
          表示順 (任意、小さいほど先に表示)
        </label>
        <input
          id="sortOrder"
          type="number"
          step="1"
          {...register('sortOrder')}
          className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
          placeholder="例: 0, 10, 20"
        />
        {errors.sortOrder && <p className="text-yellow-400 mt-1 text-xs">{errors.sortOrder.message}</p>}
      </div>

      <div className="flex items-center">
        <input
          id="isAvailable"
          type="checkbox"
          {...register('isAvailable')}
          className="h-4 w-4 text-purple-600 border-slate-500 rounded focus:ring-purple-500 bg-slate-700"
        />
        <label htmlFor="isAvailable" className="ml-2 block text-sm text-slate-300">
          公開する (ユーザー向け注文ページに表示)
        </label>
        {errors.isAvailable && <p className="text-yellow-400 ml-4 text-xs">{errors.isAvailable.message}</p>}
      </div>

      <div className="flex items-center justify-end space-x-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md shadow-sm disabled:opacity-50"
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm
            ${isSubmitting
              ? 'bg-slate-500 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-slate-800'
            }`}
        >
          {isSubmitting ? '処理中...' : initialData ? '更新する' : '追加する'}
        </button>
      </div>
    </form>
  );
};

export default ChipOptionForm;