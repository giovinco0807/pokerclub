
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import Input from '../common/Input';
import Button from '../common/Button';
import FileUpload from '../common/FileUpload'; 
import { User } from '../../types';

const UserProfileView: React.FC = () => {
  const { currentUser, updateUserProfileDetails, error, clearError } = useAppContext(); 
  
  const [isEditing, setIsEditing] = useState(false);
  const [editableUser, setEditableUser] = useState<Partial<User>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
        setEditableUser({
            pokerName: currentUser.pokerName || '', // Ensure pokerName is at least an empty string for input control
            fullName: currentUser.fullName || '',
            address: currentUser.address || '',
            idPhotoFileName: currentUser.idPhotoFileName || undefined,
        });
    }
  }, [currentUser, isEditing]); // Rerun if isEditing changes to reset form on cancel


  if (!currentUser) {
    return <p className="text-neutral-lightest">プロフィールを読み込み中...</p>;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableUser({ ...editableUser, [e.target.name]: e.target.value });
  };

  const handleFileSelected = (file: File | null, fileName: string | null) => {
    // In a real app, you'd handle the 'file' object for upload.
    // For this demo, we are just storing the file name.
    setEditableUser({ ...editableUser, idPhotoFileName: fileName || undefined });
  };
  
  const handleSaveChanges = () => {
    if (error) clearError();
    setLocalError(null);
    setFormMessage(null);

    if (!currentUser) return;

    if (isEditing && editableUser.pokerName !== undefined && editableUser.pokerName.trim() === "") {
        setLocalError("ポーカーネームを設定する場合、空にすることはできません。");
        return;
    }
    
    const detailsToUpdate: Partial<Pick<User, 'pokerName' | 'fullName' | 'address' | 'idPhotoFileName'>> = {};

    // Only include fields that have actually changed from the currentUser state or were initially empty and are now set
    if (editableUser.pokerName !== (currentUser.pokerName || '')) detailsToUpdate.pokerName = editableUser.pokerName;
    if (editableUser.fullName !== (currentUser.fullName || '')) detailsToUpdate.fullName = editableUser.fullName;
    if (editableUser.address !== (currentUser.address || '')) detailsToUpdate.address = editableUser.address;
    if (editableUser.idPhotoFileName !== (currentUser.idPhotoFileName || undefined)) detailsToUpdate.idPhotoFileName = editableUser.idPhotoFileName;

    if (Object.keys(detailsToUpdate).length > 0) {
        updateUserProfileDetails(detailsToUpdate);
        setFormMessage("プロフィールが正常に更新されました！");
    } else {
        setFormMessage("プロフィールに変更はありませんでした。");
    }
    setIsEditing(false);
    setTimeout(() => {
        setFormMessage(null);
        setLocalError(null);
    }, 4000);
  };

  const combinedError = localError || error;

  return (
    <div className="bg-neutral p-6 sm:p-8 rounded-lg shadow-xl">
      <h2 className="text-3xl font-bold text-secondary mb-6 font-condensed">マイプロフィール</h2>

      {formMessage && (
        <div className={`p-3 mb-4 rounded-md ${formMessage.includes("エラー") || formMessage.includes("変更はありませんでした") ? 'bg-yellow-200 text-yellow-800' : 'bg-green-600 text-green-100'}`}>
            {formMessage}
        </div>
      )}
      {combinedError && (
        <div className="bg-red-700 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">エラー： </strong>
          <span className="block sm:inline">{combinedError}</span>
           {clearError && <button onClick={() => {clearError(); setLocalError(null);}} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-100 hover:text-white">
            <span className="text-2xl leading-none">&times;</span>
          </button>}
        </div>
      )}

      <div className="space-y-4">
        <Input label="メールアドレス" id="email" value={currentUser.email} readOnly disabled className="bg-neutral-light opacity-70"/>
        
        {isEditing ? (
          <>
            <Input label="ポーカーネーム" id="pokerName" name="pokerName" value={editableUser.pokerName || ''} onChange={handleInputChange} placeholder="あなた固有のポーカーネーム" required/>
            <Input label="氏名（任意）" id="fullName" name="fullName" value={editableUser.fullName || ''} onChange={handleInputChange} placeholder="例：山田太郎"/>
            <Input label="住所（任意）" id="address" name="address" value={editableUser.address || ''} onChange={handleInputChange} placeholder="例：広島市中区..."/>
            <FileUpload 
                label="身分証写真（任意）" 
                onFileSelect={handleFileSelected} 
                accept="image/*" 
            />
            {(editableUser.idPhotoFileName || (currentUser.idPhotoFileName && !editableUser.idPhotoFileName)) && <p className="text-xs text-neutral-light">現在のファイル： {editableUser.idPhotoFileName || currentUser.idPhotoFileName}</p>}
          </>
        ) : (
          <>
            <p><strong className="text-neutral-light">ポーカーネーム：</strong> {currentUser.pokerName || <span className="text-yellow-400 italic">未設定</span>}</p>
            <p><strong className="text-neutral-light">氏名：</strong> {currentUser.fullName || <span className="text-neutral-light italic">未提供</span>}</p>
            <p><strong className="text-neutral-light">住所：</strong> {currentUser.address || <span className="text-neutral-light italic">未提供</span>}</p>
            <p><strong className="text-neutral-light">身分証写真：</strong> {currentUser.idPhotoFileName || <span className="text-neutral-light italic">未アップロード</span>}</p>
          </>
        )}
        
        <p className="mt-6"><strong className="text-neutral-light">保有チップ数：</strong> <span className="text-2xl text-secondary font-bold">{currentUser.chips.toLocaleString()}</span></p>
      </div>

      <div className="mt-8 flex space-x-3">
        {isEditing ? (
          <>
            <Button onClick={handleSaveChanges} variant="primary">変更を保存</Button>
            <Button onClick={() => { setIsEditing(false); setLocalError(null); setFormMessage(null); if(error) clearError(); }} variant="ghost">キャンセル</Button>
          </>
        ) : (
          <Button onClick={() => setIsEditing(true)} variant="secondary">プロフィール編集</Button>
        )}
      </div>
      <p className="text-xs text-neutral-light mt-4">メールアドレスを変更するには、サポートにお問い合わせください。パスワードの変更は通常、別の「パスワード変更」フォームで行います。</p>
    </div>
  );
};

export default UserProfileView;