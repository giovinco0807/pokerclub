// src/pages/QRCodePage.tsx
import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { QRCodeCanvas } from 'qrcode.react';
import { Link, useNavigate } from 'react-router-dom'; // Link と useNavigate をインポート

const QRCodePage: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate(); // useNavigateフックを使用

  if (!currentUser) {
    // このケースは App.tsx のルーティングで保護されているはず
    // navigate('/login'); // 必要であればログインページへリダイレクト
    return <p className="text-center mt-10">QRコードを表示するにはログインしてください。</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-150px)] bg-slate-900 text-neutral-lightest p-4"> {/* NavbarとFooterの高さを考慮したmin-h */}
      <h1 className="text-3xl font-bold text-red-500 mb-6">あなたのQRコード</h1>
      <div className="bg-white p-6 rounded-lg shadow-xl"> {/* QRコードを見やすくするために背景を白に */}
        <QRCodeCanvas value={currentUser.uid} size={256} fgColor="#000000" bgColor="#FFFFFF" />
      </div>
      <p className="mt-4 text-sm text-slate-400">このQRコードを入店時に提示してください。</p>
      <div className="mt-8">
        <Link
          to="/" // ホーム画面へのパス
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out mr-4"
        >
          ホームに戻る
        </Link>
        {/* 必要であればブラウザの「戻る」機能のようなボタンも追加可能 */}
        <button
            onClick={() => navigate(-1)} // 直前のページに戻る
            className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-lg text-center transition duration-150 ease-in-out"
        >
            前のページへ
        </button>
      </div>
    </div>
  );
};

export default QRCodePage;