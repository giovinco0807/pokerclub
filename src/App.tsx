// src/App.tsx
import React, { JSX, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './contexts/AppContext';

// Page Components
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainPage from './pages/MainPage';
import OrderPage from './pages/OrderPage';
import QRCodePage from './pages/QRCodePage';
import CheckinPage from './pages/CheckinPage';
import TableStatusPage from './pages/TableStatusPage'; // ユーザー向け卓状況ページ
// ★★★ AdminChipOptionsPage のインポート ★★★
import AdminChipOptionsPage from './pages/AdminChipOptionsPage'; 

// Admin Page Components
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUserManagementPage from './pages/AdminUserManagementPage';
import AdminDrinkMenuPage from './pages/AdminDrinkMenuPage';
import AdminTableManagementPage from './pages/AdminTableManagementPage';
import AdminOrderManagementPage from './pages/AdminOrderManagementPage';
// import AdminPrivilegePage from './pages/AdminPrivilegePage'; // もし権限管理を別ページにするなら

// Common Components
import Navbar from './components/common/Navbar'; // パスを確認
import AdminAnnouncementsPage from './pages/AdminAnnouncementsPage';

const App: React.FC = () => {
  const { isAuthenticated, currentUser } = useAppContext();
  const [isStaffMode, setIsStaffMode] = useState(false); // スタッフモードのstate

  const isUserAdmin = currentUser?.isAdmin === true;
  // スタッフ権限はカスタムクレームまたはFirestoreのisStaffで判定
  const isUserStaff = currentUser?.isStaffClaim === true || currentUser?.firestoreData?.isStaff === true || isUserAdmin; // 管理者はスタッフでもある

  const handleToggleStaffMode = () => {
    if (isUserStaff) { // スタッフ以上なら誰でもトグルできる例
      setIsStaffMode(!isStaffMode);
    }
  };

  // AdminDashboardPage に移譲したので、ここでは不要かも
  const handleToggleAdminMode = () => {};


  // AdminRouteガードコンポーネント
  const AdminRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (!isAuthenticated || !currentUser) return <Navigate to="/login" />;
    if (!isUserAdmin) return <Navigate to="/" />; // 管理者でなければメインページへ
    return children;
  };

  // StaffOrAdminRouteガードコンポーネント (チェックインページ用など)
  const StaffOrAdminRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (!isAuthenticated || !currentUser) return <Navigate to="/login" />;
    if (!isUserAdmin && !isUserStaff) return <Navigate to="/" />; // 管理者でもスタッフでもなければメインページへ
    return children;
  };

  // AuthenticatedRouteガードコンポーネント
  const AuthenticatedRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (!isAuthenticated || !currentUser) return <Navigate to="/login" />;
    return children;
  };


  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-neutral-dark text-neutral-lightest">
        {isAuthenticated && currentUser && (
          <Navbar
            appName="Hiroshima Poker Club"
            isStaffMode={isStaffMode && isUserStaff} // スタッフ権限があり、かつスタッフモードONの場合
            isAdmin={isUserAdmin} // currentUser.isAdmin を直接渡す
            onToggleStaffMode={handleToggleStaffMode}
            // onToggleAdminMode={handleToggleAdminMode} // Navbarからは不要に
          />
        )}
        <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
            <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" />} />

            {/* Authenticated Routes (一般ユーザー、スタッフ、管理者共通) */}
            <Route path="/" element={<AuthenticatedRoute><MainPage isStaffMode={isStaffMode && isUserStaff} /></AuthenticatedRoute>} />
            <Route path="/order" element={<AuthenticatedRoute><OrderPage /></AuthenticatedRoute>} />
            <Route path="/qr" element={<AuthenticatedRoute><QRCodePage /></AuthenticatedRoute>} />
            <Route path="/tables" element={<AuthenticatedRoute><TableStatusPage /></AuthenticatedRoute>} />

            {/* Staff or Admin Routes */}
            <Route path="/checkin" element={<StaffOrAdminRoute><CheckinPage /></StaffOrAdminRoute>} />

            {/* Admin Only Routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUserManagementPage /></AdminRoute>} />
            <Route path="/admin/drinks" element={<AdminRoute><AdminDrinkMenuPage /></AdminRoute>} />
            <Route path="/admin/tables" element={<AdminRoute><AdminTableManagementPage /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrderManagementPage /></AdminRoute>} />
            {/* <Route path="/admin/privileges" element={<AdminRoute><AdminPrivilegePage /></AdminRoute>} /> */}
            <Route
              path="/admin/announcements"
              element={<AdminRoute><AdminAnnouncementsPage /></AdminRoute>}
            />
            {/* ★★★ AdminChipOptionsPage へのルート定義 ★★★ */}
            <Route
              path="/admin/chip-options"
              element={<AdminRoute><AdminChipOptionsPage /></AdminRoute>}
            />

            {/* Catch All - Redirect to home or login */}
            <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} />} />
          </Routes>
        </main>
        <footer className="text-center p-4 text-sm text-neutral-light">
          © {new Date().getFullYear()} Hiroshima Poker Club.
        </footer>
      </div>
    </HashRouter>
  );
};

export default App;