// src/components/admin/TableEditForm.tsx
import React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
// ★ TABLE_STATUS_OPTIONS も types.ts からインポートする想定
import { TableData, TABLE_STATUS_OPTIONS, TableStatus } from '../../types'; // パスを調整

// const TABLE_STATUS_OPTIONS = ["active", "inactive", "full", "maintenance"] as const; // ← types.ts に移動した場合削除

const tableSchema = z.object({
  name: z.string().min(1, 'テーブル名は必須です'),
  maxSeats: z.number().min(1, '最大座席数は1以上で入力してください').int('整数で入力してください'),
  status: z.enum(TABLE_STATUS_OPTIONS).optional(), // types.tsのTABLE_STATUS_OPTIONSを参照
  gameType: z.string().optional(),
});

export type TableFormData = z.infer<typeof tableSchema>;

interface TableEditFormProps {
  onSubmitForm: (data: TableFormData) => Promise<void>;
  initialData?: TableData & { id?: string }; // 編集時はIDも含む
  isSubmitting: boolean;
  onCancel?: () => void;
}

const TableEditForm: React.FC<TableEditFormProps> = ({ onSubmitForm, initialData, isSubmitting, onCancel }) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<TableFormData>({
    resolver: zodResolver(tableSchema),
    defaultValues: initialData
      ? {
          name: initialData.name || '',
          maxSeats: initialData.maxSeats || 9,
          status: initialData.status || TABLE_STATUS_OPTIONS[0], // initialData.status を TableStatus | undefined として扱う
          gameType: initialData.gameType || '',
        }
      : { // 新規作成時のデフォルト
          name: '',
          maxSeats: 9,
          status: TABLE_STATUS_OPTIONS[0], // デフォルトは "active"
          gameType: '',
        },
  });

  const handleFormSubmit: SubmitHandler<TableFormData> = async (data) => {
    try {
        await onSubmitForm(data);
        if (!initialData?.id) { // 新規作成成功時のみフォームをリセット
            reset({ name: '', maxSeats: 9, status: TABLE_STATUS_OPTIONS[0], gameType: '' });
        }
        // 編集成功時は、親コンポーネントで editingTable を null にするなどでフォームが再初期化されるか、
        // あるいは initialData が更新されるのを待つ
    } catch (error) {
        console.error("TableEditForm submission error:", error);
        // フォームレベルでのエラートーストなどを表示しても良い
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-sm p-4 bg-slate-700 rounded-md">
      <div>
        <label htmlFor="tableName" className="block font-medium text-slate-300 mb-1">テーブル名</label>
        <input
          type="text"
          id="tableName"
          {...register('name')}
          className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white focus:ring-lime-500 focus:border-lime-500"
        />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="maxSeats" className="block font-medium text-slate-300 mb-1">最大座席数</label>
        <input
          type="number"
          id="maxSeats"
          {...register('maxSeats', { valueAsNumber: true })}
          disabled={!!initialData?.id} // 編集時は無効
          className={`w-full p-2 bg-slate-600 border border-slate-500 rounded text-white focus:ring-lime-500 focus:border-lime-500 ${initialData?.id ? 'cursor-not-allowed bg-slate-500 opacity-70' : ''}`}
          step="1"
        />
        {errors.maxSeats && <p className="text-red-400 text-xs mt-1">{errors.maxSeats.message}</p>}
        {initialData?.id && <p className="text-xs text-slate-400 mt-1">（座席数の変更は現在サポートされていません）</p>}
      </div>
      <div>
        <label htmlFor="tableStatus" className="block font-medium text-slate-300 mb-1">ステータス</label>
        <select
          id="tableStatus"
          {...register('status')}
          className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white focus:ring-lime-500 focus:border-lime-500"
        >
          {TABLE_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {errors.status && <p className="text-red-400 text-xs mt-1">{errors.status.message}</p>}
      </div>
      <div>
        <label htmlFor="gameType" className="block font-medium text-slate-300 mb-1">ゲームタイプ (任意)</label>
        <input
          type="text"
          id="gameType"
          {...register('gameType')}
          placeholder="例: NLH 100/200"
          className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white focus:ring-lime-500 focus:border-lime-500"
        />
        {errors.gameType && <p className="text-red-400 text-xs mt-1">{errors.gameType.message}</p>}
      </div>
      <div className="flex justify-end space-x-3 pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 rounded-md transition-colors"
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
            isSubmitting
              ? 'bg-slate-500 text-slate-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isSubmitting ? '処理中...' : (initialData?.id ? 'テーブル情報を更新' : 'テーブルを作成')}
        </button>
      </div>
    </form>
  );
};

export default TableEditForm;