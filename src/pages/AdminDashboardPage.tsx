// src/pages/AdminDashboardPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { SetAdminClaimResponse } from '../types';

interface AdminDashboardLinkProps {
  to: string;
  title: string;
  description: string;
  color: 'red' | 'amber' | 'lime' | 'cyan' | 'purple' | 'sky' | 'slate' | 'teal'; // teal を追加
}

const AdminDashboardLink: React.FC<AdminDashboardLinkProps> = ({ to, title, description, color }) => {
  const borderColorClass = `border-${color}-500`;
  const hoverShadowClass = `hover:shadow-${color}-500/30`;
  const titleColorClass = `text-${color}-400`;
  const focusRingClass = `focus:ring-${color}-400`;

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

  if (!currentUser || (!currentUser.isAdmin && !currentUser.isStaffClaim && !currentUser.firestoreData?.isStaff) ) { // 修正：スタッフもアクセスできるように
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
        <AdminDashboardLink to="/admin/chip-options" title="チップ購入オプション管理" description="チップの販売オプションを作成・編集します。" color="purple" />
        {/* ★★★ ウェイティングリスト管理へのリンクを追加 ★★★ */}
        <AdminDashboardLink to="/admin/waiting-list" title="ウェイティングリスト管理" description="ゲームのウェイティング状況を確認・管理します。" color="teal" />
        <AdminDashboardLink to="/admin/game-templates" title="ゲームテンプレート管理" description="ゲームの種類やブラインド等のテンプレートを作成・編集します。" color="slate" /> {/* 既存なので色を調整 */}
      </div>

       {/* 管理者権限付与セクション (管理者のみ表示) */}
      {currentUser?.isAdmin && (
        <div className="p-6 bg-slate-800 rounded-lg shadow-md max-w-xl mx-auto">
          <h2 className="text-xl font-semibold text-purple-400 mb-4">ユーザーへの管理者権限付与</h2>
          <div className="space-y-3 text-sm">
            <div>
              <label htmlFor="adminDashboardEmailTarget" className="block font-medium text-slate-300 mb-1">
                対象ユーザーのメールアドレス:
              </label>
              <input
                type="email"
                id="adminDashboardEmailTarget"
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
      )}
    </div>
  );
};

export default AdminDashboardPage;