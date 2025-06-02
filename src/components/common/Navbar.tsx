// src/components/common/Navbar.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext'; // パスを確認
import { AppUser } from '../../types'; // types.ts から AppUser をインポート (パスを確認)
import Button from './Button'; // パスを確認

interface NavbarProps {
  appName: string;
  isStaffMode: boolean; // App.tsxから渡される現在のスタッフモード状態
  isAdmin: boolean;     // App.tsxから渡される現在のユーザーが管理者かどうかの状態
  onToggleStaffMode: () => void;
  // onToggleAdminMode?: () => void; // Navbarからは直接使わない想定
}

const Navbar: React.FC<NavbarProps> = ({
  appName,
  isStaffMode,
  isAdmin, // propsから管理者状態を受け取る
  onToggleStaffMode,
}) => {
  const { logout, currentUser } = useAppContext(); // currentUser は AppUser | null 型

  // スタッフモードボタンの表示/非表示やトグル可否のロジック
  // 例: 管理者か、またはカスタムクレーム isStaffClaim がtrue、またはFirestoreのisStaffフラグがtrueのユーザー
  const canUserAccessStaffFeatures = currentUser?.isAdmin || currentUser?.isStaffClaim === true || currentUser?.firestoreData?.isStaff === true;

  return (
    <nav className="bg-slate-800 text-neutral-lightest shadow-lg sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 左側: アプリ名 (ホームへのリンク) */}
          <div className="flex items-center">
            <Link to="/" className="font-condensed text-2xl font-bold text-red-500 hover:text-red-400 transition-colors">
              {appName}
            </Link>
          </div>

          {/* 右側: ユーザー情報、ナビゲーション、アクションボタン */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {currentUser && (
              <div className="flex items-center space-x-2 text-sm">
                {/* アバター表示 (avatarUrl が UserData から削除されたため、イニシャル表示のみにする) */}
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 font-semibold text-xs">
                  {/* pokerName があればその頭文字、なければemailの頭文字、それもなければ 'U' */}
                  {(currentUser.firestoreData?.pokerName || currentUser.email || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="hidden md:inline text-slate-300">
                  ようこそ、
                  <span className="font-semibold text-amber-400">
                    {currentUser.firestoreData?.pokerName || currentUser.email?.split('@')[0]}
                  </span>
                  さん
                  {/* プロフィール未完了の表示 (例: pokerNameがまだない場合) */}
                  {!currentUser.firestoreData?.pokerName && currentUser.email && (
                    <span className="text-xs text-yellow-400 ml-1">(ポーカーネーム未設定)</span>
                  )}
                </span>
              </div>
            )}

            {/* 管理者専用リンク */}
            {isAdmin && (
              <Link
                to="/admin" // 管理者ダッシュボードへのリンク
                className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium text-neutral-lightest bg-purple-600 hover:bg-purple-700 transition-colors"
              >
                管理Dash
              </Link>
            )}

            {/* スタッフモード切替ボタン (スタッフ権限を持つユーザーに表示) */}
            {/* 管理者は管理Dashから全て操作できるので、ここでは非管理者スタッフ向けに表示する例 */}
            {canUserAccessStaffFeatures && !isAdmin && (
              <Button onClick={onToggleStaffMode} variant="ghost" size="sm" className="text-xs sm:text-sm">
                {isStaffMode ? "通常モードへ" : "スタッフモード"}
              </Button>
            )}

            {currentUser && (
              <Button onClick={logout} variant="secondary" size="sm" className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs sm:text-sm">
                ログアウト
              </Button>
            )}
            {!currentUser && ( // ログインしていない場合の表示 (オプション)
              <Link to="/login" className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium text-neutral-lightest hover:bg-slate-700 transition-colors">
                ログイン
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;