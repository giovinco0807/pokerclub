// src/services/withdrawalService.ts
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Timestamp をインポート
import { WithdrawalRequest } from '../types'; // types.ts から WithdrawalRequest 型をインポート

/**
 * 新しいチップ引き出しリクエストを作成します。
 * @param requestData - userId, userPokerName, userEmail, requestedChipsAmount を含むオブジェクト
 * @returns 追加されたドキュメントの参照
 */
export const createWithdrawalRequest = async (
  requestData: Pick<WithdrawalRequest, 'userId' | 'userPokerName' | 'userEmail' | 'requestedChipsAmount'>
) => {
  const dataToSave: Omit<WithdrawalRequest, 'id' | 'processedBy' | 'processedAt' | 'notes' | 'adminDeliveredAt' | 'customerConfirmedAt' | 'adminProcessedAt'> = {
    ...requestData,
    status: "pending_approval", // types.ts で定義した初期ステータス
    requestedAt: serverTimestamp() as Timestamp, 
  };
  return await addDoc(collection(db, 'withdrawalRequests'), dataToSave);
};