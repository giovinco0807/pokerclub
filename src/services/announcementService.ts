// src/services/announcementService.ts (新規作成)
import { db, storage } from './firebase'; // storageもインポート (画像削除のため)
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage'; // 画像削除用
import { StoreAnnouncement } from '../types'; // types.ts からインポート (パスを調整)

const announcementsCollection = collection(db, 'announcements');

// 全てのお知らせを取得 (管理画面用、作成日時順など)
export const getAllAnnouncements = async (): Promise<StoreAnnouncement[]> => {
  const q = query(announcementsCollection, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoreAnnouncement));
};

// 公開中のお知らせのみ取得 (ユーザー向けメインページ用、表示順も考慮)
export const getPublishedAnnouncements = async (): Promise<StoreAnnouncement[]> => {
  const q = query(
    announcementsCollection,
    where('isPublished', '==', true),
    orderBy('sortOrder', 'asc'), // sortOrderが小さいものから
    orderBy('createdAt', 'desc') // 次に作成日時が新しいものから
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoreAnnouncement));
};


// お知らせを追加
export const addAnnouncement = async (item: Omit<StoreAnnouncement, 'id' | 'createdAt' | 'updatedAt'>) => {
  return await addDoc(announcementsCollection, {
    ...item,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

// お知らせを更新
export const updateAnnouncement = async (id: string, updates: Partial<Omit<StoreAnnouncement, 'id' | 'createdAt'>>) => {
  const itemDoc = doc(db, 'announcements', id);
  return await updateDoc(itemDoc, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

// お知らせを削除 (関連画像も削除)
export const deleteAnnouncement = async (announcement: StoreAnnouncement) => {
  if (!announcement.id) throw new Error("削除するお知らせのIDがありません。");

  // 画像があればStorageからも削除
  if (announcement.imageUrl && announcement.imageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
    try {
      const imageStorageRef = storageRef(storage, announcement.imageUrl);
      await deleteObject(imageStorageRef);
      console.log("お知らせの関連画像をStorageから削除しました:", announcement.imageUrl);
    } catch (error: any) {
      // 画像削除失敗は継続を妨げないがログには残す
      console.warn("お知らせの関連画像の削除に失敗(無視します):", error);
    }
  }

  const itemDoc = doc(db, 'announcements', announcement.id);
  return await deleteDoc(itemDoc);
};

export type { StoreAnnouncement };
