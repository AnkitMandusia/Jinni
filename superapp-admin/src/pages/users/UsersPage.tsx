import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Space, Select, Input, Typography,
  Popconfirm, message, Badge, Tooltip, Row, Col,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, StopOutlined, ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { getUsers, approveUser, rejectUser, suspendUser, reactivateUser } from '../../api/admin';

const { Title, Text } = Typography;
const { Search } = Input;

interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  status: string;
  profile_complete: boolean;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  active:   'green',
  pending:  'orange',
  suspended:'red',
  rejected: 'default',
};

const ROLE_COLOR: Record<string, string> = {
  admin:    'purple',
  store:    'cyan',
  delivery: 'blue',
  customer: 'default',
  restaurant: 'volcano',
  cab_driver: 'geekblue',
};

const ROLE_OPTIONS = [
  { label: 'All Roles', value: '' },
  { label: 'Customer', value: 'customer' },
  { label: 'Store', value: 'store' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Restaurant', value: 'restaurant' },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Rejected', value: 'rejected' },
];

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const data: any = await getUsers(params);
      setUsers(data.users ?? data);
      setTotal(data.total ?? (data.users ?? data).length);
    } catch {
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const doAction = async (
    userId: string,
    action: 'approve' | 'reject' | 'suspend' | 'reactivate',
  ) => {
    setActionLoading(userId + action);
    try {
      if (action === 'approve') await approveUser(userId);
      else if (action === 'reject') await rejectUser(userId);
      else if (action === 'suspend') await suspendUser(userId);
      else await reactivateUser(userId);
      message.success(`User ${action}d successfully`);
      fetchUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? `Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = search
    ? users.filter(u =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.phone?.includes(search) ||
        u.email?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (u: User) => (
        <Space direction="vertical" size={0}>
          <Text strong>{u.name || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{u.phone}</Text>
          {u.email && <Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text>}
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={ROLE_COLOR[role] ?? 'default'} style={{ fontWeight: 600 }}>
          {role?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          status={status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'error'}
          text={
            <Tag color={STATUS_COLOR[status] ?? 'default'} style={{ fontWeight: 600 }}>
              {status?.toUpperCase()}
            </Tag>
          }
        />
      ),
    },
    {
      title: 'Profile',
      dataIndex: 'profile_complete',
      key: 'profile_complete',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'orange'}>{v ? 'Complete' : 'Incomplete'}</Tag>
      ),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (u: User) => (
        <Space>
          {u.status === 'pending' && (
            <>
              <Tooltip title="Approve">
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={actionLoading === u.id + 'approve'}
                  onClick={() => doAction(u.id, 'approve')}
                  style={{ background: '#10B981', border: 'none' }}
                >
                  Approve
                </Button>
              </Tooltip>
              <Popconfirm
                title="Reject this user?"
                onConfirm={() => doAction(u.id, 'reject')}
                okText="Reject"
                okButtonProps={{ danger: true }}
              >
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  loading={actionLoading === u.id + 'reject'}
                >
                  Reject
                </Button>
              </Popconfirm>
            </>
          )}
          {u.status === 'active' && u.role !== 'admin' && (
            <Popconfirm
              title="Suspend this user?"
              onConfirm={() => doAction(u.id, 'suspend')}
              okText="Suspend"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={actionLoading === u.id + 'suspend'}
              >
                Suspend
              </Button>
            </Popconfirm>
          )}
          {u.status === 'suspended' && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={actionLoading === u.id + 'reactivate'}
              onClick={() => doAction(u.id, 'reactivate')}
              style={{ color: '#10B981', borderColor: '#10B981' }}
            >
              Reactivate
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Users</Title>
        <Text type="secondary">Manage user accounts and approvals</Text>
      </div>

      <Card
        style={{ borderRadius: 16, border: '1px solid #E5E7EB' }}
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={8}>
              <Search
                placeholder="Search name, phone, email..."
                allowClear
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ borderRadius: 8 }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Select
                options={ROLE_OPTIONS}
                value={roleFilter}
                onChange={v => { setRoleFilter(v); setPage(1); }}
                style={{ width: '100%' }}
                placeholder="Filter by role"
              />
            </Col>
            <Col xs={12} sm={6}>
              <Select
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPage(1); }}
                style={{ width: '100%' }}
                placeholder="Filter by status"
              />
            </Col>
            <Col xs={24} sm={4}>
              <Button icon={<ReloadOutlined />} onClick={fetchUsers} style={{ width: '100%' }}>
                Refresh
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: p => setPage(p),
            showTotal: (t) => `${t} users`,
            showSizeChanger: false,
          }}
          scroll={{ x: 800 }}
          size="middle"
          rowClassName={(record) =>
            record.status === 'pending' ? 'highlight-row' : ''
          }
        />
      </Card>

      <style>{`
        .highlight-row { background: #FFFBEB !important; }
        .highlight-row:hover > td { background: #FEF3C7 !important; }
      `}</style>
    </div>
  );
};

export default UsersPage;
