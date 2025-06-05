// src/pages/AdminWaitingListPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import WaitingListManagementPanel from '../components/admin/WaitingListManagementPanel';
import AdminLayout from '../components/admin/AdminLayout';
import { useAppContext } from '../contexts/AppContext';
import { Container, Typography, Box, Button } from '@mui/material'; // MUIコンポーネントをインポート

const AdminWaitingListPage: React.FC = () => {
  const { currentUser, loading: appContextLoading } = useAppContext();

  if (appContextLoading) {
    return <AdminLayout><Container maxWidth="lg" sx={{ mt: 4 }}><Typography className="text-center text-xl text-neutral-lightest">アプリ情報読込中...</Typography></Container></AdminLayout>;
  }
  if (!currentUser?.isAdmin && !currentUser?.firestoreData?.isStaff) {
    return (
      <AdminLayout>
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          <Typography color="error" className="text-center text-red-500">
            このページへのアクセス権限がありません。
          </Typography>
        </Container>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Container maxWidth="lg" sx={{ mt: 4, color: 'neutral.lightest' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, pb: 2, borderBottom: 1, borderColor: 'slate.700' }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', color: 'sky.400' }}>
            ウェイティングリスト管理
          </Typography>
          <Button component={Link} to="/admin" sx={{ color: 'red.400', '&:hover': { textDecoration: 'underline' } }}>
            ← 管理ダッシュボードへ戻る
          </Button>
        </Box>
        <WaitingListManagementPanel />
      </Container>
    </AdminLayout>
  );
};

export default AdminWaitingListPage;