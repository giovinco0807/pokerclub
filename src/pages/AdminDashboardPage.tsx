// src/pages/AdminDashboardPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext'; // パスを確認
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
// SetAdminClaimResponse型はtypes.tsからインポートする
import { SetAdminClaimResponse } from '../types'; // パスを確認

// --- AdminDashboardLink コンポーネントの定義 ---
interface AdminDashboardLinkProps {
  to: string;
  title: string;
  description: string;
  color: 'red' | 'amber' | 'lime' | 'cyan' | 'purple' | 'sky' | 'slate';
}

const AdminDashboardLink: React.FC<AdminDashboardLinkProps> = ({ to, title, description, color }) => {
  // Tailwind CSS JITモードが有効でないと動的なクラス名はパージされる可能性があるため、
  // 各色に対応する完全なクラス名を定義する方が安全な場合があります。
  // ここではテンプレートリテラルを使用しますが、本番ビルドでスタイルが適用されない場合は
  // この部分を見直す必要があります。
  const borderColorClass = `border-${color}-500`;
  const hoverShadowClass = `hover:shadow-${color}-500/30`; // JITモードならOK
  const titleColorClass = `text-${color}-400`;
  const focusRingClass = `focus:ring-${color}-400`;

  // もしJITモードでない場合の代替案 (より多くのCSSを生成する可能性あり)
  // const colorStyles = {
  //   red: { border: 'border-red-500', shadow: 'hover:shadow-red-500/30', text: 'text-red-400', ring: 'focus:ring-red-400' },
  //   amber: { border: 'border-amber-500', shadow: 'hover:shadow-amber-500/30', text: 'text-amber-400', ring: 'focus:ring-amber-400' },
  //   // ... 他の色も同様に
  // };
  // const currentStyle = colorStyles[color];

  return (
    <Link
      to={to}
      className={`block p-6 bg-slate-800 rounded-lg shadow-lg hover:shadow-xl border-l-4 ${borderColorClass} ${hoverShadowClass} transition-all duration-200 ease-in-out transform hover:-translate-y-1 focus:outline-none focus:ring-2 ${focusRingClass}`}
    >
      <h2 className={`text-2xl font-semibold ${titleColorClass} mb-2`}>{title}</h2>
      <p className="text-sm text-slate-300">{description}</p>
    </Link>
  );
};
// --- AdminDashboardLink コンポーネントの定義ここまで ---


const AdminDashboardPage: React.FC = () => {
  const { currentUser } = useAppContext();

  const [targetEmailForAdmin, setTargetEmailForAdmin] = useState('');
  const [adminSetMessage, setAdminSetMessage] = useState('');
  const [adminSetError, setAdminSetError] = useState('');
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);

  const handleSetUserAsAdmin = async () => {
    if (!targetEmailForAdmin.trim()) {
      setAdminSetError('対象のメールアドレスを入力してください。');
      return;
    }
    if (!currentUser?.isAdmin) {
      setAdminSetError('この操作を実行する権限がありません。');
      return;
    }

    setIsSubmittingAdmin(true);
    setAdminSetMessage('');
    setAdminSetError('');
    try {
      const setAdminClaimFunction = httpsCallable< { email: string }, SetAdminClaimResponse>(getFunctions(), 'setAdminClaim');
      const result = await setAdminClaimFunction({ email: targetEmailForAdmin });
      setAdminSetMessage(result.data.message);
      setTargetEmailForAdmin('');
    } catch (err: any) {
      console.error('管理者権限の付与に失敗しました (AdminDashboard):', err);
      setAdminSetError(err.message || '管理者権限の付与に失敗しました。');
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  if (!currentUser || !currentUser.isAdmin) {
    return (
      <div className="container mx-auto p-6 text-center">
        <p className="text-red-500 text-xl">このページへのアクセス権限がありません。</p>
        <Link to="/" className="mt-4 inline-block text-sky-400 hover:underline">メインページへ戻る</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <h1 className="text-3xl font-bold text-red-500 mb-8 border-b border-slate-700 pb-3">管理ダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <AdminDashboardLink to="/admin/users" title="ユーザー管理" description="ユーザーの承認、チェックイン、座席割り当てなど。" color="red" />
        <AdminDashboardLink to="/admin/drinks" title="ドリンクメニュー管理" description="ドリンクメニューの追加、編集、削除。" color="amber" />
        <AdminDashboardLink to="/admin/tables" title="テーブル管理" description="テーブルの作成、編集、削除。" color="lime" />
        <AdminDashboardLink to="/admin/orders" title="オーダー管理" description="注文の確認とステータス更新。" color="cyan" />
        <AdminDashboardLink to="/admin/announcements" title="お知らせ管理" description="メインページのお知らせを作成・編集。" color="sky" />
        <AdminDashboardLink to="/admin/chip-options" title="チップ購入オプション管理" description="チップの販売オプション（価格、チップ量など）を作成・編集します。" color="purple" />
        {/* 他の主要な管理機能へのリンクもここに追加。例えば設定ページなど。 */}
        {/* <AdminDashboardLink to="/admin/privileges" title="権限管理" description="詳細な権限設定。" color="purple" /> */}
      </div>

      <div className="p-6 bg-slate-800 rounded-lg shadow-md max-w-xl mx-auto">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">ユーザーへの管理者権限付与</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="adminDashboardEmailTarget" className="block font-medium text-slate-300 mb-1">
              対象ユーザーのメールアドレス:
            </label>
            <input
              type="email"
              id="adminDashboardEmailTarget" // IDを一意にする (AdminConsoleViewと区別)
              value={targetEmailForAdmin}
              onChange={(e) => setTargetEmailForAdmin(e.target.value)}
              placeholder="user@example.com"
              className="w-full p-2 bg-slate-700 text-white border border-slate-600 rounded focus:ring-purple-500 focus:border-purple-500"
              disabled={isSubmittingAdmin}
            />
          </div>
          <button
            onClick={handleSetUserAsAdmin}
            disabled={isSubmittingAdmin}
            className={`w-full sm:w-auto px-4 py-2 font-semibold rounded h-10 transition-colors
                        ${isSubmittingAdmin
                          ? 'bg-slate-500 text-slate-400 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
          >
            {isSubmittingAdmin ? '処理中...' : '管理者に設定'}
          </button>
          {adminSetMessage && <p className="mt-2 text-xs text-green-400">{adminSetMessage}</p>}
          {adminSetError && <p className="mt-2 text-xs text-red-400">{adminSetError}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;