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
    if (user.email === "giovinco.080807@gmail.com") { // ★★★管理者のメールアドレスに変更★★★
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
    const tableRefForSession = db.collection("tables").doc(tableId); // ★ テーブル情報取得用

    let userDataForSession; // セッションログ用にユーザーデータを保持
    try {
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const seatDoc = await transaction.get(seatRef);
        if (!userDoc.exists) throw new functions.https.HttpsError("not-found", `ユーザー(ID:${userId})未発見。`);
        userDataForSession = userDoc.data(); // userDataForSession に代入
        if (!seatDoc.exists) throw new functions.https.HttpsError("not-found", `テーブル${tableId}座席${seatNumber}未発見。`);
        const seatData = seatDoc.data();
        if (userDataForSession.isCheckedIn) throw new functions.https.HttpsError("failed-precondition", `ユーザー「${userDataForSession.pokerName||userId}」チェックイン済。`);
        if ((userDataForSession.chips||0) < amountToPlay) throw new functions.https.HttpsError("failed-precondition", "保有チップ不足。");
        if (seatData.status === "occupied" && seatData.userId !== null) throw new functions.https.HttpsError("failed-precondition", `座席${tableId}-${seatNumber}使用中。`);

        transaction.update(userRef, {
          chips: admin.firestore.FieldValue.increment(-amountToPlay), chipsInPlay: admin.firestore.FieldValue.increment(amountToPlay),
          isCheckedIn: true, currentTableId: tableId, currentSeatNumber: seatNumber,
          activeGameSessionId: null, // 新しいセッションIDを記録する前にクリア
          checkedInAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(seatRef, {
          userId: userId, userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
          status: "occupied", occupiedAt: admin.firestore.FieldValue.serverTimestamp(), currentStack: amountToPlay,
        });
      });

      // ★★★ ゲームセッションの記録を開始 ★★★
      const tableDoc = await tableRefForSession.get();
      let gameTypePlayed = "Unknown";
      let ratePlayed = null;
      let tableNameForSession = tableId;
      let minBuyInForSession = 0;
      let maxBuyInForSession = 0;


      if (tableDoc.exists) {
        const tableData = tableDoc.data();
        gameTypePlayed = tableData.gameType || "Other"; // types.tsのGameName型を想定
        ratePlayed = tableData.blindsOrRate || null; //
        tableNameForSession = tableData.name || tableId; //
        minBuyInForSession = tableData.minBuyIn || 0;
        maxBuyInForSession = tableData.maxBuyIn || 0;
      }

      const gameSessionRef = db.collection("gameSessions").doc(); // 新しいIDを生成
      await gameSessionRef.set({
        userId: userId,
        userPokerName: userDataForSession.pokerName || userDataForSession.email?.split("@")[0] || "不明",
        tableId: tableId,
        tableName: tableNameForSession,
        seatNumber: seatNumber,
        gameTypePlayed: gameTypePlayed,
        ratePlayed: ratePlayed,
        sessionStartTime: admin.firestore.FieldValue.serverTimestamp(), // チェックイン時刻とほぼ同じ
        chipsIn: amountToPlay,
        totalChipsIn: amountToPlay,
        additionalChipsIn: 0,
        sessionEndTime: null,
        chipsOut: null,
        profit: null,
        durationMinutes: null,
        playFeeCalculated: null,
        playFeeAppliedToBill: false,
        minBuyIn: minBuyInForSession, // セッション開始時のバイインを記録
        maxBuyIn: maxBuyInForSession, // セッション開始時のバイインを記録
        // seasonId: getCurrentSeasonId(), // 必要に応じて現在のシーズンIDを取得するロジック
      });
      await userRef.update({ activeGameSessionId: gameSessionRef.id }); // ユーザーにアクティブなセッションIDを記録
      console.log(`ユーザー ${userId} の新しいゲームセッション ${gameSessionRef.id} を開始しました。`);
      // ★★★ ここまでゲームセッション記録 ★★★

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
 * (この関数は、ユーザーが事前にチップ引き出しリクエストを出し、管理者がそれを承認・準備し、
 * 実際にチップを渡すタイミングで呼ばれることを想定)
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
        tableIdForLog = userData.currentTableId; // ★ ユーザーが現在座っているテーブルIDを取得
        seatNumberForLog = userData.currentSeatNumber; // ★ ユーザーが現在座っている座席番号を取得

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

      // ★★★ ゲームセッションの記録を開始 (ユーザーが既にテーブルに着席している前提) ★★★
      // この引き出しが「新規着席」ではなく「プレイ中の追加チップ」である場合、
      // 既存の activeGameSessionId を使ってそのセッションの additionalChipsIn と totalChipsIn を更新する。
      // もしこれが「新規着席」のチップ移動も兼ねる場合は、checkInUserWithChips と同様のロジックが必要。
      // ここでは「新規着席」または「最初のチップ持ち込み」とみなし、新しいセッションを開始する。
      // ただし、ユーザーが既に isCheckedIn: true で activeGameSessionId を持っている場合は、そのセッションに追加する。

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
        // 新規セッションとして記録 (ユーザーがこの操作で初めてチップをテーブルに持ち込む場合)
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
      // ★★★ ここまでゲームセッション記録 ★★★

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
      let userDataForLog; // トランザクション外でセッションログ更新に使うため
      let settlementInfoForLog;
      let oldTableId = null;
      let oldSeatNumber = null;

      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new functions.https.HttpsError("not-found", "ユーザーデータが見つかりません。");
        }
        userDataForLog = userDoc.data(); // userDataForLog に代入
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
          // activeGameSessionId はこのトランザクションの後、セッションログ更新後にクリア
        });

        if (oldTableId && oldSeatNumber != null && oldSeatNumber >= 0) {
          const seatRef = db.collection("tables").doc(oldTableId).collection("seats").doc(String(oldSeatNumber));
          transaction.update(seatRef, {
            userId: null, userPokerName: null,
            status: "empty", occupiedAt: null, currentStack: 0,
          });
        }
      });

      // ★★★ ゲームセッションログの更新とプレイ代計算 ★★★
      if (userDataForLog && userDataForLog.activeGameSessionId && settlementInfoForLog) {
        const gameSessionRef = db.collection("gameSessions").doc(userDataForLog.activeGameSessionId);
        const gameSessionDoc = await gameSessionRef.get(); // トランザクション外で読み取り

        if (gameSessionDoc.exists) {
          const gameSessionData = gameSessionDoc.data();
          // totalChipsInには、最初のchipsInと、もしあればadditionalChipsInの合計が入っている想定
          const profit = settlementInfoForLog.adminEnteredTotalChips - gameSessionData.totalChipsIn;

          let durationMinutes = null;
          const sessionEndTimeForCalc = new Date(); // 現在時刻を終了時刻として計算に使用
          if (gameSessionData.sessionStartTime && gameSessionData.sessionStartTime.toDate) {
            const startTime = gameSessionData.sessionStartTime.toDate();
            durationMinutes = Math.round((sessionEndTimeForCalc.getTime() - startTime.getTime()) / (1000 * 60));
          } else {
            console.warn(`ゲームセッション ${userDataForLog.activeGameSessionId} の開始時刻が無効です。`);
          }

          let playFeeAmount = 0;
          if (durationMinutes !== null && durationMinutes > 0) {
            // --- ここにプレイ代計算ロジックを実装 ---
            // 例: 30分単位で課金、最初のN分は無料、ゲームタイプやレートで変動など
            // GameSessionのデータを使って料金を計算する
            const gameType = gameSessionData.gameTypePlayed;
            const rateInfo = gameSessionData.ratePlayed;
            const sessionMinBuyIn = gameSessionData.minBuyIn;
            const sessionMaxBuyIn = gameSessionData.maxBuyIn;

            // Log these values for future complex fee calculation logic
            console.log(`Fee calculation context for session ${userDataForLog.activeGameSessionId}: Game Type: ${gameType}, Rate Info: ${rateInfo}, Min Buy-In: ${sessionMinBuyIn}, Max Buy-In: ${sessionMaxBuyIn}`);

            // 例: 単純な時間課金 (30分ごとに500円)
            const feePerUnitTime = 500; // 単位時間あたりの料金
            const unitTimeMinutes = 30; // 単位時間(分)
            const freeMinutes = 0; // 無料時間(分)

            if (durationMinutes > freeMinutes) {
              playFeeAmount = Math.ceil((durationMinutes - freeMinutes) / unitTimeMinutes) * feePerUnitTime;
            }
            // ゲームタイプやレートに応じた複雑な料金設定はここに追記
            // if (gameType === "NLH" && rateInfo === "100/200") {
            //   // 別の料金体系
            // }

            if (playFeeAmount < 0) playFeeAmount = 0; // 念のため
            // --- プレイ代計算ロジックここまで ---
          }

          await gameSessionRef.update({
            sessionEndTime: admin.firestore.FieldValue.serverTimestamp(), // Firestoreのタイムスタンプで更新
            chipsOut: settlementInfoForLog.adminEnteredTotalChips,
            profit: profit,
            durationMinutes: durationMinutes,
            playFeeCalculated: playFeeAmount,
            playFeeAppliedToBill: playFeeAmount > 0,
          });

          if (playFeeAmount > 0) {
            await userRef.update({ // トランザクション外だが、billへの加算は最終処理
              bill: admin.firestore.FieldValue.increment(playFeeAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          // ユーザーのアクティブセッションIDをクリア
          await userRef.update({ activeGameSessionId: null });
          console.log(`ゲームセッション ${userDataForLog.activeGameSessionId} を終了。ChipsOut: ${settlementInfoForLog.adminEnteredTotalChips}, Profit: ${profit}, プレイ時間: ${durationMinutes}分, プレイ代: ${playFeeAmount}円`);
        } else {
          console.warn(`アクティブなゲームセッション ${userDataForLog.activeGameSessionId} が見つかりませんでした。プレイ代計算およびユーザーのactiveGameSessionIdクリアはスキップされます。`);
          // この場合でもユーザーのactiveGameSessionIdはクリアすべきか検討
          await userRef.update({ activeGameSessionId: null });
        }
      } else {
        console.warn(`ユーザー ${userId} のアクティブなゲームセッションIDが見つからないか、精算情報が不足しています。セッションログ更新とプレイ代計算はスキップされます。`);
      }
      // ★★★ ここまでゲームセッションログ更新とプレイ代計算 ★★★

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

        // totalOrderPrice 変数は使用されていないため削除しました。
        const currentBill = userData.bill || 0;

        // ドリンク注文の場合はbillに加算し、チップ購入は既にpurchaseChipsで処理されているので、ここで再加算しない
        let billIncrementAmount = 0;
        orderData.items.forEach((item) => {
          if (item.itemType === "drink") {
            billIncrementAmount += item.totalItemPrice;
          }
        });

        // 支払い残高に加算 (ドリンク分のみ)
        transaction.update(userRef, {
          bill: currentBill + billIncrementAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 注文ステータスを「完了」に更新
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
