import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { formatINR, getStatusBadgeClass } from '../utils/formatters';

const ORDER_STATUSES = [
  'Placed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Reschedule Requested',
  'Cancelled',
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [partners, setPartners] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, partRes] = await Promise.all([
        api.get('/admin/orders', {
          params: statusFilter !== 'all' ? { status: statusFilter } : {},
        }),
        api.get('/admin/delivery-partners'),
      ]);
      const list = ordRes.data.orders || [];
      setOrders(list);
      setPartners(partRes.data.partners || []);

      const nextDrafts = {};
      list.forEach((o) => {
        nextDrafts[o._id] = {
          status: o.status,
          deliveryPartnerId: o.deliveryPartnerId?._id || '',
        };
      });
      setDrafts(nextDrafts);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleDraftChange = (orderId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value,
      },
    }));
  };

  const handleSaveOrder = async (orderId) => {
    const draft = drafts[orderId];
    if (!draft) return;
    setSavingId(orderId);
    try {
      const { data } = await api.patch(`/admin/orders/${orderId}/status`, {
        status: draft.status,
        deliveryPartnerId: draft.deliveryPartnerId || null,
      });
      toast.success(data.message);
      loadOrders();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="container page-section">
      <Link to="/admin" className="back-link">
        <ArrowLeft size={16} /> Back to Admin Dashboard
      </Link>

      <div className="dashboard-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <h1>Order Dispatch &amp; Partner Assignment</h1>
          <p className="text-muted">
            Update fulfillment statuses and assign delivery partners to 2-hour delivery slots.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={loadOrders}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="skeleton-box" style={{ height: '240px' }} />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Delivery Window</th>
                  <th>Total / Pay</th>
                  <th>Status</th>
                  <th>Delivery Partner</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => {
                  const draft = drafts[ord._id] || {
                    status: ord.status,
                    deliveryPartnerId: ord.deliveryPartnerId?._id || '',
                  };
                  return (
                    <tr key={ord._id}>
                      <td>
                        <strong>{ord.orderNumber}</strong>
                        <div>
                          <small className="text-muted">OTP: {ord.otp}</small>
                        </div>
                      </td>
                      <td>
                        <div>{ord.userId?.name || ord.shippingAddress?.fullName}</div>
                        <small className="text-muted">PIN {ord.pincode}</small>
                      </td>
                      <td>
                        <div className="slot-cell">
                          <Clock size={14} />
                          <div>
                            <strong>{ord.slotDate}</strong>
                            <div>{ord.slotLabel}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{formatINR(ord.totals?.total)}</strong>
                        <div>
                          <small className="text-muted">
                            {ord.paymentMethod} ({ord.paymentStatus})
                          </small>
                        </div>
                      </td>
                      <td>
                        <select
                          value={draft.status}
                          onChange={(e) => handleDraftChange(ord._id, 'status', e.target.value)}
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <div style={{ marginTop: '0.25rem' }}>
                          <span className={getStatusBadgeClass(ord.status)}>{ord.status}</span>
                        </div>
                      </td>
                      <td>
                        <select
                          value={draft.deliveryPartnerId}
                          onChange={(e) =>
                            handleDraftChange(ord._id, 'deliveryPartnerId', e.target.value)
                          }
                        >
                          <option value="">-- Unassigned --</option>
                          {partners.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          disabled={savingId === ord._id}
                          onClick={() => handleSaveOrder(ord._id)}
                        >
                          <Save size={14} /> {savingId === ord._id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
