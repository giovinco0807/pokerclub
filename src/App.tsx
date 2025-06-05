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
import TableStatusPage from './pages/TableStatusPage';
import AdminChipOptionsPage from './pages/AdminChipOptionsPage';
import UserProfilePage from './pages/UserProfilePage';
// ★★★ WaitingListsPage のインポートを追加 ★★★
import WaitingListsPage from './pages/WaitingListsPage';

// Admin Page Components
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUserManagementPage from './pages/AdminUserManagementPage';
// ... (他のAdminページのインポートは変更なし)
import AdminWaitingListPage from './pages/AdminWaitingListPage';


// Common Components
import Navbar from './components/common/Navbar';
import AdminAnnouncementsPage from './pages/AdminAnnouncementsPage';
import AdminGameTemplatesPage from './pages/AdminGameTemplatesPage';
import AdminDrinkMenuPage from './pages/AdminDrinkMenuPage';
import AdminTableManagementPage from './pages/AdminTableManagementPage';
import AdminOrderManagementPage from './pages/AdminOrderManagementPage';


const App: React.FC = () => {
  const { isAuthenticated, currentUser } = useAppContext();
  const [isStaffMode, setIsStaffMode] = useState(false);

  const isUserAdmin = currentUser?.isAdmin === true;
  const isUserStaff = currentUser?.isStaffClaim === true || currentUser?.firestoreData?.isStaff === true || isUserAdmin;

  const handleToggleStaffMode = () => {
    if (isUserStaff) {
      setIsStaffMode(!isStaffMode);
    }
  };

  const AdminRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (!isAuthenticated || !currentUser) return <Navigate to="/login" />;
    if (!isUserAdmin && !isUserStaff) return <Navigate to="/" />;
    return children;
  };

  const StaffOrAdminRoute: React.FC<{ children: JSX.Element }> = ({ children }) => {
    if (!isAuthenticated || !currentUser) return <Navigate to="/login" />;
    if (!isUserAdmin && !isUserStaff) return <Navigate to="/" />;
    return children;
  };

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
            isStaffMode={isStaffMode && isUserStaff}
            isAdmin={isUserAdmin}
            onToggleStaffMode={handleToggleStaffMode}
          />
        )}
        <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
            <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" />} />

            {/* Authenticated Routes */}
            <Route path="/" element={<AuthenticatedRoute><MainPage isStaffMode={isStaffMode && isUserStaff} /></AuthenticatedRoute>} />
            <Route path="/order" element={<AuthenticatedRoute><OrderPage /></AuthenticatedRoute>} />
            <Route path="/qr" element={<AuthenticatedRoute><QRCodePage /></AuthenticatedRoute>} />
            <Route path="/tables" element={<AuthenticatedRoute><TableStatusPage /></AuthenticatedRoute>} />
            <Route path="/profile" element={<AuthenticatedRoute><UserProfilePage /></AuthenticatedRoute>} />
            {/* ★★★ WaitingListsPage へのルートを追加 ★★★ */}
            <Route path="/waiting-lists" element={<AuthenticatedRoute><WaitingListsPage /></AuthenticatedRoute>} />


            {/* Staff or Admin Routes */}
            <Route path="/checkin" element={<StaffOrAdminRoute><CheckinPage /></StaffOrAdminRoute>} />

            {/* Admin Only Routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUserManagementPage /></AdminRoute>} />
            <Route path="/admin/drinks" element={<AdminRoute><AdminDrinkMenuPage /></AdminRoute>} />
            <Route path="/admin/tables" element={<AdminRoute><AdminTableManagementPage /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrderManagementPage /></AdminRoute>} />
            <Route path="/admin/announcements" element={<AdminRoute><AdminAnnouncementsPage /></AdminRoute>} />
            <Route path="/admin/chip-options" element={<AdminRoute><AdminChipOptionsPage /></AdminRoute>} />
            <Route path="/admin/game-templates" element={<AdminRoute><AdminGameTemplatesPage /></AdminRoute>} />
            <Route path="/admin/waiting-list" element={<AdminRoute><AdminWaitingListPage /></AdminRoute>} />


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