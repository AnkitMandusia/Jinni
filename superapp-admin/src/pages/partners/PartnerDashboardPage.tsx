import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Switch, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined, ShopOutlined, ShoppingOutlined, DollarOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
const { Title, Text } = Typography;
type AnyRow = Record<string, any>;
const money = (v: any) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const listFrom = (v: any, keys: string[] = ['items','orders','products','menu_items']) => {
  if (Array.isArray(v)) return v;
  for (const key of keys) if (Array.isArray(v?.[key])) return v[key];
  return [];
};
export const PartnerDashboardPage: React.FC = () => {
  const location = useLocation(); const { user } = useAuthStore();
  const restaurant = (user?.role || '').toLowerCase().includes('restaurant');
  const base = restaurant ? '/food/partner' : '';
  const section = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const [stats, setStats] = useState<AnyRow>({}); const [profile, setProfile] = useState<AnyRow>({});
  const [orders, setOrders] = useState<AnyRow[]>([]); const [products, setProducts] = useState<AnyRow[]>([]);
  const [categories, setCategories] = useState<AnyRow[]>([]); const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false); const [form] = Form.useForm();
  const title = restaurant ? 'Restaurant' : 'Grocery Store';
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (restaurant) {
        const [dash, business, orderRes] = await Promise.all([
          apiClient.get('/food/partner/dashboard'), apiClient.get('/food/partner/restaurant'),
          apiClient.get('/food/partner/orders', { params: { page_size: 50 } }),
        ]);
        setStats(dash || {}); setProfile(business || {}); setOrders(listFrom(orderRes, ['orders','items']));
        if (section === 'catalog') {
          const [cats, menu] = await Promise.all([apiClient.get('/food/partner/categories'), apiClient.get('/food/partner/categories')]);
          setCategories(listFrom(cats)); setProducts(listFrom(cats).flatMap((category: AnyRow) => (category.items || []).map((item: AnyRow) => ({ ...item, category_name: category.name }))));
        }
      } else {
        const [dash, business, orderRes] = await Promise.all([
          apiClient.get('/store/dashboard'), apiClient.get('/store/profile'), apiClient.get('/orders/my-orders', { params: { page_size: 50 } }),
        ]);
        setStats(dash || {}); setProfile(business || {}); setOrders(listFrom(orderRes, ['orders','items']));
        if (section === 'catalog') {
          const [cats, catalog] = await Promise.all([apiClient.get('/grocery/categories'), apiClient.get('/grocery/store/products')]);
          setCategories(listFrom(cats)); setProducts([...listFrom(catalog, ['universal']), ...listFrom(catalog, ['custom'])]);
        }
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Could not load dashboard data. Check your account permissions and API availability.');
    } finally { setLoading(false); }
  }, [restaurant, section]);
  useEffect(() => { fetchData(); }, [fetchData]);
  const act = async (fn: () => Promise<any>, success: string) => { try { await fn(); message.success(success); fetchData(); } catch (e: any) { message.error(e?.response?.data?.detail || 'Action failed'); } };
  const orderAction = async (order: AnyRow, action: string) => {
    if (restaurant) return act(() => apiClient.post(`/food/partner/orders/${order.id}/status`, null, { params: { new_status: action } }), 'Order updated');
    if (action === 'accept') return act(() => apiClient.post(`/orders/${order.id}/accept`), 'Order accepted');
    if (action === 'decline') return act(() => apiClient.post(`/orders/${order.id}/decline`, { reason: 'Declined by store' }), 'Order declined');
    return act(() => apiClient.patch(`/orders/${order.id}/status`, { status: action }), 'Order status updated');
  };
  const toggleAvailability = (item: AnyRow, available: boolean) => {
    if (restaurant) return act(() => apiClient.post(`/food/partner/menu-items/${item.id}/availability`, { is_available: available }), 'Menu availability updated');
    const id = item.product_id || item.id;
    const url = item.product_id ? `/grocery/store/products/${id}/toggle` : `/grocery/store/custom-products/${id}/toggle`;
    return act(() => apiClient.post(url, { is_available: available }), 'Product availability updated');
  };
  const statCards = useMemo(() => restaurant ? [
    { title: "Today's orders", value: stats.today_orders || 0, icon: <ShoppingOutlined /> },
    { title: "Today's revenue", value: money(stats.today_revenue), icon: <DollarOutlined /> },
    { title: 'Pending orders', value: stats.pending_orders || 0, icon: <ClockCircleOutlined /> },
    { title: 'Live menu items', value: stats.active_menu_items || 0, icon: <ShopOutlined /> },
  ] : [
    { title: "Today's orders", value: stats.today_orders || stats.orders_today || 0, icon: <ShoppingOutlined /> },
    { title: "Today's revenue", value: money(stats.today_revenue || stats.revenue_today || stats.total_revenue), icon: <DollarOutlined /> },
    { title: 'Pending orders', value: stats.pending_orders || 0, icon: <ClockCircleOutlined /> },
    { title: 'Products listed', value: stats.total_products || stats.products_count || 0, icon: <ShopOutlined /> },
  ], [restaurant, stats]);
  const orderColumns = [
    { title: 'Order', dataIndex: 'order_number', key: 'order', render: (v: any, r: AnyRow) => <Space direction="vertical" size={0}><Text strong>#{v || r.id?.slice?.(0,8)}</Text><Text type="secondary" style={{fontSize:11}}>{r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—'}</Text></Space> },
    { title: 'Items', dataIndex: 'items', key: 'items', render: (items: AnyRow[] = []) => <Text>{items.map(i => `${i.name || i.product_name || 'Item'} × ${i.quantity || 1}`).join(', ') || '—'}</Text> },
    { title: 'Amount', dataIndex: 'total_amount', key: 'amount', render: money },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'delivered' ? 'green' : v === 'cancelled' || v === 'rejected' ? 'red' : 'blue'}>{(v || 'pending').replace(/_/g,' ')}</Tag> },
    { title: 'Actions', key: 'actions', render: (_: any, row: AnyRow) => {
      if (['delivered','cancelled','rejected'].includes(row.status)) return <Text type="secondary">Completed</Text>;
      if (row.status === 'pending_dispatch') return <Space wrap><Button size="small" type="primary" onClick={() => orderAction(row, restaurant ? 'store_accepted' : 'accept')}>Accept</Button><Button size="small" danger onClick={() => orderAction(row, restaurant ? 'rejected' : 'decline')}>Decline</Button></Space>;
      return <Text type="secondary">In progress · status updates are managed in the order workflow</Text>;
    }},
  ];
  const productColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string, r: AnyRow) => <Space direction="vertical" size={0}><Text strong>{v}</Text><Text type="secondary" style={{fontSize:11}}>{r.unit || r.category_name || ''}</Text></Space> },
    { title: 'Price', dataIndex: 'price', key: 'price', render: money },
    { title: 'Stock', dataIndex: 'stock_quantity', key: 'stock', render: (v: any) => v ?? '—' },
    { title: 'Availability', dataIndex: 'is_available', key: 'available', render: (v: boolean, row: AnyRow) => <Switch checked={!!v} onChange={value => toggleAvailability(row, value)} /> },
  ];
  const addProduct = async (values: AnyRow) => {
    await act(() => restaurant
      ? apiClient.post('/food/partner/menu-items', values)
      : apiClient.post('/grocery/store/custom-products', { ...values, unit: values.unit || 'piece', stock_quantity: values.stock_quantity || 0, image_url: null }), 'Item added');
    setModalOpen(false); form.resetFields();
  };
  const saveProfile = async (values: AnyRow) => act(() => restaurant
    ? apiClient.patch('/food/partner/restaurant', values)
    : apiClient.patch('/store/profile', values), 'Business profile saved');
  const toggleRestaurant = (key: 'is_open' | 'is_accepting_orders', value: boolean) => act(() => apiClient.post(key === 'is_open' ? '/food/partner/toggle-open' : '/food/partner/toggle-accepting', null, { params: { [key]: value } }), 'Restaurant status updated');
  const toggleStore = (value: boolean) => act(() => apiClient.patch('/store/profile', { is_open: value }), 'Store status updated');
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap',marginBottom:22}}>
      <div><Title level={3} style={{margin:0}}>{section === 'orders' ? 'Orders' : section === 'catalog' ? (restaurant ? 'Menu & Categories' : 'Products & Stock') : section === 'profile' ? 'Business Profile' : 'Dashboard'}</Title><Text type="secondary">{profile.name || user?.name || title} · Jinni Partner Portal</Text></div>
      <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
    </div>
    {section === 'dashboard' && <>
      <Row gutter={[14,14]}>{statCards.map(s => <Col xs={12} xl={6} key={s.title}><Card><Statistic title={s.title} value={s.value} prefix={s.icon} /></Card></Col>)}</Row>
      <Card style={{marginTop:16}} title="Business availability">
        {restaurant ? <Space size="large" wrap><Space><Switch checked={!!stats.is_open} onChange={v => toggleRestaurant('is_open',v)} /><Text>Restaurant {stats.is_open ? 'open' : 'closed'}</Text></Space><Space><Switch checked={!!stats.is_accepting_orders} onChange={v => toggleRestaurant('is_accepting_orders',v)} /><Text>Accepting orders</Text></Space></Space> : <Space><Switch checked={!!profile.is_open} onChange={toggleStore} /><Text>Store {profile.is_open ? 'open' : 'closed'}</Text></Space>}
      </Card>
      <Card style={{marginTop:16}} title="Latest orders"><Table rowKey="id" loading={loading} columns={orderColumns} dataSource={orders.slice(0,8)} pagination={false} scroll={{x:700}} /></Card>
    </>}
    {section === 'orders' && <Card><Table rowKey="id" loading={loading} columns={orderColumns} dataSource={orders} pagination={{pageSize:10}} scroll={{x:800}} locale={{emptyText:<Empty description="No orders to show yet" />}} /></Card>}
    {section === 'catalog' && <Card title={restaurant ? 'Menu items' : 'Product catalogue'} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add {restaurant ? 'menu item' : 'product'}</Button>}>
      {!restaurant && <Alert type="info" showIcon message="Universal and store-added products are shown together. Availability changes are saved to your store." style={{marginBottom:16}} />}
      <Table rowKey={r => r.id || r.product_id} loading={loading} columns={productColumns} dataSource={products} pagination={{pageSize:10}} scroll={{x:650}} />
      {restaurant && <div style={{marginTop:18}}><Title level={5}>Menu categories</Title><Space wrap>{categories.map(c => <Tag key={c.id}>{c.name}</Tag>)}</Space></div>}
    </Card>}
    {section === 'profile' && <Card title="Business details"><Form layout="vertical" initialValues={profile} key={JSON.stringify(profile)} onFinish={saveProfile}>
      <Row gutter={16}>{restaurant ? <>
        <Col xs={24} md={12}><Form.Item name="name" label="Restaurant name"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="description" label="Description"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="address_line1" label="Address"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="address_line2" label="Address line 2"><Input /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="pincode" label="PIN code"><Input maxLength={6} /></Form.Item></Col>
      </> : <>
        <Col xs={24} md={12}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="pincode" label="PIN code"><Input maxLength={6} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="delivery_radius_km" label="Delivery radius (km)"><InputNumber min={1} max={50} style={{width:'100%'}} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="gstin" label="GSTIN"><Input /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item name="fssai" label="FSSAI licence"><Input /></Form.Item></Col>
      </>}</Row>
      <Button type="primary" htmlType="submit">Save profile</Button>
    </Form></Card>}
    <Modal title={restaurant ? 'Add menu item' : 'Add custom product'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="Save item">
      <Form form={form} layout="vertical" onFinish={addProduct}><Form.Item name="name" label="Name" rules={[{required:true}]}><Input /></Form.Item><Form.Item name="category_id" label="Category" rules={[{required:true}]}><Select options={categories.map(c => ({label:c.name,value:c.id}))} /></Form.Item><Row gutter={12}><Col span={12}><Form.Item name="price" label="Price (₹)" rules={[{required:true}]}><InputNumber min={0} style={{width:'100%'}} /></Form.Item></Col><Col span={12}><Form.Item name="stock_quantity" label="Stock"><InputNumber min={0} style={{width:'100%'}} /></Form.Item></Col></Row><Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item></Form>
    </Modal>
  </div>;
};
export default PartnerDashboardPage;
