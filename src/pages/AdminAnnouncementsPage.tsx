// src/pages/AdminAnnouncementsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import {
  StoreAnnouncement, // types.ts から
  Category // types.ts から (もしAnnouncementFormで使うなら)
} from '../types';
import {
  getAllAnnouncements,
  addAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
} from '../services/announcementService'; // パスを調整
import AnnouncementForm, { AnnouncementFormData } from '../components/admin/AnnouncementForm'; // パスを調整
import { StatusBadge } from '../components/admin/UserDetailsModal'; // パスを調整
import { Timestamp } from 'firebase/firestore'; // Timestamp をインポート

const AdminAnnouncementsPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();
  const [announcements, setAnnouncements] = useState<StoreAnnouncement[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [editingAnnouncement, setEditingAnnouncement] = useState<StoreAnnouncement | null>(null);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null); // フォーム固有のエラー

  const fetchAnnouncements = useCallback(async () => {
    console.log("AdminAnnouncementsPage: fetchAnnouncements CALLED");
    setLoadingData(true); setError(null);
    try {
      const items = await getAllAnnouncements();
      console.log("AdminAnnouncementsPage: Announcements fetched:", items);
      setAnnouncements(items);
    } catch (err: any) {
      console.error("お知らせ取得失敗 (fetchAnnouncements):", err);
      setError(`お知らせの取得に失敗しました: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    console.log("AdminAnnouncementsPage: useEffect - appContextLoading:", appContextLoading, "isAdmin:", currentUser?.isAdmin);
    if (!appContextLoading) {
      if (currentUser && currentUser.isAdmin) {
        fetchAnnouncements();
      } else {
        setError(currentUser ? "このページへのアクセス権限がありません。" : "ログインしていません。");
        setLoadingData(false);
      }
    }
  }, [appContextLoading, currentUser, fetchAnnouncements]);

  const handleFormSubmit = async (formData: AnnouncementFormData, newImageUrlFromForm?: string) => {
    setIsFormSubmitting(true);
    setFormError(null); // フォームエラーをリセット
    console.log("AdminAnnouncementsPage: handleFormSubmit - formData:", formData);
    console.log("AdminAnnouncementsPage: handleFormSubmit - newImageUrlFromForm:", newImageUrlFromForm);
    console.log("AdminAnnouncementsPage: handleFormSubmit - editingAnnouncement:", editingAnnouncement);


    // newImageUrlFromForm が undefined (画像がクリアされた or 変更なし) の場合、
    // editingAnnouncement.imageUrl (既存のURL) を使うか、新規なら空文字やnull。
    let finalImageUrl = newImageUrlFromForm;
    if (editingAnnouncement && newImageUrlFromForm === undefined) { // 画像変更なしの場合
        finalImageUrl = editingAnnouncement.imageUrl;
    }


    const dataToSave: Omit<StoreAnnouncement, 'id' | 'createdAt' | 'updatedAt'> = {
      title: formData.title,
      text: formData.text || '', // undefinedなら空文字
      imageUrl: finalImageUrl || '', // undefinedなら空文字
      link: formData.link || '',   // undefinedなら空文字
      isPublished: formData.isPublished,
      sortOrder: Number(formData.sortOrder) || 0, // NaNなら0
    };
    console.log("AdminAnnouncementsPage: Data to save to Firestore:", dataToSave);

    try {
      if (editingAnnouncement && editingAnnouncement.id) {
        await updateAnnouncement(editingAnnouncement.id, dataToSave);
        alert('お知らせを更新しました。');
      } else {
        // addAnnouncement が期待する型に合わせる (createdAt, updatedAtはサービス側で付与)
        await addAnnouncement(dataToSave as Omit<StoreAnnouncement, 'id'|'createdAt'|'updatedAt'>);
        alert('お知らせを追加しました。');
      }
      setEditingAnnouncement(null); // フォームを新規モードに戻す
      fetchAnnouncements();         // お知らせリストを再取得
    } catch (e: any) {
      console.error("お知らせ保存エラー (handleFormSubmit):", e);
      console.error("Firestore Error Code (handleFormSubmit):", e.code); // エラーコードも出力
      setFormError(`お知らせの保存に失敗しました: ${e.message}`); // フォーム固有のエラーを設定
      // alert(`お知らせの保存に失敗: ${e.message}`); // alertの代わりにsetFormError
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleDelete = async (announcement: StoreAnnouncement) => {
    if (!announcement.id) return;
    if (!window.confirm(`お知らせ「${announcement.title}」を削除してもよろしいですか？この操作は元に戻せません。`)) return;
    try {
      await deleteAnnouncement(announcement); // announcementServiceで画像削除も行う
      alert('お知らせを削除しました。');
      fetchAnnouncements();
    } catch (e: any) {
      console.error("お知らせ削除エラー:", e);
      alert(`削除に失敗しました: ${e.message}`);
    }
  };

  const formatTimestamp = (timestamp?: Timestamp | Date): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' });
  };

  if (appContextLoading) {
    return <div className="p-10 text-center text-xl text-neutral-lightest">アプリケーション情報を読み込み中...</div>;
  }
  if (!currentUser || !currentUser.isAdmin) {
    return <div className="p-10 text-center text-xl text-red-500">{error || "このページへのアクセス権限がありません。"}</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-neutral-lightest">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-indigo-400">お知らせ管理</h1>
        <Link to="/admin" className="text-sm text-sky-400 hover:underline">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>

      {/* ページ全体のエラー表示 */}
      {error && <div className="mb-4 p-3 bg-red-900/50 text-yellow-300 rounded-md text-center">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 左側: お知らせ追加/編集フォーム */}
        <div className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold text-indigo-300 mb-4 border-b border-slate-700 pb-2">
            {editingAnnouncement ? `編集中: ${editingAnnouncement.title}` : '新規お知らせ作成'}
          </h3>
          <AnnouncementForm
            onSubmitForm={handleFormSubmit}
            initialData={editingAnnouncement}
            isSubmitting={isFormSubmitting}
            onCancel={editingAnnouncement ? () => setEditingAnnouncement(null) : undefined}
            key={editingAnnouncement ? editingAnnouncement.id : 'new-announcement'} // 編集->新規切替時のリセット
          />
          {formError && <p className="mt-3 text-xs text-red-400 bg-red-900/30 p-2 rounded">{formError}</p>}
        </div>

        {/* 右側: 登録済みお知らせ一覧 */}
        <div className="md:col-span-2">
          <h3 className="text-xl font-semibold text-indigo-300 mb-4">登録済みお知らせ</h3>
          {loadingData ? (
            <p className="text-slate-400 py-10 text-center">お知らせを読み込み中...</p>
          ) : announcements.length === 0 && !error ? ( // エラーがない場合のみ「登録なし」
            <p className="text-slate-400 py-10 text-center">登録されているお知らせはありません。</p>
          ) : !error && announcements.length > 0 ? ( // エラーがなくお知らせがある場合
            <ul className="space-y-3 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
              {announcements.map(item => (
                <li key={item.id} className="p-4 bg-slate-800 rounded-lg shadow hover:bg-slate-700/50">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-grow min-w-0"> {/* テキスト省略のため */}
                      <p className="font-semibold text-white text-lg truncate" title={item.title}>{item.title}</p>
                      <div className="text-xs text-slate-400 mt-0.5 mb-1">
                        <span>作成: {formatTimestamp(item.createdAt)}</span>
                        <span className="mx-1">|</span>
                        <span>更新: {formatTimestamp(item.updatedAt)}</span>
                        <span className="mx-1">|</span>
                        <span>順: {item.sortOrder ?? 'N/A'}</span>
                      </div>
                      <StatusBadge color={item.isPublished ? "green" : "slate"} text={item.isPublished ? "公開中" : "非公開"} />
                    </div>
                    <div className="flex-shrink-0 space-x-2 self-start"> {/* ボタンを右上に */}
                      <button onClick={() => setEditingAnnouncement(item)} className="text-sky-400 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-700">編集</button>
                      <button onClick={() => item.id && handleDelete(item)} className="text-red-400 hover:underline text-xs px-2 py-1 rounded hover:bg-slate-700">削除</button>
                    </div>
                  </div>
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className="mt-3 rounded max-h-40 object-contain border border-slate-700" />
                  )}
                  {item.text && <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">{item.text}</p>}
                  {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline mt-1 block">関連リンク →</a>}
                </li>
              ))}
            </ul>
          ) : null } {/* エラー時はエラーメッセージが表示されるので、ここではnull */}
        </div>
      </div>
    </div>
  );
};

export default AdminAnnouncementsPage;