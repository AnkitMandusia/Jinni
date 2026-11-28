import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Input, Segmented, Button, App, Space, Empty, Popconfirm, Drawer, Switch, InputNumber, Progress, Spin, Tooltip } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { getAdminStores, getAdminStore, patchAdminStore, storeAction } from '../../api/admin';
import { J, inr, when, STATUS_COLOR } from '../../theme/jinni';

const STATE_TAG: Record<string, [string, string]> = { active: ['green', 'verified'], pending_approval: ['gold', 'pending approval'], suspended: ['red', 'suspended'], rejected: ['volcano', 'rejected'] };
const err = (e: any, f: string) => (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : f);

export const StoresPage: React.FC = () => {
  const { message } = App.useApp();
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r: any = await getAdminStores({ state, search: q || undefined }); setRows(r.stores); setCounts(r.counts || {}); } finally { setLoading(false); }
  }, [state, q]);
  useEffect(() => { void load(); }, [load]);
  const loadDetail = useCallback(async (id: string) => { setD(await getAdminStore(id)); }, []);
  useEffect(() => { if (open) void loadDetail(open); else setD(null); }, [open, loadDetail]);

  const act = async (id: string, a: any, ok: string) => { try { await storeAction(id, a); message.success(ok); void load(); if (open === id) void loadDetail(id); } catch (e) { message.error(err(e, 'Failed')); } };
  const patch = async (id: string, body: any) => { try { await patchAdminStore(id, body); void load(); void loadDetail(id); } catch (e) { message.error(err(e, 'Failed')); } };

  const tiles = [
    { l: 'Verified', v: counts.active || 0, k: 'verified' }, { l: 'Pending approval', v: counts.pending_approval || 0, k: 'pending', alert: (counts.pending_approval || 0) > 0 },
    { l: 'Suspended', v: counts.suspended || 0, k: 'inactive' }, { l: 'Rejected', v: counts.rejected || 0, k: 'rejected' },
  ];
  const actions = (r: any) => <Space wrap>
    {r.account_status === 'pending_approval' && <Button size="small" type="primary" onClick={() => act(r.user_id, 'verify', 'Store approved')}>Approve</Button>}
    {r.account_status === 'pending_approval' && <Popconfirm title="Reject this store?" onConfirm={() => act(r.user_id, 'reject', 'Rejected')}><Button size="small" danger>Reject</Button></Popconfirm>}
    {r.account_status === 'active' && <Popconfirm title="Suspend and close this store?" onConfirm={() => act(r.user_id, 'suspend', 'Suspended')}><Button size="small" danger>Suspend</Button></Popconfirm>}
    {['suspended', 'rejected'].includes(r.account_status) && <Button size="small" onClick={() => act(r.user_id, 'reactivate', 'Reactivated')}>Reactivate</Button>}
  </Space>;

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ GROCERY PARTNERS</div><h1>Stores</h1>
      <p>Approve new stores, check their readiness (address, payout account, licences), watch stock health and what you owe them. Store owners run orders and products from their own login.</p></div>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}><div className="j-kicker">TOTAL</div><div style={{ fontSize: 30, fontWeight: 800 }}>{Object.values(counts).reduce((a, b) => a + b, 0)}</div></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
      {tiles.map(t => <div key={t.l} className={`j-tile ${t.alert ? 'alert' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setState(t.k)}><div className="lbl">{t.l}</div><div className="val">{t.v}</div></div>)}
    </div>
    <div className="j-panel" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Segmented value={state} onChange={v => setState(String(v))} options={[{ label: 'All', value: 'all' }, { label: 'Pending', value: 'pending' }, { label: 'Verified', value: 'verified' }, { label: 'Suspended', value: 'inactive' }, { label: 'Rejected', value: 'rejected' }]} />
      <Input.Search allowClear placeholder="Store, owner, city or phone" style={{ width: 260 }} onSearch={setQ} />
    </div>
    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Table rowKey="user_id" loading={loading} dataSource={rows} pagination={false} scroll={{ x: 980 }} locale={{ emptyText: <Empty description="No stores" /> }}
        onRow={r => ({ onClick: () => setOpen(r.user_id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Store', render: (_, r: any) => <div><b>{r.store_name}</b><div style={{ fontSize: 12, color: J.mute }}>{r.owner_name} · {r.phone}</div></div> },
          { title: 'Where', render: (_, r: any) => `${r.city || '—'} ${r.pincode || ''}` },
          { title: 'Status', render: (_, r: any) => <Space wrap><Tag color={STATE_TAG[r.account_status]?.[0]}>{STATE_TAG[r.account_status]?.[1] || r.account_status}</Tag>{r.account_status === 'active' && (r.is_open ? <Tag color="purple">open</Tag> : <Tag>closed</Tag>)}</Space> },
          { title: 'Ready', render: (_, r: any) => { const ok = r.checks.filter((c: any) => c.ok).length; return <Tooltip title={r.checks.filter((c: any) => !c.ok).map((c: any) => c.label).join(', ') || 'All set'}><Progress percent={Math.round(ok / r.checks.length * 100)} size="small" steps={5} strokeColor={r.ready ? J.ok : J.g400} /></Tooltip>; } },
          { title: 'Orders', align: 'right', render: (_, r: any) => `${r.delivered}/${r.orders}` },
          { title: 'Sales', align: 'right', render: (_, r: any) => <b>{inr(r.sales)}</b> },
          { title: 'Stock', render: (_, r: any) => r.products ? <span>{r.products} items{r.low_stock ? <Tag color="orange" style={{ marginLeft: 6 }}>{r.low_stock} low</Tag> : null}</span> : <span style={{ color: J.mute }}>—</span> },
          { title: 'We owe', align: 'right', render: (_, r: any) => <b style={{ color: r.payable > 0 ? J.p600 : J.mute }}>{inr(r.payable)}</b> },
          { title: '', render: (_, r: any) => <span onClick={e => e.stopPropagation()}>{actions(r)}</span> },
        ]} />
    </div>

    <Drawer width={560} open={!!open} onClose={() => setOpen(null)} title={d ? d.store_name : 'Store'} styles={{ header: { background: J.p50 } }}>
      {!d ? <div style={{ display: 'grid', placeItems: 'center', height: 200 }}><Spin /></div> : <div style={{ display: 'grid', gap: 18 }}>
        <Space wrap><Tag color={STATE_TAG[d.account_status]?.[0]}>{STATE_TAG[d.account_status]?.[1]}</Tag>{d.rating ? <Tag color="gold">★ {d.rating.toFixed(1)} ({d.rating_count})</Tag> : <Tag>no ratings yet</Tag>}<span style={{ color: J.mute, fontSize: 12 }}>joined {when(d.joined_at)}</span></Space>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[['Orders', `${d.delivered}/${d.orders}`], ['Sales', inr(d.sales)], ['We owe them', inr(d.payable)], ['Products', `${d.active_products}/${d.products}`], ['Low stock', d.low_stock], ['Out of stock', d.out_of_stock]].map(([l, v]) =>
            <div key={String(l)} className="j-tile" style={{ padding: 12, height: "auto" }}><div className="lbl">{l}</div><div className="val" style={{ fontSize: 20 }}>{v}</div></div>)}
        </div>
        <div><b style={{ color: J.p700 }}>Readiness checklist</b>
          {d.checks.map((c: any) => <div className="j-row" key={c.key}><span>{c.ok ? <CheckCircleFilled style={{ color: J.ok }} /> : c.required ? <CloseCircleFilled style={{ color: J.bad }} /> : <MinusCircleOutlined style={{ color: J.mute }} />} {c.label}{c.required ? '' : ' (optional)'}</span>
            <span style={{ color: J.mute, fontSize: 12 }}>{c.key === 'gstin' ? d.gstin : c.key === 'fssai' ? d.fssai : c.key === 'payout' ? (d.upi_id || (d.bank_account && `${d.bank_account} · ${d.bank_ifsc}`)) : c.key === 'address' ? d.address : ''}</span></div>)}
        </div>
        <div><b style={{ color: J.p700 }}>Controls</b>
          <div className="j-row"><span>Open for orders</span><Switch checked={d.is_open} disabled={d.account_status !== 'active'} onChange={v => patch(d.user_id, { is_open: v })} /></div>
          <div className="j-row"><span>Delivery radius (km)</span><InputNumber min={0.5} max={30} step={0.5} defaultValue={d.delivery_radius_km} onBlur={e => { const v = Number(e.target.value); if (v && v !== d.delivery_radius_km) void patch(d.user_id, { delivery_radius_km: v }); }} /></div>
          <div style={{ marginTop: 10 }}>{actions(d)}</div>
        </div>
        {d.low_stock_items?.length > 0 && <div><b style={{ color: J.p700 }}>Needs restocking</b>{d.low_stock_items.map((p: any) => <div className="j-row" key={p.name}><span>{p.name}</span><Tag color={p.free <= 0 ? 'red' : 'orange'}>{p.free} left</Tag></div>)}</div>}
        <div><b style={{ color: J.p700 }}>Latest orders</b>{d.recent_orders.map((o: any) => <div className="j-row" key={o.order_number}><span>#{o.order_number} <Tag color={STATUS_COLOR[o.status]}>{o.status.replace(/_/g, ' ')}</Tag></span><span>{inr(o.total_amount)}</span></div>)}{!d.recent_orders.length && <Empty description="No orders yet" />}</div>
      </div>}
    </Drawer>
  </div>;
};
export default StoresPage;
