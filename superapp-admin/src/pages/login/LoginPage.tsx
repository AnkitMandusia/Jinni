import React, { useState } from 'react';
import { Card, Input, Button, Typography, Alert, Steps, Space } from 'antd';
import { MobileOutlined, SafetyOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const { Title, Text } = Typography;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { sendOTP, verifyOTP, loading, error } = useAuthStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSendOTP = async () => {
    setLocalError('');
    const cleaned = phone.replace(/\s/g, '');
    if (!cleaned || cleaned.length < 10) {
      setLocalError('Enter a valid 10-digit phone number');
      return;
    }
    try {
      await sendOTP(cleaned);
      setStep('otp');
    } catch (e: any) {
      setLocalError(e.message);
    }
  };

  const handleVerifyOTP = async () => {
    setLocalError('');
    if (!otp || otp.length < 4) {
      setLocalError('Enter the OTP');
      return;
    }
    const success = await verifyOTP(phone, otp);
    if (success) {
      navigate('/');
    } else {
      setLocalError(error ?? 'Invalid OTP or access denied');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: 'none',
        }}
        bodyStyle={{ padding: '40px 36px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
          <Title level={2} style={{ margin: 0, color: '#111827' }}>Admin Portal</Title>
          <Text type="secondary">SuperApp Management Console</Text>
        </div>

        <Steps
          current={step === 'phone' ? 0 : 1}
          size="small"
          style={{ marginBottom: 28 }}
          items={[
            { title: 'Phone', icon: <MobileOutlined /> },
            { title: 'OTP', icon: <SafetyOutlined /> },
          ]}
        />

        {(localError || error) && (
          <Alert
            message={localError || error}
            type="error"
            showIcon
            style={{ marginBottom: 20, borderRadius: 10 }}
          />
        )}

        {step === 'phone' ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                Phone Number
              </Text>
              <Input
                prefix={<MobileOutlined style={{ color: '#9CA3AF' }} />}
                size="large"
                placeholder="Enter admin phone number"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onPressEnter={handleSendOTP}
                style={{ borderRadius: 10 }}
                maxLength={15}
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleSendOTP}
              style={{
                borderRadius: 10,
                height: 48,
                fontWeight: 700,
                fontSize: 15,
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                border: 'none',
              }}
            >
              Send OTP
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text style={{ fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                OTP sent to {phone}
              </Text>
              <Input
                prefix={<LockOutlined style={{ color: '#9CA3AF' }} />}
                size="large"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onPressEnter={handleVerifyOTP}
                style={{ borderRadius: 10, letterSpacing: 4, fontSize: 20 }}
                maxLength={6}
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleVerifyOTP}
              style={{
                borderRadius: 10,
                height: 48,
                fontWeight: 700,
                fontSize: 15,
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                border: 'none',
              }}
            >
              Verify & Login
            </Button>
            <Button
              type="text"
              block
              onClick={() => { setStep('phone'); setOtp(''); }}
              style={{ color: '#6B7280' }}
            >
              Change phone number
            </Button>
          </Space>
        )}

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Only approved admin accounts can login
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
