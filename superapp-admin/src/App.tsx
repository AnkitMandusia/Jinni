import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/Layout';
import { LoginPage } from './pages/login/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { UsersPage } from './pages/users/UsersPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { DeliveryAgentsPage } from './pages/delivery/DeliveryAgentsPage';
import { PartnerDashboardPage } from './pages/partners/PartnerDashboardPage';

const roleHome = (role?: string) => {
  const value = (role || '').toLowerCase();
  if (value.includes('restaurant')) return '/restaurant';
  if (value.includes('store') || value.includes('grocery')) return '/store';
  return '/';
};

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { token, user } = useAuthStore();
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  const role = (user?.role || '').toLowerCase();
  if (roles && !roles.some((allowed) => role === allowed || role.includes(allowed))) {
    return <Navigate to={roleHome(role)} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
};

const AppRoutes: React.FC = () => {
  const { init, token, user } = useAuthStore();
  useEffect(() => { init(); }, [init]);
  const home = roleHome(user?.role);

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to={home} replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute roles={['admin']}><DashboardPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><DashboardPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute roles={['admin']}><OrdersPage /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute roles={['admin']}><DeliveryAgentsPage /></ProtectedRoute>} />
      <Route path="/restaurant/*" element={<ProtectedRoute roles={['restaurant']}><PartnerDashboardPage /></ProtectedRoute>} />
      <Route path="/store/*" element={<ProtectedRoute roles={['store', 'grocery']}><PartnerDashboardPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <ConfigProvider theme={{
    token: { colorPrimary: '#4F46E5', borderRadius: 8, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    components: { Table: { borderRadius: 0 }, Card: { borderRadius: 16 }, Button: { borderRadius: 8 }, Input: { borderRadius: 8 }, Select: { borderRadius: 8 }, Tag: { borderRadius: 6 } },
  }}>
    <AntApp><BrowserRouter><AppRoutes /></BrowserRouter></AntApp>
  </ConfigProvider>
);
export default App;
