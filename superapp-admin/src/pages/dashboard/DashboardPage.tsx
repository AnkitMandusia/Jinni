import React, { useCallback, useEffect, useState } from 'react';
import { Row, Col, Spin, Alert, Tag, Button, Segmented, Empty } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getOverview } from '../../api/admin';
import { CountUp, StackedBars, Donut } from '../../components/charts';
import { J, inr, when, STATUS_COLOR, PAY_COLOR } from '../../theme/jinni';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export const DashboardPage: React.FC = () => {
  const nav = useNavigate();
  const [days, setDays] = useState(7);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setD(await getOverview(days)); setErr(''); } catch { setErr('Could not load the overview. Is the API running?'); } finally { setBusy(false); }
  }, [days]);
  useEffect(() => { void load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (!d && !err) return <div style={{ display: 'grid', placeItems: 'center', marginTop: 90 }}><Spin size="large" /></div>;
  if (err && !d) return <Alert type="error" showIcon message={err} />;

  const t = d.today, p = d.period, a = d.attention;
  const payParts = (rows: any[]) => rows.reduce((m: Record<string, number>, r: any) => { const k = `${r.method === 'cod' || r.method === 'cash' ? 'Cash' : r.method === 'upi' ? 'UPI' : r.method === 'wallet' ? 'Wallet' : 'Online'}`; m[k] = (m[k] || 0) + r.amount; return m; }, {});
  const mix = { ...payParts(d.payments.orders) };
  for (const [k, v] of Object.entries(payParts(d.payments.rides))) mix[k] = (mix[k] || 0) + (v as number);
  const mixColors: Record<string, string> = { Cash: J.g400, UPI: J.p500, Online: J.p300, Wallet: J.ok };
  const statusTotal = Object.values(d.orders_by_status).reduce((s: number, v: any) => s + v, 0) as number || 1;
  const attention = [
    a.open_sos > 0 && { k: 'sos', text: `${a.open_sos} open SOS`, to: '/rides?tab=sos', danger: true },
    a.pending_partners > 0 && { k: 'pp', text: `${a.pending_partners} partner${a.pending_partners > 1 ? 's' : ''} waiting for approval`, to: '/users' },
    a.refunds_pending > 0 && { k: 'rf', text: `${a.refunds_pending} refund${a.refunds_pending > 1 ? 's' : ''} to process`, to: '/payments' },
    a.low_stock > 0 && { k: 'ls', text: `${a.low_stock} product${a.low_stock > 1 ? 's' : ''} low or out of stock`, to: '/products' },
    a.stuck_orders > 0 && { k: 'st', text: `${a.stuck_orders} order${a.stuck_orders > 1 ? 's' : ''} waiting 10+ min for a seller`, to: '/orders' },
  ].filter(Boolean) as any[];
  const tiles = [
    { l: "Today's sales", v: t.sales + t.fares, money: true, s: `${t.orders} orders · ${t.rides} rides`, gold: true },
    { l: 'Food & grocery', v: t.sales, money: true, s: `${t.orders} orders today`, to: '/orders' },
    { l: 'Rides', v: t.fares, money: true, s: `${t.rides} completed today`, to: '/rides' },
    { l: `Last ${days} days`, v: p.sales + p.fares, money: true, s: `${p.orders} orders · ${p.rides} rides` },
  ];

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero">
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="j-kicker">✦ JINNI CONTROL ROOM</div>
        <h1>{greet()} — here's your city today</h1>
        <p>Food, grocery and Jinni Carpet rides in one place. Refreshes every 30 s.</p>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Segmented value={days} onChange={v => setDays(Number(v))} options={[{ label: '7d', value: 7 }, { label: '14d', value: 14 }, { label: '30d', value: 30 }]} />
        <Button shape="circle" icon={<ReloadOutlined spin={busy} />} onClick={() => void load()} aria-label="Refresh" />
      </div>
    </div>

    {attention.length > 0 && <div className="j-panel" style={{ borderColor: J.g300, background: '#FFFBF0' }}>
      <h3 style={{ color: J.warn }}><span><WarningOutlined /> Needs your attention</span></h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {attention.map(x => <span key={x.k} className="j-chip" style={x.danger ? { background: '#FEE4E2', color: J.bad } : undefined} onClick={() => nav(x.to)}>{x.text} →</span>)}
      </div>
    </div>}

    <Row gutter={[16, 16]}>
      {tiles.map((x, i) => <Col xs={12} lg={6} key={x.l}>
        <div className={`j-tile ${x.gold ? 'gold' : ''}`} style={{ animationDelay: `${i * 70}ms`, cursor: x.to ? 'pointer' : 'default' }} onClick={() => x.to && nav(x.to)}>
          <div className="lbl">{x.l}</div><div className="val"><CountUp value={x.v} money={x.money} /></div><div className="sub">{x.s}</div>
        </div>
      </Col>)}
    </Row>

    <Row gutter={[16, 16]}>
      <Col xs={24} lg={15}><div className="j-panel"><h3>Sales per day</h3>
        {d.series.some((r: any) => r.food + r.grocery + r.rides > 0)
          ? <StackedBars data={d.series} xKey="date" series={[{ key: 'food', label: 'Food', color: J.p500 }, { key: 'grocery', label: 'Grocery', color: J.p300 }, { key: 'rides', label: 'Rides', color: J.g400 }]} />
          : <Empty description="No sales in this period yet" />}
      </div></Col>
      <Col xs={24} lg={9}><div className="j-panel"><h3>How customers pay</h3>
        {Object.keys(mix).length ? <Donut parts={Object.entries(mix).map(([label, value]) => ({ label, value: value as number, color: mixColors[label] || J.p400 }))} /> : <Empty description="No payments yet" />}
        <div style={{ marginTop: 12 }}><a onClick={() => nav('/payments')}>Open payment records →</a></div>
      </div></Col>
    </Row>

    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}><div className="j-panel"><h3>Orders by status</h3>
        {Object.entries(d.orders_by_status).sort((x: any, y: any) => y[1] - x[1]).map(([s, c]: any) => <div key={s} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><Tag color={STATUS_COLOR[s]} style={{ margin: 0 }}>{s.replace(/_/g, ' ')}</Tag><b>{c}</b></div>
          <div className="j-bar" style={{ marginTop: 4 }}><i style={{ width: `${(c / statusTotal) * 100}%` }} /></div></div>)}
        {!Object.keys(d.orders_by_status).length && <Empty description="No orders yet" />}
      </div></Col>
      <Col xs={24} lg={8}><div className="j-panel"><h3>Best sellers</h3>
        {d.top_items.map((x: any, i: number) => <div className="j-row" key={x.name}><span><b style={{ color: J.g500 }}>#{i + 1}</b> {x.name}</span><span style={{ color: J.mute }}>{x.qty} sold · {inr(x.amount)}</span></div>)}
        {!d.top_items.length && <Empty description="Nothing sold yet" />}
      </div></Col>
      <Col xs={24} lg={8}><div className="j-panel"><h3>Top restaurants & stores</h3>
        {d.top_sellers.map((x: any) => <div className="j-row" key={x.id}><span>{x.name}</span><span style={{ color: J.mute }}>{x.orders} orders · <b style={{ color: J.p600 }}>{inr(x.sales)}</b></span></div>)}
        {!d.top_sellers.length && <Empty description="No seller sales yet" />}
      </div></Col>
    </Row>

    {d.sla && <div className="j-panel"><h3>Service quality (SLA) <span style={{ fontSize: 12, color: J.mute, fontWeight: 500 }}>target: delivered within {d.sla.target_min} min</span></h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
        {[['Sellers accept in', d.sla.accept_avg_min == null ? '—' : `${d.sla.accept_avg_min} min`], ['Order → delivered', d.sla.deliver_avg_min == null ? '—' : `${d.sla.deliver_avg_min} min`],
          ['Late deliveries', d.sla.late_pct == null ? '—' : `${d.sla.late_pct}%`], ['Cancelled / rejected', d.sla.cancel_pct == null ? '—' : `${d.sla.cancel_pct}%`]].map(([l, v]) =>
          <div key={String(l)}><div style={{ fontSize: 12, color: J.mute }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: J.p700 }}>{v}</div></div>)}
      </div></div>}

    <div className="j-panel"><h3>Latest orders <a style={{ fontSize: 13, fontWeight: 600 }} onClick={() => nav('/orders')}>See all →</a></h3>
      {d.recent_orders.map((o: any) => <div className="j-row" key={o.id} style={{ flexWrap: 'wrap' }}>
        <span><b>#{o.order_number}</b> <Tag style={{ marginLeft: 6 }}>{o.order_type}</Tag> <span style={{ color: J.mute }}>{o.seller}</span></span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Tag color={STATUS_COLOR[o.status]}>{o.status.replace(/_/g, ' ')}</Tag><Tag color={PAY_COLOR[o.payment_status]}>{o.payment_method} · {o.payment_status.replace('_', ' ')}</Tag><b>{inr(o.total_amount)}</b><span style={{ color: J.mute, fontSize: 12 }}>{when(o.created_at)}</span></span>
      </div>)}
      {!d.recent_orders.length && <Empty description="No orders yet" />}
    </div>
  </div>;
};
export default DashboardPage;
