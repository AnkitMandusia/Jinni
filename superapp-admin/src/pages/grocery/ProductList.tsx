import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Tag, Typography,
  Modal, Form, InputNumber, Upload, message, Popconfirm, Image,
  Row, Col, Divider, Spin, Tooltip, Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  BarcodeOutlined, UploadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import {
  getProducts, getCategories, createProduct, updateProduct,
  deleteProduct, lookupBarcode, uploadProductImage, adjustStock, getStockLog,
} from '../../api/admin';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

interface Category { id: string; name: string; }
interface Product {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  mrp: number | null;
  unit: string;
  category_id: string;
  category_name: string | null;
  primary_image_url: string | null;
  is_active: boolean;
  is_in_stock: boolean;
  stock_quantity: number;
  owner_type: string;
  barcode: string | null;
  sku: string | null;
  ingredients: string | null;
  nutrition: Record<string, any> | null;
  created_at: string;
}

const OWNER_COLOR: Record<string, string> = { platform: 'blue', store: 'orange' };

export const ProductListPage: React.FC = () => {
  const [products, setProducts]             = useState<Product[]>([]);
  const [categories, setCategories]         = useState<Category[]>([]);
  const [loading, setLoading]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [categoryFilter, setCat]            = useState<string | undefined>();
  const [lowOnly, setLowOnly]               = useState(false);
  const [page, setPage]                     = useState(1);
  const [total, setTotal]                   = useState(0);
  const [modalOpen, setModalOpen]           = useState(false);
  const [editing, setEditing]               = useState<Product | null>(null);
  const [form]                              = Form.useForm();
  const [saving, setSaving]                 = useState(false);
  const [barcodeInput, setBarcodeInput]     = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [imageUrl, setImageUrl]             = useState<string>('');
  const [imageUploading, setImageUploading] = useState(false);

  const PAGE_SIZE = 20;

  const fetchCategories = useCallback(async () => {
    try {
      const res = await getCategories();
      setCategories(res.data?.items ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchProducts = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, page_size: PAGE_SIZE };
      if (search) params.search = search;
      if (categoryFilter) params.category_id = categoryFilter;
      if (lowOnly) params.low_stock = true;
      const res = await getProducts(params);
      setProducts(res.data?.items ?? []);
      setTotal(res.data?.total ?? 0);
      setPage(p);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, categoryFilter, lowOnly]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchProducts(1); }, [search, categoryFilter, lowOnly]); // eslint-disable-line

  // ── Stock adjustment (audited) ────────────────────────────────────────────────
  const openStock = async (p: any) => {
    let delta = 0; let reason = '';
    let log: any[] = [];
    try { log = ((await getStockLog(p.id)) as any).log; } catch { /* optional */ }
    Modal.confirm({
      title: `Adjust stock — ${p.name}`, icon: null, okText: 'Save', width: 460,
      content: (
        <div>
          <p style={{ color: '#6B6482' }}>On hand {p.stock_quantity} · reserved {p.reserved_quantity || 0}. Use + to add, − to remove (damage, expiry, recount).</p>
          <InputNumber style={{ width: '100%', marginBottom: 8 }} placeholder="Change (e.g. 20 or -3)" onChange={(v) => { delta = Number(v || 0); }} />
          <Input placeholder="Reason (required)" onChange={(e) => { reason = e.target.value; }} />
          {log.length > 0 && <div style={{ marginTop: 12, fontSize: 12, color: '#6B6482' }}><b>Recent changes</b>{log.slice(0, 4).map((l, i) => <div key={i}>{l.delta > 0 ? '+' : ''}{l.delta} → {l.after} · {l.reason} · {l.by}</div>)}</div>}
        </div>
      ),
      onOk: async () => {
        try { await adjustStock(p.id, delta, reason); message.success('Stock updated'); fetchProducts(page); }
        catch (e: any) { message.error(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not adjust stock'); throw e; }
      },
    });
  };

  // ── Barcode lookup ───────────────────────────────────────────────────────────
  const handleBarcodeSearch = async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeLoading(true);
    try {
      const res = await lookupBarcode(code);
      const d = res.data;
      if (!d?.found) { message.warning(`No product found for barcode ${code}`); return; }
      form.setFieldsValue({
        name: d.name ?? '',
        brand: d.brand ?? '',
        unit: d.weight ?? '',
        ingredients: d.ingredients ?? '',
        barcode: code,
      });
      if (d.image_url) setImageUrl(d.image_url);
      message.success(`Auto-filled: ${d.name}`);
    } catch { message.error('Barcode lookup failed'); }
    finally { setBarcodeLoading(false); }
  };

  // ── Image upload ─────────────────────────────────────────────────────────────
  const customUpload: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file as File);
      const res = await uploadProductImage(fd);
      const url: string = res.data?.image_url;
      setImageUrl(url);
      form.setFieldValue('primary_image_url', url);
      onSuccess?.(res.data);
      message.success('Image uploaded successfully');
    } catch (e: any) {
      onError?.(e);
      message.error(e?.response?.data?.detail ?? 'Upload failed');
    } finally { setImageUploading(false); }
  };

  // ── Modal helpers ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setImageUrl('');
    setBarcodeInput('');
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name, brand: p.brand, price: p.price, mrp: p.mrp,
      unit: p.unit, category_id: p.category_id, barcode: p.barcode,
      sku: p.sku, ingredients: p.ingredients,
      stock_quantity: p.stock_quantity, is_active: p.is_active,
    });
    setImageUrl(p.primary_image_url ?? '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const slug = (values.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const payload = {
        ...values,
        slug: editing ? undefined : `${slug}-${Date.now()}`,
        primary_image_url: imageUrl || undefined,
        image_urls: imageUrl ? [imageUrl] : [],
      };
      if (editing) {
        await updateProduct(editing.id, payload);
        message.success('Product updated');
      } else {
        await createProduct(payload);
        message.success('Product created');
      }
      setModalOpen(false);
      fetchProducts(1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.detail ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      message.success('Product deleted');
      fetchProducts(page);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? 'Failed to delete');
    }
  };

  const handleToggleActive = async (p: Product, checked: boolean) => {
    try {
      await updateProduct(p.id, { is_active: checked });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_active: checked } : x));
    } catch { message.error('Failed to update'); }
  };

  // ── Table columns ────────────────────────────────────────────────────────────
  const columns: ColumnsType<Product> = [
    {
      title: 'Image',
      dataIndex: 'primary_image_url',
      width: 72,
      render: (url: string | null) =>
        url
          ? <Image src={url} width={48} height={48} style={{ borderRadius: 8, objectFit: 'cover' }} />
          : <div style={{ width: 48, height: 48, background: '#F3F4F6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📦</div>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, r: Product) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {r.brand && <Text type="secondary" style={{ fontSize: 12 }}>{r.brand}</Text>}
          {r.barcode && <Text type="secondary" style={{ fontSize: 11 }}>#{r.barcode}</Text>}
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category_name',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Price',
      render: (_: any, r: Product) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: '#10B981' }}>₹{Number(r.price).toFixed(2)}</Text>
          {r.mrp && Number(r.mrp) > Number(r.price) &&
            <Text delete type="secondary" style={{ fontSize: 12 }}>₹{Number(r.mrp).toFixed(2)}</Text>}
          <Text type="secondary" style={{ fontSize: 11 }}>{r.unit}</Text>
        </Space>
      ),
    },
    {
      title: 'Stock',
      dataIndex: 'stock_quantity',
      render: (v: number, r: any) => { const avail = v - (r.reserved_quantity || 0); const low = avail <= (r.low_stock_threshold ?? 5); return <Space direction="vertical" size={0}><Text strong style={{ color: avail <= 0 ? '#B42318' : low ? '#B54708' : undefined }}>{avail} free</Text><Text type="secondary" style={{ fontSize: 11 }}>{v} on hand{r.reserved_quantity ? ` · ${r.reserved_quantity} reserved` : ''}</Text></Space>; },
    },
    {
      title: 'Owner',
      dataIndex: 'owner_type',
      render: (v: string, r: any) => <Space direction="vertical" size={0}><Tag color={OWNER_COLOR[v] ?? 'default'} style={{ marginInlineEnd: 0 }}>{(v || 'platform').toUpperCase()}</Tag>{v === 'store' && r.owner && <Text type="secondary" style={{ fontSize: 11 }}>{r.owner}</Text>}</Space>,
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      render: (v: boolean, r: Product) => (
        <Switch size="small" checked={v} onChange={(checked) => handleToggleActive(r, checked)} />
      ),
    },
    {
      title: 'Actions',
      render: (_: any, r: Product) => (
        <Space>
          <Tooltip title="Add or remove stock (audited)">
            <Button size="small" onClick={() => openStock(r)}>Stock</Button>
          </Tooltip>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title={`Delete "${r.name}"?`}
            description="This cannot be undone."
            onConfirm={() => handleDelete(r.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="j-hero"><div style={{ position: 'relative', zIndex: 1 }}><div className="j-kicker">✦ GROCERY CATALOGUE</div><h1>Products & prices</h1><p>Prices, MRP and stock for the whole platform. Store-owned products show their store. Customers see changes instantly.</p></div>
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}><div className="j-kicker">PRODUCTS</div><div style={{ fontSize: 30, fontWeight: 800 }}>{total}</div></div></div>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>Catalogue</Title>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Add Product
          </Button>
        }
        bodyStyle={{ padding: 0 }}
      >
        {/* Filters */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
          <Row gutter={12} align="middle">
            <Col flex="1">
              <Search
                placeholder="Search by name…"
                allowClear
                prefix={<SearchOutlined />}
                onSearch={(v) => { setSearch(v); }}
                onChange={(e) => { if (!e.target.value) setSearch(''); }}
              />
            </Col>
            <Col>
              <Select
                placeholder="All categories"
                allowClear
                style={{ width: 200 }}
                value={categoryFilter}
                onChange={(v) => setCat(v)}
              >
                {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Select>
            </Col>
            <Col>
              <span style={{ marginRight: 8, color: '#6B6482' }}>Low stock only</span><Switch checked={lowOnly} onChange={setLowOnly} />
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={() => fetchProducts(page)} />
            </Col>
          </Row>
        </div>

        <Table<Product>
          columns={columns}
          dataSource={products}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: (t) => `${t} products`,
            onChange: (p) => fetchProducts(p),
          }}
          style={{ padding: '0 8px' }}
          size="middle"
        />
      </Card>
      {/* Add / Edit Modal */}
      <Modal
        title={editing ? `Edit: ${editing.name}` : 'Add Product'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? 'Save Changes' : 'Create Product'}
        confirmLoading={saving}
        width={680}
        destroyOnClose
      >
        {/* Barcode auto-fill (only for new products) */}
        {!editing && (
          <>
            <Divider orientation="left" style={{ fontSize: 13 }}>Barcode Auto-fill</Divider>
            <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
              <Input
                placeholder="Scan or type EAN-13 / UPC-A barcode"
                prefix={<BarcodeOutlined />}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onPressEnter={handleBarcodeSearch}
              />
              <Button loading={barcodeLoading} onClick={handleBarcodeSearch} type="primary">
                Lookup
              </Button>
            </Space.Compact>
          </>
        )}

        <Form form={form} layout="vertical" size="middle">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="name" label="Product Name" rules={[{ required: true, message: 'Name is required' }]}>
                <Input placeholder="e.g. Amul Butter 500g" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="brand" label="Brand">
                <Input placeholder="e.g. Amul" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="price" label="Selling Price (₹)" rules={[{ required: true, message: 'Price is required' }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="mrp" label="MRP (₹)">
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="Unit" rules={[{ required: true, message: 'Unit is required' }]}>
                <Input placeholder="e.g. 500g, 1L, piece" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category_id" label="Category" rules={[{ required: true, message: 'Category is required' }]}>
                <Select placeholder="Select category" showSearch optionFilterProp="children">
                  {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="stock_quantity" label="Stock Quantity" initialValue={0}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="barcode" label="Barcode">
                <Input placeholder="EAN-13 / UPC-A" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sku" label="SKU">
                <Input placeholder="Internal SKU (optional)" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ingredients" label="Ingredients">
            <Input.TextArea rows={2} placeholder="Ingredients list (auto-filled from barcode)" />
          </Form.Item>

          {/* Image upload */}
          <Form.Item label="Product Image">
            <Space direction="vertical" style={{ width: '100%' }}>
              {imageUrl && (
                <Image
                  src={imageUrl}
                  width={120}
                  height={120}
                  style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #E5E7EB' }}
                />
              )}
              <Spin spinning={imageUploading}>
                <Upload
                  accept="image/jpeg,image/png,image/webp"
                  showUploadList={false}
                  customRequest={customUpload}
                  maxCount={1}
                >
                  <Button icon={<UploadOutlined />}>Upload Image</Button>
                </Upload>
              </Spin>
              <Input
                size="small"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste image URL directly"
              />
            </Space>
          </Form.Item>

          {editing && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default ProductListPage;
