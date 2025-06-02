// src/services/menuService.ts
import { db } from './firebase';
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
  Timestamp, // Timestamp は ChipPurchaseOption で使われる可能性があるためインポートを確認
  DocumentReference // addDoc の戻り値の型として
} from 'firebase/firestore';
import { DrinkMenuItem, ChipPurchaseOption } from '../types'; // types.ts からインポート

const drinkMenuItemsCollection = collection(db, 'drinkMenuItems');
const chipPurchaseOptionsCollection = collection(db, 'chipPurchaseOptions');

// --- Drink Menu Item Functions ---
export const getAvailableDrinkMenuItems = async (): Promise<DrinkMenuItem[]> => {
  const q = query(drinkMenuItemsCollection, where('isAvailable', '==', true), orderBy('category'), orderBy('sortOrder'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DrinkMenuItem));
};

export const getAllDrinkMenuItems = async (): Promise<DrinkMenuItem[]> => {
  const q = query(drinkMenuItemsCollection, orderBy('category'), orderBy('sortOrder'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DrinkMenuItem));
};

export const addDrinkMenuItem = async (item: Omit<DrinkMenuItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocumentReference> => {
  return await addDoc(drinkMenuItemsCollection, { ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
};

export const updateDrinkMenuItem = async (id: string, updates: Partial<Omit<DrinkMenuItem, 'id' | 'createdAt'>>): Promise<void> => {
  const itemDoc = doc(db, 'drinkMenuItems', id);
  return await updateDoc(itemDoc, { ...updates, updatedAt: serverTimestamp() });
};

export const deleteDrinkMenuItem = async (id: string): Promise<void> => {
  const itemDoc = doc(db, 'drinkMenuItems', id);
  return await deleteDoc(itemDoc);
};

// --- Chip Purchase Option Functions ---

/**
 * (ユーザー向け) 公開中のチップ購入オプションを取得します。表示順でソートされます。
 */
export const getAvailableChipPurchaseOptions = async (): Promise<ChipPurchaseOption[]> => {
  const q = query(chipPurchaseOptionsCollection, where('isAvailable', '==', true), orderBy('sortOrder'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChipPurchaseOption));
};

/**
 * (管理者向け) 全てのチップ購入オプションを取得します。表示順、次に名前でソートされます。
 */
export const getAllChipPurchaseOptionsForAdmin = async (): Promise<ChipPurchaseOption[]> => {
  const q = query(chipPurchaseOptionsCollection, orderBy('sortOrder'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChipPurchaseOption));
};

/**
 * 新しいチップ購入オプションを追加します。
 * @param optionData - ID、作成日時、更新日時を除いたチップオプション情報
 * @returns 追加されたドキュメントの参照
 */
export const addChipPurchaseOption = async (optionData: Omit<ChipPurchaseOption, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocumentReference> => {
  return await addDoc(chipPurchaseOptionsCollection, {
    ...optionData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 既存のチップ購入オプションを更新します。
 * @param optionId - 更新するオプションのID
 * @param updates - 更新する情報 (ID、作成日時を除く)
 */
export const updateChipPurchaseOption = async (optionId: string, updates: Partial<Omit<ChipPurchaseOption, 'id' | 'createdAt'>>): Promise<void> => {
  const optionDoc = doc(db, 'chipPurchaseOptions', optionId);
  return await updateDoc(optionDoc, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

/**
 * チップ購入オプションを削除します。
 * @param optionId - 削除するオプションのID
 */
export const deleteChipPurchaseOption = async (optionId: string): Promise<void> => {
  const optionDoc = doc(db, 'chipPurchaseOptions', optionId);
  return await deleteDoc(optionDoc);
};