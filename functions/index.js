// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- 既存の関数 (setAdminClaim, autoSetAdminOnUserCreate, purchaseChips は変更なし) ---
/**
 * 指定されたメールアドレスのユーザーに管理者権限を付与する。
 */
exports.setAdminClaim = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const callerUid = context.auth.uid;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      // 呼び出し元が管理者でない場合はエラー
      if (callerUserRecord.customClaims?.admin !== true) {
        throw new functions.https.HttpsError("permission-denied", "管理者権限が必要です。");
      }
    } catch (error) {
      console.error("呼び出し元の権限確認エラー:", error);
      // permission-denied でない場合は internal エラー
      if (error.code === "permission-denied") throw error;
      throw new functions.https.HttpsError("internal", "権限確認中にエラーが発生しました。");
    }
    const emailToMakeAdmin = data.email;
    if (typeof emailToMakeAdmin !== "string" || emailToMakeAdmin.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "有効なメールアドレスが必要です。");
    }
    try {
      const targetUserRecord = await admin.auth().getUserByEmail(emailToMakeAdmin);
      await admin.auth().setCustomUserClaims(targetUserRecord.uid, { admin: true });
      console.log(`ユーザー ${targetUserRecord.uid} (${emailToMakeAdmin}) に管理者権限を付与しました。`);
      return { status: "success", message: `ユーザー "${emailToMakeAdmin}" に管理者権限を付与しました。` };
    } catch (error) {
      console.error("管理者権限付与エラー:", error);
      if (error.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", `ユーザー "${emailToMakeAdmin}" が見つかりません。`);
      }
      throw new functions.https.HttpsError("internal", "管理者権限付与中にエラーが発生しました。");
    }
  });
exports.autoSetAdminOnUserCreate = functions
  .region("asia-northeast1")
  .auth.user()
  .onCreate(async (user) => {
    if (user.email === "giovinco.080807@gmail.com") {
      try {
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        console.log(`ユーザー ${user.uid} (${user.email}) に管理者権限を自動付与しました。`);
      } catch (error) {
        console.error("管理者権限の自動付与失敗:", error);
      }
    }
    return null;
  });
exports.purchaseChips = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const userId = context.auth.uid;
    const itemsToPurchase = data.itemsToPurchase;
    if (!Array.isArray(itemsToPurchase) || itemsToPurchase.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "購入アイテムリストが無効です。");
    }
    let totalChipsToAward = 0;
    let totalPriceYen = 0;
    const purchasedItemsDetailsForLog = [];
    try {
      for (const item of itemsToPurchase) {
        if (!item.chipOptionId || typeof item.chipOptionId !== "string" || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new functions.https.HttpsError("invalid-argument", `無効なアイテムデータ: ${JSON.stringify(item)}`);
        }
        const optionRef = db.collection("chipPurchaseOptions").doc(item.chipOptionId);
        const optionDoc = await optionRef.get();
        if (!optionDoc.exists) throw new functions.https.HttpsError("not-found", `チップオプション (ID: ${item.chipOptionId}) が見つかりません。`);
        const optionData = optionDoc.data();
        if (!optionData.isAvailable) throw new functions.https.HttpsError("failed-precondition", `オプション「${optionData.name || item.chipOptionId}」は購入できません。`);
        if (typeof optionData.priceYen !== "number" || typeof optionData.chipsAmount !== "number") throw new functions.https.HttpsError("internal", `オプション「${optionData.name || item.chipOptionId}」のデータが無効です。`);
        totalChipsToAward += optionData.chipsAmount * item.quantity;
        totalPriceYen += optionData.priceYen * item.quantity;
        purchasedItemsDetailsForLog.push({ name: optionData.name, optionId: item.chipOptionId, quantity: item.quantity, chipsAwarded: optionData.chipsAmount * item.quantity, pricePaid: optionData.priceYen * item.quantity });
      }
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", "ユーザーデータが見つかりません。");
        const userData = userDoc.data();
        const newChips = (userData.chips || 0) + totalChipsToAward;
        const newBill = (userData.bill || 0) + totalPriceYen;
        transaction.update(userRef, { chips: newChips, bill: newBill, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      const successMessage = `チップ ${totalChipsToAward.toLocaleString()}枚の購入完了。合計: ${totalPriceYen.toLocaleString()}円`;
      console.log(`ユーザー ${userId} チップ購入成功: `, purchasedItemsDetailsForLog, `結果: ${successMessage}`);
      return { status: "success", message: successMessage, totalChipsAwarded: totalChipsToAward, totalPriceYen: totalPriceYen, purchasedItems: purchasedItemsDetailsForLog };
    } catch (error) {
      console.error(`ユーザー ${userId} のチップ購入エラー:`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ購入処理中にサーバーエラー。", error.message);
    }
  });


// --- ★★★ ここから変更・追加のある関数 ★★★ ---

/**
 * チェックイン時のチップ移動 (管理者/スタッフ操作)
 * ★ ゲームセッションログの開始記録を追加 ★
 */
exports.checkInUserWithChips = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(checkIn):", error); throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { userId, tableId, seatNumber, amountToPlay } = data;
    if (!userId || typeof userId !== "string" || !tableId || typeof tableId !== "string" || !Number.isInteger(seatNumber) || seatNumber <= 0 || typeof amountToPlay !== "number" || amountToPlay < 0) {
      throw new functions.https.HttpsError("invalid-argument", "入力無効。");
    }
    const userRef = db.collection("users").doc(userId);
    const seatRef = db.collection("tables").doc(tableId).collection("seats").doc(String(seatNumber));
    const tableRefForSession = db.collection("tables").doc(tableId);

    let userDataForSession;
    try {
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const seatDoc = await transaction.get(seatRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `ユーザー(ID:${userId})未発見。`);
        userDataForSession = userDoc.data();
        if (!seatDoc.exists) throw new functions.https.HttpsError("not-found", `テーブル${tableId}座席${seatNumber}未発見。`);
        const seatData = seatDoc.data();
        if (userDataForSession.isCheckedIn) throw new functions.https.HttpsError("failed-precondition", `ユーザー「${userDataForSession.pokerName||userId}」チェックイン済。`);
        if ((userDataForSession.chips||0) < amountToPlay) throw new functions.https.HttpsError("failed-precondition", "保有チップ不足。");
        if (seatData.status === "occupied" && seatData.userId !== null) throw new functions.https.HttpsError("failed-precondition", `座席${tableId}-${seatNumber}使用中。`);

        transaction.update(userRef, {
          chips: admin.firestore.FieldValue.increment(-amountToPlay), chipsInPlay: admin.firestore.FieldValue.increment(amountToPlay),
          isCheckedIn: true, currentTableId: tableId, currentSeatNumber: seatNumber,
          activeGameSessionId: null,
          checkedInAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(seatRef, {
          userId: userId, userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
          status: "occupied", occupiedAt: admin.firestore.FieldValue.serverTimestamp(), currentStack: amountToPlay,
        });
      });

      // ゲームセッションの記録を開始
      const tableDoc = await tableRefForSession.get();
      let gameTypePlayed = "Unknown";
      let ratePlayed = null;
      let tableNameForSession = tableId;
      let minBuyInForSession = 0;
      let maxBuyInForSession = 0;


      if (tableDoc.exists) {
        const tableData = tableDoc.data();
        gameTypePlayed = tableData.gameType || "Other";
        ratePlayed = tableData.blindsOrRate || null;
        tableNameForSession = tableData.name || tableId;
        minBuyInForSession = tableData.minBuyIn || 0;
        maxBuyInForSession = tableData.maxBuyIn || 0;
      }

      const gameSessionRef = db.collection("gameSessions").doc();
      await gameSessionRef.set({
        userId: userId,
        userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
        tableId: tableId,
        tableName: tableNameForSession,
        seatNumber: seatNumber,
        gameTypePlayed: gameTypePlayed,
        ratePlayed: ratePlayed,
        sessionStartTime: admin.firestore.FieldValue.serverTimestamp(),
        chipsIn: amountToPlay,
        totalChipsIn: amountToPlay,
        additionalChipsIn: 0,
        sessionEndTime: null,
        chipsOut: null,
        profit: null,
        durationMinutes: null,
        playFeeCalculated: null,
        playFeeAppliedToBill: false,
        minBuyIn: minBuyInForSession,
        maxBuyIn: maxBuyInForSession,
      });
      await userRef.update({ activeGameSessionId: gameSessionRef.id });
      console.log(`ユーザー ${userId} の新しいゲームセッション ${gameSessionRef.id} を開始しました。`);

      console.log(`ユーザー${userId}をテーブル${tableId}座席${seatNumber}に${amountToPlay}チップでチェックイン。`);
      return { status: "success", message: `ユーザーをT${tableId}S${seatNumber}に${amountToPlay.toLocaleString()}チップでチェックインしました。` };
    } catch (error) {
      console.error(`チェックインエラー(ID:${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チェックイン処理中エラー。", error.message);
    }
  });


/**
 * 管理者によるチップ引き出し「提供済み」処理 (チップ移動を伴う)
 */
exports.dispenseApprovedChipsAndMarkAsDelivered = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(dispense):", error); throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { withdrawalRequestId } = data;
    if (!withdrawalRequestId || typeof withdrawalRequestId !== "string") throw new functions.https.HttpsError("invalid-argument", "リクエストID無効。");

    const requestRef = db.collection("withdrawalRequests").doc(withdrawalRequestId);
    let userIdForLog; let amountForLog; let userPokerNameForLog; let userEmailForLog; let tableIdForLog; let seatNumberForLog;

    try {
      await db.runTransaction(async (transaction) => {
        const requestDoc = await transaction.get(requestRef);
        if (!requestDoc.exists) throw new functions.https.HttpsError("not-found", `引出リクエスト(ID:${withdrawalRequestId})未発見。`);
        const requestData = requestDoc.data();
        if (requestData.status !== "approved_preparing") throw new functions.https.HttpsError("failed-precondition", `リクエスト状態不正(現在:${requestData.status})。`);
        if (!requestData.userId || typeof requestData.userId !== "string" || typeof requestData.requestedChipsAmount !== "number" || requestData.requestedChipsAmount <= 0) {
          throw new functions.https.HttpsError("internal", "リクエストデータ無効(ユーザーID/チップ額)。");
        }

        userIdForLog = requestData.userId;
        amountForLog = requestData.requestedChipsAmount;

        const targetUserRef = db.collection("users").doc(requestData.userId);
        const userDoc = await transaction.get(targetUserRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `対象ユーザー(ID:${requestData.userId})未発見。`);
        const userData = userDoc.data();
        userPokerNameForLog = userData.pokerName;
        userEmailForLog = userData.email;
        tableIdForLog = userData.currentTableId;
        seatNumberForLog = userData.currentSeatNumber;

        if ((userData.chips||0) < requestData.requestedChipsAmount) throw new functions.https.HttpsError("failed-precondition", `ユーザー「${userData.pokerName||requestData.userId}」保有チップ(${(userData.chips||0)})不足。`);

        transaction.update(targetUserRef, {
          chips: admin.firestore.FieldValue.increment(-requestData.requestedChipsAmount),
          chipsInPlay: admin.firestore.FieldValue.increment(requestData.requestedChipsAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(requestRef, {
          status: "delivered_awaiting_confirmation", adminDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: callerUid, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      // ゲームセッションの記録を開始
      const userDocAfterTransaction = await db.collection("users").doc(userIdForLog).get();
      const userDataAfterTransaction = userDocAfterTransaction.data();

      if (userDataAfterTransaction && userDataAfterTransaction.activeGameSessionId) {
        // 既存セッションへの追加チップとして記録
        const existingGameSessionRef = db.collection("gameSessions").doc(userDataAfterTransaction.activeGameSessionId);
        await existingGameSessionRef.update({
          additionalChipsIn: admin.firestore.FieldValue.increment(amountForLog),
          totalChipsIn: admin.firestore.FieldValue.increment(amountForLog),
        });
        console.log(`既存ゲームセッション ${userDataAfterTransaction.activeGameSessionId} に ${amountForLog} チップ追加。`);
      } else if (tableIdForLog && seatNumberForLog !== null) {
        // 新規セッションとして記録
        const tableDocForSession = await db.collection("tables").doc(tableIdForLog).get();
        let gameTypePlayed = "Unknown";
        let ratePlayed = null;
        let tableNameForSession = tableIdForLog;
        let minBuyInForSession = 0;
        let maxBuyInForSession = 0;


        if (tableDocForSession.exists) {
          const tableDataForSession = tableDocForSession.data();
          gameTypePlayed = tableDataForSession.gameType || "Other";
          ratePlayed = tableDataForSession.blindsOrRate || null;
          tableNameForSession = tableDataForSession.name || tableIdForLog;
          minBuyInForSession = tableDataForSession.minBuyIn || 0;
          maxBuyInForSession = tableDataForSession.maxBuyIn || 0;
        }

        const gameSessionRef = db.collection("gameSessions").doc();
        await gameSessionRef.set({
          userId: userIdForLog,
          userPokerName: userPokerNameForLog || userEmailForLog?.split("@")[0] || "不明",
          tableId: tableIdForLog,
          tableName: tableNameForSession,
          seatNumber: seatNumberForLog,
          gameTypePlayed: gameTypePlayed,
          ratePlayed: ratePlayed,
          sessionStartTime: admin.firestore.FieldValue.serverTimestamp(),
          chipsIn: amountForLog,
          totalChipsIn: amountForLog,
          additionalChipsIn: 0,
          sessionEndTime: null, chipsOut: null, profit: null, durationMinutes: null,
          playFeeCalculated: null, playFeeAppliedToBill: false,
          minBuyIn: minBuyInForSession,
          maxBuyIn: maxBuyInForSession,
        });
        await db.collection("users").doc(userIdForLog).update({ activeGameSessionId: gameSessionRef.id });
        console.log(`ユーザー ${userIdForLog} の新しいゲームセッション ${gameSessionRef.id} をチップ引き出し承認時に開始。`);
      } else {
        console.warn(`ユーザー ${userIdForLog} はテーブルに紐付いていないため、ゲームセッションログは開始されませんでした。(dispenseApprovedChips)`);
      }

      console.log(`チップ引出リクエスト${withdrawalRequestId}を提供済(ユーザー確認待ち)にしチップ移動。`);
      return { status: "success", message: "チップを提供済にしユーザーチップを更新。ユーザー確認待ちです。" };
    } catch (error) {
      console.error(`チップ提供処理エラー(ID:${withdrawalRequestId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ提供処理中エラー。", error.message);
    }
  });

/**
 * 管理者によるチップ精算開始処理
 */
exports.initiateChipSettlementByAdmin = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(initiateChipSettlementByAdmin):", error);
      throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { userId, tableId, seatNumber, denominationsCount, totalAdminEnteredChips } = data;
    if (!userId || typeof userId !== "string" || !tableId || typeof tableId !== "string" || !Number.isInteger(seatNumber) || seatNumber < 0 || typeof denominationsCount !== "object" || denominationsCount === null || typeof totalAdminEnteredChips !== "number" || totalAdminEnteredChips < 0) {
      throw new functions.https.HttpsError("invalid-argument", "入力データが無効です。");
    }

    const userRef = db.collection("users").doc(userId);
    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `対象ユーザー (ID: ${userId}) が見つかりません。`);
      const userData = userDoc.data();
      if (!userData.isCheckedIn || userData.currentTableId !== tableId || userData.currentSeatNumber !== seatNumber) {
        throw new functions.https.HttpsError("failed-precondition", "ユーザーのチェックイン情報と指定されたテーブル/座席が一致しません。");
      }

      await userRef.update({
        pendingChipSettlement: {
          tableId: tableId, seatNumber: seatNumber,
          adminEnteredTotalChips: totalAdminEnteredChips,
          denominationsCount: denominationsCount,
          initiatedBy: callerUid, initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`ユーザー ${userId} のチップ精算 (${totalAdminEnteredChips}チップ) をユーザー確認待ちに。T:${tableId}, S:${seatNumber}`);
      return { status: "success", message: "チップ精算をユーザー確認待ちに設定しました。" };
    } catch (error) {
      console.error(`チップ精算開始エラー (ID:${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ精算開始処理中エラー。", error.message);
    }
  });

/**
 * ユーザーによるチップ精算確認処理
 * ★ ゲームセッションログの終了記録とプレイ代計算・請求処理を追加 ★
 */
exports.confirmAndFinalizeChipSettlement = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const userId = context.auth.uid;

    const userRef = db.collection("users").doc(userId);

    try {
      let userDataForLog;
      let settlementInfoForLog;
      let oldTableId = null;
      let oldSeatNumber = null;

      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new functions.https.HttpsError("not-found", "ユーザーデータが見つかりません。");
        }
        userDataForLog = userDoc.data();
        if (!userDataForLog.pendingChipSettlement || typeof userDataForLog.pendingChipSettlement.adminEnteredTotalChips !== "number") {
          throw new functions.https.HttpsError("failed-precondition", "確認待ちのチップ精算情報がありません、または無効です。");
        }

        settlementInfoForLog = userDataForLog.pendingChipSettlement;
        const chipsToAddFromSettlement = settlementInfoForLog.adminEnteredTotalChips;
        oldTableId = settlementInfoForLog.tableId;
        oldSeatNumber = settlementInfoForLog.seatNumber;

        const currentChips = userDataForLog.chips || 0;

        transaction.update(userRef, {
          chips: currentChips + chipsToAddFromSettlement,
          chipsInPlay: 0,
          isCheckedIn: false,
          currentTableId: null,
          currentSeatNumber: null,
          pendingChipSettlement: admin.firestore.FieldValue.delete(),
          checkedOutAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (oldTableId && oldSeatNumber != null && oldSeatNumber >= 0) {
          const seatRef = db.collection("tables").doc(oldTableId).collection("seats").doc(String(oldSeatNumber));
          transaction.update(seatRef, {
            userId: null, userPokerName: null,
            status: "empty", occupiedAt: null, currentStack: 0,
          });
        }
      });

      // ゲームセッションログの更新とプレイ代計算
      if (userDataForLog && userDataForLog.activeGameSessionId && settlementInfoForLog) {
        const gameSessionRef = db.collection("gameSessions").doc(userDataForLog.activeGameSessionId);
        const gameSessionDoc = await gameSessionRef.get();

        if (gameSessionDoc.exists) {
          const gameSessionData = gameSessionDoc.data();
          const profit = settlementInfoForLog.adminEnteredTotalChips - gameSessionData.totalChipsIn;

          let durationMinutes = null;
          const sessionEndTimeForCalc = new Date();
          if (gameSessionData.sessionStartTime && gameSessionData.sessionStartTime.toDate) {
            const startTime = gameSessionData.sessionStartTime.toDate();
            durationMinutes = Math.round((sessionEndTimeForCalc.getTime() - startTime.getTime()) / (1000 * 60));
          } else {
            console.warn(`ゲームセッション ${userDataForLog.activeGameSessionId} の開始時刻が無効です。`);
          }

          let playFeeAmount = 0;
          if (durationMinutes !== null && durationMinutes > 0) {
            const gameType = gameSessionData.gameTypePlayed;
            const rateInfo = gameSessionData.ratePlayed;
            const sessionMinBuyIn = gameSessionData.minBuyIn;
            const sessionMaxBuyIn = gameSessionData.maxBuyIn;

            console.log(`Fee calculation context for session ${userDataForLog.activeGameSessionId}: Game Type: ${gameType}, Rate Info: ${rateInfo}, Min Buy-In: ${sessionMinBuyIn}, Max Buy-In: ${sessionMaxBuyIn}`);

            const feePerUnitTime = 500;
            const unitTimeMinutes = 30;
            const freeMinutes = 0;

            if (durationMinutes > freeMinutes) {
              playFeeAmount = Math.ceil((durationMinutes - freeMinutes) / unitTimeMinutes) * feePerUnitTime;
            }

            if (playFeeAmount < 0) playFeeAmount = 0;
          }

          await gameSessionRef.update({
            sessionEndTime: admin.firestore.FieldValue.serverTimestamp(),
            chipsOut: settlementInfoForLog.adminEnteredTotalChips,
            profit: profit,
            durationMinutes: durationMinutes,
            playFeeCalculated: playFeeAmount,
            playFeeAppliedToBill: playFeeAmount > 0,
          });

          if (playFeeAmount > 0) {
            await userRef.update({
              bill: admin.firestore.FieldValue.increment(playFeeAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await userRef.update({ activeGameSessionId: null });
          console.log(`ゲームセッション ${userDataForLog.activeGameSessionId} を終了。ChipsOut: ${settlementInfoForLog.adminEnteredTotalChips}, Profit: ${profit}, プレイ時間: ${durationMinutes}分, プレイ代: ${playFeeAmount}円`);
        } else {
          console.warn(`アクティブなゲームセッション ${userDataForLog.activeGameSessionId} が見つかりませんでした。プレイ代計算およびユーザーのactiveGameSessionIdクリアはスキップされます。`);
          await userRef.update({ activeGameSessionId: null });
        }
      } else {
        console.warn(`ユーザー ${userId} のアクティブなゲームセッションIDが見つからないか、精算情報が不足しています。セッションログ更新とプレイ代計算はスキップされます。`);
      }

      console.log(`ユーザー ${userId} がチップ精算 (テーブル: ${oldTableId}, 座席: ${oldSeatNumber}) を確認・完了しました。`);
      return { status: "success", message: "チップの精算が完了しました。" };
    } catch (error) {
      console.error(`チップ精算確認エラー (ユーザーID: ${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ精算確認処理中にエラー。", error.message);
    }
  });

/**
 * ユーザーによるドリンク注文の最終確定と請求処理
 */
exports.finalizeDrinkOrderAndBill = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const userId = context.auth.uid;
    const { orderId } = data;

    if (!orderId || typeof orderId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "注文IDが無効です。");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const userRef = db.collection("users").doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        const userDoc = await transaction.get(userRef);

        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", `注文 (ID: ${orderId}) が見つかりません。`);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `ユーザー (ID: ${userId}) が見つかりません。`);

        const orderData = orderDoc.data();
        const userData = userDoc.data();

        if (orderData.userId !== userId) throw new functions.https.HttpsError("permission-denied", "この注文はあなたのユーザーIDに紐付いていません。");
        if (orderData.orderStatus !== "delivered_awaiting_confirmation") throw new functions.https.HttpsError("failed-precondition", `注文ステータスが「提供済み(ユーザー確認待ち)」ではありません。(現在のステータス: ${orderData.orderStatus})`);

        const currentBill = userData.bill || 0;

        let billIncrementAmount = 0;
        orderData.items.forEach((item) => {
          if (item.itemType === "drink") {
            billIncrementAmount += item.totalItemPrice;
          }
        });

        transaction.update(userRef, {
          bill: currentBill + billIncrementAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(orderRef, {
          orderStatus: "completed",
          customerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`ユーザー ${userId} の注文 ${orderId} が完了しました。`);
      return { status: "success", message: "注文の受け取りを確定しました。" };
    } catch (error) {
      console.error(`注文確定処理エラー (注文ID: ${orderId}, ユーザーID: ${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "注文確定処理中にエラー。", error.message);
    }
  });

// --- 新規追加された関数 ---

// ゲームテンプレートの追加・更新
exports.upsertGameTemplate = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
  const callerUid = context.auth.uid;
  try {
    const callerUserRecord = await admin.auth().getUser(callerUid);
    if (!callerUserRecord.customClaims?.admin && !callerUserRecord.customClaims?.staff) {
      throw new functions.https.HttpsError("permission-denied", "管理者またはスタッフ権限が必要です。");
    }
  } catch (error) {
    console.error("権限確認エラー(upsertGameTemplate):", error);
    if (error.code === "permission-denied") throw error;
    throw new functions.https.HttpsError("internal", "権限確認中にエラーが発生しました。");
  }

  const { id, templateName, gameType, blindsOrRate, description, minPlayers, maxPlayers, estimatedDurationMinutes, notesForUser, isActive, sortOrder } = data;

  if (!templateName || !gameType) {
    throw new functions.https.HttpsError("invalid-argument", "テンプレート名とゲームタイプは必須です。");
  }

  const templateData = {
    templateName,
    gameType,
    blindsOrRate: blindsOrRate || null,
    description: description || "",
    minPlayers: minPlayers !== undefined ? Number(minPlayers) : null,
    maxPlayers: maxPlayers !== undefined ? Number(maxPlayers) : null,
    estimatedDurationMinutes: estimatedDurationMinutes !== undefined ? Number(estimatedDurationMinutes) : null,
    notesForUser: notesForUser || "",
    isActive: isActive === undefined ? true : isActive,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (id) {
      // 更新
      await db.collection("gameTemplates").doc(id).update(templateData);
      return { status: "success", message: "ゲームテンプレートを更新しました。", id };
    } else {
      // 新規作成
      const newRef = await db.collection("gameTemplates").add({
        ...templateData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: "success", message: "ゲームテンプレートを作成しました。", id: newRef.id };
    }
  } catch (error) {
    console.error("ゲームテンプレートの保存エラー:", error);
    throw new functions.https.HttpsError("unknown", "ゲームテンプレートの保存に失敗しました。", error.message);
  }
});

// ゲームテンプレートの削除
exports.deleteGameTemplate = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
  const callerUid = context.auth.uid;
  try {
    const callerUserRecord = await admin.auth().getUser(callerUid);
    if (!callerUserRecord.customClaims?.admin && !callerUserRecord.customClaims?.staff) {
      throw new functions.https.HttpsError("permission-denied", "管理者またはスタッフ権限が必要です。");
    }
  } catch (error) {
    console.error("権限確認エラー(deleteGameTemplate):", error);
    if (error.code === "permission-denied") throw error;
    throw new functions.https.HttpsError("internal", "権限確認中にエラーが発生しました。");
  }

  const { templateId } = data;
  if (!templateId || typeof templateId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "テンプレートIDは必須です。");
  }

  try {
    await db.collection("gameTemplates").doc(templateId).delete();
    return { status: "success", message: "ゲームテンプレートを削除しました。" };
  } catch (error) {
    console.error("ゲームテンプレートの削除エラー:", error);
    throw new functions.https.HttpsError("unknown", "ゲームテンプレートの削除に失敗しました。", error.message);
  }
});

// ウェイティングリストに追加
exports.addWaitingListEntry = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
  const userId = context.auth.uid;

  const { userPokerName, gameTemplateId, partySize, notes } = data;

  if (!userPokerName || !gameTemplateId || !Number.isInteger(partySize) || partySize <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "必須情報が不足しているか無効です。");
  }

  try {
    // 既にウェイティングリストに登録されているか確認
    const existingEntrySnapshot = await db.collection("waitingLists")
      .where("userId", "==", userId)
      .where("status", "in", ["waiting", "called"])
      .get();

    if (!existingEntrySnapshot.empty) {
      throw new functions.https.HttpsError("already-exists", "既にウェイティングリストに登録されています。");
    }

    const newEntryRef = await db.collection("waitingLists").add({
      userId: userId,
      userPokerNameSnapshot: userPokerName,
      gameTemplateId: gameTemplateId,
      partySize: partySize,
      status: "waiting",
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      notes: notes || "",
      adminNotes: "",
      callCount: 0,
      calledAt: null,
      seatedAt: null,
      cancelledAt: null,
    });

    return { id: newEntryRef.id, message: "ウェイティングリストに追加されました。" };
  } catch (error) {
    console.error("ウェイティングリスト追加エラー:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("unknown", "ウェイティングリストへの追加に失敗しました。", error.message);
  }
});

// ウェイティングリストエントリの更新 (管理者/スタッフ用)
exports.updateWaitingListEntry = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
  const callerUid = context.auth.uid;
  let isAdminOrStaff = false;
  try {
    const callerUserRecord = await admin.auth().getUser(callerUid);
    if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
  } catch (error) {
    console.error("権限確認エラー(updateWaitingListEntry):", error);
    if (error.code === "permission-denied") throw error;
    throw new functions.https.HttpsError("internal", "権限確認中にエラーが発生しました。");
  }
  if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

  const { entryId, status, estimatedWaitTime, tableId, adminNotes, callCount } = data;
  if (!entryId || typeof entryId !== "string") throw new functions.https.HttpsError("invalid-argument", "エントリIDは必須です。");

  const updateData = {};
  if (status) updateData.status = status;
  if (estimatedWaitTime !== undefined) updateData.estimatedWaitTime = estimatedWaitTime;
  if (tableId !== undefined) updateData.tableId = tableId;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
  if (callCount !== undefined) updateData.callCount = callCount;

  if (status === "called") updateData.calledAt = admin.firestore.FieldValue.serverTimestamp();
  if (status === "seated") updateData.seatedAt = admin.firestore.FieldValue.serverTimestamp();
  if (status === "cancelled_by_admin" || status === "cancelled_by_user" || status === "no_show") updateData.cancelledAt = admin.firestore.FieldValue.serverTimestamp();

  updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  try {
    await db.collection("waitingLists").doc(entryId).update(updateData);
    return { status: "success", message: "ウェイティングリストエントリを更新しました。" };
  } catch (error) {
    console.error("ウェイティングリスト更新エラー:", error);
    throw new functions.https.HttpsError("unknown", "ウェイティングリストの更新に失敗しました。", error.message);
  }
});


// ウェイティングリストエントリの削除 (管理者/スタッフ用)
exports.deleteWaitingListEntry = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
  const callerUid = context.auth.uid;
  let isAdminOrStaff = false;
  try {
    const callerUserRecord = await admin.auth().getUser(callerUid);
    if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    if (!isAdminOrStaff) {
      throw new functions.https.HttpsError("permission-denied", "管理者またはスタッフ権限が必要です。");
    }
  } catch (error) {
    console.error("権限確認エラー(deleteWaitingListEntry):", error);
    if (error.code === "permission-denied") throw error;
    throw new functions.https.HttpsError("internal", "権限確認中にエラーが発生しました。");
  }
  if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

  const { entryId } = data;
  if (!entryId || typeof entryId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "エントリIDは必須です。");
  }

  try {
    await db.collection("waitingLists").doc(entryId).delete();
    return { status: "success", message: "ウェイティングリストエントリを削除しました。" };
  } catch (error) {
    console.error("ウェイティングリスト削除エラー:", error);
    throw new functions.https.HttpsError("unknown", "ウェイティングリストの削除に失敗しました。", error.message);
  }
});

exports.onWaitingListStatusUpdate = functions.firestore
  .document("waitingLists/{entryId}")
  .onUpdate(async (change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();

    if (previousValue.status === "waiting" && newValue.status === "called") {
      const userId = newValue.userId;
      const userPokerName = newValue.userPokerNameSnapshot || "お客様";
      const gameTemplateId = newValue.gameTemplateId;
      const entryId = context.params.entryId;

      let gameName = "ゲーム";
      const gameTemplateDoc = await db.collection("gameTemplates").doc(gameTemplateId).get();
      if (gameTemplateDoc.exists) {
        const gtData = gameTemplateDoc.data();
        gameName = gtData.templateName || gtData.gameType || "ゲーム";
      }

      const notificationTitle = `ウェイティング呼び出し: ${gameName}のご準備ができました！`;
      const notificationMessage = `${userPokerName}様、${gameName}のウェイティングが進行しました。スタッフにお声がけください。`;

      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;

      if (fcmToken) {
        const payload = {
          notification: {
            title: notificationTitle,
            body: notificationMessage,
          },
          data: {
            type: "waiting_list_called",
            entryId: entryId,
            gameTemplateId: gameTemplateId,
          },
        };
        try {
          await admin.messaging().sendToDevice(fcmToken, payload);
          console.log(`FCM通知をユーザー ${userId} (${userPokerName}) に送信しました (ウェイティング呼び出し)。`);
        } catch (error) {
          console.error(`FCM通知の送信エラー (ウェイティング呼び出し, UserID: ${userId}):`, error);
        }
      } else {
        console.log(`FCMトークンが見つからないため、プッシュ通知をスキップしました。(User: ${userId})`);
      }

      await db.collection("notifications").add({
        userId: userId,
        title: notificationTitle,
        message: notificationMessage,
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: "waiting_list_called",
        relatedId: entryId,
      });
    } else if (previousValue.status === "waiting" && newValue.status === "cancelled_by_admin") {
      const userId = newValue.userId;
      const userPokerName = newValue.userPokerNameSnapshot || "お客様";
      const gameTemplateId = newValue.gameTemplateId;
      const entryId = context.params.entryId;

      let gameName = "ゲーム";
      const gameTemplateDoc = await db.collection("gameTemplates").doc(gameTemplateId).get();
      if (gameTemplateDoc.exists) {
        const gtData = gameTemplateDoc.data();
        gameName = gtData.templateName || gtData.gameType || "ゲーム";
      }

      const notificationTitle = "ウェイティングがキャンセルされました";
      const notificationMessage = `${userPokerName}様、${gameName}のウェイティングが管理者によってキャンセルされました。`;

      await db.collection("notifications").add({
        userId: userId,
        title: notificationTitle,
        message: notificationMessage,
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: "waiting_list_cancelled",
        relatedId: entryId,
      });
    }

    return null;
  });

/**
 * チェックイン時のチップ移動 (管理者/スタッフ操作)
 * ゲームセッションログの開始記録を追加
 */
exports.checkInUserWithChips = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(checkIn):", error); throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { userId, tableId, seatNumber, amountToPlay } = data;
    if (!userId || typeof userId !== "string" || !tableId || typeof tableId !== "string" || !Number.isInteger(seatNumber) || seatNumber <= 0 || typeof amountToPlay !== "number" || amountToPlay < 0) {
      throw new functions.https.HttpsError("invalid-argument", "入力無効。");
    }
    const userRef = db.collection("users").doc(userId);
    const seatRef = db.collection("tables").doc(tableId).collection("seats").doc(String(seatNumber));
    const tableRefForSession = db.collection("tables").doc(tableId);

    let userDataForSession;
    try {
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const seatDoc = await transaction.get(seatRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `ユーザー(ID:${userId})未発見。`);
        userDataForSession = userDoc.data();
        if (!seatDoc.exists) throw new functions.https.HttpsError("not-found", `テーブル${tableId}座席${seatNumber}未発見。`);
        const seatData = seatDoc.data();
        if (userDataForSession.isCheckedIn) throw new functions.https.HttpsError("failed-precondition", `ユーザー「${userDataForSession.pokerName||userId}」チェックイン済。`);
        if ((userDataForSession.chips||0) < amountToPlay) throw new functions.https.HttpsError("failed-precondition", "保有チップ不足。");
        if (seatData.status === "occupied" && seatData.userId !== null) throw new functions.https.HttpsError("failed-precondition", `座席${tableId}-${seatNumber}使用中。`);

        transaction.update(userRef, {
          chips: admin.firestore.FieldValue.increment(-amountToPlay), chipsInPlay: admin.firestore.FieldValue.increment(amountToPlay),
          isCheckedIn: true, currentTableId: tableId, currentSeatNumber: seatNumber,
          activeGameSessionId: null,
          checkedInAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(seatRef, {
          userId: userId, userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
          status: "occupied", occupiedAt: admin.firestore.FieldValue.serverTimestamp(), currentStack: amountToPlay,
        });
      });

      const tableDoc = await tableRefForSession.get();
      let gameTypePlayed = "Unknown";
      let ratePlayed = null;
      let tableNameForSession = tableId;
      let minBuyInForSession = 0;
      let maxBuyInForSession = 0;


      if (tableDoc.exists) {
        const tableData = tableDoc.data();
        gameTypePlayed = tableData.gameType || "Other";
        ratePlayed = tableData.blindsOrRate || null;
        tableNameForSession = tableData.name || tableId;
        minBuyInForSession = tableData.minBuyIn || 0;
        maxBuyInForSession = tableData.maxBuyIn || 0;
      }

      const gameSessionRef = db.collection("gameSessions").doc();
      await gameSessionRef.set({
        userId: userId,
        userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
        tableId: tableId,
        tableName: tableNameForSession,
        seatNumber: seatNumber,
        gameTypePlayed: gameTypePlayed,
        ratePlayed: ratePlayed,
        sessionStartTime: admin.firestore.FieldValue.serverTimestamp(),
        chipsIn: amountToPlay,
        totalChipsIn: amountToPlay,
        additionalChipsIn: 0,
        sessionEndTime: null,
        chipsOut: null,
        profit: null,
        durationMinutes: null,
        playFeeCalculated: null,
        playFeeAppliedToBill: false,
        minBuyIn: minBuyInForSession,
        maxBuyIn: maxBuyInForSession,
      });
      await userRef.update({ activeGameSessionId: gameSessionRef.id });
      console.log(`ユーザー ${userId} の新しいゲームセッション ${gameSessionRef.id} を開始しました。`);

      console.log(`ユーザー${userId}をテーブル${tableId}座席${seatNumber}に${amountToPlay}チップでチェックイン。`);
      return { status: "success", message: `ユーザーをT${tableId}S${seatNumber}に${amountToPlay.toLocaleString()}チップでチェックインしました。` };
    } catch (error) {
      console.error(`チェックインエラー(ID:${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チェックイン処理中エラー。", error.message);
    }
  });


/**
 * 管理者によるチップ引き出し「提供済み」処理 (チップ移動を伴う)
 */
exports.dispenseApprovedChipsAndMarkAsDelivered = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(dispense):", error); throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { withdrawalRequestId } = data;
    if (!withdrawalRequestId || typeof withdrawalRequestId !== "string") throw new functions.https.HttpsError("invalid-argument", "リクエストID無効。");

    const requestRef = db.collection("withdrawalRequests").doc(withdrawalRequestId);
    let userIdForLog; let amountForLog; let userPokerNameForLog; let userEmailForLog; let tableIdForLog; let seatNumberForLog;

    try {
      await db.runTransaction(async (transaction) => {
        const requestDoc = await transaction.get(requestRef);
        if (!requestDoc.exists) throw new functions.https.HttpsError("not-found", `引出リクエスト(ID:${withdrawalRequestId})未発見。`);
        const requestData = requestDoc.data();
        if (requestData.status !== "approved_preparing") throw new functions.https.HttpsError("failed-precondition", `リクエスト状態不正(現在:${requestData.status})。`);
        if (!requestData.userId || typeof requestData.userId !== "string" || typeof requestData.requestedChipsAmount !== "number" || requestData.requestedChipsAmount <= 0) {
          throw new functions.https.HttpsError("internal", "リクエストデータ無効(ユーザーID/チップ額)。");
        }

        userIdForLog = requestData.userId;
        amountForLog = requestData.requestedChipsAmount;

        const targetUserRef = db.collection("users").doc(requestData.userId);
        const userDoc = await transaction.get(targetUserRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `対象ユーザー(ID:${requestData.userId})未発見。`);
        const userData = userDoc.data();
        userPokerNameForLog = userData.pokerName;
        userEmailForLog = userData.email;
        tableIdForLog = userData.currentTableId;
        seatNumberForLog = userData.currentSeatNumber;

        if ((userData.chips||0) < requestData.requestedChipsAmount) throw new functions.https.HttpsError("failed-precondition", `ユーザー「${userData.pokerName||requestData.userId}」保有チップ(${(userData.chips||0)})不足。`);

        transaction.update(targetUserRef, {
          chips: admin.firestore.FieldValue.increment(-requestData.requestedChipsAmount),
          chipsInPlay: admin.firestore.FieldValue.increment(requestData.requestedChipsAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(requestRef, {
          status: "delivered_awaiting_confirmation", adminDeliveredAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: callerUid, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      const userDocAfterTransaction = await db.collection("users").doc(userIdForLog).get();
      const userDataAfterTransaction = userDocAfterTransaction.data();

      if (userDataAfterTransaction && userDataAfterTransaction.activeGameSessionId) {
        const existingGameSessionRef = db.collection("gameSessions").doc(userDataAfterTransaction.activeGameSessionId);
        await existingGameSessionRef.update({
          additionalChipsIn: admin.firestore.FieldValue.increment(amountForLog),
          totalChipsIn: admin.firestore.FieldValue.increment(amountForLog),
        });
        console.log(`既存ゲームセッション ${userDataAfterTransaction.activeGameSessionId} に ${amountForLog} チップ追加。`);
      } else if (tableIdForLog && seatNumberForLog !== null) {
        const tableDocForSession = await db.collection("tables").doc(tableIdForLog).get();
        let gameTypePlayed = "Unknown";
        let ratePlayed = null;
        let tableNameForSession = tableIdForLog;
        let minBuyInForSession = 0;
        let maxBuyInForSession = 0;


        if (tableDocForSession.exists) {
          const tableDataForSession = tableDocForSession.data();
          gameTypePlayed = tableDataForSession.gameType || "Other";
          ratePlayed = tableDataForSession.blindsOrRate || null;
          tableNameForSession = tableDataForSession.name || tableIdForLog;
          minBuyInForSession = tableDataForSession.minBuyIn || 0;
          maxBuyInForSession = tableDataForSession.maxBuyIn || 0;
        }

        const gameSessionRef = db.collection("gameSessions").doc();
        await gameSessionRef.set({
          userId: userIdForLog,
          userPokerName: userPokerNameForLog || userEmailForLog?.split("@")[0] || "不明",
          tableId: tableIdForLog,
          tableName: tableNameForSession,
          seatNumber: seatNumberForLog,
          gameTypePlayed: gameTypePlayed,
          ratePlayed: ratePlayed,
          sessionStartTime: admin.firestore.FieldValue.serverTimestamp(),
          chipsIn: amountForLog,
          totalChipsIn: amountForLog,
          additionalChipsIn: 0,
          sessionEndTime: null, chipsOut: null, profit: null, durationMinutes: null,
          playFeeCalculated: null, playFeeAppliedToBill: false,
          minBuyIn: minBuyInForSession,
          maxBuyIn: maxBuyInForSession,
        });
        await db.collection("users").doc(userIdForLog).update({ activeGameSessionId: gameSessionRef.id });
        console.log(`ユーザー ${userIdForLog} の新しいゲームセッション ${gameSessionRef.id} をチップ引き出し承認時に開始。`);
      } else {
        console.warn(`ユーザー ${userIdForLog} はテーブルに紐付いていないため、ゲームセッションログは開始されませんでした。(dispenseApprovedChips)`);
      }

      console.log(`チップ引出リクエスト${withdrawalRequestId}を提供済(ユーザー確認待ち)にしチップ移動。`);
      return { status: "success", message: "チップを提供済にしユーザーチップを更新。ユーザー確認待ちです。" };
    } catch (error) {
      console.error(`チップ提供処理エラー(ID:${withdrawalRequestId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ提供処理中エラー。", error.message);
    }
  });

/**
 * 管理者によるチップ精算開始処理
 */
exports.initiateChipSettlementByAdmin = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const callerUid = context.auth.uid;
    let isAdminOrStaff = false;
    try {
      const callerUserRecord = await admin.auth().getUser(callerUid);
      if (callerUserRecord.customClaims?.admin === true || callerUserRecord.customClaims?.staff === true) isAdminOrStaff = true;
    } catch (error) {
      console.error("権限確認エラー(initiateChipSettlementByAdmin):", error);
      throw new functions.https.HttpsError("internal", "権限確認エラー。");
    }
    if (!isAdminOrStaff) throw new functions.https.HttpsError("permission-denied", "権限不足(管理者/スタッフ)。");

    const { userId, tableId, seatNumber, denominationsCount, totalAdminEnteredChips } = data;
    if (!userId || typeof userId !== "string" || !tableId || typeof tableId !== "string" || !Number.isInteger(seatNumber) || seatNumber < 0 || typeof denominationsCount !== "object" || denominationsCount === null || typeof totalAdminEnteredChips !== "number" || totalAdminEnteredChips < 0) {
      throw new functions.https.HttpsError("invalid-argument", "入力データが無効です。");
    }

    const userRef = db.collection("users").doc(userId);
    try {
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `対象ユーザー (ID: ${userId}) が見つかりません。`);
      const userData = userDoc.data();
      if (!userData.isCheckedIn || userData.currentTableId !== tableId || userData.currentSeatNumber !== seatNumber) {
        throw new functions.https.HttpsError("failed-precondition", "ユーザーのチェックイン情報と指定されたテーブル/座席が一致しません。");
      }

      await userRef.update({
        pendingChipSettlement: {
          tableId: tableId, seatNumber: seatNumber,
          adminEnteredTotalChips: totalAdminEnteredChips,
          denominationsCount: denominationsCount,
          initiatedBy: callerUid, initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`ユーザー ${userId} のチップ精算 (${totalAdminEnteredChips}チップ) をユーザー確認待ちに。T:${tableId}, S:${seatNumber}`);
      return { status: "success", message: "チップ精算をユーザー確認待ちに設定しました。" };
    } catch (error) {
      console.error(`チップ精算開始エラー (ID:${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ精算開始処理中エラー。", error.message);
    }
  });

/**
 * ユーザーによるチップ精算確認処理
 * ゲームセッションログの終了記録とプレイ代計算・請求処理を追加
 */
exports.confirmAndFinalizeChipSettlement = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    }
    const userId = context.auth.uid;

    const userRef = db.collection("users").doc(userId);

    try {
      let userDataForLog;
      let settlementInfoForLog;
      let oldTableId = null;
      let oldSeatNumber = null;

      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new functions.https.HttpsError("not-found", "ユーザーデータが見つかりません。");
        }
        userDataForLog = userDoc.data();
        if (!userDataForLog.pendingChipSettlement || typeof userDataForLog.pendingChipSettlement.adminEnteredTotalChips !== "number") {
          throw new functions.https.HttpsError("failed-precondition", "確認待ちのチップ精算情報がありません、または無効です。");
        }

        settlementInfoForLog = userDataForLog.pendingChipSettlement;
        const chipsToAddFromSettlement = settlementInfoForLog.adminEnteredTotalChips;
        oldTableId = settlementInfoForLog.tableId;
        oldSeatNumber = settlementInfoForLog.seatNumber;

        const currentChips = userDataForLog.chips || 0;

        transaction.update(userRef, {
          chips: currentChips + chipsToAddFromSettlement,
          chipsInPlay: 0,
          isCheckedIn: false,
          currentTableId: null,
          currentSeatNumber: null,
          pendingChipSettlement: admin.firestore.FieldValue.delete(),
          checkedOutAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (oldTableId && oldSeatNumber != null && oldSeatNumber >= 0) {
          const seatRef = db.collection("tables").doc(oldTableId).collection("seats").doc(String(oldSeatNumber));
          transaction.update(seatRef, {
            userId: null, userPokerName: null,
            status: "empty", occupiedAt: null, currentStack: 0,
          });
        }
      });

      if (userDataForLog && userDataForLog.activeGameSessionId && settlementInfoForLog) {
        const gameSessionRef = db.collection("gameSessions").doc(userDataForLog.activeGameSessionId);
        const gameSessionDoc = await gameSessionRef.get();

        if (gameSessionDoc.exists) {
          const gameSessionData = gameSessionDoc.data();
          const profit = settlementInfoForLog.adminEnteredTotalChips - gameSessionData.totalChipsIn;

          let durationMinutes = null;
          const sessionEndTimeForCalc = new Date();
          if (gameSessionData.sessionStartTime && gameSessionData.sessionStartTime.toDate) {
            const startTime = gameSessionData.sessionStartTime.toDate();
            durationMinutes = Math.round((sessionEndTimeForCalc.getTime() - startTime.getTime()) / (1000 * 60));
          } else {
            console.warn(`ゲームセッション ${userDataForLog.activeGameSessionId} の開始時刻が無効です。`);
          }

          let playFeeAmount = 0;
          if (durationMinutes !== null && durationMinutes > 0) {
            const gameType = gameSessionData.gameTypePlayed;
            const rateInfo = gameSessionData.ratePlayed;
            const sessionMinBuyIn = gameSessionData.minBuyIn;
            const sessionMaxBuyIn = gameSessionData.maxBuyIn;

            console.log(`Fee calculation context for session ${userDataForLog.activeGameSessionId}: Game Type: ${gameType}, Rate Info: ${rateInfo}, Min Buy-In: ${sessionMinBuyIn}, Max Buy-In: ${sessionMaxBuyIn}`);

            const feePerUnitTime = 500;
            const unitTimeMinutes = 30;
            const freeMinutes = 0;

            if (durationMinutes > freeMinutes) {
              playFeeAmount = Math.ceil((durationMinutes - freeMinutes) / unitTimeMinutes) * feePerUnitTime;
            }

            if (playFeeAmount < 0) playFeeAmount = 0;
          }

          await gameSessionRef.update({
            sessionEndTime: admin.firestore.FieldValue.serverTimestamp(),
            chipsOut: settlementInfoForLog.adminEnteredTotalChips,
            profit: profit,
            durationMinutes: durationMinutes,
            playFeeCalculated: playFeeAmount,
            playFeeAppliedToBill: playFeeAmount > 0,
          });

          if (playFeeAmount > 0) {
            await userRef.update({
              bill: admin.firestore.FieldValue.increment(playFeeAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await userRef.update({ activeGameSessionId: null });
          console.log(`ゲームセッション ${userDataForLog.activeGameSessionId} を終了。ChipsOut: ${settlementInfoForLog.adminEnteredTotalChips}, Profit: ${profit}, プレイ時間: ${durationMinutes}分, プレイ代: ${playFeeAmount}円`);
        } else {
          console.warn(`アクティブなゲームセッション ${userDataForLog.activeGameSessionId} が見つかりませんでした。プレイ代計算およびユーザーのactiveGameSessionIdクリアはスキップされます。`);
          await userRef.update({ activeGameSessionId: null });
        }
      } else {
        console.warn(`ユーザー ${userId} のアクティブなゲームセッションIDが見つからないか、精算情報が不足しています。セッションログ更新とプレイ代計算はスキップされます。`);
      }

      console.log(`ユーザー ${userId} がチップ精算 (テーブル: ${oldTableId}, 座席: ${oldSeatNumber}) を確認・完了しました。`);
      return { status: "success", message: "チップの精算が完了しました。" };
    } catch (error) {
      console.error(`チップ精算確認エラー (ユーザーID: ${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "チップ精算確認処理中にエラー。", error.message);
    }
  });

/**
 * ユーザーによるドリンク注文の最終確定と請求処理
 */
exports.finalizeDrinkOrderAndBill = functions
  .region("asia-northeast1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "認証が必要です。");
    const userId = context.auth.uid;
    const { orderId } = data;

    if (!orderId || typeof orderId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "注文IDが無効です。");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const userRef = db.collection("users").doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        const userDoc = await transaction.get(userRef);

        if (!orderDoc.exists) throw new functions.https.HttpsError("not-found", `注文 (ID: ${orderId}) が見つかりません。`);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `ユーザー (ID: ${userId}) が見つかりません。`);

        const orderData = orderDoc.data();
        const userData = userDoc.data();

        if (orderData.userId !== userId) throw new functions.https.HttpsError("permission-denied", "この注文はあなたのユーザーIDに紐付いていません。");
        if (orderData.orderStatus !== "delivered_awaiting_confirmation") throw new functions.https.HttpsError("failed-precondition", `注文ステータスが「提供済み(ユーザー確認待ち)」ではありません。(現在のステータス: ${orderData.orderStatus})`);

        const currentBill = userData.bill || 0;

        let billIncrementAmount = 0;
        orderData.items.forEach((item) => {
          if (item.itemType === "drink") {
            billIncrementAmount += item.totalItemPrice;
          }
        });

        transaction.update(userRef, {
          bill: currentBill + billIncrementAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(orderRef, {
          orderStatus: "completed",
          customerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(`ユーザー ${userId} の注文 ${orderId} が完了しました。`);
      return { status: "success", message: "注文の受け取りを確定しました。" };
    } catch (error) {
      console.error(`注文確定処理エラー (注文ID: ${orderId}, ユーザーID: ${userId}):`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "注文確定処理中にエラー。", error.message);
    }
  });
