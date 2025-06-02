
import React from 'react';
// import { useAppContext } from '../../contexts/AppContext'; // For saving settings

const SystemSettingsPanel: React.FC = () => {
  // const { settings, updateSettings } = useAppContext(); // Example context usage

  return (
    <div className="bg-neutral p-6 rounded-lg shadow-xl">
      <h3 className="text-xl font-semibold text-red-400 mb-4">システム設定</h3>
      <p className="text-neutral-light">
        このパネルでは、アプリケーション全体の動作に関わる重要な設定を管理します。
      </p>
      <p className="text-neutral-light mt-2">
        想定される設定項目：
      </p>
      <ul className="list-disc list-inside text-neutral-light text-sm space-y-1 mt-1">
        <li>基本プレイ料金（時間あたりのレート）の変更</li>
        <li>メニューアイテム（ドリンク、チップ購入オプション）の追加、編集、削除、価格変更</li>
        <li>プロモーションやイベント設定（特別料金期間、ボーナスチップなど）</li>
        <li>支払い方法の設定（対応する決済ゲートウェイなど）</li>
        <li>通知設定（ユーザーへの自動通知テンプレートなど）</li>
        <li>APIキー管理（Gemini APIキーなど、安全な方法で）</li>
        <li>利用規約やプライバシーポリシーの更新インターフェース</li>
      </ul>
       <p className="text-neutral-light mt-4">
        これらの設定変更はアプリケーション全体に影響を与えるため、慎重な操作が必要です。
        現在はプレースホルダーです。
      </p>
      {/* Example: Input for hourly rate */}
      {/*
      <div className="mt-4 space-y-2">
        <label htmlFor="hourlyRate" className="block text-sm font-medium text-neutral-lightest">
          時間料金 (円/時間):
        </label>
        <Input type="number" id="hourlyRate" name="hourlyRate" defaultValue={1000} className="max-w-xs"/>
        <Button variant="primary" size="sm">料金を更新</Button>
      </div>
      */}
    </div>
  );
};

export default SystemSettingsPanel;