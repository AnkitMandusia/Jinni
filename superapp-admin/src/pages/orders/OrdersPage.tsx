import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Input, Select, DatePicker, Button, Drawer, Descriptions, Timeline, Space, App, Modal, Empty, Spin } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { searchOrders, getOrderDetail, markOrderRefunded, manualCompleteOrder } from '../../api/admin';
import { J, inr, when, STATUS_COLOR, PAY_COLOR } from '../../theme/jinni';

const STATUSES = ['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'rejected', 'no_store_available'];
const err = (e: any, f: string) => e?.response?.data?.detail?.message || (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : f);

export const OrdersPage: React.FC = () => {
  const { message } = App.useApp();
  const [f, setF] = useState<any>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ orders: any[]; total: number; sales_total: number }>({ orders: [], total: 0, sales_total: 0 });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, page_size: 15, ...f };
      if (f.range) { params.date_from = f.range[0].format('YYYY-MM-DD'); params.date_to = f.range[1].format('YYYY-MM-DD'); delete params.range; }
      setData(await searchOrders(params));
    } catch (e) { message.error(err(e, 'Could not load orders')); } finally { setLoading(false); }
  }, [f, page, message]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!open) { setDetail(null); return; } getOrderDetail(open).then(setDetail).catch(e => { message.error(err(e, 'Could not load order')); setOpen(null); }); }, [open, message]);

  const set = (k: string, v: any) => { setPage(1); setF((x: any) => ({ ...x, [k]: v || undefined })); };

  const refund = () => { let ref = ''; Modal.confirm({ title: 'Mark refund as paid', content: <Input placeholder="Gateway refund id / UTR" onChange={e => (ref = e.target.value)} />, okText: 'Mark refunded',
    onOk: async () => { try { await markOrderRefunded(detail.id, ref); message.success('Marked refunded'); setOpen(null); void load(); } catch (e) { message.error(err(e, 'Failed')); throw e; } } }); };
  const complete = () => { let why = ''; Modal.confirm({ title: 'Complete delivery manually', content: <div><p style={{ color: J.mute }}>Use only if the OTP flow failed. A reason (10+ chars) is audited.</p><Input.TextArea rows={3} onChange={e => (why = e.target.value)} /></div>, okText: 'Complete',
    onOk: async () => { try { await manualCompleteOrder(detail.id, why); message.success('Order completed'); setOpen(null); void load(); } catch (e) { message.error(err(e, 'Failed')); throw e; } } }); };

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ ORDERS</div><h1>Order history</h1><p>Every food and grocery order — search, filter, open for items, address, payment and timeline.</p></div>
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}><div className="j-kicker">SALES IN THIS VIEW</div><div style={{ fontSize: 30, fontWeight: 800 }}>{inr(data.sales_total)}</div><div style={{ color: '#CBB4F0' }}>{data.total} orders (cancelled excluded from sales)</div></div></div>

    <div className="j-panel" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Order number" style={{ width: 190 }} onChange={e => set('q', e.target.value)} />
      <Select allowClear placeholder="Type" style={{ width: 120 }} options={[{ value: 'food', label: 'Food' }, { value: 'grocery', label: 'Grocery' }]} onChange={v => set('order_type', v)} />
      <Select allowClear placeholder="Status" style={{ width: 170 }} options={STATUSES.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} onChange={v => set('status', v)} />
      <Select allowClear placeholder="Payment" style={{ width: 130 }} options={['cod', 'online', 'wallet'].map(s => ({ value: s, label: s.toUpperCase() }))} onChange={v => set('payment_method', v)} />
      <Select allowClear placeholder="Pay status" style={{ width: 150 }} options={['pending', 'paid', 'refund_pending', 'refunded', 'failed'].map(s => ({ value: s, label: s.replace('_', ' ') }))} onChange={v => set('payment_status', v)} />
      <DatePicker.RangePicker onChange={v => set('range', v && v[0] && v[1] ? [v[0], v[1]] : undefined)} presets={[{ label: 'Today', value: [dayjs(), dayjs()] }, { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] }]} />
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
    </div>

    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Table rowKey="id" loading={loading} dataSource={data.orders} scroll={{ x: 900 }} onRow={r => ({ onClick: () => setOpen(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 15, total: data.total, showSizeChanger: false, onChange: setPage }}
        locale={{ emptyText: <Empty description="No orders match" /> }}
        columns={[
          { title: 'Order', dataIndex: 'order_number', render: (v, r: any) => <div><b>#{v}</b><div style={{ fontSize: 11, color: J.mute }}>{when(r.created_at)}</div></div> },
          { title: 'Type', dataIndex: 'order_type', render: v => <Tag color={v === 'food' ? 'purple' : 'gold'}>{v}</Tag> },
          { title: 'Customer', dataIndex: 'customer' },
          { title: 'Seller', dataIndex: 'seller', render: v => v || <span style={{ color: J.mute }}>—</span> },
          { title: 'Rider', dataIndex: 'agent', render: v => v || <span style={{ color: J.mute }}>—</span> },
          { title: 'Status', dataIndex: 'status', render: v => <Tag color={STATUS_COLOR[v]}>{v.replace(/_/g, ' ')}</Tag> },
          { title: 'Payment', render: (_, r: any) => <Tag color={PAY_COLOR[r.payment_status]}>{r.payment_method} · {r.payment_status.replace('_', ' ')}</Tag> },
          { title: 'Total', dataIndex: 'total_amount', align: 'right', render: v => <b>{inr(v)}</b> },
        ]} />
    </div>

    <Drawer width={520} open={!!open} onClose={() => setOpen(null)} title={detail ? `Order #${detail.order_number}` : 'Order'} styles={{ header: { background: J.p50 } }}>
      {!detail ? <div style={{ display: 'grid', placeItems: 'center', height: 200 }}><Spin /></div> : <div style={{ display: 'grid', gap: 18 }}>
        <Space wrap><Tag color={detail.order_type === 'food' ? 'purple' : 'gold'}>{detail.order_type}</Tag><Tag color={STATUS_COLOR[detail.status]}>{detail.status.replace(/_/g, ' ')}</Tag><Tag color={PAY_COLOR[detail.payment_status]}>{detail.payment_method} · {detail.payment_status.replace('_', ' ')}</Tag></Space>
        <Descriptions size="small" column={1} bordered items={[
          { key: 'c', label: 'Customer', children: detail.customer ? `${detail.customer.name} · ${detail.customer.phone}` : '—' },
          { key: 's', label: 'Seller', children: detail.seller ? `${detail.seller.name} · ${detail.seller.phone}` : '—' },
          { key: 'a', label: 'Rider', children: detail.agent ? `${detail.agent.name} · ${detail.agent.phone}` : 'Not assigned' },
          { key: 'd', label: 'Deliver to', children: [detail.delivery_address?.line1, detail.delivery_address?.line2, detail.delivery_address?.city, detail.delivery_address?.pincode].filter(Boolean).join(', ') },
        ]} />
        <div><b style={{ color: J.p700 }}>Items</b>
          {detail.items.map((i: any, k: number) => <div className="j-row" key={k}><span>{i.qty} × {i.name}</span><span>{inr(i.subtotal)}</span></div>)}
          <div className="j-row"><span style={{ color: J.mute }}>Subtotal</span><span>{inr(detail.subtotal)}</span></div>
          <div className="j-row"><span style={{ color: J.mute }}>Delivery</span><span>{inr(detail.delivery_fee)}</span></div>
          <div className="j-row"><span style={{ color: J.mute }}>Tax</span><span>{inr(detail.tax)}</span></div>
          {detail.discount > 0 && <div className="j-row"><span style={{ color: J.ok }}>Discount {detail.coupon_code ? `(${detail.coupon_code})` : ''}</span><span>− {inr(detail.discount)}</span></div>}
          {detail.platform_dues > 0 && <div className="j-row"><span style={{ color: J.warn }}>Earlier ride cancellation charge</span><span>{inr(detail.platform_dues)}</span></div>}
          <div className="j-row"><b>Total</b><b style={{ fontSize: 18, color: J.p600 }}>{inr(detail.total_amount)}</b></div>
          {detail.payment_id && <div style={{ fontSize: 12, color: J.mute }}>Txn: {detail.payment_id}</div>}
        </div>
        <div><b style={{ color: J.p700 }}>Timeline</b><Timeline style={{ marginTop: 12 }} items={detail.timeline.map((t: any) => ({ color: t.label === 'Cancelled' ? 'red' : J.p500, children: <span><b>{t.label}</b> · <span style={{ color: J.mute }}>{when(t.at)}</span></span> }))} /></div>
        <Space>
          {detail.payment_status === 'refund_pending' && <Button type="primary" onClick={refund}>Mark refund paid</Button>}
          {['picked_up', 'in_transit', 'delivery_assigned'].includes(detail.status) && <Button onClick={complete}>Complete manually</Button>}
        </Space>
      </div>}
    </Drawer>
  </div>;
};
export default OrdersPage;
