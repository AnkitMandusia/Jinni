import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Drawer, Button } from 'antd';
import { DashboardOutlined, UserOutlined, ShoppingOutlined, CarOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, AppstoreOutlined, SettingOutlined, MenuOutlined, HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
const { Header, Sider, Content } = Layout;
const { Text } = Typography;
interface AppLayoutProps { children: React.ReactNode; }

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const role = (user?.role || '').toLowerCase();
  const restaurant = role.includes('restaurant');
  const partner = restaurant || role === 'store' || role.includes('grocery');
  const base = restaurant ? '/restaurant' : '/store';
  const title = restaurant ? 'Restaurant Partner' : partner ? 'Grocery Store' : 'Super Admin';
  const menuItems = partner ? [
    { key: base, icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: base + '/orders', icon: <ShoppingOutlined />, label: 'Orders' },
    { key: base + '/catalog', icon: <AppstoreOutlined />, label: restaurant ? 'Menu & Categories' : 'Products & Stock' },
    { key: base + '/profile', icon: <SettingOutlined />, label: 'Business Profile' },
  ] : [
    { key: '/admin', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/users', icon: <UserOutlined />, label: 'Users & Partners' },
    { key: '/orders', icon: <ShoppingOutlined />, label: 'All Orders' },
    { key: '/delivery', icon: <CarOutlined />, label: 'Delivery Agents' },
    { key: '/rides', icon: <ThunderboltOutlined />, label: 'Rides' },
  ];
  const selected = menuItems.find(item => location.pathname === item.key || location.pathname.startsWith(item.key + '/'))?.key || (partner ? base : '/admin');
  const go = (key: string) => { navigate(key); setMobileOpen(false); };
  const navMenu = <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuItems} onClick={({ key }) => go(key)} style={{ marginTop: 10, background: 'transparent', border: 0 }} />;
  const userMenuItems = [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true, onClick: async () => { await logout(); navigate('/login', { replace: true }); } }];

  return <Layout className="portal-layout" style={{ minHeight: '100vh' }}>
    <Sider className="portal-sider desktop-sider" collapsible collapsed={collapsed} trigger={null} breakpoint="lg" onBreakpoint={broken => setCollapsed(broken)} width={244} style={{ background: '#101828', boxShadow: '2px 0 12px rgba(0,0,0,.12)' }}>
      <div className="portal-brand">
        <span className="portal-brand-mark">j</span>
        {!collapsed && <span>jinni<span style={{ color: '#A5B4FC' }}>.</span><small>{title}</small></span>}
      </div>
      {navMenu}
      {!collapsed && <div className="portal-sider-foot">Food · Grocery · Local business</div>}
    </Sider>
    <Drawer className="portal-mobile-drawer" title={<span className="portal-brand-inline"><span className="portal-brand-mark">j</span> Jinni · {title}</span>} placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={280} styles={{ body: { background: '#101828', padding: '8px 0' } }}>
      {navMenu}
    </Drawer>
    <Layout>
      <Header className="portal-header">
        <div className="portal-header-left">
          <Button className="desktop-collapse" type="text" aria-label="Toggle navigation" onClick={() => setCollapsed(!collapsed)} icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} />
          <Button className="mobile-nav-trigger" type="text" aria-label="Open navigation" onClick={() => setMobileOpen(true)} icon={<MenuOutlined />} />
          <div className="portal-breadcrumb"><HomeOutlined /> <span>{title}</span></div>
        </div>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space className="portal-user-menu" style={{ cursor: 'pointer' }}>
            <Avatar size={34} style={{ background: '#4F46E5', fontWeight: 700 }}>{user?.name?.[0]?.toUpperCase() ?? 'J'}</Avatar>
            <span className="portal-user-copy"><Text strong>{user?.name || user?.email || title}</Text><small>{user?.email || user?.phone}</small></span>
          </Space>
        </Dropdown>
      </Header>
      <Content className="portal-content">{children}</Content>
    </Layout>
  </Layout>;
};
export default AppLayout;
