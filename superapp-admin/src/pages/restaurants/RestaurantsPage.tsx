import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Input, Segmented, Button, App, Space, Empty, Popconfirm } from 'antd';
import { getAdminRestaurants, restaurantAction } from '../../api/admin';
import { J, when } from '../../theme/jinni';

export const RestaurantsPage: React.FC = () => {
  const { message } = App.useApp();
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const r: any = await getAdminRestaurants({ state, search: q || undefined, page_size: 50 }); setRows(r.restaurants); setTotal(r.total); } finally { setLoading(false); } }, [state, q]);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, a: any, ok: string) => { try { await restaurantAction(id, a); message.success(ok); void load(); } catch (e: any) { message.error(e?.response?.data?.detail || 'Failed'); } };
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ FOOD PARTNERS</div><h1>Restaurants</h1><p>Verify new restaurants, switch them on or off. Owners manage their own menu and orders after login.</p></div>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}><div className="j-kicker">TOTAL</div><div style={{ fontSize: 30, fontWeight: 800 }}>{total}</div></div></div>
    <div className="j-panel" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Segmented value={state} onChange={v => setState(String(v))} options={[{ label: 'All', value: 'all' }, { label: 'Pending', value: 'pending' }, { label: 'Verified', value: 'verified' }, { label: 'Inactive', value: 'inactive' }, { label: 'Rejected', value: 'rejected' }]} />
      <Input.Search allowClear placeholder="Name, city or phone" style={{ width: 240 }} onSearch={setQ} />
    </div>
    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Table rowKey="id" loading={loading} dataSource={rows} pagination={false} scroll={{ x: 800 }} locale={{ emptyText: <Empty description="No restaurants" /> }}
        columns={[
          { title: 'Restaurant', render: (_, r: any) => <div><b>{r.name}</b><div style={{ fontSize: 12, color: J.mute }}>{(r.cuisines || []).join(', ') || '—'}</div></div> },
          { title: 'Where', render: (_, r: any) => `${r.city}, ${r.pincode}` },
          { title: 'Status', render: (_, r: any) => <Space wrap>{r.is_verified ? <Tag color="green">verified</Tag> : <Tag color="gold">pending</Tag>}{!r.is_active && <Tag color="red">inactive</Tag>}{r.is_open ? <Tag color="purple">open</Tag> : <Tag>closed</Tag>}{r.owner_status !== 'active' && <Tag color="orange">owner {r.owner_status.replace('_', ' ')}</Tag>}</Space> },
          { title: 'Docs', render: (_, r: any) => <span style={{ fontSize: 12, color: J.mute }}>{r.fssai_license ? `FSSAI ${r.fssai_license}` : 'No FSSAI'}{r.gstin ? ` · GST ${r.gstin}` : ''}</span> },
          { title: 'Added', dataIndex: 'created_at', render: v => when(v) },
          { title: '', render: (_, r: any) => <Space>
            {!r.is_verified && <Button size="small" type="primary" onClick={() => act(r.id, 'verify', 'Verified')}>Verify</Button>}
            {!r.is_verified && <Popconfirm title="Reject this restaurant?" onConfirm={() => act(r.id, 'reject', 'Rejected')}><Button size="small" danger>Reject</Button></Popconfirm>}
            {r.is_verified && (r.is_active ? <Button size="small" onClick={() => act(r.id, 'deactivate', 'Deactivated')}>Deactivate</Button> : <Button size="small" onClick={() => act(r.id, 'activate', 'Activated')}>Activate</Button>)}
          </Space> },
        ]} />
    </div>
  </div>;
};
export default RestaurantsPage;
