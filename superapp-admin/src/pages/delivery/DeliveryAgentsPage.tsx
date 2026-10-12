import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Tag, Button, Select, Typography, Space, Row, Col, Badge, Tooltip,
} from 'antd';
import { ReloadOutlined, CheckOutlined, StopOutlined } from '@ant-design/icons';
import { getUsers, approveUser, suspendUser, reactivateUser } from '../../api/admin';
import { message } from 'antd';

const { Title, Text } = Typography;

interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  status: string;
  profile_complete: boolean;
  created_at: string;
}

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
];

export const DeliveryAgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<DeliveryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20, role: 'delivery' };
      if (statusFilter) params.status = statusFilter;
      const data: any = await getUsers(params);
      const list = data.users ?? data ?? [];
      setAgents(list);
      setTotal(data.total ?? list.length);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const doAction = async (id: string, action: 'approve' | 'suspend' | 'reactivate') => {
    setActionLoading(id + action);
    try {
      if (action === 'approve') await approveUser(id);
      else if (action === 'suspend') await suspendUser(id);
      else await reactivateUser(id);
      message.success(`Agent ${action}d`);
      fetchAgents();
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const columns = [
    {
      title: 'Agent',
      key: 'agent',
      render: (a: DeliveryAgent) => (
        <Space direction="vertical" size={0}>
          <Text strong>{a.name || '—'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{a.phone}</Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Badge
          status={s === 'active' ? 'success' : s === 'pending' ? 'warning' : 'error'}
          text={
            <Tag
              color={s === 'active' ? 'green' : s === 'pending' ? 'orange' : 'red'}
              style={{ fontWeight: 600 }}
            >
              {s?.toUpperCase()}
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
      render: (d: string) =>
        d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (a: DeliveryAgent) => (
        <Space>
          {a.status === 'pending' && (
            <Tooltip title="Approve">
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                loading={actionLoading === a.id + 'approve'}
                onClick={() => doAction(a.id, 'approve')}
                style={{ background: '#10B981', border: 'none' }}
              >
                Approve
              </Button>
            </Tooltip>
          )}
          {a.status === 'active' && (
            <Tooltip title="Suspend">
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={actionLoading === a.id + 'suspend'}
                onClick={() => doAction(a.id, 'suspend')}
              >
                Suspend
              </Button>
            </Tooltip>
          )}
          {a.status === 'suspended' && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={actionLoading === a.id + 'reactivate'}
              onClick={() => doAction(a.id, 'reactivate')}
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
        <Title level={3} style={{ margin: 0 }}>Delivery Agents</Title>
        <Text type="secondary">Manage delivery agent accounts</Text>
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
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                style={{ width: '100%' }}
                placeholder="Filter by status"
              />
            </Col>
            <Col xs={24} sm={4}>
              <Button icon={<ReloadOutlined />} onClick={fetchAgents} style={{ width: '100%' }}>
                Refresh
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={agents}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: (p) => setPage(p),
            showTotal: (t) => `${t} agents`,
            showSizeChanger: false,
          }}
          scroll={{ x: 700 }}
          size="middle"
        />
      </Card>
    </div>
  );
};

export default DeliveryAgentsPage;
