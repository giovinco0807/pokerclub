// src/components/common/PlayerInfoPopover.tsx
import React from 'react';
import { UserData } from '../../types'; // UserDataまたは必要な情報を持つ型

interface PlayerInfoPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  playerData: Partial<Pick<UserData, 'pokerName' | 'chips'>> | null; // 表示したい情報に絞る
  anchorEl?: HTMLElement | null; // Popoverの場合のアンカー要素
  // position?: { top: number; left: number }; // 絶対位置指定の場合
}

const PlayerInfoPopover: React.FC<PlayerInfoPopoverProps> = ({
  isOpen,
  onClose,
  playerData,
  anchorEl,
}) => {
  if (!isOpen || !playerData) return null;

  // ここではシンプルなdivで表現。実際にはMUI Popoverなどを使用
  return (
    <div
      style={{
        // Popover風のスタイル（実際にはMUI Popoverや自作CSSでより良くする）
        position: 'fixed', // または 'absolute' で親要素基準
        top: anchorEl ? anchorEl.getBoundingClientRect().bottom + 5 : '50%', // 例
        left: anchorEl ? anchorEl.getBoundingClientRect().left : '50%', // 例
        transform: anchorEl ? '' : 'translate(-50%, -50%)', //例
        backgroundColor: 'rgba(50, 50, 70, 0.95)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 1000, // 他の要素より手前に
        minWidth: '150px',
      }}
      onClick={(e) => e.stopPropagation()} // ポップオーバー内のクリックで閉じないように
    >
      <h4 className="text-lg font-semibold text-sky-400 mb-1">{playerData.pokerName || 'プレイヤー'}</h4>
      
      {/* 他に表示したい情報があればここに追加 */}
      <button
        onClick={onClose}
        className="text-xs text-slate-400 hover:text-slate-200 mt-2 underline"
      >
        閉じる
      </button>
    </div>
  );
};

export default PlayerInfoPopover;