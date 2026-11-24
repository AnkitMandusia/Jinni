import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row,
  Select, Space, Statistic, Switch, Table, Tabs, Tag, Typography,
} from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import {
  adjustRideFare, approveUser, assignRide, bulkActivatePlaces, cancelRide, deleteRidePlace, getPricingPreview,
  getRidePartners, getRidePlaces, getRideSettings, getRideSummary, getRides, getSosList, importOsmPlaces,
  markRidePaid, patchRidePartner, rejectUser, resolveSos, saveRideFare, saveRidePlace, saveRideSettings, waiveRideFee,
} from '../../api/admin';

const { Text, Paragraph } = Typography;

const STATUS_COLOR: Record<string, string> = {
  requested: 'orange', accepted: 'blue', arrived: 'cyan', in_progress: 'geekblue', completed: 'green', cancelled: 'red', expired: 'default',
};
const VEHICLE_LABEL: Record<string, string> = { bike: '🛵 Bike', auto: '🛺 Auto', cab: '🚕 Cab' };
const err = (e: any, fb: string) => {
  const d = e?.response?.data?.detail;
  return (typeof d === 'string' ? d : d?.message) || (Array.isArray(d) ? d.map((x: any) => x.msg).join('; ') : '') || fb;
};
const money = (n: number) => `₹${Number(n || 0).toFixed(0)}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

interface RideRow {
  id: string; ride_number: string; status: string; vehicle_class: string; fare: number; total_payable: number; dues_amount: number;
  boost_amount: number; surge_multiplier: number; cancellation_fee: number; fee_waived: boolean; distance_km: number;
  payment_method: string; payment_status: string; payment_ref?: string; paid_at?: string; requested_at?: string;
  completed_at?: string; cancel_reason?: string; assigned_by_admin: boolean; fare_adjusted_reason?: string;
  rating?: number | null; rating_comment?: string | null;
  pickup: { text: string }; drop: { text: string };
  rider: { id: string; name: string; phone: string; vehicle_number?: string; vehicle_class?: string } | null;
  customer: { name: string; phone: string } | null;
}
interface Partner {
  id: string; name: string; phone: string; email?: string; account_status: string; created_at?: string; online: boolean; ride_enabled: boolean;
  upi_id?: string; state: string; completed_rides: number; rating?: number; rating_count?: number;
  vehicle_class?: string; vehicle_number?: string; vehicle_make_model?: string; vehicle_color?: string; license_no?: string; dob?: string;
  dl_expiry?: string; rc_expiry?: string; insurance_expiry?: string; aadhaar_last4?: string; emergency_name?: string; emergency_phone?: string;
  documents_verified: boolean; documents_verified_at?: string; kyc_issues: string[]; ride_block_reason?: string | null;
  take_rides: boolean; take_deliveries: boolean; last_seen?: string | null;
}

// ── Bookings & payments ─────────────────────────────────────────────────────

const Bookings: React.FC<{ forcedStatus?: string; payments?: boolean }> = ({ forcedStatus, payments }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<RideRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(forcedStatus || '');
  const [vehicle, setVehicle] = useState('');
  const [pay, setPay] = useState('');
  const [method, setMethod] = useState('');
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
      if (vehicle) params.vehicle_class = vehicle;
      const d: any = await getRides(params);
      setRows(d.rides || []);
      setTotal(d.total || 0);
    } catch (e) { message.error(err(e, 'Could not load rides')); } finally { setLoading(false); }
  }, [page, status, pay, method, vehicle, payments, message]);

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

  const reasonPrompt = (title: string, placeholder: string, onOk: (reason: string) => Promise<void>) => {
    let reason = '';
    Modal.confirm({ title, content: <Input placeholder={placeholder} onChange={(e) => { reason = e.target.value; }} />,
      onOk: async () => { if (reason.trim().length < 3) { message.warning('Enter a reason'); throw new Error('reason'); } await onOk(reason.trim()); } });
  };
  const doCancel = (r: RideRow) => reasonPrompt(`Cancel ${r.ride_number}?`, 'Reason (shown to customer & rider)', (reason) => run(() => cancelRide(r.id, reason), 'Ride cancelled'));
  const doWaive = (r: RideRow) => reasonPrompt(`Waive the ${money(r.cancellation_fee)} cancellation fee?`, 'Reason (e.g. rider at fault, customer complaint)', (reason) => run(() => waiveRideFee(r.id, reason), 'Fee waived'));
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
    Modal.confirm({ title: `Mark ${money(r.total_payable)} as received?`, content: <Input placeholder="UPI reference / UTR (optional)" onChange={(e) => { ref = e.target.value; }} />,
      onOk: () => run(() => markRidePaid(r.id, ref.trim() || undefined), 'Marked paid') });
  };

  const eligible = useMemo(() => partners.filter((p) => p.ride_enabled && p.account_status === 'active' && p.documents_verified), [partners]);
  const forAssign = assigning ? eligible.filter((p) => p.vehicle_class === assigning.vehicle_class) : [];

  const columns = [
    { title: 'Ride', key: 'n', render: (r: RideRow) => <Space direction="vertical" size={0}><Text strong>{r.ride_number}</Text><Text type="secondary" style={{ fontSize: 12 }}>{when(r.requested_at)}</Text></Space> },
    { title: 'Customer', key: 'c', render: (r: RideRow) => r.customer ? <Space direction="vertical" size={0}><Text>{r.customer.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.customer.phone}</Text></Space> : '—' },
    { title: 'Route', key: 'r', render: (r: RideRow) => <Space direction="vertical" size={0}><Text>{r.pickup.text}</Text><Text type="secondary">→ {r.drop.text}</Text></Space> },
    { title: 'Vehicle', dataIndex: 'vehicle_class', render: (v: string) => VEHICLE_LABEL[v] || v },
    { title: 'Fare', key: 'f', render: (r: RideRow) => (
      <Space direction="vertical" size={0}>
        <Text strong>{money(r.total_payable)}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.distance_km.toFixed(1)} km
          {r.surge_multiplier > 1 ? ` · ×${r.surge_multiplier}` : ''}{r.boost_amount > 0 ? ` · +${money(r.boost_amount)} boost` : ''}{r.dues_amount > 0 ? ` · incl. ${money(r.dues_amount)} dues` : ''}{r.fare_adjusted_reason && !r.fare_adjusted_reason.startsWith('Fee') ? ' · adjusted' : ''}</Text>
      </Space>) },
    { title: 'Rider', key: 'rd', render: (r: RideRow) => r.rider ? <Space direction="vertical" size={0}><Text>{r.rider.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.rider.phone}{r.rider.vehicle_number ? ` · ${r.rider.vehicle_number}` : ''}{r.assigned_by_admin ? ' · assigned' : ''}</Text></Space> : <Text type="secondary">—</Text> },
    { title: 'Status', key: 's', render: (r: RideRow) => (
      <Space direction="vertical" size={0}>
        <Tag color={STATUS_COLOR[r.status]}>{r.status.replace('_', ' ').toUpperCase()}</Tag>
        {r.cancellation_fee > 0 && <Tag color={r.fee_waived ? 'default' : 'volcano'}>{r.fee_waived ? 'fee waived' : `fee ${money(r.cancellation_fee)}`}</Tag>}
        {r.rating ? <Text style={{ fontSize: 12 }}>{'★'.repeat(r.rating)}</Text> : null}
      </Space>) },
    { title: 'Payment', key: 'p', render: (r: RideRow) => <Space direction="vertical" size={0}><Tag color={r.payment_method === 'upi' ? 'purple' : 'gold'}>{r.payment_method.toUpperCase()}</Tag><Badge status={r.payment_status === 'paid' ? 'success' : 'warning'} text={r.payment_status === 'paid' ? `paid${r.payment_ref ? ` · ${r.payment_ref}` : ''}` : 'pending'} /></Space> },
    ...(payments ? [{ title: 'Paid at', key: 'pa', render: (r: RideRow) => when(r.paid_at) }] : []),
    { title: '', key: 'a', render: (r: RideRow) => (
      <Space wrap>
        {['requested', 'accepted', 'arrived'].includes(r.status) && <Button size="small" type="primary" onClick={() => { setAssigning(r); setRiderId(r.rider?.id); }}>{r.rider ? 'Reassign' : 'Assign'}</Button>}
        {r.status === 'completed' && r.payment_status !== 'paid' && <Button size="small" onClick={() => doPaid(r)}>Mark paid</Button>}
        {!['cancelled', 'expired', 'completed'].includes(r.status) && <Button size="small" danger onClick={() => doCancel(r)}>Cancel</Button>}
        {r.cancellation_fee > 0 && !r.fee_waived && <Button size="small" onClick={() => doWaive(r)}>Waive fee</Button>}
        {r.payment_status !== 'paid' && !['cancelled', 'expired'].includes(r.status) && <Button size="small" onClick={() => doFare(r)}>Fare</Button>}
        <Button size="small" type="link" onClick={() => setOpen(r)}>Details</Button>
      </Space>) },
  ];

  const sums = useMemo(() => {
    const done = rows.filter((r) => r.status === 'completed');
    const sum = (f: (r: RideRow) => boolean) => done.filter(f).reduce((a, r) => a + r.total_payable, 0);
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
        {!forcedStatus && <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} style={{ width: 150 }} options={[{ value: '', label: 'All statuses' }, ...['requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired'].map((s) => ({ value: s, label: s.replace('_', ' ') }))]} />}
        <Select value={vehicle} onChange={(v) => { setVehicle(v); setPage(1); }} style={{ width: 130 }} options={[{ value: '', label: 'All vehicles' }, { value: 'bike', label: 'Bike' }, { value: 'auto', label: 'Auto' }, { value: 'cab', label: 'Cab' }]} />
        <Select value={pay} onChange={(v) => { setPay(v); setPage(1); }} style={{ width: 140 }} options={[{ value: '', label: 'Any payment' }, { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} />
        <Select value={method} onChange={(v) => { setMethod(v); setPage(1); }} style={{ width: 120 }} options={[{ value: '', label: 'Cash + UPI' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }]} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>Refresh</Button>
      </Space>
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 1200 }}
        pagination={payments ? false : { current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }} />

      <Modal open={!!assigning} title={`Assign ${assigning?.ride_number} (${VEHICLE_LABEL[assigning?.vehicle_class || ''] || ''})`} onCancel={() => setAssigning(null)} okText="Assign" okButtonProps={{ disabled: !riderId }}
        onOk={async () => { if (assigning && riderId) { await run(() => assignRide(assigning.id, riderId), 'Ride assigned'); setAssigning(null); } }}>
        <Select value={riderId} onChange={setRiderId} placeholder="Choose a partner" style={{ width: '100%' }}
          options={forAssign.map((p) => ({ value: p.id, disabled: p.state !== 'idle' && p.id !== assigning?.rider?.id, label: `${p.name} · ${p.vehicle_number || ''} · ${p.online ? 'online' : 'offline'} · ${p.state.replace('_', ' ')}` }))} />
        {forAssign.length === 0 && <Alert style={{ marginTop: 8 }} type="warning" showIcon message={`No verified ${assigning?.vehicle_class} partner is enabled for rides.`} />}
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Only approved, document-verified partners with the matching vehicle can be assigned. Busy partners are disabled.</Text>
      </Modal>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={460} title={open?.ride_number}>
        {open && <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[open.status]}>{open.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Vehicle">{VEHICLE_LABEL[open.vehicle_class]}</Descriptions.Item>
          <Descriptions.Item label="Customer">{open.customer ? `${open.customer.name} · ${open.customer.phone}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Rider">{open.rider ? `${open.rider.name} · ${open.rider.phone}${open.rider.vehicle_number ? ` · ${open.rider.vehicle_number}` : ''}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Pickup">{open.pickup.text}</Descriptions.Item>
          <Descriptions.Item label="Drop">{open.drop.text}</Descriptions.Item>
          <Descriptions.Item label="Fare">{money(open.fare)} ({open.distance_km.toFixed(1)} km){open.surge_multiplier > 1 ? ` · surge ×${open.surge_multiplier}` : ''}{open.boost_amount > 0 ? ` · boost ${money(open.boost_amount)}` : ''}</Descriptions.Item>
          {open.dues_amount > 0 && <Descriptions.Item label="Earlier dues included">{money(open.dues_amount)}</Descriptions.Item>}
          <Descriptions.Item label="Total payable">{money(open.total_payable)}</Descriptions.Item>
          {open.fare_adjusted_reason && <Descriptions.Item label="Adjusted">{open.fare_adjusted_reason}</Descriptions.Item>}
          <Descriptions.Item label="Payment">{open.payment_method.toUpperCase()} · {open.payment_status}{open.payment_ref ? ` · ${open.payment_ref}` : ''}</Descriptions.Item>
          <Descriptions.Item label="Requested">{when(open.requested_at)}</Descriptions.Item>
          <Descriptions.Item label="Completed">{when(open.completed_at)}</Descriptions.Item>
          {open.cancel_reason && <Descriptions.Item label="Cancel reason">{open.cancel_reason}{open.cancellation_fee > 0 ? ` (fee ${money(open.cancellation_fee)}${open.fee_waived ? ', waived' : ''})` : ''}</Descriptions.Item>}
          {open.rating && <Descriptions.Item label="Rating">{'★'.repeat(open.rating)} {open.rating_comment || ''}</Descriptions.Item>}
        </Descriptions>}
      </Drawer>
    </Space>
  );
};

// ── Ride partners (KYC, approval, verification) ─────────────────────────────

const PartnersTab: React.FC = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Partner | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const r = (await getRidePartners()) as any as Partner[]; setRows(r); setOpen((o) => (o ? r.find((x) => x.id === o.id) || null : o)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); message.success(ok); void load(); } catch (e) { message.error(err(e, 'Failed')); } };
  const reject = (p: Partner) => {
    let reason = '';
    Modal.confirm({ title: `Reject ${p.name}?`, content: <Input placeholder="Reason (shown to partner)" onChange={(e) => { reason = e.target.value; }} />,
      onOk: () => act(() => rejectUser(p.id, reason.trim() || 'Documents could not be verified'), 'Partner rejected') });
  };

  const stateTag = (p: Partner) => p.account_status === 'pending_approval' ? <Tag color="orange">Awaiting approval</Tag> : p.account_status !== 'active' ? <Tag color="red">{p.account_status}</Tag> : p.state === 'idle' ? <Tag>idle</Tag> : <Tag color={p.state === 'on_ride' ? 'purple' : 'blue'}>{p.state.replace('_', ' ')}</Tag>;

  return (
    <>
      <Table rowKey="id" loading={loading} dataSource={rows} pagination={false} scroll={{ x: 1000 }} columns={[
        { title: 'Partner', key: 'n', render: (p: Partner) => <Space direction="vertical" size={0}><Text strong>{p.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.phone}</Text></Space> },
        { title: 'Vehicle', key: 'v', render: (p: Partner) => <Space direction="vertical" size={0}><Text>{VEHICLE_LABEL[p.vehicle_class || ''] || '—'}</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.vehicle_number || 'no number'}</Text></Space> },
        { title: 'Account', key: 'a', render: stateTag },
        { title: 'Online', key: 'o', render: (p: Partner) => <Space direction="vertical" size={0}><Badge status={p.online ? 'success' : 'default'} text={p.online ? 'Online' : 'Offline'} />{p.last_seen && <Text type="secondary" style={{ fontSize: 11 }}>seen {when(p.last_seen)}</Text>}</Space> },
        { title: 'Documents', key: 'd', render: (p: Partner) => p.documents_verified ? <Tag color="green" icon={<SafetyCertificateOutlined />}>Verified</Tag> : <Tag color="orange">Not verified</Tag> },
        { title: 'Rides', dataIndex: 'completed_rides' },
        { title: 'Rating', key: 'r', render: (p: Partner) => p.rating_count ? `★ ${p.rating?.toFixed(1)} (${p.rating_count})` : '—' },
        { title: 'Takes rides', key: 'e', render: (p: Partner) => <Switch checked={p.ride_enabled} onChange={(v) => act(() => patchRidePartner(p.id, { ride_enabled: v }), v ? 'Rides enabled' : 'Rides disabled')} /> },
        { title: '', key: 'x', render: (p: Partner) => <Button size="small" type={p.account_status === 'pending_approval' ? 'primary' : 'default'} onClick={() => setOpen(p)}>{p.account_status === 'pending_approval' ? 'Review' : 'Details'}</Button> },
      ]} />

      <Drawer open={!!open} onClose={() => setOpen(null)} width={500} title={open ? `${open.name} · ${VEHICLE_LABEL[open.vehicle_class || ''] || ''}` : ''}
        footer={open && (
          <Space wrap>
            {open.account_status === 'pending_approval' && <>
              <Button type="primary" disabled={!open.documents_verified} onClick={() => act(() => approveUser(open.id), 'Partner approved')}>Approve partner</Button>
              <Button danger onClick={() => reject(open)}>Reject</Button>
            </>}
            <Button type={open.documents_verified ? 'default' : 'primary'} ghost={!open.documents_verified}
              onClick={() => act(() => patchRidePartner(open.id, { documents_verified: !open.documents_verified }), open.documents_verified ? 'Verification removed' : 'Documents verified')}>
              {open.documents_verified ? 'Remove verification' : 'Mark documents verified'}
            </Button>
          </Space>)}>
        {open && <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {open.account_status === 'pending_approval' && (
            <Alert type="info" showIcon message="Verify the ORIGINAL licence, RC and insurance in person, tick ‘Mark documents verified’, then Approve."
              description="Approval is blocked until documents are verified. Partners cannot take rides until both are done." />
          )}
          {open.kyc_issues.length > 0 && <Alert type="error" showIcon message={open.kyc_issues.join(' · ')} />}
          <Descriptions column={1} size="small" bordered title="Vehicle">
            <Descriptions.Item label="Type">{VEHICLE_LABEL[open.vehicle_class || ''] || '—'}</Descriptions.Item>
            <Descriptions.Item label="Registration no.">{open.vehicle_number || '—'}</Descriptions.Item>
            <Descriptions.Item label="Make & model">{[open.vehicle_make_model, open.vehicle_color].filter(Boolean).join(' · ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="RC valid till">{day(open.rc_expiry)}</Descriptions.Item>
            <Descriptions.Item label="Insurance valid till">{day(open.insurance_expiry)}</Descriptions.Item>
          </Descriptions>
          <Descriptions column={1} size="small" bordered title="Rider">
            <Descriptions.Item label="Name">{open.name}</Descriptions.Item>
            <Descriptions.Item label="Phone">{open.phone}</Descriptions.Item>
            <Descriptions.Item label="Date of birth">{day(open.dob)}</Descriptions.Item>
            <Descriptions.Item label="Licence no.">{open.license_no || '—'}</Descriptions.Item>
            <Descriptions.Item label="Licence valid till">{day(open.dl_expiry)}</Descriptions.Item>
            <Descriptions.Item label="Aadhaar (last 4)">{open.aadhaar_last4 || '—'}</Descriptions.Item>
            <Descriptions.Item label="Emergency contact">{open.emergency_name ? `${open.emergency_name} · ${open.emergency_phone}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="UPI id">{open.upi_id || <Text type="secondary">uses platform UPI</Text>}</Descriptions.Item>
            <Descriptions.Item label="Registered">{day(open.created_at)}</Descriptions.Item>
          </Descriptions>
          {open.ride_block_reason && <Alert type="warning" showIcon message={`Can't take rides: ${open.ride_block_reason}`} />}
        </Space>}
      </Drawer>
    </>
  );
};

// ── Pricing & rules ─────────────────────────────────────────────────────────

const PricingTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [fares, setFares] = useState<any[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const mode = Form.useWatch('pricing_mode', form);
  const auto = Form.useWatch('auto_surge_enabled', form);

  const load = useCallback(async () => {
    const s: any = await getRideSettings();
    setFares(s.fares);
    form.setFieldsValue(s);
    setPreview((await getPricingPreview()) as any);
  }, [form]);
  useEffect(() => { void load(); }, [load]);

  const saveFare = async (f: any) => {
    try { await saveRideFare(f.vehicle_class, { label: f.label, base_fare: f.base_fare, per_km: f.per_km, min_fare: f.min_fare, is_enabled: f.is_enabled }); message.success(`${f.label} fares saved`); void load(); } catch (e) { message.error(err(e, 'Could not save')); }
  };
  const save = async (v: any) => {
    const { fares: _f, current_multipliers: _c, ...rest } = v;
    try { await saveRideSettings({ ...rest, platform_upi_id: rest.platform_upi_id || null }); message.success('Settings saved'); void load(); } catch (e) { message.error(err(e, 'Could not save')); }
  };
  const setFareField = (i: number, k: string, val: any) => setFares((fs) => fs.map((f, idx) => (idx === i ? { ...f, [k]: val } : f)));

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Card title="1 · Fare cards (your default prices)" size="small">
          <Paragraph type="secondary" style={{ fontSize: 12 }}>Fare = base + per-km × distance, never below the minimum, rounded up to the next ₹5. These are what customers pay when pricing is <b>Fixed</b>.</Paragraph>
          {fares.map((f, i) => (
            <Card key={f.vehicle_class} size="small" style={{ marginBottom: 10 }} title={VEHICLE_LABEL[f.vehicle_class]} extra={<Switch checked={f.is_enabled} onChange={(v) => setFareField(i, 'is_enabled', v)} checkedChildren="On" unCheckedChildren="Off" />}>
              <Space wrap>
                <InputNumber addonBefore="Base ₹" min={0} value={f.base_fare} onChange={(v) => setFareField(i, 'base_fare', v)} style={{ width: 150 }} />
                <InputNumber addonBefore="Per km ₹" min={0} value={f.per_km} onChange={(v) => setFareField(i, 'per_km', v)} style={{ width: 160 }} />
                <InputNumber addonBefore="Min ₹" min={0} value={f.min_fare} onChange={(v) => setFareField(i, 'min_fare', v)} style={{ width: 140 }} />
                <Button type="primary" size="small" onClick={() => saveFare(f)}>Save</Button>
              </Space>
            </Card>
          ))}
        </Card>
        <Card title="Live price preview" size="small" style={{ marginTop: 16 }} extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} />}>
          <Table size="small" rowKey="vehicle_class" pagination={false} dataSource={preview} columns={[
            { title: 'Vehicle', dataIndex: 'label' },
            { title: 'Multiplier now', key: 'm', render: (p: any) => p.multiplier > 1 ? <Tag color="orange">×{p.multiplier} · {p.reason}</Tag> : <Tag>×1.0</Tag> },
            ...[2, 5, 10].map((km, i) => ({ title: `${km} km`, key: km, render: (p: any) => { const x = p.samples[i]; return x.now !== x.base ? <span><s style={{ color: '#98A2B3' }}>{money(x.base)}</s> <b>{money(x.now)}</b></span> : money(x.now); } })),
            { title: 'Demand', key: 'd', render: (p: any) => <Text type="secondary" style={{ fontSize: 12 }}>{p.open_requests} open · {p.idle_riders} idle</Text> },
          ]} />
        </Card>
      </Col>

      <Col xs={24} xl={14}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Card title="2 · Dynamic pricing (optional)" size="small">
            <Form.Item name="pricing_mode" label="Pricing mode">
              <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'fixed', label: 'Fixed (default)' }, { value: 'dynamic', label: 'Dynamic' }]} />
            </Form.Item>
            <Alert type={mode === 'dynamic' ? 'warning' : 'info'} showIcon style={{ marginBottom: 12 }}
              message={mode === 'dynamic' ? 'Dynamic: price = fare card × multiplier (below), capped at the max.' : 'Fixed: customers always pay exactly the fare card. Everything below is ignored.'}
              description={mode === 'dynamic' ? 'multiplier = special-pricing dial × peak-hour window × live demand. Customers see the multiplier and a ⓘ explanation before booking, and the price is locked once booked.' : 'Switch to Dynamic only when you want surge pricing — e.g. rush hours or rain.'} />
            <div style={{ opacity: mode === 'dynamic' ? 1 : 0.45, pointerEvents: mode === 'dynamic' ? 'auto' : 'none' }}>
              <Row gutter={12}>
                <Col span={8}><Form.Item name="manual_multiplier" label="Special pricing ×" tooltip="Your manual dial: rain, festival, strike… 1.0 = off"><InputNumber min={1} max={3} step={0.05} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item name="max_multiplier" label="Never exceed ×" tooltip="Hard cap on the final multiplier"><InputNumber min={1} max={3} step={0.05} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={8}><Form.Item name="auto_surge_enabled" label="Live demand surge" valuePropName="checked" tooltip="Raise prices automatically when open requests outnumber idle riders"><Switch /></Form.Item></Col>
              </Row>
              {auto && <Form.Item name="auto_surge_step" label="Surge step ×" tooltip="Added for every open request beyond one per idle rider. 0.25 → 2 extra requests = ×1.5"><InputNumber min={0} max={1} step={0.05} style={{ width: 160 }} /></Form.Item>}
              <Text strong>Peak-hour windows (India time)</Text>
              <Form.List name="peak_windows">
                {(fields, { add, remove }) => (<>
                  {fields.map((f) => (
                    <Space key={f.key} align="baseline" wrap style={{ display: 'flex', marginTop: 8 }}>
                      <Form.Item {...f} name={[f.name, 'label']} noStyle><Input placeholder="Label" style={{ width: 130 }} /></Form.Item>
                      <Form.Item {...f} name={[f.name, 'start']} rules={[{ required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'HH:MM' }]} noStyle><Input placeholder="08:00" style={{ width: 80 }} /></Form.Item>
                      <span>to</span>
                      <Form.Item {...f} name={[f.name, 'end']} rules={[{ required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'HH:MM' }]} noStyle><Input placeholder="10:00" style={{ width: 80 }} /></Form.Item>
                      <Form.Item {...f} name={[f.name, 'multiplier']} rules={[{ required: true }]} noStyle><InputNumber min={1} max={3} step={0.05} addonBefore="×" style={{ width: 110 }} /></Form.Item>
                      <MinusCircleOutlined onClick={() => remove(f.name)} />
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => add({ label: 'Busy time', start: '08:00', end: '10:00', multiplier: 1.2 })}>Add window</Button>
                </>)}
              </Form.List>
            </div>
          </Card>

          <Card title="3 · Cancellation, boost & safety" size="small" style={{ marginTop: 16 }}>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="cancel_grace_seconds" label="Free-cancel grace after a rider accepts (sec)"><InputNumber min={0} max={900} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="cancel_fee" label="Cancellation fee (₹, 0 = none)" tooltip="Charged only after the grace period or once the rider has arrived. Carried into the customer's next ride/order. Rider-fault reasons are free."><InputNumber min={0} max={500} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="boost_options" label="‘No rider yet?’ boost options (₹)" tooltip="Buttons customers can tap to add to the fare"><Select mode="tags" tokenSeparators={[',']} placeholder="10, 20, 30" /></Form.Item></Col>
              <Col span={12}><Form.Item name="max_boost" label="Max total boost per ride (₹)"><InputNumber min={0} max={500} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="request_timeout_minutes" label="Request timeout (min)"><InputNumber min={1} max={60} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="sos_helpline" label="Emergency number shown in SOS"><Input style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          </Card>

          <Card title="4 · Service area & basics" size="small" style={{ marginTop: 16 }}>
            <Form.Item name="is_enabled" label="Accept new ride bookings" valuePropName="checked"><Switch /></Form.Item>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="service_lat" label="Centre latitude"><InputNumber style={{ width: '100%' }} step={0.0001} /></Form.Item></Col>
              <Col span={8}><Form.Item name="service_lng" label="Centre longitude"><InputNumber style={{ width: '100%' }} step={0.0001} /></Form.Item></Col>
              <Col span={8}><Form.Item name="service_radius_km" label="Radius (km)" tooltip="Pickups outside this circle are refused. Clear all three to allow anywhere."><InputNumber min={1} max={200} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="road_factor" label="Road factor" tooltip="Straight-line distance × this ≈ road distance"><InputNumber min={1} max={3} step={0.05} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="max_distance_km" label="Max trip (km)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="avg_speed_kmph" label="Avg speed (km/h, for ETA)"><InputNumber min={5} max={80} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="nearby_radius_km" label="Nearby rider radius (km)" tooltip="A vehicle type shows as available only if an idle, verified, online rider of that type reported a location within this distance of the pickup (in the last 5 min)."><InputNumber min={1} max={50} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={16}><Form.Item name="require_nearby_rider" label="Hide vehicle types with no rider nearby" valuePropName="checked" tooltip="On (recommended): customers can't book a vehicle nobody is near. Off: always bookable; you assign manually."><Switch /></Form.Item></Col>
            </Row>
            <Form.Item name="platform_upi_id" label="Fallback UPI id" tooltip="Used when the assigned rider has no UPI id" rules={[{ pattern: /^[\w.-]{2,}@[\w.-]{2,}$/, message: 'e.g. jinni@okaxis' }]}><Input placeholder="jinni@okaxis" /></Form.Item>
          </Card>
          <Button type="primary" htmlType="submit" size="large" style={{ marginTop: 16 }}>Save pricing & rules</Button>
        </Form>
      </Col>
    </Row>
  );
};

// ── Jinni Spots ─────────────────────────────────────────────────────────────

const SpotsTab: React.FC = () => {
  const { message } = App.useApp();
  const [placeForm] = Form.useForm();
  const [importForm] = Form.useForm();
  const [places, setPlaces] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const load = useCallback(async () => { setPlaces((await getRidePlaces()) as any); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { getRideSettings().then((s: any) => importForm.setFieldsValue({ lat: s.service_lat ?? 26.9124, lng: s.service_lng ?? 75.7873, radius_km: 8, limit: 25, activate: false })).catch(() => undefined); }, [importForm]);

  const savePlace = async (v: any) => {
    try { await saveRidePlace(v, editing && editing !== 'new' ? editing.id : undefined); setEditing(null); void load(); } catch (e) { message.error(err(e, 'Could not save place')); }
  };
  const doImport = async (v: any) => {
    setImporting(true);
    try { const r: any = await importOsmPlaces(v); message.success(`Found ${r.found}, added ${r.added} (${r.skipped_existing} already there)${v.activate ? '' : ' — review & switch on the ones you want.'}`); void load(); } catch (e) { message.error(err(e, 'Import failed')); } finally { setImporting(false); }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" title="Import well-known places for your city (free · OpenStreetMap)">
        <Paragraph type="secondary" style={{ fontSize: 12 }}>One click pulls the city's airport, railway & bus stations, hospitals, malls, attractions, colleges and markets, ranked by how well-known they are. They're added <b>hidden</b> so you can review. Customers then see the spots <b>nearest to them first</b>. Works for any city — change the centre point.</Paragraph>
        <Form form={importForm} layout="inline" onFinish={doImport}>
          <Form.Item name="lat" label="Lat" rules={[{ required: true }]}><InputNumber step={0.0001} style={{ width: 120 }} /></Form.Item>
          <Form.Item name="lng" label="Lng" rules={[{ required: true }]}><InputNumber step={0.0001} style={{ width: 120 }} /></Form.Item>
          <Form.Item name="radius_km" label="Radius km"><InputNumber min={1} max={30} style={{ width: 90 }} /></Form.Item>
          <Form.Item name="limit" label="Max spots"><InputNumber min={1} max={60} style={{ width: 90 }} /></Form.Item>
          <Form.Item name="activate" label="Show immediately" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" htmlType="submit" loading={importing}>Import from OpenStreetMap</Button>
        </Form>
      </Card>
      <Card title="Jinni Spots" size="small" extra={<Space>
        <Button disabled={!selected.length} onClick={async () => { await bulkActivatePlaces(selected, true); setSelected([]); void load(); }}>Show selected</Button>
        <Button disabled={!selected.length} onClick={async () => { await bulkActivatePlaces(selected, false); setSelected([]); void load(); }}>Hide selected</Button>
        <Button type="primary" onClick={() => { placeForm.resetFields(); placeForm.setFieldsValue({ is_active: true, display_order: 0 }); setEditing('new'); }}>Add spot</Button></Space>}>
        <Table rowKey="id" size="small" dataSource={places} pagination={{ pageSize: 15 }} rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]) }} columns={[
          { title: '', dataIndex: 'icon', width: 40 },
          { title: 'Name', key: 'n', render: (p: any) => <Space direction="vertical" size={0}><Text strong>{p.name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{p.area}</Text></Space> },
          { title: 'Type', key: 't', render: (p: any) => <Space><Tag>{p.category || 'custom'}</Tag>{p.source === 'osm' && <Tag color="blue">OSM</Tag>}</Space> },
          { title: 'Lat, Lng', key: 'l', render: (p: any) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` },
          { title: 'Visible', dataIndex: 'is_active', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'Hidden'}</Tag> },
          { title: '', key: 'a', render: (p: any) => <Space>
            <Button size="small" onClick={() => { placeForm.setFieldsValue(p); setEditing(p); }}>Edit</Button>
            <Popconfirm title="Delete this spot?" onConfirm={async () => { await deleteRidePlace(p.id); void load(); }}><Button size="small" danger>Delete</Button></Popconfirm>
          </Space> },
        ]} />
      </Card>
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
    </Space>
  );
};

// ── SOS ─────────────────────────────────────────────────────────────────────

const SosTab: React.FC = () => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [scope, setScope] = useState('open');
  const load = useCallback(async () => { setRows((await getSosList(scope)) as any); }, [scope]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);
  const resolve = (s: any) => {
    let text = '';
    Modal.confirm({ title: 'Resolve SOS', content: <Input.TextArea rows={3} placeholder="What happened / what you did" onChange={(e) => { text = e.target.value; }} />,
      onOk: async () => { if (text.trim().length < 3) { message.warning('Add a note'); throw new Error('note'); } await resolveSos(s.id, text.trim()); message.success('Resolved'); void load(); } });
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)} optionType="button" options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All' }]} />
      {rows.length === 0 && <Alert type="success" showIcon message="No SOS alerts" />}
      {rows.map((s) => (
        <Card key={s.id} size="small" style={{ borderColor: s.status === 'open' ? '#F04438' : undefined }}
          title={<Space><Tag color={s.status === 'open' ? 'red' : 'green'}>{s.status.toUpperCase()}</Tag>🚨 {s.raised_by_role === 'customer' ? 'Passenger' : 'Rider'} pressed SOS · {when(s.created_at)}</Space>}
          extra={s.status === 'open' && <Button danger type="primary" onClick={() => resolve(s)}>Resolve</Button>}>
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="Raised by">{s.raised_by.name || '—'} · <a href={`tel:${s.raised_by.phone}`}>{s.raised_by.phone}</a></Descriptions.Item>
            <Descriptions.Item label="Ride">{s.ride?.ride_number} · {s.ride?.status}</Descriptions.Item>
            <Descriptions.Item label="Passenger">{s.ride?.customer ? <>{s.ride.customer.name} · <a href={`tel:${s.ride.customer.phone}`}>{s.ride.customer.phone}</a></> : '—'}</Descriptions.Item>
            <Descriptions.Item label="Rider">{s.ride?.rider ? <>{s.ride.rider.name} · <a href={`tel:${s.ride.rider.phone}`}>{s.ride.rider.phone}</a></> : '—'}</Descriptions.Item>
            <Descriptions.Item label="Vehicle">{s.ride?.rider ? `${s.ride.rider.vehicle_number || ''} ${s.ride.rider.vehicle_make_model || ''} ${s.ride.rider.vehicle_color || ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Route">{s.ride?.pickup.text} → {s.ride?.drop.text}</Descriptions.Item>
            <Descriptions.Item label="Location">{s.map_url ? <a href={s.map_url} target="_blank" rel="noreferrer">Open in Google Maps ↗</a> : 'GPS not shared'}</Descriptions.Item>
            <Descriptions.Item label="Note">{s.note || '—'}</Descriptions.Item>
          </Descriptions>
          {s.status === 'resolved' && <Text type="secondary">Resolved {when(s.resolved_at)}: {s.resolution}</Text>}
          <Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12 }}>Call both parties, and the emergency number ({s.helpline}) if anyone is in danger.</Paragraph>
        </Card>
      ))}
    </Space>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────

export const RidesPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'b';
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
      <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ JINNI CARPET</div><h1>Rides</h1><p>Bookings, riders and approvals, fares and dynamic pricing, Jinni Spots, SOS desk and payments.</p></div></div>
      {!!sum?.open_sos && <Alert type="error" showIcon banner message={`${sum.open_sos} open SOS alert${sum.open_sos > 1 ? 's' : ''} — respond now`} action={<Button danger type="primary" size="small" onClick={() => setParams({ tab: 'sos' })}>Open SOS</Button>} />}
      {!!sum?.pending_partners && <Alert type="info" showIcon message={`${sum.pending_partners} partner${sum.pending_partners > 1 ? 's are' : ' is'} waiting for approval`} action={<Button size="small" onClick={() => setParams({ tab: 'p' })}>Review</Button>} />}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Open requests" value={sum?.open_requests ?? 0} valueStyle={{ color: (sum?.open_requests ?? 0) ? '#d46b08' : undefined }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Riders online" value={sum?.riders_online ?? 0} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Completed today" value={by('completed')} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Cancelled today" value={by('cancelled') + by('expired')} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Cash today" value={pay('cash', 'paid')} prefix="₹" /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="UPI today" value={pay('upi', 'paid')} prefix="₹" /></Card></Col>
      </Row>
      <Card>
        <Tabs destroyInactiveTabPane activeKey={tab} onChange={(k) => setParams({ tab: k })} items={[
          { key: 'b', label: 'Bookings', children: <Bookings /> },
          { key: 'p', label: <Badge count={sum?.pending_partners || 0} size="small" offset={[8, -2]}>Ride partners</Badge>, children: <PartnersTab /> },
          { key: 'f', label: 'Pricing & rules', children: <PricingTab /> },
          { key: 's', label: 'Jinni Spots', children: <SpotsTab /> },
          { key: 'sos', label: <Badge count={sum?.open_sos || 0} size="small" offset={[8, -2]}>SOS</Badge>, children: <SosTab /> },
          { key: 'pay', label: 'Payments', children: <Bookings forcedStatus="completed" payments /> },
        ]} />
      </Card>
    </Space>
  );
};

export default RidesPage;
