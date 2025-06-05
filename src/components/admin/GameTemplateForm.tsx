// src/components/admin/GameTemplateForm.tsx
import React, { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GameTemplate, GAME_NAME_OPTIONS } from '../../types';
import Button from '../common/Button';
import Input from '../common/Input';

// フォームデータのスキーマ定義
const gameTemplateSchema = z.object({
  templateName: z.string().min(1, 'テンプレート名は必須です。'),
  gameType: z.enum(GAME_NAME_OPTIONS, {
    errorMap: () => ({ message: "有効なゲームタイプを選択してください。" }),
  }),
  blindsOrRate: z.string().nullable().optional(), // 空文字列も許容し、nullも対応
  description: z.string().optional(),
  // ★修正点: z.coerce.number() を使用し、.nullable().optional() でより柔軟に扱う
  //これにより、空文字列はNaNになり、optional()でundefinedとして扱われる
  minPlayers: z.coerce.number().int('整数で入力してください。').min(0, '最小人数は0以上です。').nullable().optional(),
  maxPlayers: z.coerce.number().int('整数で入力してください。').min(0, '最大人数は0以上です。').nullable().optional(),
  estimatedDurationMinutes: z.coerce.number().int('整数で入力してください。').min(0, '予想時間は0以上です。').nullable().optional(),
  notesForUser: z.string().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int('整数で入力してください。').min(0, '表示順は0以上です。').nullable().optional(),
});

export type GameTemplateFormData = z.infer<typeof gameTemplateSchema>;

interface GameTemplateFormProps {
  onSubmitForm: (data: GameTemplateFormData) => Promise<void>;
  initialData?: GameTemplate | null;
  isSubmitting: boolean;
  onCancel?: () => void;
  formError?: string | null;
}

const GameTemplateForm: React.FC<GameTemplateFormProps> = ({ onSubmitForm, initialData, isSubmitting, onCancel, formError }) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<GameTemplateFormData>({
    resolver: zodResolver(gameTemplateSchema),
    defaultValues: {
      templateName: initialData?.templateName || '',
      gameType: initialData?.gameType || GAME_NAME_OPTIONS[0],
      blindsOrRate: initialData?.blindsOrRate ?? '', // nullish coalescingでnullも空文字列に変換
      description: initialData?.description || '',
      minPlayers: initialData?.minPlayers ?? undefined,
      maxPlayers: initialData?.maxPlayers ?? undefined,
      estimatedDurationMinutes: initialData?.estimatedDurationMinutes ?? undefined,
      notesForUser: initialData?.notesForUser || '',
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
    },
  });

  useEffect(() => {
    reset({
      templateName: initialData?.templateName || '',
      gameType: initialData?.gameType || GAME_NAME_OPTIONS[0],
      blindsOrRate: initialData?.blindsOrRate ?? '',
      description: initialData?.description || '',
      minPlayers: initialData?.minPlayers ?? undefined,
      maxPlayers: initialData?.maxPlayers ?? undefined,
      estimatedDurationMinutes: initialData?.estimatedDurationMinutes ?? undefined,
      notesForUser: initialData?.notesForUser || '',
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
    });
  }, [initialData, reset]);

  const handleFormSubmit: SubmitHandler<GameTemplateFormData> = async (data) => {
    await onSubmitForm(data);
    if (!initialData) {
      reset();
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 text-sm p-4 bg-slate-700 rounded-md">
      {formError && <p className="text-red-400 text-xs mb-3">{formError}</p>}
      <div>
        <label htmlFor="templateName" className="block font-medium text-slate-300 mb-1">テンプレート名 <span className="text-red-500">*</span></label>
        <Input type="text" id="templateName" {...register('templateName')} className="w-full" />
        {errors.templateName && <p className="text-red-400 text-xs mt-1">{errors.templateName.message}</p>}
      </div>

      <div>
        <label htmlFor="gameType" className="block font-medium text-slate-300 mb-1">ゲームタイプ <span className="text-red-500">*</span></label>
        <select id="gameType" {...register('gameType')} className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white focus:ring-red-500 focus:border-red-500">
          {GAME_NAME_OPTIONS.map(option => (<option key={option} value={option}>{option}</option>))}
        </select>
        {errors.gameType && <p className="text-red-400 text-xs mt-1">{errors.gameType.message}</p>}
      </div>

      <div>
        <label htmlFor="blindsOrRate" className="block font-medium text-slate-300 mb-1">ブラインド/レート (例: 100/200)</label>
        <Input type="text" id="blindsOrRate" {...register('blindsOrRate')} className="w-full" />
        {errors.blindsOrRate && <p className="text-red-400 text-xs mt-1">{errors.blindsOrRate.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="minPlayers" className="block font-medium text-slate-300 mb-1">最小人数</label>
          <Input type="number" id="minPlayers" {...register('minPlayers')} className="w-full" />
          {errors.minPlayers && <p className="text-red-400 text-xs mt-1">{errors.minPlayers.message}</p>}
        </div>
        <div>
          <label htmlFor="maxPlayers" className="block font-medium text-slate-300 mb-1">最大人数</label>
          <Input type="number" id="maxPlayers" {...register('maxPlayers')} className="w-full" />
          {errors.maxPlayers && <p className="text-red-400 text-xs mt-1">{errors.maxPlayers.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="estimatedDurationMinutes" className="block font-medium text-slate-300 mb-1">想定プレイ時間 (分)</label>
        <Input type="number" id="estimatedDurationMinutes" {...register('estimatedDurationMinutes')} className="w-full" />
        {errors.estimatedDurationMinutes && <p className="text-red-400 text-xs mt-1">{errors.estimatedDurationMinutes.message}</p>}
      </div>

      <div>
        <label htmlFor="notesForUser" className="block font-medium text-slate-300 mb-1">ユーザー向け補足 (任意)</label>
        <textarea id="notesForUser" {...register('notesForUser')} rows={2} className="w-full p-2 bg-slate-600 border border-slate-500 rounded text-white"></textarea>
      </div>

      <div>
        <label htmlFor="sortOrder" className="block font-medium text-slate-300 mb-1">表示順 (小さいほど先)</label>
        <Input type="number" id="sortOrder" {...register('sortOrder')} className="w-full" />
        {errors.sortOrder && <p className="text-red-400 text-xs mt-1">{errors.sortOrder.message}</p>}
      </div>

      <div className="flex items-center">
        <input type="checkbox" id="isActive" {...register('isActive')} className="h-4 w-4 text-green-600 border-slate-600 rounded bg-slate-700 focus:ring-green-500" />
        <label htmlFor="isActive" className="ml-2 block font-medium text-slate-300">ウェイティング受付中</label>
      </div>

      <div className="flex justify-end space-x-3 pt-3">
        {onCancel && (
          <Button type="button" onClick={onCancel} disabled={isSubmitting} className="bg-slate-600 hover:bg-slate-500 text-slate-300">キャンセル</Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {isSubmitting ? '処理中...' : (initialData ? 'テンプレートを更新' : 'テンプレートを作成')}
        </Button>
      </div>
    </form>
  );
};

export default GameTemplateForm;