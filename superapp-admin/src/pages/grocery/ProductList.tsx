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
  deleteProduct, lookupBarcode, uploadProductImage,
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
      const res = await getProducts(params);
      setProducts(res.data?.items ?? []);
      setTotal(res.data?.total ?? 0);
      setPage(p);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, categoryFilter]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchProducts(1); }, [search, categoryFilter]); // eslint-disable-line

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
      render: (v: number) => <Text>{v}</Text>,
    },
    {
      title: 'Owner',
      dataIndex: 'owner_type',
      render: (v: string) => <Tag color={OWNER_COLOR[v] ?? 'default'}>{v.toUpperCase()}</Tag>,
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
    <>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>📦 Products</Title>}
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
    </>
  );
};

export default ProductListPage;
