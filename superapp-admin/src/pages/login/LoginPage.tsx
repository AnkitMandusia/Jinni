import React, { useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography } from 'antd';
import { LockOutlined, MailOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { API_CONFIGURED } from '../../api/client';

const { Title, Text } = Typography;

const homeForRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  if (value.includes('restaurant')) return '/restaurant';
  if (value.includes('store') || value.includes('grocery')) return '/store';
  return '/admin';
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithPassword, loading, error, clearError } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    clearError();
    if (!identifier.trim()) return;
    if (!password) return;
    const success = await loginWithPassword(identifier.trim(), password);
    if (success) {
      const currentUser = useAuthStore.getState().user;
      navigate(currentUser?.status === 'active' ? homeForRole(currentUser.role) : '/account-status', { replace: true });
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: 20, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 15% 10%, #eef2ff 0, #f8fafc 42%, #f1f5f9 100%)' }}>
      <Card bordered={false} style={{ width: '100%', maxWidth: 430, borderRadius: 22, boxShadow: '0 22px 70px rgba(15,23,42,.12)' }} bodyStyle={{ padding: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 14px', borderRadius: 18, display: 'grid', placeItems: 'center', background: '#d9ef73', color: '#20241d', fontSize: 32, fontWeight: 800 }}>j</div>
          <Title level={2} style={{ margin: 0, letterSpacing: -1 }}>Welcome back</Title>
          <Text type="secondary">Sign in with the same Jinni account you use in the mobile app.</Text>
        </div>

        {!API_CONFIGURED && <Alert type="error" showIcon style={{ marginBottom: 18 }} message="Backend API URL is not configured" description="Add VITE_API_URL to the Jinni Vercel project. Use your deployed FastAPI origin without /api/v1 or a trailing slash, then redeploy." />}
        {error && <Alert type="error" showIcon style={{ marginBottom: 18 }} message={error} />}

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 7 }}>Email or phone number</Text>
            <Input
              size="large"
              autoComplete="username"
              prefix={<MailOutlined />}
              placeholder="you@example.com or 9876543210"
              value={identifier}
              onChange={event => setIdentifier(event.target.value)}
              onPressEnter={submit}
              disabled={!API_CONFIGURED || loading}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 7 }}>Password</Text>
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined />}
              iconRender={visible => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />}
              placeholder="Enter your password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              onPressEnter={submit}
              disabled={!API_CONFIGURED || loading}
            />
          </div>
          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            disabled={!API_CONFIGURED || !identifier.trim() || !password}
            onClick={submit}
            style={{ height: 48, borderRadius: 10, fontWeight: 700, marginTop: 5 }}
          >
            Sign in
          </Button>
        </Space>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Your existing account role decides which portal opens: Admin, Restaurant or Grocery Store.</Text>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
