import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App, Badge, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space,
  Statistic, Switch, Table, Tabs, Tag, Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  adjustRideFare, assignRide, cancelRide, deleteRidePlace, getRidePartners, getRidePlaces, getRideSettings,
  getRideSummary, getRides, markRidePaid, saveRidePlace, saveRideSettings, setRidePartner,
} from '../../api/admin';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  requested: 'orange', accepted: 'blue', arrived: 'cyan', in_progress: 'geekblue', completed: 'green', cancelled: 'red', expired: 'default',
};
const err = (e: any, fb: string) => e?.response?.data?.detail?.message || e?.response?.data?.detail || fb;
const money = (n: number) => `₹${Number(n || 0).toFixed(0)}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

interface RideRow {
  id: string; ride_number: string; status: string; fare: number; distance_km: number; payment_method: string; payment_status: string;
  payment_ref?: string; paid_at?: string; requested_at?: string; completed_at?: string; cancel_reason?: string; assigned_by_admin: boolean;
  fare_adjusted_reason?: string;
  pickup: { text: string }; drop: { text: string };
  rider: { id: string; name: string; phone: string } | null; customer: { name: string; phone: string } | null;
}
interface Partner { id: string; name: string; phone: string; online: boolean; ride_enabled: boolean; state: string; completed_rides: number; upi_id?: string; account_status: string }

// ── Bookings ────────────────────────────────────────────────────────────────

const Bookings: React.FC<{ forcedStatus?: string; payments?: boolean }> = ({ forcedStatus, payments }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<RideRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(forcedStatus || '');
  const [pay, setPay] = useState<string>('');
  const [method, setMethod] = useState<string>('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [assigning, setAssigning] = useState<RideRow | null>(null);
  const [riderId, setRiderId] = useState<string>();
  const [open, setOpen] = useState<RideRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: payments ? 100 : 20 };
      if (status) params.status = status;
      if (pay) params.payment_status = pay;
      if (method) params.payment_method = method;
      const d: any = await getRides(params);
      setRows(d.rides || []);
      setTotal(d.total || 0);
    } catch (e) { message.error(err(e, 'Could not load rides')); } finally { setLoading(false); }
  }, [page, status, pay, method, payments, message]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { // keep the live board fresh without a websocket
    if (payments) return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load, payments]);
  useEffect(() => { getRidePartners().then((p: any) => setPartners(p)).catch(() => undefined); }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); message.success(ok); void load(); setOpen(null); } catch (e) { message.error(err(e, 'Action failed')); }
  };

  const doCancel = (r: RideRow) => {
    let reason = '';
    Modal.confirm({
      title: `Cancel ${r.ride_number}?`,
      content: <Input placeholder="Reason (shown to customer & rider)" onChange={(e) => { reason = e.target.value; }} />,
      okText: 'Cancel ride', okButtonProps: { danger: true },
      onOk: async () => { if (reason.trim().length < 3) { message.warning('Enter a reason'); throw new Error('reason'); } await run(() => cancelRide(r.id, reason.trim()), 'Ride cancelled'); },
    });
  };
  const doFare = (r: RideRow) => {
    let fare = r.fare; let reason = '';
    Modal.confirm({
      title: `Adjust fare · ${r.ride_number}`,
      content: <Space direction="vertical" style={{ width: '100%' }}>
        <InputNumber min={1} defaultValue={r.fare} addonBefore="₹" style={{ width: '100%' }} onChange={(v) => { fare = Number(v); }} />
        <Input placeholder="Reason (e.g. long wait, detour)" onChange={(e) => { reason = e.target.value; }} />
      </Space>,
      onOk: async () => { if (reason.trim().length < 3) { message.warning('Enter a reason'); throw new Error('reason'); } await run(() => adjustRideFare(r.id, fare, reason.trim()), 'Fare updated'); },
    });
  };
  const doPaid = (r: RideRow) => {
    let ref = '';
    Modal.confirm({
      title: `Mark ${money(r.fare)} as received?`,
      content: <Input placeholder="UPI reference / UTR (optional)" onChange={(e) => { ref = e.target.value; }} />,
      onOk: () => run(() => markRidePaid(r.id, ref.trim() || undefined), 'Marked paid'),
    });
  };

  const eligible = useMemo(() => partners.filter((p) => p.ride_enabled && p.account_status === 'active'), [partners]);

  const columns = [
    { title: 'Ride', key: 'n', render: (r: RideRow) => <Space direction="vertical" size={0}><Text strong>{r.ride_number}</Text><Text type="secondary" style={{ fontSize: 12 }}>{when(r.requested_at)}</Text></Space> },
    { title: 'Customer', key: 'c', render: (r: RideRow) => r.customer ? <Space direction="vertical" size={0}><Text>{r.customer.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.customer.phone}</Text></Space> : '—' },
    { title: 'Route', key: 'r', render: (r: RideRow) => <Space direction="vertical" size={0}><Text>{r.pickup.text}</Text><Text type="secondary">→ {r.drop.text}</Text></Space> },
    { title: 'Fare', key: 'f', render: (r: RideRow) => <Space direction="vertical" size={0}><Text strong>{money(r.fare)}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.distance_km.toFixed(1)} km{r.fare_adjusted_reason ? ' · adjusted' : ''}</Text></Space> },
    { title: 'Rider', key: 'rd', render: (r: RideRow) => r.rider ? <Space direction="vertical" size={0}><Text>{r.rider.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.rider.phone}{r.assigned_by_admin ? ' · assigned' : ''}</Text></Space> : <Text type="secondary">—</Text> },
    { title: 'Status', key: 's', render: (r: RideRow) => <Tag color={STATUS_COLOR[r.status]}>{r.status.replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Payment', key: 'p', render: (r: RideRow) => <Space direction="vertical" size={0}><Tag color={r.payment_method === 'upi' ? 'purple' : 'gold'}>{r.payment_method.toUpperCase()}</Tag><Badge status={r.payment_status === 'paid' ? 'success' : 'warning'} text={r.payment_status === 'paid' ? `paid${r.payment_ref ? ` · ${r.payment_ref}` : ''}` : 'pending'} /></Space> },
    ...(payments ? [{ title: 'Paid at', key: 'pa', render: (r: RideRow) => when(r.paid_at) }] : []),
    { title: '', key: 'a', render: (r: RideRow) => (
      <Space wrap>
        {['requested', 'accepted', 'arrived'].includes(r.status) && <Button size="small" type="primary" onClick={() => { setAssigning(r); setRiderId(r.rider?.id); }}>{r.rider ? 'Reassign' : 'Assign'}</Button>}
        {r.status === 'completed' && r.payment_status !== 'paid' && <Button size="small" onClick={() => doPaid(r)}>Mark paid</Button>}
        {!['cancelled', 'expired', 'completed'].includes(r.status) && <Button size="small" danger onClick={() => doCancel(r)}>Cancel</Button>}
        {r.payment_status !== 'paid' && !['cancelled', 'expired'].includes(r.status) && <Button size="small" onClick={() => doFare(r)}>Fare</Button>}
        <Button size="small" type="link" onClick={() => setOpen(r)}>Details</Button>
      </Space>) },
  ];

  const sums = useMemo(() => {
    const done = rows.filter((r) => r.status === 'completed');
    const sum = (f: (r: RideRow) => boolean) => done.filter(f).reduce((a, r) => a + r.fare, 0);
    return { cashPaid: sum((r) => r.payment_method === 'cash' && r.payment_status === 'paid'), upiPaid: sum((r) => r.payment_method === 'upi' && r.payment_status === 'paid'), pending: sum((r) => r.payment_status !== 'paid') };
  }, [rows]);

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {payments && <Row gutter={12}>
        <Col xs={8}><Card size="small"><Statistic title="Cash received" value={sums.cashPaid} prefix="₹" /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="UPI received" value={sums.upiPaid} prefix="₹" /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Pending" value={sums.pending} prefix="₹" valueStyle={{ color: sums.pending ? '#d46b08' : undefined }} /></Card></Col>
      </Row>}
      <Space wrap>
        {!forcedStatus && <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} style={{ width: 160 }} options={[{ value: '', label: 'All statuses' }, ...['requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired'].map((s) => ({ value: s, label: s.replace('_', ' ') }))]} />}
        <Select value={pay} onChange={(v) => { setPay(v); setPage(1); }} style={{ width: 150 }} options={[{ value: '', label: 'Any payment' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} />
        <Select value={method} onChange={(v) => { setMethod(v); setPage(1); }} style={{ width: 130 }} options={[{ value: '', label: 'Cash + UPI' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }]} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
      </Space>
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 1000 }}
        pagination={payments ? false : { current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }} />

      <Modal open={!!assigning} title={`Assign ${assigning?.ride_number}`} onCancel={() => setAssigning(null)} okText="Assign" okButtonProps={{ disabled: !riderId }}
        onOk={async () => { if (assigning && riderId) { await run(() => assignRide(assigning.id, riderId), 'Ride assigned'); setAssigning(null); } }}>
        <Select value={riderId} onChange={setRiderId} placeholder="Choose a ride partner" style={{ width: '100%' }}
          options={eligible.map((p) => ({ value: p.id, disabled: p.state !== 'idle' && p.id !== assigning?.rider?.id, label: `${p.name} · ${p.phone} · ${p.online ? 'online' : 'offline'} · ${p.state.replace('_', ' ')}` }))} />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Busy partners (on a ride or delivery) are disabled. Offline partners can still be assigned manually.</Text>
      </Modal>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={440} title={open?.ride_number}>
        {open && <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[open.status]}>{open.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Customer">{open.customer ? `${open.customer.name} · ${open.customer.phone}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Rider">{open.rider ? `${open.rider.name} · ${open.rider.phone}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Pickup">{open.pickup.text}</Descriptions.Item>
          <Descriptions.Item label="Drop">{open.drop.text}</Descriptions.Item>
          <Descriptions.Item label="Fare">{money(open.fare)} · {open.distance_km.toFixed(1)} km</Descriptions.Item>
          {open.fare_adjusted_reason && <Descriptions.Item label="Adjusted">{open.fare_adjusted_reason}</Descriptions.Item>}
          <Descriptions.Item label="Payment">{open.payment_method.toUpperCase()} · {open.payment_status}{open.payment_ref ? ` · ${open.payment_ref}` : ''}</Descriptions.Item>
          <Descriptions.Item label="Requested">{when(open.requested_at)}</Descriptions.Item>
          <Descriptions.Item label="Completed">{when(open.completed_at)}</Descriptions.Item>
          {open.cancel_reason && <Descriptions.Item label="Cancel reason">{open.cancel_reason}</Descriptions.Item>}
        </Descriptions>}
      </Drawer>
    </Space>
  );
};

// ── Ride partners ───────────────────────────────────────────────────────────

const PartnersTab: React.FC = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setRows((await getRidePartners()) as any); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = async (p: Partner, v: boolean) => {
    try { await setRidePartner(p.id, v); message.success(v ? 'Rides enabled' : 'Rides disabled'); void load(); } catch (e) { message.error(err(e, 'Failed')); }
  };
  return (
    <Table rowKey="id" loading={loading} dataSource={rows} pagination={false} columns={[
      { title: 'Partner', key: 'n', render: (p: Partner) => <Space direction="vertical" size={0}><Text strong>{p.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.phone}</Text></Space> },
      { title: 'Account', dataIndex: 'account_status', render: (s: string) => <Tag color={s === 'active' ? 'green' : 'orange'}>{s}</Tag> },
      { title: 'Online', dataIndex: 'online', render: (v: boolean) => <Badge status={v ? 'success' : 'default'} text={v ? 'Online' : 'Offline'} /> },
      { title: 'Now', dataIndex: 'state', render: (s: string) => <Tag color={s === 'idle' ? 'default' : s === 'on_ride' ? 'purple' : 'blue'}>{s.replace('_', ' ')}</Tag> },
      { title: 'Completed rides', dataIndex: 'completed_rides' },
      { title: 'UPI id', dataIndex: 'upi_id', render: (v?: string) => v || <Text type="secondary">uses platform UPI</Text> },
      { title: 'Takes rides', key: 'e', render: (p: Partner) => <Switch checked={p.ride_enabled} onChange={(v) => toggle(p, v)} /> },
    ]} />
  );
};

// ── Fares & places ──────────────────────────────────────────────────────────

const FaresTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [placeForm] = Form.useForm();
  const [places, setPlaces] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null | 'new'>(null);

  const load = useCallback(async () => {
    form.setFieldsValue(await getRideSettings());
    setPlaces((await getRidePlaces()) as any);
  }, [form]);
  useEffect(() => { void load(); }, [load]);

  const save = async (v: any) => {
    try { await saveRideSettings({ ...v, platform_upi_id: v.platform_upi_id || null }); message.success('Fares saved'); } catch (e) { message.error(err(e, 'Could not save')); }
  };
  const savePlace = async (v: any) => {
    try { await saveRidePlace(v, editing && editing !== 'new' ? editing.id : undefined); setEditing(null); void load(); } catch (e) { message.error(err(e, 'Could not save place')); }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="Fares & service">
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item name="is_enabled" label="Accept new ride bookings" valuePropName="checked"><Switch /></Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="base_fare" label="Base fare (₹)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="per_km" label="Per km (₹)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="min_fare" label="Minimum fare (₹)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="road_factor" label="Road factor" tooltip="Straight-line distance × this ≈ road distance" rules={[{ required: true }]}><InputNumber min={1} max={3} step={0.05} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="max_distance_km" label="Max trip (km)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="request_timeout_minutes" label="Request timeout (min)" rules={[{ required: true }]}><InputNumber min={1} max={60} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Form.Item name="platform_upi_id" label="Fallback UPI id" tooltip="Used when the assigned rider has no UPI id of their own" rules={[{ pattern: /^[\w.-]{2,}@[\w.-]{2,}$/, message: 'e.g. jinni@okaxis' }]}><Input placeholder="jinni@okaxis" /></Form.Item>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>Fare = base + per-km × distance, at least the minimum, rounded up to the next ₹5.</Text>
            <Button type="primary" htmlType="submit">Save fares</Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} lg={14}>
        <Card title="Jinni Spots (pickup / drop shortcuts)" extra={<Button type="primary" onClick={() => { placeForm.resetFields(); placeForm.setFieldsValue({ is_active: true, display_order: places.length }); setEditing('new'); }}>Add spot</Button>}>
          <Table rowKey="id" size="small" dataSource={places} pagination={false} columns={[
            { title: '', dataIndex: 'icon', width: 40 },
            { title: 'Name', key: 'n', render: (p: any) => <Space direction="vertical" size={0}><Text strong>{p.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.area}</Text></Space> },
            { title: 'Lat, Lng', key: 'l', render: (p: any) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` },
            { title: 'Active', dataIndex: 'is_active', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'Hidden'}</Tag> },
            { title: '', key: 'a', render: (p: any) => <Space>
              <Button size="small" onClick={() => { placeForm.setFieldsValue(p); setEditing(p); }}>Edit</Button>
              <Popconfirm title="Delete this spot?" onConfirm={async () => { await deleteRidePlace(p.id); void load(); }}><Button size="small" danger>Delete</Button></Popconfirm>
            </Space> },
          ]} />
        </Card>
      </Col>
      <Modal open={!!editing} title={editing === 'new' ? 'Add spot' : 'Edit spot'} onCancel={() => setEditing(null)} onOk={() => placeForm.submit()}>
        <Form form={placeForm} layout="vertical" onFinish={savePlace}>
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}><Input /></Form.Item>
          <Form.Item name="area" label="Area"><Input /></Form.Item>
          <Form.Item name="icon" label="Emoji"><Input maxLength={4} style={{ width: 90 }} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="lat" label="Latitude" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} step={0.0001} /></Form.Item></Col>
            <Col span={12}><Form.Item name="lng" label="Longitude" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} step={0.0001} /></Form.Item></Col>
          </Row>
          <Text type="secondary">Tip: right-click the place in Google Maps and copy the coordinates.</Text>
          <Row gutter={12} style={{ marginTop: 12 }}>
            <Col span={12}><Form.Item name="display_order" label="Order"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="is_active" label="Visible" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </Row>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export const RidesPage: React.FC = () => {
  const [sum, setSum] = useState<any>(null);
  useEffect(() => {
    const load = () => getRideSummary().then(setSum).catch(() => undefined);
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const pay = (m: string, s: string) => (sum?.today_payments || []).filter((p: any) => p.method === m && p.payment_status === s).reduce((a: number, p: any) => a + p.amount, 0);
  const by = (s: string) => sum?.today_by_status?.[s] || 0;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Title level={3} style={{ margin: 0 }}>🧞 Jinni Carpet · Rides</Title>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Open requests" value={sum?.open_requests ?? 0} valueStyle={{ color: (sum?.open_requests ?? 0) ? '#d46b08' : undefined }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Riders online" value={sum?.riders_online ?? 0} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Completed today" value={by('completed')} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Cancelled today" value={by('cancelled') + by('expired')} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Cash today" value={pay('cash', 'paid')} prefix="₹" /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="UPI today" value={pay('upi', 'paid')} prefix="₹" /></Card></Col>
      </Row>
      <Card>
        <Tabs destroyInactiveTabPane items={[
          { key: 'b', label: 'Bookings', children: <Bookings /> },
          { key: 'p', label: 'Ride partners', children: <PartnersTab /> },
          { key: 'f', label: 'Fares & spots', children: <FaresTab /> },
          { key: 'pay', label: 'Payments', children: <Bookings forcedStatus="completed" payments /> },
        ]} />
      </Card>
    </Space>
  );
};

export default RidesPage;
