// src/components/admin/SeatSelectionModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
// db, collection, query, orderBy, getDocs, Timestamp はここでは直接使わない想定
// Table, Seat, UserWithId 型は props または types.ts から取得
import { Table, Seat, UserWithId } from '../../types'; // パスを調整してください
import { Timestamp } from 'firebase/firestore'; // Timestamp は型の参照でのみ使用可能性

export interface SeatSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeatSelect: (tableId: string, seatNumber: number) => void;
  targetUser: UserWithId | null;
  currentTables?: Table[]; // 親コンポーネントからテーブル情報を取得
  isLoadingTables?: boolean; // 親コンポーネントからローディング状態を取得
  needsChipInput?: boolean;
}

const SeatSelectionModal: React.FC<SeatSelectionModalProps> = ({
  isOpen,
  onClose,
  onSeatSelect,
  targetUser,
  currentTables,
  isLoadingTables,
}) => {
  const [tablesToDisplay, setTablesToDisplay] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null);

  useEffect(() => {
    if (currentTables) {
      // inactiveでないテーブルのみ表示するなどのフィルタリングはここで追加可能
      setTablesToDisplay(currentTables.filter(t => t.status !== 'inactive'));
    } else {
      setTablesToDisplay([]); // currentTablesがundefinedなら空にする
    }
  }, [currentTables]);

  const handleSelectAndConfirm = () => { // 関数名を変更 (handleSelect -> handleSelectAndConfirm)
    if (selectedTableId && selectedSeatNumber !== null) {
      onSeatSelect(selectedTableId, selectedSeatNumber);
      // onClose(); // 選択後すぐにモーダルを閉じるかは要件による (今回は残す)
    }
  };

  // モーダルが開かれた時に選択状態をリセット
  useEffect(() => {
    if (isOpen) {
      setSelectedTableId(null);
      setSelectedSeatNumber(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-800 text-neutral-lightest p-6 rounded-lg shadow-xl w-full max-w-2xl transform animate-scaleUp max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
          <h2 className="text-xl font-semibold text-amber-400">
            {targetUser ? `${targetUser.pokerName || targetUser.email || 'ユーザー'}さんの` : ''}テーブル・座席を選択
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded-full hover:bg-slate-700" aria-label="閉じる">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-grow pr-2 space-y-5">
          {isLoadingTables ? (
            <p className="text-slate-400 text-center py-10">テーブル情報を読み込み中...</p>
          ) : tablesToDisplay.length === 0 ? (
            <p className="text-slate-400 text-center py-10">現在利用可能なテーブルがありません。</p>
          ) : (
            tablesToDisplay.map(table => (
              <div key={table.id}>
                <h3 className="text-lg font-medium text-slate-200 mb-2">{table.name} <span className="text-xs text-slate-400">({table.gameType || 'N/A'})</span></h3>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {Array.from({ length: table.maxSeats || 0 }, (_, i) => i + 1).map(seatNum => {
                    const seat = table.seats?.find(s => s.seatNumber === seatNum);
                    const isOccupiedByOther = !!(seat && seat.userId && seat.userId !== targetUser?.id);
                    const isSelected = selectedTableId === table.id && selectedSeatNumber === seatNum;
                    const isCurrentUserSeat = seat?.userId === targetUser?.id; // 選択対象のユーザーが既にその席にいるか

                    return (
                      <button
                        key={seatNum}
                        onClick={() => {
                          if (!isOccupiedByOther) { // 他の人が使っていなければ選択可能
                            setSelectedTableId(table.id);
                            setSelectedSeatNumber(seatNum);
                          }
                        }}
                        disabled={isOccupiedByOther} // 他の人が使っていたら disabled
                        className={`p-2 rounded border text-xs h-16 min-w-[60px] flex flex-col items-center justify-center transition-all duration-150 focus:outline-none focus:ring-2
                          ${isSelected ? 'bg-green-500 border-green-400 text-white ring-green-300 scale-105 shadow-lg' :
                            isCurrentUserSeat ? 'bg-blue-600 border-blue-500 text-white ring-blue-400 shadow-md' : // 選択対象ユーザーが座っている席
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
        <div className="mt-6 pt-4 border-t border-slate-700 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-3">
          {selectedTableId && selectedSeatNumber !== null && (
            <p className="text-sm text-slate-300 order-2 sm:order-1">
              選択中: <span className="font-semibold text-amber-400">{tablesToDisplay.find(t => t.id === selectedTableId)?.name} / Seat {selectedSeatNumber}</span>
            </p>
          )}
          <div className="flex space-x-3 order-1 sm:order-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600 rounded-md transition-colors">キャンセル</button>
            <button
              onClick={handleSelectAndConfirm}
              disabled={!selectedTableId || selectedSeatNumber === null}
              className="px-5 py-2 text-sm font-semibold rounded-md transition-colors bg-green-600 hover:bg-green-500 text-white disabled:bg-slate-500 disabled:cursor-not-allowed"
            >
              この席に割り当てる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeatSelectionModal;