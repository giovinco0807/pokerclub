// src/components/admin/SeatSelectionModal.tsx
import React, { useState, useEffect } from 'react';
import { Table, Seat, UserWithId } from '../../types';

export interface SeatSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeatSelect: (tableId: string, seatNumber: number, amountToPlay?: number) => void;
  targetUser: UserWithId | null;
  currentTables: Table[];
  isLoadingTables: boolean;
  needsChipInput?: boolean;
}

const SeatSelectionModal: React.FC<SeatSelectionModalProps> = ({
  isOpen,
  onClose,
  onSeatSelect,
  targetUser,
  currentTables = [],
  isLoadingTables,
  needsChipInput = false,
}) => {
  const [tablesToDisplay, setTablesToDisplay] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null);
  const [chipsToBring, setChipsToBring] = useState<string>('');

  useEffect(() => {
    if (currentTables) {
      setTablesToDisplay(currentTables.filter(t => t.status !== 'inactive'));
    } else {
      setTablesToDisplay([]);
    }
  }, [currentTables]);

  useEffect(() => {
    if (isOpen) {
      setSelectedTableId(null);
      setSelectedSeatNumber(null);
      if (needsChipInput && targetUser) {
        const currentChipsInPlay = targetUser.chipsInPlay ?? 0;
        const currentChips = targetUser.chips ?? 0;
        const defaultChips = currentChipsInPlay > 0 
                            ? currentChipsInPlay 
                            : (currentChips > 20000 ? 20000 : (currentChips >= 0 ? currentChips : 0));
        setChipsToBring(String(defaultChips));
      } else {
        setChipsToBring('');
      }
    }
  }, [isOpen, targetUser, needsChipInput]);

  if (!isOpen || !targetUser) return null;

  const handleSeatButtonClick = (tableId: string, seatNum: number) => {
    setSelectedTableId(tableId);
    setSelectedSeatNumber(seatNum);
  };

  const handleConfirmSelection = () => {
    if (selectedTableId && selectedSeatNumber !== null) {
      if (needsChipInput) {
        const amount = parseInt(chipsToBring, 10);
        if (isNaN(amount) || amount < 0) {
          alert("チップ額には0以上の数値を入力してください。");
          return;
        }
        const userChips = targetUser?.chips ?? 0;
        if (amount > userChips) {
          alert(`保有チップ(${userChips.toLocaleString()}チップ)を超える額は持ち込めません。`);
          return;
        }
        onSeatSelect(selectedTableId, selectedSeatNumber, amount);
      } else {
        onSeatSelect(selectedTableId, selectedSeatNumber);
      }
    } else {
      alert("テーブルと座席を選択してください。");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-800 text-neutral-lightest p-6 rounded-lg shadow-xl w-full max-w-2xl transform animate-scaleUp max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
          <h2 className="text-xl font-semibold text-sky-400">
            {targetUser.pokerName || targetUser.email || 'ユーザー'}さんのテーブル・座席を選択
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-full hover:bg-slate-700" aria-label="閉じる">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-grow pr-2 space-y-5 custom-scrollbar">
          {isLoadingTables ? (
            <p className="text-slate-400 text-center py-10">テーブル情報読み込み中...</p>
          ) : tablesToDisplay.length === 0 ? (
            <p className="text-slate-400 text-center py-10">現在利用可能なテーブルがありません。</p>
          ) : (
            tablesToDisplay.map(table => (
              table.id && 
              <div key={table.id}>
                {/* ★★★ テーブル情報にゲームタイプとレート/ブラインドを表示 ★★★ */}
                <h3 className="text-lg font-medium text-slate-200 mb-1">
                  {table.name}
                </h3>
                <div className="text-xs text-slate-400 mb-2">
                  <span>ゲーム: {table.gameType || '未設定'}</span>
                  {table.blindsOrRate && ( // blindsOrRate が存在する場合のみ表示
                    <span className="ml-2">レート/ブラインド: {table.blindsOrRate}</span>
                  )}
                </div>
                {/* ★★★ ここまで ★★★ */}
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {Array.from({ length: table.maxSeats || 0 }, (_, i) => i + 1).map(seatNum => {
                    const seat = table.seats?.find(s => s.seatNumber === seatNum);
                    const isOccupiedByOther = !!(seat && seat.userId && seat.userId !== targetUser?.id);
                    const isSelected = selectedTableId === table.id && selectedSeatNumber === seatNum;
                    const isCurrentUserSeat = seat?.userId === targetUser?.id;

                    return (
                      <button
                        key={seatNum}
                        onClick={() => { if (!isOccupiedByOther && table.id) handleSeatButtonClick(table.id, seatNum); }}
                        disabled={isOccupiedByOther}
                        className={`p-2 rounded border text-xs h-16 min-w-[60px] flex flex-col items-center justify-center transition-all duration-150 focus:outline-none focus:ring-2
                          ${isSelected ? 'bg-green-500 border-green-400 text-white ring-green-300 scale-105 shadow-lg' :
                            isCurrentUserSeat ? 'bg-blue-600 border-blue-500 text-white ring-blue-400 shadow-md' :
                            isOccupiedByOther ? 'bg-slate-600 border-slate-500 text-slate-400 cursor-not-allowed opacity-70' :
                                                'bg-slate-700 border-slate-500 hover:bg-slate-600 text-slate-200 hover:border-sky-400 focus:ring-sky-400 shadow-sm hover:shadow-md'}`}
                        title={isOccupiedByOther ? `使用中: ${seat?.userPokerName || '不明'}` : isCurrentUserSeat ? `現在この席: ${seat?.userPokerName || 'あなた'}` : `座席 ${seatNum} (空席)`}
                      >
                        <span className="font-semibold text-base">S{seatNum}</span>
                        {isOccupiedByOther && <span className="text-xxs truncate block w-full opacity-80">{seat?.userPokerName || '他ユーザー'}</span>}
                        {isCurrentUserSeat && <span className="text-xxs truncate block w-full text-blue-200">(現在の席)</span>}
                        {!isOccupiedByOther && !isCurrentUserSeat && <span className="text-xxs text-green-400">(空席)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        
        {selectedTableId && selectedSeatNumber !== null && (
          <div className="mt-4 text-center">
            <p className="text-green-400 font-semibold">
              選択中: {tablesToDisplay.find(t => t.id === selectedTableId)?.name || 'テーブル不明'} / Seat {selectedSeatNumber}
            </p>
          </div>
        )}

        {needsChipInput && selectedTableId && selectedSeatNumber !== null && targetUser && (
          <div className="mt-4">
            <label htmlFor="chipsToBring" className="block text-sm font-medium text-slate-300 mb-1">
              持ち込みチップ額 (保有: {(targetUser.chips ?? 0).toLocaleString()}):
            </label>
            <input
              type="number"
              id="chipsToBring"
              value={chipsToBring}
              onChange={(e) => setChipsToBring(e.target.value)}
              min="0"
              step="100"
              className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-sky-500 focus:border-sky-500"
              placeholder={`最大 ${(targetUser.chips ?? 0).toLocaleString()}`}
            />
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-700 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 rounded-md transition-colors">キャンセル</button>
          <button
            type="button"
            onClick={handleConfirmSelection}
            disabled={!selectedTableId || selectedSeatNumber === null}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-colors bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-500 disabled:cursor-not-allowed`}
          >
            この席に決定
          </button>
        </div>
      </div>
    </div>
  );
};

export default SeatSelectionModal;