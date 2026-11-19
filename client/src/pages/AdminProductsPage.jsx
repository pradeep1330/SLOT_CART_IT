import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Edit3, Trash2, ArrowLeft, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { formatINR } from '../utils/formatters';

const EMPTY_PRODUCT = {
  name: '',
  brand: '',
  category: '',
  price: '',
  discount: 0,
  stock: 10,
  imageUrl: '',
  description: '',
  isFeatured: false,
  isDeal: false,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get('/products', { params: { limit: 50 } }),
        api.get('/categories'),
      ]);
      setProducts(prodRes.data.products || []);
      setCategories(catRes.data.categories || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_PRODUCT, category: categories[0]?._id || '' });
    setShowForm(true);
  };

  const openEdit = (prod) => {
    setEditingId(prod._id);
    setForm({
      name: prod.name,
      brand: prod.brand || '',
      category: prod.category?._id || prod.category || '',
      price: prod.price,
      discount: prod.discount || 0,
      stock: prod.stock,
      imageUrl: prod.imageUrl,
      description: prod.description,
      isFeatured: Boolean(prod.isFeatured),
      isDeal: Boolean(prod.isDeal),
    });
    setShowForm(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        discount: Number(form.discount || 0),
        stock: Number(form.stock),
      };
      if (editingId) {
        await api.put(`/admin/products/${editingId}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/admin/products', payload);
        toast.success('Product created');
      }
      setShowForm(false);
      setEditingId(null);
      loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await api.delete(`/admin/products/${id}`);
      toast.success('Product deleted');
      setProducts((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await api.post('/admin/categories', { name: newCategoryName.trim() });
      toast.success('Category added');
      setNewCategoryName('');
      loadData();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="container page-section">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={16} /> Back to Admin Dashboard
      </Link>

      <div className="dashboard-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1>Manage Products &amp; Categories</h1>
          <p className="text-muted">Create, update stock &amp; pricing, or add new categories.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Category Quick Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header-row" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Tag size={16} className="text-indigo" />
            <strong>Categories:</strong>
            {categories.map((cat) => (
              <span key={cat._id} className="badge badge-indigo">
                {cat.name}
              </span>
            ))}
          </div>
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button type="submit" className="btn btn-outline btn-sm">
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Product Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSaveProduct} className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>{editingId ? 'Edit Product' : 'Add New Product'}</h3>
          <div className="form-grid-3" style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label>Product Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Brand</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-3" style={{ marginTop: '0.75rem' }}>
            <div className="form-group">
              <label>Price (INR)</label>
              <input
                type="number"
                required
                min={1}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Discount (%)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Stock Units</label>
              <input
                type="number"
                required
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label>Product Image URL</label>
            <input
              type="url"
              required
              placeholder="https://images.unsplash.com/..."
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label>Description</label>
            <textarea
              rows={3}
              required
              minLength={10}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0 1rem' }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
              />
              <span>Featured on Home</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isDeal}
                onChange={(e) => setForm({ ...form, isDeal: e.target.checked })}
              />
              <span>Show in Deals</span>
            </label>
          </div>

          <div className="form-actions-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Product'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Product Table */}
      <div className="card">
        {loading ? (
          <div className="skeleton-box" style={{ height: '240px' }} />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Discount</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr key={prod._id}>
                    <td>
                      <div className="table-product-cell">
                        <img src={prod.imageUrl} alt={prod.name} />
                        <div>
                          <strong>{prod.name}</strong>
                          <small className="text-muted">{prod.brand}</small>
                        </div>
                      </div>
                    </td>
                    <td>{prod.category?.name}</td>
                    <td>{formatINR(prod.price)}</td>
                    <td>{prod.discount}%</td>
                    <td>
                      <span
                        className={`badge ${
                          prod.stock <= 0
                            ? 'badge-danger'
                            : prod.stock <= 5
                              ? 'badge-amber'
                              : 'badge-emerald'
                        }`}
                      >
                        {prod.stock} units
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => openEdit(prod)}
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-soft btn-xs"
                          onClick={() => handleDeleteProduct(prod._id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
