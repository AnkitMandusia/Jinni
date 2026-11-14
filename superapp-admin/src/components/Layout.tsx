import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Badge, Space } from 'antd';
import { DashboardOutlined, UserOutlined, ShoppingOutlined, CarOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined, ShopOutlined, AppstoreOutlined, UnorderedListOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
const { Header, Sider, Content } = Layout; const { Text } = Typography;
interface AppLayoutProps { children: React.ReactNode; }
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false); const navigate = useNavigate(); const location = useLocation();
  const { user, logout } = useAuthStore(); const role = (user?.role || '').toLowerCase();
  const partner = role.includes('restaurant') || role.includes('store') || role.includes('grocery');
  const base = role.includes('restaurant') ? '/restaurant' : '/store';
  const title = role.includes('restaurant') ? 'Restaurant Partner' : role.includes('store') || role.includes('grocery') ? 'Grocery Store' : 'Super Admin';
  const menuItems = partner ? [
    { key: base, icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: base + '/orders', icon: <ShoppingOutlined />, label: 'Orders' },
    { key: base + '/catalog', icon: <AppstoreOutlined />, label: role.includes('restaurant') ? 'Menu & Categories' : 'Products & Stock' },
    { key: base + '/profile', icon: <SettingOutlined />, label: 'Business Profile' },
  ] : [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/users', icon: <UserOutlined />, label: 'Users & Partners' },
    { key: '/orders', icon: <ShoppingOutlined />, label: 'All Orders' },
    { key: '/delivery', icon: <CarOutlined />, label: 'Delivery Agents' },
  ];
  const selected = menuItems.find(item => item.key === location.pathname)?.key || (partner ? base : '/');
  const userMenuItems = [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true, onClick: () => { logout(); navigate('/login'); } }];
  return <Layout style={{ minHeight: '100vh' }}>
    <Sider collapsible collapsed={collapsed} trigger={null} breakpoint="lg" onBreakpoint={broken => setCollapsed(broken)} width={232} style={{ background: '#111827', boxShadow: '2px 0 12px rgba(0,0,0,.12)' }}>
      <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 0 : '0 22px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ fontSize: 23, color: '#fff' }}>✦</span>{!collapsed && <Text style={{ color: '#fff', fontWeight: 750, fontSize: 16, marginLeft: 11 }}>Jinni <span style={{ color: '#A5B4FC', fontWeight: 500 }}>· {title}</span></Text>}
      </div>
      <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuItems} onClick={({ key }) => navigate(key)} style={{ marginTop: 10, background: 'transparent', border: 0 }} />
    </Sider>
    <Layout>
      <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)', height: 68 }}>
        <button aria-label="Toggle navigation" onClick={() => setCollapsed(!collapsed)} style={{ background: 'none', border: 0, fontSize: 18, cursor: 'pointer', color: '#374151', padding: '6px 8px' }}>{collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}</button>
        <Space size="middle"><Badge count={0}><BellOutlined style={{ fontSize: 18, color: '#6B7280' }} /></Badge><Dropdown menu={{ items: userMenuItems }} placement="bottomRight"><Space style={{ cursor: 'pointer' }}><Avatar size={32} style={{ background: '#4F46E5', fontWeight: 700 }}>{user?.name?.[0]?.toUpperCase() ?? 'J'}</Avatar><Text strong>{user?.name ?? title}</Text></Space></Dropdown></Space>
      </Header>
      <Content style={{ margin: 'clamp(12px, 2.5vw, 28px)', minHeight: 'calc(100vh - 124px)' }}>{children}</Content>
    </Layout>
  </Layout>;
};
export default AppLayout;
