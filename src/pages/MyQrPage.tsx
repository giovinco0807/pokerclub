// src/pages/MyQrPage.tsx
import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

const MyQrPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-red-500 font-mincho p-8">
      <button
        onClick={() => navigate(-1)}
        className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded mb-6"
      >
        戻る
      </button>

      <h2 className="text-2xl font-bold mb-4 text-center">あなたのQRコード</h2>

      {currentUser ? (
        <div className="flex justify-center">
          <QRCodeCanvas
            value={currentUser.uid}
            size={200}
            bgColor="#000000"
            fgColor="#ff0000"
            level="H"
            includeMargin
          />
        </div>
      ) : (
        <p className="text-center text-lg">ログイン情報が見つかりません</p>
      )}

      <p className="text-center mt-4 text-sm">このQRをスタッフに提示してください</p>
    </div>
  );
};

export default MyQrPage;
