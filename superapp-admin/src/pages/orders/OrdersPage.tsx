import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Select, Typography, Space, Row, Col, Tooltip,
} from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { getOrders } from '../../api/admin';

const { Title, Text } = Typography;

interface Order {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_id: string;
  store_id: string;
  delivery_agent_id: string | null;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  delivery_pincode: string;
  created_at: string;
  delivered_at: string | null;
  items_count?: number;
}

const STATUS_COLOR: Record<string, string> = {
  pending_dispatch:   'orange',
  store_accepted:     'cyan',
  preparing:          'blue',
  ready_for_pickup:   'geekblue',
  delivery_assigned:  'purple',
  picked_up:          'volcano',
  in_transit:         'magenta',
  delivered:          'green',
  cancelled:          'red',
  no_store_available: 'default',
};

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Pending Dispatch', value: 'pending_dispatch' },
  { label: 'Store Accepted', value: 'store_accepted' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Ready for Pickup', value: 'ready_for_pickup' },
  { label: 'Delivery Assigned', value: 'delivery_assigned' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'In Transit', value: 'in_transit' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
];

const PAYMENT_COLOR: Record<string, string> = {
  cod:    'gold',
  online: 'green',
  upi:    'blue',
};

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (statusFilter) params.status = statusFilter;
      const data: any = await getOrders(params);
      const list = data.items ?? data.orders ?? data ?? [];
      setOrders(list);
      setTotal(data.total ?? list.length);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const columns = [
    {
      title: 'Order',
      key: 'order',
      render: (o: Order) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontFamily: 'monospace' }}>#{o.order_number}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'order_type',
      key: 'order_type',
      render: (t: string) => (
        <Tag color={t === 'grocery' ? 'cyan' : t === 'food' ? 'volcano' : 'default'}>
          {t?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? 'default'} style={{ fontWeight: 600 }}>
          {s?.replace(/_/g, ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      render: (o: Order) => (
        <Space direction="vertical" size={0}>
          <Text strong>₹{Number(o.total_amount).toFixed(0)}</Text>
          <Tag color={PAYMENT_COLOR[o.payment_method] ?? 'default'} style={{ fontSize: 10 }}>
            {o.payment_method?.toUpperCase()}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Pincode',
      dataIndex: 'delivery_pincode',
      key: 'pincode',
      render: (p: string) => <Text type="secondary">{p ?? '—'}</Text>,
    },
    {
      title: 'Delivery Agent',
      dataIndex: 'delivery_agent_id',
      key: 'agent',
      render: (id: string | null) => id
        ? <Tag color="blue" style={{ fontSize: 11 }}>Assigned</Tag>
        : <Tag color="default" style={{ fontSize: 11 }}>Unassigned</Tag>,
    },
    {
      title: 'Payment',
      dataIndex: 'payment_status',
      key: 'payment_status',
      render: (s: string) => (
        <Tag color={s === 'paid' ? 'green' : s === 'pending' ? 'orange' : 'red'}>
          {s?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (o: Order) => (
        <Tooltip title="View Order">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              const url = `/orders/${o.id}`;
              window.open(url, '_blank');
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Orders</Title>
        <Text type="secondary">Monitor all platform orders</Text>
      </div>

      <Card
        style={{ borderRadius: 16, border: '1px solid #E5E7EB' }}
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={8}>
              <Select
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPage(1); }}
                style={{ width: '100%' }}
                placeholder="Filter by status"
              />
            </Col>
            <Col xs={24} sm={4}>
              <Button icon={<ReloadOutlined />} onClick={fetchOrders} style={{ width: '100%' }}>
                Refresh
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: p => setPage(p),
            showTotal: (t) => `${t} orders`,
            showSizeChanger: false,
          }}
          scroll={{ x: 900 }}
          size="middle"
        />
      </Card>
    </div>
  );
};

export default OrdersPage;
