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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuthStore();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <AppLayout>{children}</AppLayout>;
};

const AppRoutes: React.FC = () => {
  const { init, token } = useAuthStore();

  useEffect(() => { init(); }, [init]);

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery"
        element={
          <ProtectedRoute>
            <DeliveryAgentsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: '#4F46E5',
        borderRadius: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      components: {
        Table: { borderRadius: 0 },
        Card: { borderRadius: 16 },
        Button: { borderRadius: 8 },
        Input: { borderRadius: 8 },
        Select: { borderRadius: 8 },
        Tag: { borderRadius: 6 },
      },
    }}
  >
    <AntApp>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AntApp>
  </ConfigProvider>
);

export default App;
