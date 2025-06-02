
import React, { useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import Button from '../common/Button';
import Input from '../common/Input';
import { User, Attendance } from '../../types'; // Added Attendance type for setAttendance

const StaffAttendancePanel: React.FC = () => {
  // Fix: Destructure setAttendance from useAppContext to allow direct update of attendance state
  const { checkIn, checkOut, updateUserChips, attendance, currentUser, setAttendance } = useAppContext();
  const [scannedQrData, setScannedQrData] = useState<string>('');
  const [parsedUserData, setParsedUserData] = useState<{ userId: string; email: string; pokerName: string } | null>(null);
  const [chipsAmount, setChipsAmount] = useState<number>(0);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // This is a MOCK for QR scan. In a real app, you'd use a QR scanner library.
  const handleSimulateScan = () => {
    setErrorMessage('');
    setActionMessage('');
    if (!scannedQrData) {
      setErrorMessage("スキャンをシミュレートするためのQRデータを入力してください。");
      return;
    }
    try {
      const data = JSON.parse(scannedQrData);
      if (data.userId && data.email && data.pokerName) {
        setParsedUserData(data);
        // Check if this scanned user matches the currently logged-in user in the context (for this demo)
        // In a real multi-user staff app, staff would search/select user, not rely on AppContext's currentUser.
        if (currentUser && currentUser.id === data.userId) {
             setActionMessage(`ユーザー「${data.pokerName}」を識別しました。現在のステータス：${attendance.isCheckedIn ? 'チェックイン中' : 'チェックアウト済'}`);
        } else {
            // For this demo, we assume staff is managing the *currently logged in* user.
            // A real staff app would look up the user by ID from a database.
            setErrorMessage(`スキャンされたユーザー「${data.pokerName}」はアクティブなデモユーザーと一致しません。このパネルはデモ目的でログイン中のユーザーの状態を制御します。`);
            setParsedUserData(null); // Clear if not matching current demo user
        }
      } else {
        setErrorMessage("無効なQRデータ形式です。");
        setParsedUserData(null);
      }
    } catch (e) {
      setErrorMessage("QRデータの解析に失敗しました。有効なJSON形式であることを確認してください。");
      setParsedUserData(null);
    }
  };

  const handleCheckIn = () => {
    setErrorMessage('');
    setActionMessage('');
    if (!parsedUserData || !currentUser || currentUser.id !== parsedUserData.userId) {
      setErrorMessage("まずQRスキャンでユーザーを識別するか、アクティブなデモユーザーであることを確認してください。");
      return;
    }
    if (chipsAmount <= 0) {
      setErrorMessage("プレイ用に引き出す有効なチップ量を入力してください。");
      return;
    }
    if (attendance.isCheckedIn) {
        setErrorMessage(`ユーザー「${parsedUserData.pokerName}」は既にチェックイン済みです。`);
        return;
    }
    checkIn(chipsAmount);
    setActionMessage(`ユーザー「${parsedUserData.pokerName}」が ${chipsAmount} チップでチェックインしました。`);
    setChipsAmount(0);
    // setParsedUserData(null); // Keep user data for potential immediate checkout
  };

  const handleCheckOut = () => {
    setErrorMessage('');
    setActionMessage('');
    if (!parsedUserData || !currentUser || currentUser.id !== parsedUserData.userId) {
      setErrorMessage("まずQRスキャンでユーザーを識別するか、アクティブなデモユーザーであることを確認してください。");
      return;
    }
     if (!attendance.isCheckedIn) {
        setErrorMessage(`ユーザー「${parsedUserData.pokerName}」はチェックインしていません。`);
        return;
    }
    
    const chipsReturned = attendance.chipsAtTable; // Store before checkOut resets it
    checkOut();
    setActionMessage(`ユーザー「${parsedUserData.pokerName}」がチェックアウトしました。テーブルのチップ (${chipsReturned}) が残高に戻されました。`);
    setChipsAmount(0);
    // setParsedUserData(null); 
  };
  
  const handleAddChipsToTable = () => {
    setErrorMessage('');
    setActionMessage('');
    if (!parsedUserData || !currentUser || currentUser.id !== parsedUserData.userId) {
      setErrorMessage("まずQRスキャンでユーザーを識別するか、アクティブなデモユーザーであることを確認してください。");
      return;
    }
    if (!attendance.isCheckedIn) {
        setErrorMessage("テーブルにチップを追加するには、ユーザーがチェックインしている必要があります。");
        return;
    }
    if (chipsAmount <= 0) {
      setErrorMessage("追加する有効なチップ量を入力してください。");
      return;
    }
    if (currentUser.chips < chipsAmount) {
        setErrorMessage("ユーザーのメイン残高に十分なチップがありません。");
        return;
    }
    updateUserChips(chipsAmount, 'subtract'); // From main balance
    // Need to update attendance.chipsAtTable in context. This is missing from AppContext.
    // Let's assume a direct update for now. A proper AppContext function would be better.
    // For demo, this illustrates the need for such a function.
    // This operation should be in AppContext:
    // context.addChipsToTable(chipsAmount); which would do:
    //   updateUserChips(chipsAmount, 'subtract');
    //   setAttendance(prev => ({...prev, chipsAtTable: prev.chipsAtTable + chipsAmount}));
    // For now, this requires a new function in AppContext. Let's simulate adding to chipsAtTable
    setAttendance(prev => ({...prev, chipsAtTable: prev.chipsAtTable + chipsAmount})); // This needs to be done in AppContext for persistence.
    setActionMessage(`${chipsAmount} チップが「${parsedUserData.pokerName}」さんのテーブルに追加されました。`);
    setChipsAmount(0);
  };


  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl">
      <h3 className="text-xl font-semibold text-secondary mb-4">入退店・チップ管理</h3>
      
      {actionMessage && <p className="text-green-400 bg-green-800 bg-opacity-40 p-2 rounded mb-3">{actionMessage}</p>}
      {errorMessage && <p className="text-red-400 bg-red-800 bg-opacity-40 p-2 rounded mb-3">{errorMessage}</p>}

      <div className="space-y-4">
        <div>
          <Input 
            label="QRスキャンデータ入力 (JSON)" 
            value={scannedQrData} 
            onChange={(e) => setScannedQrData(e.target.value)}
            placeholder='{"userId":"...", "email":"...", "pokerName":"..."}'
          />
          <Button onClick={handleSimulateScan} className="mt-2">QRからユーザーを識別</Button>
        </div>

        {parsedUserData && currentUser && currentUser.id === parsedUserData.userId && (
          <div className="p-4 border border-neutral-light rounded-md bg-neutral-dark bg-opacity-30">
            <p className="text-lg font-semibold text-neutral-lightest">ユーザー： {parsedUserData.pokerName}</p>
            <p className="text-sm text-neutral-light">メール： {parsedUserData.email}</p>
            <p className="text-sm text-neutral-light">ステータス： <span className={attendance.isCheckedIn ? "text-green-400" : "text-red-400"}>{attendance.isCheckedIn ? `チェックイン中 (テーブルのチップ: ${attendance.chipsAtTable})` : 'チェックアウト済'}</span></p>
            <p className="text-sm text-neutral-light">メイン残高： {currentUser.chips} チップ</p>

            <div className="mt-4 space-y-3">
              <Input 
                label="チップ量（チェックイン / テーブル追加用）" 
                type="number" 
                value={chipsAmount.toString()} 
                onChange={(e) => setChipsAmount(parseInt(e.target.value, 10) || 0)}
                min="0"
              />
              <div className="flex flex-wrap gap-2">
                {!attendance.isCheckedIn && (
                    <Button onClick={handleCheckIn} variant="primary" disabled={chipsAmount <=0}>チェックイン</Button>
                )}
                {attendance.isCheckedIn && (
                    <Button onClick={handleCheckOut} variant="danger">チェックアウト</Button>
                )}
                 {attendance.isCheckedIn && (
                    <Button onClick={handleAddChipsToTable} variant="secondary" disabled={chipsAmount <=0}>テーブルにチップ追加</Button>
                )}
              </div>
            </div>
          </div>
        )}
        {!parsedUserData && scannedQrData && <p className="text-neutral-light">「QRからユーザーを識別」をクリックするか、QRデータがアクティブなデモユーザーのものであることを確認してください。</p>}
         <p className="text-xs text-neutral-light mt-4">注意：このデモでは、スタッフのアクションは、QRデータが「スキャン」された場合、現在ログインしているユーザーに適用されます。実際のシステムでは、任意のユーザーを管理します。</p>
      </div>
    </div>
  );
};

export default StaffAttendancePanel;
