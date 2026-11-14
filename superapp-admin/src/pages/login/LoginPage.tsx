import React, { useState } from 'react';
import { Card, Input, Button, Typography, Alert, Steps, Space } from 'antd';
import { MobileOutlined, SafetyOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
const { Title, Text } = Typography;
const homeForRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  if (value.includes('restaurant')) return '/restaurant';
  if (value.includes('store') || value.includes('grocery')) return '/store';
  return '/';
};
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { sendOTP, verifyOTP, loading, error } = useAuthStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState(''); const [otp, setOtp] = useState(''); const [localError, setLocalError] = useState('');
  const handleSendOTP = async () => {
    setLocalError(''); const cleaned = phone.replace(/\s/g, '');
    if (!cleaned || cleaned.replace(/\D/g, '').length < 10) { setLocalError('Enter a valid phone number'); return; }
    try { await sendOTP(cleaned); setStep('otp'); } catch (e: any) { setLocalError(e.message); }
  };
  const handleVerifyOTP = async () => {
    setLocalError('');
    if (!otp || otp.length < 4) { setLocalError('Enter the OTP'); return; }
    const success = await verifyOTP(phone, otp);
    if (success) navigate(homeForRole(useAuthStore.getState().user?.role));
    else setLocalError(useAuthStore.getState().error || error || 'Invalid OTP or account access denied');
  };
  return <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#111827 0%,#312e81 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <Card style={{ width: '100%', maxWidth: 430, borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }} bodyStyle={{ padding: 36 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>✦</div>
        <Title level={2} style={{ margin: 0 }}>Jinni Partner Portal</Title>
        <Text type="secondary">One secure login for Admin, Restaurant and Grocery Store</Text>
      </div>
      <Steps current={step === 'phone' ? 0 : 1} size="small" style={{ marginBottom: 24 }} items={[{ title: 'Phone', icon: <MobileOutlined /> }, { title: 'OTP', icon: <SafetyOutlined /> }]} />
      {(localError || error) && <Alert message={localError || error} type="error" showIcon style={{ marginBottom: 18 }} />}
      {step === 'phone' ? <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text strong>Registered phone number</Text>
        <Input size="large" prefix={<MobileOutlined />} placeholder="Enter registered phone number" value={phone} onChange={e => setPhone(e.target.value)} onPressEnter={handleSendOTP} maxLength={15} />
        <Button type="primary" size="large" block loading={loading} onClick={handleSendOTP}>Send OTP</Button>
      </Space> : <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text strong>Enter the OTP sent to {phone}</Text>
        <Input size="large" prefix={<LockOutlined />} placeholder="6-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} onPressEnter={handleVerifyOTP} maxLength={6} />
        <Button type="primary" size="large" block loading={loading} onClick={handleVerifyOTP}>Verify & Continue</Button>
        <Button type="link" block onClick={() => { setStep('phone'); setOtp(''); }}>Change phone number</Button>
      </Space>}
      <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 24, fontSize: 12 }}>Your account role determines which dashboard you can access.</Text>
    </Card>
  </div>;
};
export default LoginPage;
