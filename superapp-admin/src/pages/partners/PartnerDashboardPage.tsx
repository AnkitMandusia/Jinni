import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Divider, Empty, Form, Input, InputNumber,
  Modal, Row, Segmented, Select, Space, Spin, Statistic, Switch, Table, Tag, Typography, message,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, ShopOutlined, ShoppingOutlined, DollarOutlined,
  ClockCircleOutlined, EnvironmentOutlined, EditOutlined, DeleteOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, InboxOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const { Title, Text, Paragraph } = Typography;
type RowData = Record<string, any>;
const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const isTerminal = (status: string) => ['delivered', 'cancelled', 'rejected', 'no_store_available'].includes(status);
const normalList = (value: any, keys: string[] = ['items', 'orders', 'products', 'categories']) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
};
const apiMessage = (error: any, fallback: string) => error?.response?.data?.detail || error?.response?.data?.message || error?.message || fallback;

const statusColor: Record<string, string> = {
  pending_dispatch: 'orange', store_accepted: 'blue', preparing: 'processing',
  ready_for_pickup: 'cyan', delivery_assigned: 'purple', picked_up: 'geekblue',
  in_transit: 'processing', delivered: 'success', cancelled: 'error', rejected: 'error',
};

export const PartnerDashboardPage: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const restaurant = (user?.role || '').toLowerCase().includes('restaurant');
  const base = restaurant ? '/restaurant' : '/store';
  const section = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';

  const [stats, setStats] = useState<RowData | null>(null);
  const [profile, setProfile] = useState<RowData | null>(null);
  const [orders, setOrders] = useState<RowData[]>([]);
  const [orderTab, setOrderTab] = useState<'active' | 'completed' | 'all'>('active');
  const [pendingOrders, setPendingOrders] = useState<RowData[]>([]);
  const [categories, setCategories] = useState<RowData[]>([]);
  const [products, setProducts] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<RowData | null>(null);
  const [declineOrder, setDeclineOrder] = useState<RowData | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [menuForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [productForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [setupForm] = Form.useForm();

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setPageError('');
    setSetupRequired(false);
    try {
      if (restaurant) {
        let business: RowData;
        try {
          const profileResponse = await apiClient.get('/food/partner/restaurant');
          business = profileResponse.data;
        } catch (error: any) {
          if (error?.response?.status === 404) {
            setProfile(null);
            setStats(null);
            setOrders([]);
            setCategories([]);
            setProducts([]);
            setSetupRequired(true);
            return;
          }
          throw error;
        }
        const [dashResponse, orderResponse, categoryResponse] = await Promise.all([
          apiClient.get('/food/partner/dashboard'),
          apiClient.get('/food/partner/orders', { params: { page_size: 50 } }),
          apiClient.get('/food/partner/categories'),
        ]);
        const categoryList = normalList(categoryResponse.data);
        const orderList = normalList(orderResponse.data, ['orders', 'items']);
        setProfile(business);
        setStats(dashResponse.data);
        setOrders(orderList);
        setPendingOrders(orderList.filter((order: RowData) => order.status === 'pending_dispatch'));
        setCategories(categoryList);
        setProducts(categoryList.flatMap((category: RowData) => (category.items || []).map((item: RowData) => ({ ...item, category_name: category.name }))));
        profileForm.setFieldsValue(business);
      } else {
        const [dashResponse, profileResponse, orderResponse, pendingResponse] = await Promise.all([
          apiClient.get('/store/dashboard'),
          apiClient.get('/store/profile'),
          apiClient.get('/orders/my-orders', { params: { page_size: 50 } }),
          apiClient.get('/orders/pending'),
        ]);
        const orderList = normalList(orderResponse.data, ['items', 'orders']);
        const pendingList = normalList(pendingResponse.data);
        const byId = new Map<string, RowData>();
        [...orderList, ...pendingList].forEach(order => byId.set(String(order.id), order));
        const mergedOrders = Array.from(byId.values()).sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        setStats(dashResponse.data);
        setProfile(profileResponse.data);
        setOrders(mergedOrders);
        setPendingOrders(pendingList);
        profileForm.setFieldsValue(profileResponse.data);

        if (section === 'catalog') {
          const [categoryResponse, productResponse] = await Promise.all([
            apiClient.get('/grocery/categories'),
            apiClient.get('/grocery/store/products'),
          ]);
          const catalogue = productResponse.data || {};
          setCategories(normalList(categoryResponse.data));
          setProducts([
            ...normalList(catalogue, ['universal']),
            ...normalList(catalogue, ['custom']),
          ].map((item: RowData) => ({ ...item, category_name: item.category_name || categories.find(c => c.id === item.category_id)?.name })));
        }
      }
    } catch (error: any) {
      setPageError(apiMessage(error, 'Unable to load live Jinni data. Please check the backend connection and account permissions.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurant, section]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const runAction = async (action: () => Promise<any>, successText: string) => {
    setSaving(true);
    try {
      await action();
      message.success(successText);
      await fetchData(true);
      return true;
    } catch (error: any) {
      message.error(apiMessage(error, 'The action could not be completed.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleBusinessOpen = async (value: boolean) => {
    if (restaurant) {
      await runAction(() => apiClient.post('/food/partner/toggle-open', null, { params: { is_open: value } }), 'Restaurant status updated');
    } else {
      await runAction(() => apiClient.patch('/store/profile', { is_open: value }), 'Store status updated');
    }
  };

  const toggleAccepting = (value: boolean) =>
    runAction(() => apiClient.post('/food/partner/toggle-accepting', null, { params: { is_accepting_orders: value } }), 'Order acceptance updated');

  const actOnOrder = async (order: RowData, action: string) => {
    setActionId(String(order.id));
    try {
      if (restaurant) {
        await apiClient.post(`/food/partner/orders/${order.id}/status`, null, { params: { new_status: action } });
      } else if (action === 'accept') {
        await apiClient.post(`/orders/${order.id}/accept`, {});
      } else if (action === 'decline') {
        await apiClient.post(`/orders/${order.id}/decline`, { reason: declineReason.trim() });
      } else {
        await apiClient.patch(`/orders/${order.id}/status`, { status: action });
      }
      message.success(action === 'accept' ? 'Order accepted' : action === 'decline' ? 'Order declined' : 'Order status updated');
      setDeclineOrder(null);
      setDeclineReason('');
      await fetchData(true);
    } catch (error: any) {
      message.error(apiMessage(error, 'Could not update this order.'));
    } finally {
      setActionId(null);
    }
  };

  const beginMenuItem = (item?: RowData, categoryId?: string) => {
    setEditingMenuItem(item || null);
    menuForm.resetFields();
    if (item) menuForm.setFieldsValue({ ...item, price: Number(item.price), discounted_price: item.discounted_price ? Number(item.discounted_price) : undefined });
    else menuForm.setFieldsValue({ category_id: categoryId, is_veg: true, is_egg: false, is_available: true, tax_percent: 5 });
    setMenuOpen(true);
  };

  const saveMenuItem = async (values: RowData) => {
    const body = {
      ...values,
      price: Number(values.price),
      discounted_price: values.discounted_price === undefined || values.discounted_price === null || values.discounted_price === '' ? null : Number(values.discounted_price),
      prep_time_minutes: values.prep_time_minutes ? Number(values.prep_time_minutes) : null,
    };
    const ok = await runAction(
      () => editingMenuItem
        ? apiClient.patch(`/food/partner/menu-items/${editingMenuItem.id}`, body)
        : apiClient.post('/food/partner/menu-items', body),
      editingMenuItem ? 'Menu item updated' : 'Menu item added',
    );
    if (ok) { setMenuOpen(false); setEditingMenuItem(null); menuForm.resetFields(); }
  };

  const deleteMenuItem = (item: RowData) => Modal.confirm({
    title: `Remove ${item.name} from the menu?`,
    content: 'This will call the Jinni API to remove the menu item.',
    okText: 'Remove item', okButtonProps: { danger: true },
    onOk: async () => {
      const ok = await runAction(() => apiClient.delete(`/food/partner/menu-items/${item.id}`), 'Menu item removed');
      if (!ok) return Promise.reject(new Error('Delete failed'));
    },
  });

  const saveCategory = async (values: RowData) => {
    const ok = await runAction(() => apiClient.post('/food/partner/categories', values), 'Menu category created');
    if (ok) { setCategoryOpen(false); categoryForm.resetFields(); }
  };

  const saveProduct = async (values: RowData) => {
    const body = {
      ...values,
      price: Number(values.price),
      stock_quantity: Number(values.stock_quantity || 0),
      unit: values.unit || 'piece',
      image_url: values.image_url || null,
    };
    const ok = await runAction(() => apiClient.post('/grocery/store/custom-products', body), 'Product added to your store');
    if (ok) { setProductOpen(false); productForm.resetFields(); }
  };

  const toggleAvailability = async (item: RowData, available: boolean) => {
    const id = item.product_id || item.id;
    const endpoint = item.product_id
      ? `/grocery/store/products/${id}/toggle`
      : `/grocery/store/custom-products/${id}/toggle`;
    if (restaurant) {
      await runAction(() => apiClient.post(`/food/partner/menu-items/${item.id}/availability`, { is_available: available }), 'Menu availability updated');
    } else {
      await runAction(() => apiClient.post(endpoint, { is_available: available }), 'Product availability updated');
    }
  };

  const deleteCustomProduct = (item: RowData) => Modal.confirm({
    title: `Delete ${item.name}?`,
    content: 'This removes the custom product from your store catalogue.',
    okText: 'Delete', okButtonProps: { danger: true },
    onOk: async () => {
      const ok = await runAction(() => apiClient.delete(`/grocery/store/custom-products/${item.id}`), 'Custom product deleted');
      if (!ok) return Promise.reject(new Error('Delete failed'));
    },
  });

  const saveProfile = async (values: RowData) => {
    const endpoint = restaurant ? '/food/partner/restaurant' : '/store/profile';
    await runAction(() => apiClient.patch(endpoint, values), 'Business profile saved');
  };

  const setupRestaurant = async (values: RowData) => {
    if (!values.latitude || !values.longitude) {
      message.error('Restaurant location coordinates are required. Use the location button or enter coordinates.');
      return;
    }
    const payload = {
      ...values,
      cuisines: values.cuisines || [],
      tags: values.tags || [],
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      cost_for_two: values.cost_for_two ? Number(values.cost_for_two) : undefined,
      pure_veg: !!values.pure_veg,
    };
    const ok = await runAction(() => apiClient.post('/food/partner/restaurant', payload), 'Restaurant profile created');
    if (ok) { setSetupRequired(false); await fetchData(true); }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) { message.error('Location is not available in this browser. Enter latitude and longitude.'); return; }
    navigator.geolocation.getCurrentPosition(
      position => setupForm.setFieldsValue({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => message.error(error.message || 'Could not get your location. Enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const visibleOrders = useMemo(() => orderTab === 'active'
    ? orders.filter(order => !isTerminal(order.status))
    : orderTab === 'completed'
      ? orders.filter(order => isTerminal(order.status))
      : orders, [orders, orderTab]);

  const pageTitle = section === 'orders' ? 'Orders'
    : section === 'catalog' ? (restaurant ? 'Menu & Categories' : 'Products & Stock')
    : section === 'profile' ? 'Business Profile'
    : 'Dashboard';

  const orderColumns = [
    {
      title: 'Order', dataIndex: 'order_number', key: 'order_number',
      render: (value: string, row: RowData) => <Space direction="vertical" size={0}><Text strong>#{value || String(row.id).slice(0,8)}</Text><Text type="secondary" style={{fontSize:11}}>{row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '—'}</Text></Space>,
    },
    {
      title: 'Items', dataIndex: 'items', key: 'items',
      render: (items: RowData[] = []) => <div>{items.map(item => `${item.name || item.product_name || 'Item'} × ${item.quantity || 1}`).join(', ') || '—'}</div>,
    },
    { title: 'Amount', dataIndex: 'total_amount', key: 'amount', render: money },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusColor[value] || 'default'}>{(value || 'unknown').replace(/_/g,' ')}</Tag> },
    {
      title: 'Delivery address', dataIndex: 'delivery_address', key: 'delivery_address',
      render: (value: any) => value ? [value.line1 || value.address, value.city, value.pincode].filter(Boolean).join(', ') : '—',
    },
    {
      title: 'Actions', key: 'actions', render: (_: any, row: RowData) => {
        if (isTerminal(row.status)) return <Text type="secondary">Completed</Text>;
        if (row.status === 'pending_dispatch') return restaurant
          ? <Space wrap><Button size="small" type="primary" loading={actionId===String(row.id)} onClick={() => void actOnOrder(row,'store_accepted')}>Accept</Button><Button size="small" danger loading={actionId===String(row.id)} onClick={() => { setDeclineOrder(row); setDeclineReason(''); }}>Decline</Button></Space>
          : <Space wrap><Button size="small" type="primary" loading={actionId===String(row.id)} onClick={() => void actOnOrder(row,'accept')}>Accept</Button><Button size="small" danger onClick={() => { setDeclineOrder(row); setDeclineReason(''); }}>Decline</Button></Space>;
        const next = row.status === 'store_accepted' ? 'preparing' : row.status === 'preparing' ? 'ready_for_pickup' : row.status === 'ready_for_pickup' && !restaurant ? 'delivery_assigned' : null;
        if (next) return <Button size="small" type="primary" loading={actionId===String(row.id)} onClick={() => void actOnOrder(row,next)}>{next === 'preparing' ? 'Start preparing' : next === 'ready_for_pickup' ? 'Mark ready for pickup' : 'Assign delivery'}</Button>;
        return <Text type="secondary">In progress</Text>;
      },
    },
  ];

  const productColumns = [
    { title: 'Product', dataIndex: 'name', key: 'name', render: (value: string, row: RowData) => <Space direction="vertical" size={0}><Text strong>{value}</Text><Text type="secondary" style={{fontSize:11}}>{row.category_name || row.unit || ''} {row.product_id ? '· Catalogue' : '· My product'}</Text></Space> },
    { title: 'Price', dataIndex: 'price', key: 'price', render: money },
    { title: 'Stock', dataIndex: 'stock_quantity', key: 'stock', render: (value: any) => value ?? '—' },
    { title: 'Availability', dataIndex: 'is_available', key: 'is_available', render: (value: boolean, row: RowData) => <Switch checked={!!value} loading={actionId===String(row.product_id || row.id)} onChange={available => void toggleAvailability(row,available)} /> },
    ...(!restaurant ? [{ title: 'Actions', key: 'actions', render: (_: any,row: RowData) => !row.product_id ? <Button size="small" danger icon={<DeleteOutlined/>} onClick={() => deleteCustomProduct(row)}>Delete</Button> : <Text type="secondary">Catalogue item</Text> }] : []),
  ];

  if (loading && !profile && !setupRequired) return <div className="portal-loading"><Spin size="large" tip="Loading your Jinni account…" /></div>;

  if (setupRequired && restaurant) return (
    <div className="partner-page setup-page">
      <Card className="portal-card setup-card">
        <div className="section-kicker">RESTAURANT ONBOARDING</div>
        <Title level={2}>Set up your restaurant</Title>
        <Paragraph type="secondary">Complete your real restaurant profile to start managing orders and your menu. These details will be saved to your Jinni account.</Paragraph>
        <Form form={setupForm} layout="vertical" onFinish={setupRestaurant}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="name" label="Restaurant name" rules={[{required:true,min:2}]}><Input placeholder="Your restaurant name"/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="cuisines" label="Cuisines" rules={[{required:true}]}><Select mode="tags" tokenSeparators={[',']} placeholder="North Indian, Chinese…"/></Form.Item></Col>
            <Col xs={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item></Col>
            <Col xs={24}><Form.Item name="address_line1" label="Address" rules={[{required:true,min:3}]}><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="city" label="City" rules={[{required:true}]}><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="state" label="State" rules={[{required:true}]}><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pincode" label="PIN code" rules={[{required:true,pattern:/^\d{6}$/,message:'Enter a 6-digit PIN code'}]}><Input maxLength={6}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="latitude" label="Latitude" rules={[{required:true}]}><InputNumber style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="longitude" label="Longitude" rules={[{required:true}]}><InputNumber style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8} className="location-button-col"><Button icon={<EnvironmentOutlined/>} onClick={captureLocation}>Use current location</Button></Col>
            <Col xs={24} md={8}><Form.Item name="cost_for_two" label="Cost for two (₹)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pure_veg" label="Pure vegetarian" valuePropName="checked"><Switch/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="fssai_license" label="FSSAI licence"><Input/></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving}>Create restaurant profile</Button>
        </Form>
      </Card>
    </div>
  );

  return <div className="partner-page">
    <div className="partner-page-head">
      <div>
        <div className="section-kicker">{restaurant ? 'RESTAURANT PARTNER' : 'GROCERY STORE PARTNER'}</div>
        <Title level={2}>{pageTitle}</Title>
        <Text type="secondary">{profile?.name || profile?.store_name || user?.name || 'Jinni partner'} · Live account data</Text>
      </div>
      <Button icon={<ReloadOutlined/>} loading={refreshing || loading} onClick={() => {setRefreshing(true);void fetchData(true);}}>Refresh</Button>
    </div>

    {pageError && <Alert type="error" showIcon message="Could not load live data" description={pageError} action={<Button size="small" onClick={() => void fetchData()}>Retry</Button>} style={{marginBottom:18}}/>}

    {section === 'dashboard' && <>
      {stats && <Row gutter={[14,14]}>
        {(restaurant ? [
          {title:"Today's orders",value:stats.today_orders,icon:<ShoppingOutlined/>},
          {title:"Today's revenue",value:money(stats.today_revenue),icon:<DollarOutlined/>},
          {title:"Pending orders",value:stats.pending_orders,icon:<ClockCircleOutlined/>},
          {title:"Live menu items",value:stats.active_menu_items,icon:<ShopOutlined/>},
        ] : [
          {title:"Total orders",value:stats.total_orders,icon:<ShoppingOutlined/>},
          {title:"Pending / active",value:stats.pending_orders,icon:<ClockCircleOutlined/>},
          {title:"Total revenue",value:money(stats.total_revenue),icon:<DollarOutlined/>},
          {title:"Available products",value:stats.product_count,icon:<ShopOutlined/>},
        ]).map(stat=><Col xs={12} xl={6} key={stat.title}><Card className="stat-card"><Statistic title={stat.title} value={stat.value ?? '—'} prefix={stat.icon}/></Card></Col>)}
      </Row>}
      {profile && <Card className="portal-card availability-card" title="Business availability" extra={<Tag color={restaurant ? (stats?.is_open ? 'success':'default') : (profile.is_open ? 'success':'default')}>{(restaurant ? stats?.is_open : profile.is_open) ? 'OPEN' : 'CLOSED'}</Tag>}>
        <div className="availability-row">
          <div><Text strong>{restaurant ? 'Restaurant open' : 'Store open'}</Text><Paragraph type="secondary" style={{margin:0}}>{restaurant ? 'Customers can find your restaurant while it is open.' : 'Your store receives new orders while it is open.'}</Paragraph></div>
          <Switch checked={!!(restaurant ? stats?.is_open : profile.is_open)} loading={saving} onChange={toggleBusinessOpen}/>
        </div>
        {restaurant && <><Divider/><div className="availability-row"><div><Text strong>Accepting orders</Text><Paragraph type="secondary" style={{margin:0}}>Pause incoming orders without closing your restaurant.</Paragraph></div><Switch checked={!!stats?.is_accepting_orders} loading={saving} onChange={toggleAccepting}/></div></>}
      </Card>}
      <Card className="portal-card" title="New orders · Needs your response" extra={<Button type="link" onClick={() => window.location.assign(base+'/orders')}>View all orders</Button>}>
        <Table rowKey="id" loading={loading || refreshing} columns={orderColumns} dataSource={pendingOrders} pagination={false} scroll={{x:850}} locale={{emptyText:<Empty description={pageError ? 'Orders could not be loaded' : 'No new orders'} />}}/>
      </Card>
      <Card className="portal-card" title="Recent orders">
        <Table rowKey="id" loading={loading || refreshing} columns={orderColumns} dataSource={orders.slice(0,8)} pagination={false} scroll={{x:850}} locale={{emptyText:<Empty description="No orders found for this account"/>}}/>
      </Card>
    </>}

    {section === 'orders' && <Card className="portal-card" title="Orders" extra={<Segmented value={orderTab} onChange={value=>setOrderTab(value as 'active'|'completed'|'all')} options={[{label:'Active',value:'active'},{label:'Completed',value:'completed'},{label:'All',value:'all'}]}/>}> 
      <Table rowKey="id" loading={loading || refreshing} columns={orderColumns} dataSource={visibleOrders} pagination={{pageSize:10,showSizeChanger:true}} scroll={{x:950}} locale={{emptyText:<Empty description={pageError ? 'Orders could not be loaded' : orderTab==='active' ? 'No active orders' : orderTab==='completed' ? 'No completed orders' : 'No orders found for this account'}/>}}/>
    </Card>}

    {section === 'catalog' && restaurant && <Card className="portal-card" title="Menu & categories" extra={<Space wrap><Button onClick={()=>{categoryForm.resetFields();setCategoryOpen(true);}}>Add category</Button></Space>}>
      {categories.length===0 && <Empty description="No menu categories have been created yet"/>}
      <div className="category-list">{categories.map(category=><Card size="small" key={category.id} className="category-card" title={<Space wrap><Text strong>{category.name}</Text><Tag>{(category.items||[]).length} items</Tag></Space>} extra={<Button size="small" type="primary" icon={<PlusOutlined/>} onClick={()=>beginMenuItem(undefined,category.id)}>Add item</Button>}>
        {category.description && <Paragraph type="secondary">{category.description}</Paragraph>}
        <Table size="small" rowKey="id" pagination={false} dataSource={category.items||[]} columns={[
          {title:'Menu item',dataIndex:'name',key:'name',render:(v:string,row:RowData)=><Space direction="vertical" size={0}><Text strong>{v}</Text><Text type="secondary" style={{fontSize:11}}>{row.description||''}</Text></Space>},
          {title:'Price',dataIndex:'price',key:'price',render:money},
          {title:'Type',dataIndex:'is_veg',key:'type',render:(v:boolean,row:RowData)=>row.is_egg?<Tag color="gold">Egg</Tag>:<Tag color={v?'green':'red'}>{v?'Veg':'Non-veg'}</Tag>},
          {title:'Available',dataIndex:'is_available',key:'available',render:(v:boolean,row:RowData)=><Switch checked={!!v} loading={actionId===String(row.id)} onChange={available=>void toggleAvailability(row,available)}/>},
          {title:'Actions',key:'actions',render:(_:any,row:RowData)=><Space><Button size="small" icon={<EditOutlined/>} onClick={()=>beginMenuItem(row)}>Edit</Button><Button size="small" danger icon={<DeleteOutlined/>} onClick={()=>deleteMenuItem(row)}>Remove</Button></Space>},
        ]}/>
      </Card>)}</div>
    </Card>}

    {section === 'catalog' && !restaurant && <Card className="portal-card" title="Store products & stock" extra={<Button type="primary" icon={<PlusOutlined/>} onClick={()=>{productForm.resetFields();productForm.setFieldsValue({unit:'piece',stock_quantity:0});setProductOpen(true);}}>Add custom product</Button>}>
      <Alert type="info" showIcon message="Universal catalogue and your custom products" description="Availability is saved to your store inventory. Custom products can be added, toggled or removed here." style={{marginBottom:16}}/>
      <Table rowKey={row=>row.product_id || row.id} loading={loading || refreshing} columns={productColumns} dataSource={products} pagination={{pageSize:10}} scroll={{x:800}} locale={{emptyText:<Empty description={pageError ? 'Products could not be loaded' : 'No products found for this store'}/>}}/>
      <div className="mobile-product-list">
        {products.map(item=><Card size="small" key={item.product_id||item.id} className="mobile-product-card">
          <div className="mobile-product-row"><div><Text strong>{item.name}</Text><div><Text type="secondary">{money(item.price)} / {item.unit || 'piece'} · Stock {item.stock_quantity ?? '—'}</Text></div><Tag>{item.product_id?'Catalogue':'My product'}</Tag></div><Switch checked={!!item.is_available} onChange={value=>void toggleAvailability(item,value)}/></div>
          {!item.product_id && <Button danger size="small" icon={<DeleteOutlined/>} onClick={()=>deleteCustomProduct(item)}>Delete custom product</Button>}
        </Card>)}
      </div>
    </Card>}

    {section === 'profile' && <Card className="portal-card" title="Business profile">
      {!profile ? <Empty description="The business profile could not be loaded. Use refresh or contact support."/> : <Form form={profileForm} layout="vertical" onFinish={saveProfile}>
        {!restaurant && <Descriptions bordered size="small" column={{xs:1,md:2}} style={{marginBottom:20}} items={[
          {key:'name',label:'Store name',children:profile.store_name || '—'},
          {key:'owner',label:'Owner',children:profile.owner_name || user?.name || '—'},
          {key:'email',label:'Email',children:profile.email || user?.email || '—'},
          {key:'phone',label:'Phone',children:profile.phone || user?.phone || '—'},
        ]}/>}
        <Row gutter={16}>
          {restaurant ? <>
            <Col xs={24} md={12}><Form.Item name="name" label="Restaurant name" rules={[{required:true,min:2}]}><Input/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="description" label="Description"><Input/></Form.Item></Col>
            <Col xs={24}><Form.Item name="cuisines" label="Cuisines"><Select mode="tags" tokenSeparators={[',']} placeholder="Add cuisine types"/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="logo_url" label="Logo image URL"><Input placeholder="https://…"/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="cover_image_url" label="Cover image URL"><Input placeholder="https://…"/></Form.Item></Col>
            <Col xs={24}><Form.Item name="address_line1" label="Address"><Input/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="address_line2" label="Address line 2"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="city" label="City"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="state" label="State"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pincode" label="PIN code" rules={[{pattern:/^\d{6}$/,message:'Enter a 6-digit PIN'}]}><Input maxLength={6}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="cost_for_two" label="Cost for two (₹)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="min_order_amount" label="Minimum order (₹)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="delivery_fee" label="Delivery fee (₹)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="avg_prep_minutes" label="Average prep time (min)"><InputNumber min={5} max={120} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="delivery_radius_km" label="Delivery radius (km)"><InputNumber min={1} max={50} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pure_veg" label="Pure vegetarian" valuePropName="checked"><Switch/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="fssai_license" label="FSSAI licence"><Input/></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="gstin" label="GSTIN"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="bank_account" label="Bank account"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="bank_ifsc" label="Bank IFSC"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="upi_id" label="UPI ID"><Input/></Form.Item></Col>
          </> : <>
            <Col xs={24}><Form.Item name="address" label="Address"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pincode" label="PIN code" rules={[{pattern:/^\d{6}$/,message:'Enter a 6-digit PIN'}]}><Input maxLength={6}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="city" label="City"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="state" label="State"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="delivery_radius_km" label="Delivery radius (km)"><InputNumber min={1} max={50} style={{width:'100%'}}/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="gstin" label="GSTIN"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="fssai" label="FSSAI licence"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="bank_account" label="Bank account"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="bank_ifsc" label="Bank IFSC"><Input/></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="upi_id" label="UPI ID"><Input/></Form.Item></Col>
          </>}
        </Row>
        <Button type="primary" htmlType="submit" loading={saving}>Save profile</Button>
      </Form>}
    </Card>}

    <Modal title={editingMenuItem ? 'Edit menu item' : 'Add menu item'} open={menuOpen} onCancel={()=>{setMenuOpen(false);setEditingMenuItem(null);}} onOk={()=>menuForm.submit()} confirmLoading={saving} width={680}>
      <Form form={menuForm} layout="vertical" onFinish={saveMenuItem}>
        <Row gutter={12}>
          <Col xs={24} md={14}><Form.Item name="name" label="Dish name" rules={[{required:true,min:2}]}><Input/></Form.Item></Col>
          <Col xs={24} md={10}><Form.Item name="category_id" label="Category" rules={[{required:true}]}><Select options={categories.map(c=>({label:c.name,value:c.id}))}/></Form.Item></Col>
          <Col xs={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="price" label="Price (₹)" rules={[{required:true}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="discounted_price" label="Offer price (₹)"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="prep_time_minutes" label="Prep time (min)"><InputNumber min={1} style={{width:'100%'}}/></Form.Item></Col>
          <Col xs={24}><Form.Item name="image_url" label="Dish image URL"><Input placeholder="https://…"/></Form.Item></Col>
          <Col xs={12}><Form.Item name="is_veg" label="Vegetarian" valuePropName="checked"><Switch/></Form.Item></Col>
          <Col xs={12}><Form.Item name="is_egg" label="Contains egg" valuePropName="checked"><Switch/></Form.Item></Col>
          <Col xs={12}><Form.Item name="is_bestseller" label="Bestseller" valuePropName="checked"><Switch/></Form.Item></Col>
          <Col xs={12}><Form.Item name="is_recommended" label="Chef recommended" valuePropName="checked"><Switch/></Form.Item></Col>
          <Col xs={12}><Form.Item name="is_available" label="Available" valuePropName="checked"><Switch/></Form.Item></Col>
        </Row>
      </Form>
    </Modal>

    <Modal title="Add menu category" open={categoryOpen} onCancel={()=>setCategoryOpen(false)} onOk={()=>categoryForm.submit()} confirmLoading={saving}>
      <Form form={categoryForm} layout="vertical" onFinish={saveCategory}>
        <Form.Item name="name" label="Category name" rules={[{required:true,min:1,max:100}]}><Input placeholder="e.g. Starters"/></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item>
      </Form>
    </Modal>

    <Modal title="Add custom product" open={productOpen} onCancel={()=>setProductOpen(false)} onOk={()=>productForm.submit()} confirmLoading={saving}>
      <Form form={productForm} layout="vertical" onFinish={saveProduct}>
        <Form.Item name="name" label="Product name" rules={[{required:true,min:2}]}><Input/></Form.Item>
        <Form.Item name="category_id" label="Category" rules={[{required:true}]}><Select options={categories.map(c=>({label:c.name,value:c.id}))}/></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="price" label="Selling price (₹)" rules={[{required:true}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
          <Col span={12}><Form.Item name="stock_quantity" label="Stock quantity"><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
          <Col span={12}><Form.Item name="unit" label="Unit"><Select options={['piece','kg','g','litre','ml','pack','dozen'].map(v=>({label:v,value:v}))}/></Form.Item></Col>
          <Col span={12}><Form.Item name="image_url" label="Image URL"><Input placeholder="https://…"/></Form.Item></Col>
        </Row>
        <Form.Item name="description" label="Description"><Input.TextArea rows={2}/></Form.Item>
      </Form>
    </Modal>

    <Modal title={`Decline order #${declineOrder?.order_number || ''}`} open={!!declineOrder} onCancel={()=>setDeclineOrder(null)} onOk={()=>declineOrder && void actOnOrder(declineOrder,'decline')} confirmLoading={!!declineOrder && actionId===String(declineOrder.id)} okButtonProps={{danger:true,disabled:!declineReason.trim()}}>
      <Paragraph type="secondary">Please provide a reason for declining this order. It will be sent to the customer as the cancellation reason.</Paragraph>
      <Input.TextArea rows={4} maxLength={500} showCount value={declineReason} onChange={event=>setDeclineReason(event.target.value)} placeholder="e.g. One or more requested items are out of stock."/>
    </Modal>
  </div>;
};

export default PartnerDashboardPage;
