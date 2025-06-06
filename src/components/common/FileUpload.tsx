// src/components/common/FileUpload.tsx

import React, { useState, useRef } from 'react';
import Button from './Button';

// ★★★ export を追加 ★★★
export interface FileUploadProps {
  label: string;
  onFileSelect: (file: File | null, fileName: string | null) => void;
  accept?: string;
  id?: string;
  // currentFileName?: string | null; // 既存のファイル名を表示する場合に追加 (任意)
}

const FileUpload: React.FC<FileUploadProps> = ({ label, onFileSelect, accept, id = "file-upload" /*, currentFileName */ }) => {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      setSelectedFileName(file.name);
      onFileSelect(file, file.name);
    } else {
      setSelectedFileName(null);
      onFileSelect(null, null);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-medium text-neutral-lightest mb-1">
        {label}
      </label>
      <div className="mt-1 flex items-center">
        <Button type="button" variant="ghost" size="sm" onClick={handleButtonClick}>
          ファイルを選択
        </Button>
        <input
          id={id}
          name={id}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          ref={fileInputRef}
          className="sr-only" // Hidden, triggered by button
        />
        {selectedFileName && (
          <span className="ml-3 text-sm text-neutral-light truncate max-w-xs">
            {selectedFileName}
          </span>
        )}
        {/* {currentFileName && !selectedFileName && ( // 既存のファイル名を表示する例
          <span className="ml-3 text-sm text-slate-500 truncate max-w-xs">
            現在のファイル: {currentFileName}
          </span>
        )} */}
      </div>
      {!selectedFileName && /* !currentFileName && */ <p className="text-xs text-neutral-light mt-1">ファイルが選択されていません。</p>}
    </div>
  );
};

export default FileUpload;