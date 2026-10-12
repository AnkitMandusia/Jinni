import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Spin, Alert } from 'antd';
import {
  UserOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  ShopOutlined,
  CarOutlined,
  TeamOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { getStats } from '../../api/admin';

const { Title, Text } = Typography;

interface Stats {
  total_users: number;
  pending_approvals: number;
  active_partners: number;
  suspended_users: number;
  customers: number;
  stores: number;
  restaurants: number;
  delivery_agents: number;
}

const statCards = (stats: Stats) => [
  {
    title: 'Total Users',
    value: stats.total_users,
    icon: <UserOutlined />,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  {
    title: 'Pending Approvals',
    value: stats.pending_approvals,
    icon: <ClockCircleOutlined />,
    color: '#D97706',
    bg: '#FEF3C7',
    highlight: stats.pending_approvals > 0,
  },
  {
    title: 'Active Partners',
    value: stats.active_partners,
    icon: <CheckCircleOutlined />,
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    title: 'Suspended',
    value: stats.suspended_users,
    icon: <StopOutlined />,
    color: '#DC2626',
    bg: '#FEF2F2',
  },
];

const roleCards = (stats: Stats) => [
  { title: 'Customers', value: stats.customers, icon: <TeamOutlined />, color: '#6366F1' },
  { title: 'Stores', value: stats.stores, icon: <ShopOutlined />, color: '#10B981' },
  { title: 'Restaurants', value: stats.restaurants, icon: <ShoppingOutlined />, color: '#F59E0B' },
  { title: 'Delivery Agents', value: stats.delivery_agents, icon: <CarOutlined />, color: '#3B82F6' },
];

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats()
      .then((data: any) => setStats(data))
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }

  if (!stats) return null;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Dashboard</Title>
        <Text type="secondary">Platform overview and key metrics</Text>
      </div>

      {/* Main Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards(stats).map(card => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <Card
              style={{
                borderRadius: 16,
                border: card.highlight ? '2px solid #F59E0B' : '1px solid #E5E7EB',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
              bodyStyle={{ padding: 20 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Statistic
                  title={<Text style={{ color: '#6B7280', fontSize: 13 }}>{card.title}</Text>}
                  value={card.value}
                  valueStyle={{ fontSize: 28, fontWeight: 800, color: card.color }}
                />
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: card.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: card.color,
                }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Role Breakdown */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<Text style={{ fontWeight: 700, fontSize: 15 }}>Users by Role</Text>}
            style={{ borderRadius: 16, border: '1px solid #E5E7EB' }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            <Row gutter={[12, 12]}>
              {roleCards(stats).map(r => (
                <Col xs={12} sm={6} key={r.title}>
                  <div style={{
                    background: '#F9FAFB',
                    borderRadius: 12,
                    padding: '16px 12px',
                    textAlign: 'center',
                    border: '1px solid #E5E7EB',
                  }}>
                    <div style={{ fontSize: 22, color: r.color, marginBottom: 6 }}>{r.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{r.value}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{r.title}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<Text style={{ fontWeight: 700, fontSize: 15 }}>Quick Links</Text>}
            style={{ borderRadius: 16, border: '1px solid #E5E7EB', height: '100%' }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            {[
              { label: 'Pending Approvals', count: stats.pending_approvals, href: '/users?status=pending', color: '#F59E0B' },
              { label: 'All Users', count: stats.total_users, href: '/users', color: '#4F46E5' },
              { label: 'All Orders', count: null, href: '/orders', color: '#10B981' },
              { label: 'Delivery Agents', count: stats.delivery_agents, href: '/delivery', color: '#3B82F6' },
            ].map(link => (
              <a
                href={link.href}
                key={link.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid #F3F4F6',
                  textDecoration: 'none',
                }}
              >
                <Text style={{ color: '#374151', fontWeight: 600 }}>{link.label}</Text>
                {link.count !== null && (
                  <Tag color={link.color} style={{ borderRadius: 20, fontWeight: 700 }}>{link.count}</Tag>
                )}
              </a>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
