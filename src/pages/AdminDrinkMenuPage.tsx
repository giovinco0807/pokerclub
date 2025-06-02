// src/pages/AdminDrinkMenuPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { db, storage } from '../services/firebase'; // storageをインポート
import {
  collection,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  addDoc,
  deleteDoc,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import {
  ref as storageRef, // refが重複しないようにエイリアス
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage'; // storage関連関数をインポート
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';

// 型定義とコンポーネントのインポート (パスを実際の構造に合わせてください)
import { DrinkMenuItem, Category } from '../types'; // Categoryも必要なら
import {
  getAllDrinkMenuItems, // menuServiceから
  addDrinkMenuItem,
  updateDrinkMenuItem,
  deleteDrinkMenuItem
} from '../services/menuService';
import DrinkMenuForm, { DrinkMenuFormDataWithFile } from '../components/admin/DrinkMenuForm';
import { StatusBadge } from '../components/admin/UserDetailsModal'; // UserDetailsModalからStatusBadgeをインポート

const AdminDrinkMenuPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [drinkMenuItems, setDrinkMenuItems] = useState<DrinkMenuItem[]>([]);
  const [loadingDrinks, setLoadingDrinks] = useState(true);
  const [editingDrinkItem, setEditingDrinkItem] = useState<DrinkMenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDrinkFormSubmitting, setIsDrinkFormSubmitting] = useState(false);

  const fetchDrinkMenuItems = useCallback(async () => {
    setLoadingDrinks(true);
    setError(null);
    try {
      const items = await getAllDrinkMenuItems();
      setDrinkMenuItems(items);
    } catch (err: any) {
      console.error("ドリンクメニューの取得に失敗:", err);
      setError(`ドリンクメニュー取得失敗: ${err.message}`);
    } finally {
      setLoadingDrinks(false);
    }
  }, []);

  useEffect(() => {
    if (!appContextLoading && currentUser && currentUser.isAdmin) {
      fetchDrinkMenuItems();
    } else if (!appContextLoading && (!currentUser || !currentUser.isAdmin)) {
      setError("このページへのアクセス権限がありません。");
      setLoadingDrinks(false);
    }
  }, [appContextLoading, currentUser, fetchDrinkMenuItems]);

  const handleDrinkMenuFormSubmit = async (formData: DrinkMenuFormDataWithFile, imageToUpload?: File) => {
    setIsDrinkFormSubmitting(true);
    let newImageUrl = editingDrinkItem?.imageUrl || '';
    try {
      if (imageToUpload) {
        // 既存画像があれば削除 (編集時)
        if (editingDrinkItem && editingDrinkItem.imageUrl && editingDrinkItem.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
          try {
            const oldImageStorageRef = storageRef(storage, editingDrinkItem.imageUrl);
            await deleteObject(oldImageStorageRef);
            console.log("古い画像をStorageから削除:", editingDrinkItem.imageUrl);
          } catch (deleteError: any) {
            console.warn("古い画像の削除失敗(無視):", deleteError);
          }
        }
        // 新しい画像をアップロード
        const imageFileName = `drink_${Date.now()}_${imageToUpload.name}`;
        const newImageStorageRef = storageRef(storage, `drinkMenuItemsImages/${imageFileName}`);
        const uploadTask = await uploadBytes(newImageStorageRef, imageToUpload);
        newImageUrl = await getDownloadURL(uploadTask.ref);
        console.log("画像アップロード成功:", newImageUrl);
      }

      const dataToSave: Omit<DrinkMenuItem, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name,
        category: formData.category,
        price: formData.price,
        description: formData.description || '',
        imageUrl: newImageUrl,
        isAvailable: formData.isAvailable,
        sortOrder: Number(formData.sortOrder) || undefined, // 数値に変換、NaNならundefined
      };

      if (editingDrinkItem && editingDrinkItem.id) {
        await updateDrinkMenuItem(editingDrinkItem.id, dataToSave);
        alert('ドリンクメニューを更新しました。');
      } else {
        await addDrinkMenuItem(dataToSave);
        alert('ドリンクメニューを追加しました。');
      }
      setEditingDrinkItem(null); // 編集モード解除
      fetchDrinkMenuItems();     // リストを再読み込み
    } catch (error: any) {
      console.error("ドリンクメニュー保存エラー:", error);
      alert(`処理に失敗しました: ${error.message}`);
    } finally {
      setIsDrinkFormSubmitting(false);
    }
  };

  const handleDeleteDrinkItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`「${itemName}」を削除してもよろしいですか？この操作は元に戻せません。`)) return;
    try {
      const itemToDelete = drinkMenuItems.find(item => item.id === itemId);
      if (itemToDelete && itemToDelete.imageUrl && itemToDelete.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
        try {
          const imageStorageRef = storageRef(storage, itemToDelete.imageUrl);
          await deleteObject(imageStorageRef);
          console.log("関連画像をStorageから削除:", itemToDelete.imageUrl);
        } catch (imageDeleteError: any) {
          console.warn("画像の削除に失敗(無視します):", imageDeleteError);
        }
      }
      await deleteDrinkMenuItem(itemId);
      alert(`「${itemName}」を削除しました。`);
      fetchDrinkMenuItems(); // リストを再読み込み
    } catch (e: any) {
      console.error("ドリンクメニュー削除エラー:", e);
      alert(`削除に失敗しました: ${e.message}`);
    }
  };

  if (appContextLoading) {
    return <div className="text-center p-10 text-xl text-neutral-lightest">アプリケーション情報を読み込み中...</div>;
  }
  if (!currentUser || !currentUser.isAdmin) {
    return <div className="text-center p-10 text-xl text-yellow-400">{error || "このページへのアクセス権限がありません。"}</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-amber-500">ドリンクメニュー管理</h1>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>

      {error && !loadingDrinks && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左側: メニュー追加/編集フォーム */}
        <div className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-amber-300 mb-4 border-b border-slate-700 pb-2">
            {editingDrinkItem ? 'メニュー編集' : '新規メニュー追加'}
          </h3>
          <DrinkMenuForm
            onSubmitForm={handleDrinkMenuFormSubmit}
            initialData={editingDrinkItem}
            isSubmitting={isDrinkFormSubmitting}
            key={editingDrinkItem ? editingDrinkItem.id : 'new-drink'}
          />
          {editingDrinkItem && (
            <button
              onClick={() => setEditingDrinkItem(null)}
              className="mt-4 text-sm text-sky-400 hover:underline w-full text-left"
            >
              + 新規追加モードに切り替え
            </button>
          )}
        </div>

        {/* 右側: 登録済みメニュー一覧 */}
        <div className="md:col-span-2">
          <h3 className="text-xl font-semibold text-amber-300 mb-4">登録済みメニュー</h3>
          {loadingDrinks ? (
            <p className="text-slate-400 py-10 text-center">ドリンクメニューを読み込み中...</p>
          ) : drinkMenuItems.length === 0 ? (
            <p className="text-slate-400 py-10 text-center">登録されているドリンクメニューはありません。</p>
          ) : (
            <ul className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {drinkMenuItems.map(item => (
                <li key={item.id} className="p-4 bg-slate-800 rounded-lg shadow flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-start space-x-4 flex-grow min-w-0 mb-3 sm:mb-0">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-cover rounded flex-shrink-0 border border-slate-600" />
                    )}
                    {!item.imageUrl && (
                      <div className="w-16 h-16 bg-slate-700 rounded flex-shrink-0 border border-slate-600 flex items-center justify-center text-slate-500 text-xs">画像なし</div>
                    )}
                    <div className="min-w-0">
                        <p className="font-semibold text-white truncate text-base leading-tight">{item.name}</p>
                        <p className="text-sm text-slate-400">{item.category}</p>
                        <p className="text-slate-200 font-medium">{item.price.toLocaleString()}円</p>
                        <div className="mt-1">
                            <StatusBadge color={item.isAvailable ? "green" : "slate"} text={item.isAvailable ? "提供中" : "停止中"} />
                        </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 space-x-2 sm:ml-4 flex items-center self-end sm:self-center">
                    <button onClick={() => setEditingDrinkItem(item)} className="text-sky-400 hover:text-sky-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-700">編集</button>
                    <button onClick={() => item.id && handleDeleteDrinkItem(item.id, item.name)} className="text-red-400 hover:text-red-300 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-700">削除</button>
                  </div>
                  {item.description && <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-700/50 w-full">{item.description}</p>}
                </li>))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDrinkMenuPage;