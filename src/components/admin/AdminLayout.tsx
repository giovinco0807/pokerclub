// src/components/admin/AdminLayout.tsx
import React, { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-lightest">
      {/* ナビゲーションやヘッダーなど、共通のレイアウト要素 */}
      <header className="bg-neutral-800 p-4 shadow-md">
        <h1 className="text-xl font-bold">管理画面</h1>
      </header>
      <main className="p-6">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;