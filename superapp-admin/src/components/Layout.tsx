import React, { useEffect, useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Drawer, Button } from 'antd';
import { BankOutlined, WalletOutlined, ShopOutlined, TagsOutlined, DashboardOutlined, UserOutlined, ShoppingOutlined, CarOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, AppstoreOutlined, SettingOutlined, MenuOutlined, HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getSosCount } from '../api/admin';
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
  const [sos, setSos] = useState(0);
  const isAdmin = role === 'admin' || role === 'super_admin';
  useEffect(() => { // an emergency must be visible on EVERY page, not just the Rides one
    if (!isAdmin) return;
    const load = () => getSosCount().then((r: any) => setSos(r.open || 0)).catch(() => undefined);
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [isAdmin]);
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
    { key: '/admin', icon: <DashboardOutlined />, label: 'Overview' },
    { key: '/orders', icon: <ShoppingOutlined />, label: 'Orders' },
    { key: '/finance', icon: <BankOutlined />, label: 'Finance' },
    { key: '/payments', icon: <WalletOutlined />, label: 'Payment records' },
    { key: '/restaurants', icon: <ShopOutlined />, label: 'Restaurants' },
    { key: '/stores', icon: <AppstoreOutlined />, label: 'Stores' },
    { key: '/products', icon: <TagsOutlined />, label: 'Grocery Products' },
    { key: '/rides', icon: <ThunderboltOutlined />, label: 'Rides' },
    { key: '/delivery', icon: <CarOutlined />, label: 'Delivery Agents' },
    { key: '/users', icon: <UserOutlined />, label: 'Users & Partners' },
  ];
  const selected = menuItems.find(item => location.pathname === item.key || location.pathname.startsWith(item.key + '/'))?.key || (partner ? base : '/admin');
  const go = (key: string) => { navigate(key); setMobileOpen(false); };
  const navMenu = <Menu theme="dark" mode="inline" selectedKeys={[selected]} items={menuItems} onClick={({ key }) => go(key)} style={{ marginTop: 10, background: 'transparent', border: 0 }} />;
  const userMenuItems = [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true, onClick: async () => { await logout(); navigate('/login', { replace: true }); } }];

  return <Layout className="portal-layout" style={{ minHeight: '100vh' }}>
    <Sider className="portal-sider desktop-sider" collapsible collapsed={collapsed} trigger={null} breakpoint="lg" onBreakpoint={broken => setCollapsed(broken)} width={244} style={{ boxShadow: '2px 0 12px rgba(26,12,53,.18)' }}>
      <div className="portal-brand">
        <span className="portal-brand-mark">j</span>
        {!collapsed && <span>jinni<span style={{ color: '#F3DD96' }}>.</span><small>{title}</small></span>}
      </div>
      {navMenu}
      {!collapsed && <div className="portal-sider-foot">Food · Grocery · Local business</div>}
    </Sider>
    <Drawer className="portal-mobile-drawer" title={<span className="portal-brand-inline"><span className="portal-brand-mark">j</span> Jinni · {title}</span>} placement="left" open={mobileOpen} onClose={() => setMobileOpen(false)} width={280} styles={{ body: { background: '#2A1354', padding: '8px 0' } }}>
      {navMenu}
    </Drawer>
    <Layout>
      <Header className="portal-header">
        <div className="portal-header-left">
          <Button className="desktop-collapse" type="text" aria-label="Toggle navigation" onClick={() => setCollapsed(!collapsed)} icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} />
          <Button className="mobile-nav-trigger" type="text" aria-label="Open navigation" onClick={() => setMobileOpen(true)} icon={<MenuOutlined />} />
          <div className="portal-breadcrumb"><HomeOutlined /> <span>{title}</span></div>
        </div>
        {sos > 0 && <Button danger type="primary" onClick={() => navigate('/rides?tab=sos')} style={{ fontWeight: 700 }}>🚨 {sos} SOS</Button>}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space className="portal-user-menu" style={{ cursor: 'pointer' }}>
            <Avatar size={34} style={{ background: 'linear-gradient(135deg,#7E4FD1,#5E2FB8)', fontWeight: 700 }}>{user?.name?.[0]?.toUpperCase() ?? 'J'}</Avatar>
            <span className="portal-user-copy"><Text strong>{user?.name || user?.email || title}</Text><small>{user?.email || user?.phone}</small></span>
          </Space>
        </Dropdown>
      </Header>
      <Content className="portal-content">{children}</Content>
    </Layout>
  </Layout>;
};
export default AppLayout;
