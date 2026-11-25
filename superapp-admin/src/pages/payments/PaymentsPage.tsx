import React, { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Select, Segmented, Empty } from 'antd';
import { getPaymentsLedger } from '../../api/admin';
import { CountUp } from '../../components/charts';
import { J, inr, when, PAY_COLOR } from '../../theme/jinni';

const KIND: Record<string, string> = { food: 'purple', grocery: 'gold', ride: 'geekblue' };

export const PaymentsPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<string | undefined>();
  const [method, setMethod] = useState<string | undefined>();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setD(await getPaymentsLedger({ days, kind, method })); } finally { setLoading(false); } }, [days, kind, method]);
  useEffect(() => { void load(); }, [load]);
  const tiles = d ? [
    { l: 'Collected', v: d.collected, s: 'Paid orders + completed rides', gold: true },
    { l: 'Still to collect', v: d.to_collect, s: 'Cash on delivery / UPI not yet confirmed' },
    { l: 'Refunds to pay', v: d.refund_pending, s: 'Paid online, then cancelled', alert: d.refund_pending > 0 },
    { l: 'Refunded', v: d.refunded, s: 'Already returned to customers' },
  ] : [];
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ MONEY</div><h1>Payment records</h1><p>Food, grocery and ride payments in one ledger — cash, UPI and online.</p></div>
      <div style={{ position: 'relative', zIndex: 1 }}><Segmented value={days} onChange={v => setDays(Number(v))} options={[{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '90d', value: 90 }]} /></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16 }}>
      {tiles.map((t, i) => <div key={t.l} className={`j-tile ${t.gold ? 'gold' : ''} ${t.alert ? 'alert' : ''}`} style={{ animationDelay: `${i * 70}ms` }}><div className="lbl">{t.l}</div><div className="val"><CountUp value={t.v} money /></div><div className="sub">{t.s}</div></div>)}
    </div>
    {d && Object.keys(d.by_method).length > 0 && <div className="j-panel"><h3>Collected by method</h3><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {Object.entries(d.by_method).filter(([, v]) => (v as number) > 0).map(([m, v]) => <span key={m} className="j-chip" onClick={() => setMethod(method === m ? undefined : m)} style={method === m ? { background: J.p500, color: '#fff' } : undefined}>{m.toUpperCase()} · {inr(v as number)}</span>)}</div></div>}
    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Select allowClear placeholder="All types" style={{ width: 150 }} value={kind} onChange={setKind} options={[{ value: 'food', label: 'Food' }, { value: 'grocery', label: 'Grocery' }, { value: 'ride', label: 'Rides' }]} />
        <Select allowClear placeholder="All methods" style={{ width: 150 }} value={method} onChange={setMethod} options={['cod', 'online', 'wallet', 'cash', 'upi', 'dues'].map(m => ({ value: m, label: m.toUpperCase() }))} />
      </div>
      <Table rowKey={(r: any) => r.kind + r.ref} loading={loading} dataSource={d?.rows || []} pagination={{ pageSize: 15, showSizeChanger: false }} scroll={{ x: 760 }} locale={{ emptyText: <Empty description="No payments in this period" /> }}
        columns={[
          { title: 'Reference', dataIndex: 'ref', render: (v: string, r: any) => <div><b>#{v}</b><div style={{ fontSize: 11, color: J.mute }}>{when(r.at)}</div></div> },
          { title: 'Type', dataIndex: 'kind', render: (v: string) => <Tag color={KIND[v]}>{v}</Tag> },
          { title: 'Method', dataIndex: 'method', render: (v: string) => v === 'dues' ? <Tag color="orange">cancellation fee</Tag> : v.toUpperCase() },
          { title: 'Payment', dataIndex: 'status', render: (v: string) => <Tag color={PAY_COLOR[v]}>{v.replace('_', ' ')}</Tag> },
          { title: 'Job status', dataIndex: 'order_status', render: (v: string) => <span style={{ color: J.mute }}>{v.replace(/_/g, ' ')}</span> },
          { title: 'Txn id', dataIndex: 'txn', render: (v: string) => v || <span style={{ color: J.mute }}>—</span> },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number) => <b>{inr(v)}</b> },
        ]} />
    </div>
  </div>;
};
export default PaymentsPage;
