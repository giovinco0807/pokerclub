// src/components/common/Breadcrumbs.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface Breadcrumb {
  path: string;
  name: string;
}

// パスと表示名のマッピング (実際のパス構成に合わせて調整)
const breadcrumbNameMap: { [key: string]: string } = {
  '/': 'ホーム',
  '/qr': 'マイQRコード',
  '/checkin': 'チェックイン',
  '/admin': '管理コンソール', // AdminConsoleViewのパスが /admin の場合
  // 他のパスも必要に応じて追加
  // 例: '/events': 'イベント', '/events/detail': 'イベント詳細' (動的パスは別途処理が必要)
};

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x); // パスを分割し、空の要素を除去

  // ホームへのパンくずは常に表示
  const crumbs: Breadcrumb[] = [{ path: '/', name: breadcrumbNameMap['/'] || 'ホーム' }];

  let currentPath = '';
  pathnames.forEach((name, index) => {
    currentPath += `/${name}`;
    const breadcrumbName = breadcrumbNameMap[currentPath];
    if (breadcrumbName) {
      // 最後の要素はリンクにしない場合もあるが、今回は全てリンクにする
      crumbs.push({ path: currentPath, name: breadcrumbName });
    } else if (name) {
      // マップにないがパスが存在する場合、パス名をそのまま表示 (動的ルートなど)
      // ここはアプリの要件に合わせて調整 (例: IDの部分を「詳細」と表示するなど)
      const displayName = name.charAt(0).toUpperCase() + name.slice(1); // 先頭大文字化
      crumbs.push({ path: currentPath, name: displayName });
    }
  });

  // 現在のパスがホーム("/")のみの場合は、ホームのパンくずだけを表示
  if (location.pathname === '/') {
    return (
        <nav aria-label="breadcrumb" className="mb-4 text-sm text-slate-400">
            <ol className="list-none p-0 inline-flex">
                <li className="flex items-center">
                    <span className="text-red-400 font-semibold">{breadcrumbNameMap['/'] || 'ホーム'}</span>
                </li>
            </ol>
        </nav>
    );
  }


  return (
    <nav aria-label="breadcrumb" className="mb-4 text-sm text-slate-400">
      <ol className="list-none p-0 inline-flex">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center">
              {index > 0 && <span className="mx-2">/</span>} {/* 区切り文字 */}
              {isLast ? (
                <span className="text-red-400 font-semibold">{crumb.name}</span> // 現在のページは強調
              ) : (
                <Link to={crumb.path} className="hover:text-red-300 hover:underline">
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;