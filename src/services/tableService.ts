// src/services/tableService.ts
import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc, // getDoc も追加 (特定のテーブルを取得する場合など)
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
// Table, Seat, TableData, SeatData は types.ts からインポートする想定
import { Table, Seat, TableData, SeatData } from '../types'; // あなたのパスに合わせて調整

const tablesCollectionRef = collection(db, 'tables');

// 全てのテーブル情報を取得 (座席情報は別途取得)
export const getAllTables = async (): Promise<Omit<Table, 'seats'>[]> => {
  console.log("tableService: getAllTables called");
  const q = query(tablesCollectionRef, orderBy('name'));
  const snapshot = await getDocs(q);
  const tables = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as TableData) }));
  console.log("tableService: getAllTables fetched:", tables.length, "items");
  return tables;
};

// 特定のテーブルの座席情報を取得
export const getSeatsForTable = async (tableId: string): Promise<Seat[]> => {
  console.log(`tableService: getSeatsForTable called for tableId: ${tableId}`);
  const seatsCollectionRef = collection(db, 'tables', tableId, 'seats');
  const q = query(seatsCollectionRef, orderBy('seatNumber'));
  const snapshot = await getDocs(q);
  const seats = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as SeatData) } as Seat));
  console.log(`tableService: getSeatsForTable fetched:`, seats.length, "seats for table", tableId);
  return seats;
};


// 新しいテーブルを作成 (座席サブコレクションも同時に作成)
export const createTableWithSeats = async (tableData: TableData, maxSeatsInput: number): Promise<string> => {
  console.log("tableService: createTableWithSeats called with tableData:", tableData, "maxSeats:", maxSeatsInput);
  const batch = writeBatch(db);
  const newTableRef = doc(tablesCollectionRef); // IDを事前に取得

  // maxSeats は number であることを保証 (フォームから来た値が文字列の可能性も考慮)
  const maxSeats = Number(maxSeatsInput);
  if (isNaN(maxSeats) || maxSeats <= 0) {
    console.error("tableService: Invalid maxSeats value:", maxSeatsInput);
    throw new Error("最大座席数には正の整数を指定してください。");
  }

  const tableDocumentDataToCreate = {
    name: tableData.name,
    maxSeats: maxSeats,
    status: tableData.status || 'active', // デフォルト値を設定
    gameType: tableData.gameType || '',   // デフォルト値を設定 (空文字またはnull)
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log("tableService: Attempting to create table document:", JSON.stringify(tableDocumentDataToCreate, null, 2));
  batch.set(newTableRef, tableDocumentDataToCreate);

  for (let i = 1; i <= maxSeats; i++) {
    const seatDocRef = doc(db, 'tables', newTableRef.id, 'seats', String(i));
    const seatDocumentData: SeatData = {
      seatNumber: i,
      userId: null,
      userPokerName: null,
      status: 'empty',
      occupiedAt: null, // serverTimestamp()ではなく、最初はnull
    };
    // console.log(`tableService: Attempting to create seat ${String(i)} for table ${newTableRef.id}:`, JSON.stringify(seatDocumentData, null, 2)); // ログが多すぎる場合はコメントアウト
    batch.set(seatDocRef, seatDocumentData);
  }

  try {
    await batch.commit();
    console.log("tableService: Batch commit successful for table and seats. Table ID:", newTableRef.id);
    return newTableRef.id;
  } catch (error) {
    console.error("tableService: Error committing batch in createTableWithSeats (FULL ERROR OBJECT):", error);
    if (error instanceof Error && 'code' in error) { // FirebaseErrorの場合、codeプロパティがあることが多い
        console.error("tableService: Firestore Error Code:", (error as any).code);
    }
    throw error; // エラーを再スロー
  }
};

// テーブル情報を更新
export const updateTable = async (tableId: string, updates: Partial<TableData>) => {
  console.log(`tableService: updateTable called for tableId: ${tableId} with updates:`, updates);
  const tableDoc = doc(db, 'tables', tableId);

  // Firestoreにundefinedを書き込まないようにフィルタリング (任意だが安全)
  const filteredUpdates: { [key: string]: any } = {};
  for (const key in updates) {
    if (updates[key as keyof TableData] !== undefined) {
      filteredUpdates[key] = updates[key as keyof TableData];
    }
  }
  filteredUpdates.updatedAt = serverTimestamp(); // updatedAtは必ず更新

  console.log(`tableService: Attempting to update table document ${tableId} with:`, JSON.stringify(filteredUpdates, null, 2));

  try {
    await updateDoc(tableDoc, filteredUpdates);
    console.log(`tableService: Table ${tableId} updated successfully.`);
  } catch (error) {
    console.error(`tableService: Error updating table ${tableId}:`, error);
    throw error;
  }
};

// テーブルを削除 (サブコレクションの座席も削除する必要がある - Functionsで行うのが安全かつ確実)
export const deleteTable = async (tableId: string) => {
  console.log(`tableService: deleteTable called for tableId: ${tableId}`);
  // **重要**: このクライアントサイドの実装ではサブコレクション(seats)は削除されません。
  // サブコレクションを確実に削除するにはFirebase Functionsのトリガーなどを使用する必要があります。
  // ここではテーブルドキュメントのみを削除します。
  const tableDoc = doc(db, 'tables', tableId);
  try {
    await deleteDoc(tableDoc);
    console.warn(`テーブル ${tableId} を削除しました。サブコレクション 'seats' は自動では削除されていません。`);
  } catch (error) {
    console.error(`tableService: Error deleting table ${tableId}:`, error);
    throw error;
  }
};

// 特定のテーブル情報を取得 (もし必要なら)
export const getTableById = async (tableId: string): Promise<Table | null> => {
    console.log(`tableService: getTableById called for tableId: ${tableId}`);
    const tableDocRef = doc(db, 'tables', tableId);
    const tableSnap = await getDoc(tableDocRef);
    if (tableSnap.exists()) {
        const tableData = { id: tableSnap.id, ...(tableSnap.data() as TableData) } as Omit<Table, 'seats'>;
        const seats = await getSeatsForTable(tableId);
        console.log(`tableService: getTableById found table:`, tableData);
        return { ...tableData, seats };
    } else {
        console.log(`tableService: getTableById - No such table found with id: ${tableId}`);
        return null;
    }
};