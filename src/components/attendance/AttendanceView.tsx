
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react'; // Use named import for QRCodeSVG
import { useAppContext } from '../../contexts/AppContext';

const AttendanceView: React.FC = () => {
  const { currentUser, attendance } = useAppContext();
  const [qrValue, setQrValue] = useState<string>('');

  useEffect(() => {
    if (currentUser) {
      // QR code could contain user ID and current timestamp for uniqueness if needed by scanner
      const data = { userId: currentUser.id, email: currentUser.email, pokerName: currentUser.pokerName, timestamp: Date.now() };
      setQrValue(JSON.stringify(data));
    }
  }, [currentUser]);

  if (!currentUser) {
    return <p>ユーザー情報を読み込み中...</p>;
  }

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl text-center">
      <h2 className="text-2xl font-bold text-secondary mb-4 font-condensed">入退店QRコード</h2>
      <p className="text-neutral-lightest mb-2">
        チェックインまたはチェックアウトのために、このQRコードをスタッフに提示してください。
      </p>
      
      {attendance.isCheckedIn && (
        <div className="mb-4 p-3 bg-green-700 bg-opacity-50 border border-green-500 rounded-md">
            <p className="text-lg font-semibold text-green-300">現在チェックイン中です。</p>
            {attendance.checkInTime && <p className="text-sm text-green-200">開始時刻： {new Date(attendance.checkInTime).toLocaleString()}</p>}
        </div>
      )}
      {!attendance.isCheckedIn && (
        <div className="mb-4 p-3 bg-red-700 bg-opacity-50 border border-red-500 rounded-md">
            <p className="text-lg font-semibold text-red-300">現在チェックアウト済みです。</p>
        </div>
      )}

      {qrValue ? (
        <div className="inline-block p-4 bg-white rounded-lg shadow-md">
          {/* Use QRCodeSVG component */}
          <QRCodeSVG value={qrValue} size={256} level="H" includeMargin={true} />
        </div>
      ) : (
        <p className="text-neutral-light">QRコードを生成中...</p>
      )}
      <p className="text-xs text-neutral-light mt-4">
        このQRコードには、入退店管理用のあなた固有の識別子が含まれています。
      </p>
    </div>
  );
};

export default AttendanceView;