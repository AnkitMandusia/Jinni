import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin, Result, Button } from 'antd';
import { useAuthStore } from './store/authStore';
import { AppLayout } from './components/Layout';
import { LoginPage } from './pages/login/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { UsersPage } from './pages/users/UsersPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { DeliveryAgentsPage } from './pages/delivery/DeliveryAgentsPage';
import { RidesPage } from './pages/rides/RidesPage';
import { PartnerDashboardPage } from './pages/partners/PartnerDashboardPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { RestaurantsPage } from './pages/restaurants/RestaurantsPage';
import { ProductListPage as ProductList } from './pages/grocery/ProductList';
import { StoresPage } from './pages/stores/StoresPage';
import { FinancePage } from './pages/finance/FinancePage';

const roleHome = (role?: string) => {
  const value = (role || '').toLowerCase();
  if (value.includes('restaurant')) return '/restaurant';
  if (value === 'store' || value.includes('grocery')) return '/store';
  return '/admin';
};

const AccountStatusPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  return <Result status="403" title="Your account is not active yet"
    subTitle={`Current account status: ${user?.status || 'unknown'}. Access is available when the Jinni team activates your account.`}
    extra={<Button type="primary" onClick={() => void logout()}>Sign out</Button>} />;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { token, user, initialized } = useAuthStore();
  const location = useLocation();
  if (!initialized) return <div className="app-loading"><Spin size="large" /></div>;
  if (!token || !user) return <Navigate to="/login" state={{ from: location }} replace />;
  const role = (user.role || '').toLowerCase();
  if (user.status !== 'active') return <Navigate to="/account-status" replace />;
  if (roles && !roles.some(allowed => role === allowed || role.includes(allowed))) return <Navigate to={roleHome(role)} replace />;
  return <AppLayout>{children}</AppLayout>;
};

const AppRoutes: React.FC = () => {
  const { init, token, user, initialized } = useAuthStore();
  useEffect(() => { void init(); }, [init]);
  const home = roleHome(user?.role);
  if (!initialized) return <div className="app-loading"><Spin size="large" /></div>;
  return <Routes>
    <Route path="/login" element={token && user ? <Navigate to={user.status === 'active' ? home : '/account-status'} replace /> : <LoginPage />} />
    <Route path="/account-status" element={token && user ? <AccountStatusPage /> : <Navigate to="/login" replace />} />
    <Route path="/" element={<ProtectedRoute roles={['admin','super_admin']}><DashboardPage /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute roles={['admin','super_admin']}><DashboardPage /></ProtectedRoute>} />
    <Route path="/users" element={<ProtectedRoute roles={['admin','super_admin']}><UsersPage /></ProtectedRoute>} />
    <Route path="/orders" element={<ProtectedRoute roles={['admin','super_admin']}><OrdersPage /></ProtectedRoute>} />
    <Route path="/stores" element={<ProtectedRoute roles={['admin','super_admin']}><StoresPage /></ProtectedRoute>} />
    <Route path="/finance" element={<ProtectedRoute roles={['admin','super_admin']}><FinancePage /></ProtectedRoute>} />
    <Route path="/payments" element={<ProtectedRoute roles={['admin','super_admin']}><PaymentsPage /></ProtectedRoute>} />
    <Route path="/restaurants" element={<ProtectedRoute roles={['admin','super_admin']}><RestaurantsPage /></ProtectedRoute>} />
    <Route path="/products" element={<ProtectedRoute roles={['admin','super_admin']}><ProductList /></ProtectedRoute>} />
    <Route path="/rides" element={<ProtectedRoute roles={['admin','super_admin']}><RidesPage /></ProtectedRoute>} />
    <Route path="/delivery" element={<ProtectedRoute roles={['admin','super_admin']}><DeliveryAgentsPage /></ProtectedRoute>} />
    <Route path="/restaurant/*" element={<ProtectedRoute roles={['restaurant']}><PartnerDashboardPage /></ProtectedRoute>} />
    <Route path="/store/*" element={<ProtectedRoute roles={['store','grocery']}><PartnerDashboardPage /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to={token && user ? home : '/login'} replace />} />
  </Routes>;
};

const App: React.FC = () => <ConfigProvider theme={{
  token: { colorPrimary: '#5E2FB8', colorInfo: '#5E2FB8', colorLink: '#5E2FB8', borderRadius: 10, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  components: { Table: { borderRadius: 0 }, Card: { borderRadius: 16 }, Button: { borderRadius: 8 }, Input: { borderRadius: 8 }, Select: { borderRadius: 8 }, Tag: { borderRadius: 6 } },
}}>
  <AntApp><BrowserRouter><AppRoutes /></BrowserRouter></AntApp>
</ConfigProvider>;
export default App;
