// src/components/common/PokerTableSVG.tsx
import React from 'react';
import { Seat } from '../../types'; // 適切な型をインポート
// import { FaUserCircle } from 'react-icons/fa'; // アイコンの例

interface PokerTableSVGProps {
  seats: Seat[];
  maxSeats: number;
  onSeatClick?: (seatNumber: number, userId: string | null, eventTarget: SVGGElement | null) => void;
  tableName?: string;
  gameType?: string;
  blindsOrRate?: string | null;
}

const PokerTableSVG: React.FC<PokerTableSVGProps> = ({
  seats,
  maxSeats,
  onSeatClick,
  tableName,
  gameType,
  blindsOrRate,
}) => {
  const svgWidth = 520;
  const svgHeight = 330;

  const tableCx = svgWidth / 2;
  const tableCy = svgHeight / 2 + 15;
  const tableRx = svgWidth * 0.44;
  const tableRy = svgHeight * 0.37;

  const seatRadius = 29; // 8人と9人でサイズを少し変えても良い
  const iconSize = seatRadius * 1.0;
  const dealerCircleRadius = 18;

  const dealerX = tableCx;
  const dealerY = tableCy - tableRy - dealerCircleRadius - 12;

  // 座席の位置を計算する関数
  const getSeatPosition = (seatNumber: number, totalSeats: number): { x: number; y: number } => {
    if (totalSeats <= 0) return { x: tableCx, y: tableCy };

    const seatOrbitRx = tableRx * 0.91;
    const seatOrbitRy = tableRy * 0.91;

    let angleRadian: number;

    // 「今の9番の位置が1で時計回り」のロジック
    // X軸右が0度、反時計回りが正
    if (totalSeats === 9) {
      const seatAnglesDegree9: { [key: number]: number } = {
        1: -50, // 右下 (310度)
        2: -15, // 右
        3: 20,  // 右上
        4: 60,  // 上右
        5: 90,  // 真上
        6: 120, // 上左
        7: 160, // 左上
        8: 195, // 左
        9: 230, // 左下
      };
      // ご要望に合わせてキーと値をマッピング
      const seatOrderMap9: { [key: number]: number } = {
          1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1
      }
      angleRadian = (seatAnglesDegree9[seatOrderMap9[seatNumber]] * Math.PI) / 180;

    } else if (totalSeats === 8) {
      // ★★★ 8人掛け: トップ(90度)を空ける ★★★
      // シート1は右下、時計回り
      const seatAnglesDegree8: { [key: number]: number } = {
        1: 40,  // 右下 (315度)
        2: 10,    // 真右
        3: 330,   // 右上
        4: 290,  // 左上 (90度をスキップして配置)
        5: 250,  // 真左
        6: 210,  // 左下
        // 7と8は下部に配置
        7: 170 - 22.5, // 真下から少し左
        8: 130 + 22.5, // 真下から少し右
                 // ↑この配置だとディーラーに近すぎる可能性あり
      };
       // よりバランスの取れた8人掛けの配置例
       const seatAnglesDegree8Balanced: { [key: number]: number } = {
        1: -60,   // 右下
        2: -20,    // 右
        3: 30,    // 右上
        4: 70,   // 左上 (トップの90度を避けて左右に配置)
        5: 110,   // 左上寄り
        6: 150,   // 左下寄り
        7: 200,   // 左下
        8: 240,   // 右下寄り (または -65度)
      };
      angleRadian = (seatAnglesDegree8Balanced[seatNumber] * Math.PI) / 180;

    } else {
      // その他の座席数 (汎用的な時計回り、シート1が右下から)
      const firstSeatAngle = 1.75 * Math.PI; // 約315度
      const angleIncrement = (Math.PI * 2) / totalSeats;
      angleRadian = firstSeatAngle - (seatNumber - 1) * angleIncrement;
    }

    const x = tableCx + seatOrbitRx * Math.cos(angleRadian);
    const y = tableCy + seatOrbitRy * Math.sin(angleRadian);

    return { x, y };
  };

  return (
    <div className="p-4 rounded-lg bg-slate-800 shadow-lg text-center select-none">
      {tableName && <h3 className="text-xl font-semibold text-sky-400 mb-1">{tableName}</h3>}
      {gameType && blindsOrRate && <p className="text-sm text-slate-300 mb-3">{gameType} - {blindsOrRate}</p>}
      <svg width="100%" height="auto" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto max-w-full">
        <ellipse
          cx={tableCx}
          cy={tableCy}
          rx={tableRx}
          ry={tableRy}
          fill="#15803d"
          stroke="#78350f"
          strokeWidth="14"
        />
        <ellipse
          cx={tableCx}
          cy={tableCy}
          rx={tableRx * 0.80}
          ry={tableRy * 0.80}
          fill="none"
          stroke="rgba(253, 224, 71, 0.6)"
          strokeWidth="2.5"
        />

        {/* ディーラー表示 (トップ中央) */}
        <g transform={`translate(${dealerX}, ${dealerY})`}>
          <circle cx="0" cy="0" r={dealerCircleRadius} fill="white" stroke="#374151" strokeWidth="2" />
          <text x="0" y="0" fontSize="14" fill="#111827" textAnchor="middle" dominantBaseline="central" dy=".05em" fontWeight="bold">D</text>
        </g>

        {/* 座席の描画 */}
        {Array.from({ length: maxSeats }, (_, i) => i + 1).map((seatNum) => {
          const seatData = seats.find(s => s.seatNumber === seatNum);
          const { x, y } = getSeatPosition(seatNum, maxSeats);
          const isOccupied = seatData && seatData.userId;
          let seatFillColor = '#374151'; // 空席の色
          if (isOccupied) {
            seatFillColor = '#1e40af'; // 着席
          }

          return (
            <g
              key={`seat-${seatNum}`}
              transform={`translate(${x}, ${y})`}
              onClick={(event) => onSeatClick && onSeatClick(seatNum, seatData?.userId || null, event.currentTarget)}
              className="cursor-pointer group"
            >
              <circle
                cx="0"
                cy="0"
                r={seatRadius}
                fill={seatFillColor}
                stroke="#0f172a"
                strokeWidth="2.5"
                className="transition-all duration-150 ease-in-out group-hover:stroke-sky-300 group-hover:opacity-90"
              />
              {isOccupied ? (
                <svg x={-(iconSize/2)} y={-(iconSize/2)} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white" className="opacity-90 group-hover:opacity-100">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              ) : (
                <text x="0" y="0" fontSize="11" fill="#a1a1aa" textAnchor="middle" dominantBaseline="central" className="font-semibold group-hover:fill-white">
                  {seatNum}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default PokerTableSVG;