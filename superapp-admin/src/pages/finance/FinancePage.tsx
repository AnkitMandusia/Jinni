import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, Table, Tag, Segmented, Button, Modal, Form, Input, InputNumber, Select, App, Space, Empty, Alert, Drawer, Spin, Tooltip } from 'antd';
import { CopyOutlined, BankOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { getFinanceOverview, getFinanceParties, getPartyStatement, createFinanceEntry, getFinanceEntries, getFinanceSettings, saveFinanceSettings, getOnlinePayments } from '../../api/admin';
import { CountUp, StackedBars, Donut } from '../../components/charts';
import { J, inr, when, PAY_COLOR } from '../../theme/jinni';

const err = (e: any, f: string) => (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : f);
const ROLE_LABEL: Record<string, string> = { restaurant: 'Restaurant', store: 'Store', delivery: 'Rider' };
const ROLE_COLOR: Record<string, string> = { restaurant: 'purple', store: 'gold', delivery: 'geekblue' };
const METHOD_LABEL: Record<string, string> = { cod: 'COD (cash to rider)', online: 'Online (Paytm)', wallet: 'Wallet', ride_cash: 'Ride · cash', ride_upi: 'Ride · UPI' };
const METHOD_COLOR: Record<string, string> = { cod: J.g400, online: J.p500, wallet: J.ok, ride_cash: J.g300, ride_upi: J.p300 };

// ── Overview ────────────────────────────────────────────────────────────────
const Overview: React.FC<{ days: number; go: (k: string) => void }> = ({ days, go }) => {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); getFinanceOverview(days).then(setD); }, [days]);
  if (!d) return <div style={{ display: 'grid', placeItems: 'center', height: 240 }}><Spin /></div>;
  const tiles = [
    { l: 'Platform revenue', v: d.revenue, s: `from ${inr(d.gmv)} customer spend`, gold: true },
    { l: 'We owe restaurants & stores', v: d.owed.to_sellers, s: 'ready to pay out', go: 'payouts', alert: d.owed.to_sellers > 0 },
    { l: 'We owe riders', v: d.owed.to_riders, s: 'earnings not yet paid', go: 'payouts' },
    { l: 'Cash riders must deposit', v: d.owed.cash_with_riders, s: 'COD + ride cash they hold', go: 'payouts', alert: d.owed.cash_with_riders > 0 },
  ];
  const mix = Object.entries(d.by_method).filter(([, v]) => (v as number) > 0).map(([k, v]) => ({ label: METHOD_LABEL[k] || k, value: v as number, color: METHOD_COLOR[k] || J.p400 }));
  const rb = Object.entries(d.revenue_breakdown) as [string, number][];
  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
      {tiles.map((t, i) => <div key={t.l} className={`j-tile ${t.gold ? 'gold' : ''} ${t.alert ? 'alert' : ''}`} style={{ animationDelay: `${i * 70}ms`, cursor: t.go ? 'pointer' : 'default' }} onClick={() => t.go && go(t.go)}>
        <div className="lbl">{t.l}</div><div className="val"><CountUp value={t.v} money /></div><div className="sub">{t.s}</div></div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16 }}>
      <div className="j-panel"><h3>Customer spend vs your revenue</h3>
        {d.daily.some((x: any) => x.gmv > 0) ? <StackedBars data={d.daily.map((x: any) => ({ ...x, rest: Math.max(0, x.gmv - x.revenue) }))} xKey="date" series={[{ key: 'revenue', label: 'Platform revenue', color: J.g400 }, { key: 'rest', label: 'Passed to partners / tax', color: J.p300 }]} /> : <Empty description="Nothing delivered yet" />}</div>
      <div className="j-panel"><h3>Where the money came from</h3>{mix.length ? <Donut parts={mix} /> : <Empty description="No payments" />}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16 }}>
      <div className="j-panel"><h3>How revenue is made <span style={{ fontSize: 12, color: J.mute, fontWeight: 500 }}>{d.counts.orders} orders · {d.counts.rides} rides</span></h3>
        {rb.map(([k, v]) => <div className="j-row" key={k}><span>{k}</span><b style={{ color: v < 0 ? J.bad : J.p700 }}>{inr(v)}</b></div>)}
        <div className="j-row"><b>Total revenue</b><b style={{ color: J.p600, fontSize: 18 }}>{inr(d.revenue)}</b></div>
        <div className="j-row"><span style={{ color: J.mute }}>GST collected (pass-through, not revenue)</span><span style={{ color: J.mute }}>{inr(d.tax_collected)}</span></div></div>
      <div className="j-panel"><h3>Money moves in this period</h3>
        <div className="j-row"><span>Paid online (Paytm), settled by Paytm to your bank</span><b>{inr(d.online_paid)}</b></div>
        <div className="j-row"><span>Paid from customer wallets</span><b>{inr(d.wallet_used)}</b></div>
        <div className="j-row"><span>Paid out to partners (recorded)</span><b>{inr(d.movements.paid_out)}</b></div>
        <div className="j-row"><span>Cash deposits received from riders</span><b>{inr(d.movements.deposits_received)}</b></div>
        <div className="j-row"><span style={{ color: d.refunds_pending.count ? J.bad : undefined }}>Refunds to process ({d.refunds_pending.count})</span><b>{inr(d.refunds_pending.amount)}</b></div></div>
    </div>
    <div className="j-panel"><h3>Current rates <a style={{ fontSize: 13 }} onClick={() => go('rates')}>Change →</a></h3>
      <Space wrap size={[10, 10]}><Tag color="purple">Food commission {d.rates.food}%</Tag><Tag color="gold">Grocery commission {d.rates.grocery}%</Tag><Tag color="blue">Rider keeps {d.rates.rider_share}% of delivery fee</Tag><Tag color="geekblue">Ride commission {d.rates.ride}%</Tag></Space></div>
  </div>;
};

// ── Payouts / cash ───────────────────────────────────────────────────────────
const Payouts: React.FC = () => {
  const { message } = App.useApp();
  const [role, setRole] = useState<string>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [minPayout, setMin] = useState(100);
  const [loading, setLoading] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const [stmt, setStmt] = useState<any>(null);
  const [form] = Form.useForm();
  const load = useCallback(async () => { setLoading(true); try { const r: any = await getFinanceParties(role === 'all' ? {} : { role }); setRows(r.parties); setMin(r.min_payout); } finally { setLoading(false); } }, [role]);
  useEffect(() => { void load(); }, [load]);
  const openPay = (r: any) => { setPay(r); form.setFieldsValue({ amount: Math.abs(r.payable), method: r.payable > 0 ? (r.upi ? 'upi' : 'bank') : 'cash', reference: '', note: '' }); };
  const submit = async () => {
    const v = await form.validateFields();
    try { await createFinanceEntry({ party_user_id: pay.user_id, kind: pay.payable > 0 ? 'payout' : 'deposit', ...v }); message.success(pay.payable > 0 ? 'Payout recorded' : 'Deposit recorded'); setPay(null); void load(); }
    catch (e) { message.error(err(e, 'Could not record')); }
  };
  const open = async (r: any) => setStmt(await getPartyStatement(r.user_id));
  const dueNow = rows.filter(r => r.payable >= minPayout && r.role !== 'delivery' || r.payable >= minPayout && r.role === 'delivery').reduce((s, r) => s + r.payable, 0);
  return <div style={{ display: 'grid', gap: 14 }}>
    <Alert type="info" showIcon message="How to settle" description={<span>Pay restaurants, stores and riders from your own UPI/bank app, then <b>record the UTR here</b> so the books match. Riders who collected COD cash or ride money hand it over, and you record the <b>deposit</b>. Balance = what they earned − what they collected − what's already settled. Minimum payout: {inr(minPayout)}.</span>} />
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Segmented value={role} onChange={v => setRole(String(v))} options={[{ label: 'Everyone', value: 'all' }, { label: 'Restaurants', value: 'restaurant' }, { label: 'Stores', value: 'store' }, { label: 'Riders', value: 'delivery' }]} />
      <span style={{ color: J.mute }}>Ready to pay now: <b style={{ color: J.p600 }}>{inr(dueNow)}</b></span>
    </div>
    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <Table rowKey="user_id" loading={loading} dataSource={rows} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: <Empty description="Nothing to settle yet — complete a delivery first" /> }}
        columns={[
          { title: 'Party', render: (_, r: any) => <div><b>{r.name}</b> <Tag color={ROLE_COLOR[r.role]}>{ROLE_LABEL[r.role]}</Tag><div style={{ fontSize: 12, color: J.mute }}>{r.jobs} jobs · {r.phone}</div></div> },
          { title: 'Earned', align: 'right', render: (_, r: any) => inr(r.earned) },
          { title: 'Collected', align: 'right', render: (_, r: any) => r.holds ? <Tooltip title="Cash/UPI the rider took from customers on our behalf">{inr(r.holds)}</Tooltip> : <span style={{ color: J.mute }}>—</span> },
          { title: 'Settled', align: 'right', render: (_, r: any) => <span>{r.paid_out ? `−${inr(r.paid_out)}` : ''}{r.received_in ? ` +${inr(r.received_in)}` : ''}{!r.paid_out && !r.received_in ? '—' : ''}</span> },
          { title: 'Balance', align: 'right', render: (_, r: any) => r.payable > 0 ? <b style={{ color: J.p600 }}>Pay {inr(r.payable)}</b> : r.payable < 0 ? <b style={{ color: J.bad }}>Collect {inr(-r.payable)}</b> : <Tag color="green">settled</Tag> },
          { title: 'Payout to', render: (_, r: any) => r.upi ? <span>{r.upi} <CopyOutlined onClick={e => { e.stopPropagation(); void navigator.clipboard?.writeText(r.upi); message.success('UPI copied'); }} /></span> : r.bank_account ? `${r.bank_account} · ${r.bank_ifsc}` : <Tag color="orange">no account</Tag> },
          { title: '', render: (_, r: any) => <Space onClick={e => e.stopPropagation()}>
            {Math.abs(r.payable) >= 1 && <Button size="small" type="primary" disabled={r.payable > 0 && r.payable < minPayout} onClick={() => openPay(r)}>{r.payable > 0 ? 'Record payout' : 'Record deposit'}</Button>}
            <Button size="small" onClick={() => open(r)}>Statement</Button></Space> },
        ]} />
    </div>

    <Modal open={!!pay} title={pay ? (pay.payable > 0 ? `Pay ${pay.name}` : `Cash deposit from ${pay.name}`) : ''} onCancel={() => setPay(null)} onOk={submit} okText="Record">
      {pay && <Form form={form} layout="vertical">
        <div className="j-panel" style={{ marginBottom: 14, background: J.p50, boxShadow: 'none' }}>
          <div>{pay.payable > 0 ? 'Owed to them' : 'They hold'}: <b>{inr(Math.abs(pay.payable))}</b></div>
          {pay.payable > 0 && <div style={{ color: J.mute, fontSize: 13 }}>Send to: {pay.upi || (pay.bank_account ? `${pay.bank_account} · ${pay.bank_ifsc}` : 'no payout account saved — ask them to add UPI/bank in their app')}</div>}
          {pay.payable < 0 && <div style={{ color: J.mute, fontSize: 13 }}>They can hand cash over or UPI it to your platform UPI id (set under Rates).</div>}
        </div>
        <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}><InputNumber min={1} max={Math.abs(pay.payable)} step={10} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="method" label="How"><Select options={[{ value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank transfer (IMPS/NEFT)' }, { value: 'cash', label: 'Cash' }]} /></Form.Item>
        <Form.Item noStyle shouldUpdate={(a, b) => a.method !== b.method}>{({ getFieldValue }) => <Form.Item name="reference" label={getFieldValue('method') === 'cash' ? 'Receipt / note (optional)' : 'UTR / transaction id'} rules={getFieldValue('method') === 'cash' ? [] : [{ required: true, min: 6, message: 'Enter the UTR so it can be traced' }]}><Input placeholder="e.g. 4123 5678 9012" /></Form.Item>}</Form.Item>
        <Form.Item name="note" label="Note (optional)"><Input /></Form.Item>
      </Form>}
    </Modal>

    <Drawer width={560} open={!!stmt} onClose={() => setStmt(null)} title={stmt ? `${stmt.party.name} — statement` : ''} styles={{ header: { background: J.p50 } }}>
      {stmt && <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {[['Earned', inr(stmt.party.earned)], ['Collected', inr(stmt.party.holds)], ['Paid out', inr(stmt.party.paid_out)], ['Deposits', inr(stmt.party.received_in)]].map(([l, v]) => <div key={l} className="j-tile" style={{ padding: 12, height: "auto" }}><div className="lbl">{l}</div><div className="val" style={{ fontSize: 20 }}>{v}</div></div>)}</div>
        <div><b style={{ color: J.p700 }}>Settlements</b>{stmt.entries.map((e: any) => <div className="j-row" key={e.id}><span><Tag color={e.direction === 'out' ? 'purple' : 'green'}>{e.kind}</Tag> {e.method.toUpperCase()} {e.reference || ''}<div style={{ fontSize: 11, color: J.mute }}>{when(e.created_at)}{e.note ? ` · ${e.note}` : ''}</div></span><b>{e.direction === 'out' ? '−' : '+'}{inr(e.amount)}</b></div>)}{!stmt.entries.length && <Empty description="No settlements yet" />}</div>
        <div><b style={{ color: J.p700 }}>Recent jobs</b>{stmt.lines.map((l: any, i: number) => <div className="j-row" key={i}><span>#{l.ref} <Tag>{l.kind}</Tag><div style={{ fontSize: 11, color: J.mute }}>{when(l.at)} · {l.note}</div></span><span>{l.earned ? <b style={{ color: J.ok }}>+{inr(l.earned)}</b> : ''}{l.held ? <span style={{ color: J.bad }}> held {inr(l.held)}</span> : ''}</span></div>)}</div>
      </div>}
    </Drawer>
  </div>;
};

// ── Ledger ───────────────────────────────────────────────────────────────────
const Ledger: React.FC<{ days: number }> = ({ days }) => {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { getFinanceEntries({ days }).then((r: any) => setRows(r.entries)); }, [days]);
  return <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}><Table rowKey="id" dataSource={rows} pagination={{ pageSize: 12, showSizeChanger: false }} locale={{ emptyText: <Empty description="No payouts or deposits recorded in this period" /> }} scroll={{ x: 700 }}
    columns={[{ title: 'When', dataIndex: 'created_at', render: v => when(v) }, { title: 'Party', render: (_, r: any) => <span>{r.party} <Tag color={ROLE_COLOR[r.party_role]}>{ROLE_LABEL[r.party_role]}</Tag></span> },
      { title: 'Type', render: (_, r: any) => <Tag color={r.direction === 'out' ? 'purple' : 'green'}>{r.kind}</Tag> }, { title: 'Method', dataIndex: 'method', render: v => v.toUpperCase() }, { title: 'Reference', dataIndex: 'reference', render: v => v || '—' },
      { title: 'Amount', align: 'right', render: (_, r: any) => <b style={{ color: r.direction === 'out' ? J.p600 : J.ok }}>{r.direction === 'out' ? '−' : '+'}{inr(r.amount)}</b> }]} /></div>;
};

// ── Online (Paytm) ───────────────────────────────────────────────────────────
const Online: React.FC<{ days: number }> = ({ days }) => {
  const [d, setD] = useState<any>(null);
  useEffect(() => { getOnlinePayments(days).then(setD); }, [days]);
  if (!d) return <div style={{ display: 'grid', placeItems: 'center', height: 200 }}><Spin /></div>;
  return <div style={{ display: 'grid', gap: 14 }}>
    <div className="j-panel"><h3><span><BankOutlined /> Paytm gateway</span><Tag color={d.gateway.configured ? 'green' : 'red'}>{d.gateway.configured ? 'configured' : 'not configured'}</Tag></h3>
      <div className="j-row"><span>Environment</span><b>{d.gateway.environment}</b></div><div className="j-row"><span>Merchant id</span><b>{d.gateway.merchant_id || '—'}</b></div>
      <div className="j-row"><span>Paid in this period</span><b>{inr(d.paid)}</b></div><div className="j-row"><span>Refunds to process</span><b style={{ color: d.refund_pending ? J.bad : undefined }}>{inr(d.refund_pending)}</b></div>
      <div style={{ color: J.mute, fontSize: 12, marginTop: 8 }}>Settlement from Paytm to your bank, MDR and chargebacks live in the Paytm business dashboard. Match its TXNID with the column below to reconcile.</div></div>
    <div className="j-panel" style={{ padding: 0, overflow: 'hidden' }}><Table rowKey="order_number" dataSource={d.transactions} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} locale={{ emptyText: <Empty description="No online payments yet — customers paying by COD, wallet or ride cash do not appear here" /> }}
      columns={[{ title: 'Order', dataIndex: 'order_number', render: (v, r: any) => <div><b>#{v}</b><div style={{ fontSize: 11, color: J.mute }}>{when(r.at)}</div></div> }, { title: 'Paytm TXNID', dataIndex: 'txn_id', render: v => v || '—' }, { title: 'Reference', dataIndex: 'reference', render: v => v || '—' },
        { title: 'Payment', dataIndex: 'status', render: v => <Tag color={PAY_COLOR[v]}>{v.replace('_', ' ')}</Tag> }, { title: 'Order', dataIndex: 'order_status', render: v => v.replace(/_/g, ' ') }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: v => <b>{inr(v)}</b> }]} /></div>
  </div>;
};

// ── Rates ────────────────────────────────────────────────────────────────────
const Rates: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  useEffect(() => { getFinanceSettings().then((s: any) => form.setFieldsValue(s)); }, [form]);
  const save = async () => { const v = await form.validateFields(); try { await saveFinanceSettings({ ...v, platform_upi_id: v.platform_upi_id || null }); message.success('Saved — applies to jobs completed from now on'); } catch (e) { message.error(err(e, 'Could not save')); } };
  const pct = (name: string, label: string, tip: string) => <Form.Item name={name} label={label} tooltip={tip}><InputNumber min={0} max={100} step={0.5} addonAfter="%" style={{ width: '100%' }} /></Form.Item>;
  return <div className="j-panel" style={{ maxWidth: 720 }}><Form form={form} layout="vertical" onFinish={save}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0 18px' }}>
      {pct('food_commission_pct', 'Food commission', 'Platform cut of the food item subtotal. Restaurant gets the rest.')}
      {pct('grocery_commission_pct', 'Grocery commission', 'Platform cut of the grocery item subtotal. The store gets the rest.')}
      {pct('rider_delivery_share_pct', 'Rider share of delivery fee', 'Rider keeps this % of the delivery fee. 100% = rider keeps all; platform earns only commission.')}
      {pct('ride_commission_pct', 'Ride commission', 'Platform cut of each ride fare. Rider keeps the rest.')}
      <Form.Item name="min_payout" label="Minimum payout (₹)" tooltip="Don't pay out smaller balances; let them accumulate."><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="payout_cycle_days" label="Payout cycle (days)" tooltip="How often you plan to settle. Informational — shown to partners."><InputNumber min={1} max={31} style={{ width: '100%' }} /></Form.Item>
    </div>
    <Form.Item name="platform_upi_id" label="Platform UPI id (riders deposit cash here)" rules={[{ pattern: /^[\w.\-]{2,}@[\w.\-]{2,}$/, message: 'e.g. jinni@okaxis' }]}><Input placeholder="jinni@okaxis" /></Form.Item>
    <Alert type="warning" showIcon style={{ marginBottom: 14 }} message="Changing rates only affects jobs completed afterwards. Completed jobs keep the split they were frozen with, so past books never change." />
    <Button type="primary" htmlType="submit">Save rates</Button></Form></div>;
};

// ── How money flows ──────────────────────────────────────────────────────────
const Flow: React.FC = () => {
  const box = (t: string, s: string, bg = '#fff') => <div style={{ background: bg, border: `1px solid ${J.p100}`, borderRadius: 14, padding: '10px 14px', minWidth: 150, boxShadow: '0 4px 14px rgba(94,47,184,.06)' }}><b style={{ color: J.p700 }}>{t}</b><div style={{ fontSize: 12, color: J.mute }}>{s}</div></div>;
  const arrow = <ArrowRightOutlined style={{ color: J.g500 }} />;
  const row = (label: string, items: React.ReactNode[]) => <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: J.g600, marginBottom: 6 }}>{label}</div><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{items.flatMap((x, i) => (i ? [<span key={'a' + i}>{arrow}</span>, x] : [x]))}</div></div>;
  return <div className="j-panel">
    {row('ONLINE (PAYTM)', [box('Customer pays', 'Paytm / UPI app'), box('Paytm', 'settles to your bank (T+1)'), box('Platform bank', 'money is yours to distribute')])}
    {row('COD (CASH ON DELIVERY)', [box('Customer pays cash', 'to the rider at the door'), box('Rider holds it', 'shows as "Collect" in Payouts'), box('Rider deposits', 'hand over / UPI → you record deposit')])}
    {row('RIDES (CASH / UPI)', [box('Customer pays rider', 'cash or rider UPI'), box('Rider keeps fare', 'owes you commission + any cancellation dues')])}
    {row('PAYING PARTNERS', [box('Restaurant / store', 'earns item total − commission'), box('You pay by UPI / bank', 'weekly, above min payout'), box('Record UTR here', 'ledger is append-only')])}
    <Alert type="info" showIcon message="Why this works for a small city" description="Everything is netted per person. A rider who earned ₹800 and collected ₹1,500 COD simply deposits the ₹700 difference — you never move money both ways. Restaurants and stores are paid from what you collected (Paytm balance + rider deposits). Automate later with Paytm/Razorpay payouts using the same ledger." />
  </div>;
};

export const FinancePage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState('overview');
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ FINANCE</div><h1>Money control room</h1><p>Revenue, what you owe, what riders hold, payouts and Paytm — one place.</p></div>
      <div style={{ position: 'relative', zIndex: 1 }}><Segmented value={days} onChange={v => setDays(Number(v))} options={[{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '90d', value: 90 }]} /></div></div>
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'overview', label: 'Overview', children: <Overview days={days} go={setTab} /> },
      { key: 'payouts', label: 'Payouts & cash', children: <Payouts /> },
      { key: 'ledger', label: 'Ledger', children: <Ledger days={days} /> },
      { key: 'online', label: 'Paytm / online', children: <Online days={days} /> },
      { key: 'rates', label: 'Rates', children: <Rates /> },
      { key: 'flow', label: 'How money flows', children: <Flow /> },
    ]} />
  </div>;
};
export default FinancePage;
