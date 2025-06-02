// src/pages/AdminChipOptionsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { ChipPurchaseOption } from '../types'; // types.tsからインポート
import {
  getAllChipPurchaseOptionsForAdmin,
  addChipPurchaseOption,
  updateChipPurchaseOption,
  deleteChipPurchaseOption,
} from '../services/menuService'; // 編集済みのmenuServiceからインポート
import ChipOptionForm, { ChipOptionFormData } from '../components/admin/ChipOptionForm'; // 作成したフォームコンポーネント
import { Timestamp } from 'firebase/firestore';

// 簡易的なステータスバッジ (他の管理ページでも使用しているものと同様)
export const StatusBadge: React.FC<{ color: 'green' | 'red' | 'yellow' | 'blue' | 'slate' | 'purple'; text: string }> = ({ color, text }) => {
  const colorClasses = {
    green: 'bg-green-100 text-green-800 border border-green-300',
    red: 'bg-red-100 text-red-800 border border-red-300',
    yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    blue: 'bg-blue-100 text-blue-800 border border-blue-300',
    slate: 'bg-slate-200 text-slate-800 border border-slate-400',
    purple: 'bg-purple-100 text-purple-800 border border-purple-300',
  };
  return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[color]} shadow-sm`}>{text}</span>;
};


const AdminChipOptionsPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext(); // appContextLoadingも取得
  const [chipOptions, setChipOptions] = useState<ChipPurchaseOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null); // ページ全体のエラー
  const [formError, setFormError] = useState<string | null>(null); // フォーム固有のエラー

  const [editingOption, setEditingOption] = useState<ChipPurchaseOption | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const fetchChipOptions = useCallback(async () => {
    console.log("AdminChipOptionsPage: fetchChipOptions CALLED");
    setLoadingData(true);
    setError(null);
    try {
      const options = await getAllChipPurchaseOptionsForAdmin();
      console.log("AdminChipOptionsPage: Fetched chip options:", options);
      setChipOptions(options);
    } catch (err: any) {
      console.error("チップオプション取得失敗 (AdminChipOptionsPage):", err);
      setError(`オプションの取得に失敗しました: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading) { // AppContextの読み込み完了後に実行
        if (currentUser && currentUser.isAdmin) {
            fetchChipOptions();
        } else if (currentUser && !currentUser.isAdmin) {
            setError("このページへのアクセス権限がありません。");
            setLoadingData(false);
        } else if (!currentUser) {
            setError("ログインしていません。");
            setLoadingData(false);
        }
    }
  }, [appContextLoading, currentUser, fetchChipOptions]);

  const handleShowAddForm = () => {
    setEditingOption(null); // 新規追加なので編集中のデータはなし
    setIsFormVisible(true);
    setFormError(null); // フォームエラーをリセット
  };

  const handleShowEditForm = (option: ChipPurchaseOption) => {
    setEditingOption(option);
    setIsFormVisible(true);
    setFormError(null); // フォームエラーをリセット
  };

  const handleCancelForm = () => {
    setIsFormVisible(false);
    setEditingOption(null); // 編集中データをクリア
    setFormError(null); // フォームエラーをリセット
  };

  const handleFormSubmit = async (formData: ChipOptionFormData) => {
    setIsFormSubmitting(true);
    setFormError(null);
    try {
      // ChipPurchaseOptionに必要なデータをformDataからマッピング
      // id, createdAt, updatedAt はサービス側で処理されるか、更新時にはidが必要
      const dataToSave: Omit<ChipPurchaseOption, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name,
        priceYen: formData.priceYen,
        chipsAmount: formData.chipsAmount,
        description: formData.description || '',
        sortOrder: formData.sortOrder === undefined || isNaN(formData.sortOrder) ? 0 : Number(formData.sortOrder), // 数値に変換、無効なら0
        isAvailable: formData.isAvailable,
      };

      if (editingOption && editingOption.id) {
        // 更新の場合
        await updateChipPurchaseOption(editingOption.id, dataToSave);
        alert('チップオプションを更新しました。');
      } else {
        // 新規追加の場合
        await addChipPurchaseOption(dataToSave);
        alert('チップオプションを追加しました。');
      }
      setIsFormVisible(false); // フォームを閉じる
      setEditingOption(null);  // 編集中データをクリア
      fetchChipOptions();      // リストを再取得して表示を更新
    } catch (e: any) {
      console.error("チップオプション保存エラー (AdminChipOptionsPage):", e);
      setFormError(`保存に失敗しました: ${e.message}`);
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDeleteOption = async (optionId: string, optionName: string) => {
    if (!window.confirm(`チップオプション「${optionName}」を削除してもよろしいですか？この操作は元に戻せません。`)) return;
    try {
      await deleteChipPurchaseOption(optionId);
      alert('チップオプションを削除しました。');
      fetchChipOptions(); // リストを再取得
      if (editingOption && editingOption.id === optionId) { // 編集中のものが削除されたらフォームを閉じる
        handleCancelForm();
      }
    } catch (e: any) {
      console.error("チップオプション削除エラー (AdminChipOptionsPage):", e);
      alert(`削除に失敗しました: ${e.message}`);
    }
  };
  
  const formatTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' });
  };

  // アプリケーションコンテキストのローディングが完了するまで待つ
  if (appContextLoading) {
    return <div className="p-10 text-center text-xl text-neutral-lightest">アプリケーション情報を読み込み中...</div>;
  }
  // 権限チェック (ローディング完了後)
  if (!currentUser || !currentUser.isAdmin) {
    return <div className="p-10 text-center text-xl text-red-500">{error || "このページへのアクセス権限がありません。"}</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-purple-400">チップ購入オプション管理</h1>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md text-center">{error}</div>}

      <div className="mb-6">
        {!isFormVisible && (
          <button
            onClick={handleShowAddForm} // ★★★ ここでフォーム表示用の関数を呼び出す ★★★
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded transition-colors"
          >
            新しいチップオプションを追加
          </button>
        )}
      </div>

      {/* フォーム表示エリア */}
      {isFormVisible && (
        <div className="mb-8 p-6 bg-slate-800 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold text-purple-300 mb-4">
            {editingOption ? `編集中: ${editingOption.name}` : '新規チップオプション作成'}
          </h2>
          <ChipOptionForm
            onSubmitForm={handleFormSubmit}
            initialData={editingOption}
            isSubmitting={isFormSubmitting}
            onCancel={handleCancelForm}
            key={editingOption ? editingOption.id : 'new-option-form'} // 編集->新規切替時のフォームリセット用キー
          />
          {formError && <p className="mt-3 text-xs text-red-400 bg-red-900/30 p-2 rounded">{formError}</p>}
        </div>
      )}

      {/* 登録済みオプション一覧表示エリア */}
      <div className="bg-slate-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-purple-300 mb-4">登録済みオプション一覧</h2>
        {loadingData ? (
          <p className="text-slate-400 py-10 text-center">オプションを読み込み中...</p>
        ) : chipOptions.length === 0 && !error ? (
          <p className="text-slate-400 py-10 text-center">登録されているオプションはありません。</p>
        ) : !error && chipOptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">オプション名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">価格(円)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">チップ量</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">表示順</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">最終更新</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-slate-800 divide-y divide-slate-700">
                {chipOptions.map((option) => (
                  <tr key={option.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white font-medium">{option.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 text-right">{option.priceYen.toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 text-right">{option.chipsAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 text-center">{option.sortOrder ?? 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <StatusBadge
                        color={option.isAvailable ? 'green' : 'slate'}
                        text={option.isAvailable ? '公開中' : '非公開'}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-400">{formatTimestamp(option.updatedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleShowEditForm(option)}
                        className="text-sky-400 hover:text-sky-300 hover:underline mr-3"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => option.id && handleDeleteOption(option.id, option.name)}
                        className="text-red-400 hover:text-red-300 hover:underline"
                        disabled={!option.id} // IDがなければ無効化
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null } {/* エラー時はエラーメッセージが表示されるので、ここではnull (error stateで表示) */}
      </div>
    </div>
  );
};

export default AdminChipOptionsPage;