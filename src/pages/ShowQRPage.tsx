import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

const ShowQRPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();

  if (!currentUser) {
    return <p>ログイン情報が見つかりません</p>;
  }

  return (
    <div className="min-h-screen bg-black text-red-500 font-mincho p-8 flex flex-col items-center justify-center">
      <h1 className="text-xl mb-4">QRコード</h1>
      <QRCodeCanvas
        value={currentUser.uid}
        size={200}
        bgColor="#000000"
        fgColor="#ff0000"
        level="H"
        includeMargin
      />
      <p className="mt-4 text-sm">このQRをスタッフに提示してください</p>
      <button
        onClick={() => navigate(-1)}
        className="mt-6 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded"
      >
        戻る
      </button>
    </div>
  );
};

export default ShowQRPage;
