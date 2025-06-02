// src/components/admin/ChipSettlementModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { UserWithId, ChipDenomination, DEFAULT_CHIP_DENOMINATIONS } from '../../types'; // types.ts からインポート

export interface ChipSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithId | null; // 精算対象のユーザー
  onSubmitSettlement: (
    denominationsCount: { [denominationValue: string]: number }, // キーはstring (value)
    totalChips: number
  ) => Promise<void>; // 呼び出し元 (AdminUserManagementPage) の関数
  isSubmitting: boolean; // 呼び出し元が管理する送信中フラグ
}

const ChipSettlementModal: React.FC<ChipSettlementModalProps> = ({
  isOpen,
  onClose,
  user,
  onSubmitSettlement,
  isSubmitting,
}) => {
  // 各金種の枚数を文字列として保持 (空入力を許容するため)
  const [denominationsCountInput, setDenominationsCountInput] = useState<{ [denominationValue: string]: string }>({});

  useEffect(() => {
    // モーダルが開くとき、または対象ユーザーが変わるときにカウントをリセット
    if (isOpen) {
      const initialCounts: { [key: string]: string } = {};
      DEFAULT_CHIP_DENOMINATIONS.forEach(denom => {
        initialCounts[String(denom.value)] = ''; 
      });
      setDenominationsCountInput(initialCounts);
    }
  }, [isOpen, user]);

  // 入力された枚数から合計チップを計算
  const totalCalculatedChips = useMemo(() => {
    return DEFAULT_CHIP_DENOMINATIONS.reduce((total, denom) => {
      const count = parseInt(denominationsCountInput[String(denom.value)], 10);
      if (!isNaN(count) && count > 0) {
        return total + denom.value * count;
      }
      return total;
    }, 0);
  }, [denominationsCountInput]);

  const handleCountChange = (denominationValue: number, countString: string) => {
    const sanitizedCount = countString.replace(/[^0-9]/g, ''); // 数字以外を削除
    if (sanitizedCount === '' || parseInt(sanitizedCount, 10) >= 0) { // 空または0以上を許可
      setDenominationsCountInput(prev => ({
        ...prev,
        [String(denominationValue)]: sanitizedCount,
      }));
    }
  };

  const handleSubmit = () => {
    if (!user) return;

    const finalDenominationsCountParsed: { [key: string]: number } = {};
    DEFAULT_CHIP_DENOMINATIONS.forEach(denom => {
        const count = parseInt(denominationsCountInput[String(denom.value)], 10);
        if (!isNaN(count) && count > 0) {
            finalDenominationsCountParsed[String(denom.value)] = count;
        }
    });

    if (totalCalculatedChips < 0) { // 基本的に発生しないはずだが念のため
        alert("合計チップ額がマイナスになっています。入力内容を確認してください。");
        return;
    }
    
    if (totalCalculatedChips === 0 && Object.keys(finalDenominationsCountParsed).length === 0 ) {
        if (!window.confirm("チップ枚数が入力されていません（合計0チップ）。この内容で精算を開始してよろしいですか？")) {
            return;
        }
    }
    onSubmitSettlement(finalDenominationsCountParsed, totalCalculatedChips);
  };

  if (!isOpen || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-neutral-lightest transform animate-scaleUp">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
            <h2 className="text-xl font-semibold text-amber-400">
            チップ精算入力
            </h2>
            <button onClick={onClose} disabled={isSubmitting} className="text-slate-400 hover:text-slate-200 p-1 rounded-full hover:bg-slate-700 transition-colors" aria-label="閉じる">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <p className="text-sm text-slate-300 mb-1">対象ユーザー: <span className="font-medium">{user.pokerName || user.email}</span></p>
        <p className="text-xs text-slate-400 mb-1">現在のテーブル: {user.currentTableId || 'N/A'}, 座席: {user.currentSeatNumber ?? 'N/A'}</p>
        {user.chipsInPlay !== undefined && ( // chipsInPlayが0の場合も表示するため undefined のみチェック
            <p className="text-xs text-slate-400 mb-4">
                (システム上の使用中チップ `chipsInPlay`: {(user.chipsInPlay ?? 0).toLocaleString()} チップ)
            </p>
        )}

        <div className="space-y-2 max-h-[calc(50vh-120px)] overflow-y-auto mb-4 pr-2 custom-scrollbar"> {/* 高さを微調整 */}
          {DEFAULT_CHIP_DENOMINATIONS.map(denom => (
            <div key={denom.value} className="flex items-center justify-between gap-3">
              <label htmlFor={`denom-input-${denom.value}`} className="text-slate-300 whitespace-nowrap w-2/5 text-sm">
                {denom.label} ({denom.value.toLocaleString()}P):
              </label>
              <input
                type="number"
                id={`denom-input-${denom.value}`}
                min="0"
                step="1"
                value={denominationsCountInput[String(denom.value)] || ''}
                onChange={(e) => handleCountChange(denom.value, e.target.value)}
                className="w-3/5 p-2 bg-slate-700 border border-slate-600 rounded focus:ring-amber-500 focus:border-amber-500 appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="枚数"
                disabled={isSubmitting}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-700">
          <p className="text-lg font-semibold text-white">
            精算合計チップ (入力ベース): <span className="text-amber-300 text-xl">{totalCalculatedChips.toLocaleString()}</span> チップ
          </p>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md shadow-sm disabled:opacity-70"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm ${
              isSubmitting ? 'bg-slate-500 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isSubmitting ? '処理中...' : '精算内容をユーザー確認へ送る'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChipSettlementModal;