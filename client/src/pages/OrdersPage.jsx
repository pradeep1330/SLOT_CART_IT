import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Package, KeyRound, CalendarClock, ArrowRight, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { formatINR, formatDateTime, getStatusBadgeClass } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import RescheduleModal from '../components/RescheduleModal';

const STATUS_FILTERS = [
  'all',
  'Placed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Reschedule Requested',
  'Delivered',
  'Cancelled',
];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/orders', {
        params: statusFilter !== 'all' ? { status: statusFilter } : {},
      });
      setOrders(data.orders || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="container page-section">
      <div className="dashboard-header">
        <div>
          <h1>My Orders</h1>
          <p className="text-muted">
            Every order displays your exact 2-hour delivery window, 4-digit handover OTP, and
            one-click rescheduling.
          </p>
        </div>
        <Link to="/catalog" className="btn btn-primary btn-sm">
          Shop More
        </Link>
      </div>

      <div className="filter-pills-row">
        {STATUS_FILTERS.map((st) => (
          <button
            key={st}
            type="button"
            className={`filter-pill ${statusFilter === st ? 'active' : ''}`}
            onClick={() => setStatusFilter(st)}
          >
            {st === 'all' ? 'All Orders' : st}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton-box" style={{ height: '240px' }} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders match this filter"
          description="Place an order and pick a convenient 2-hour delivery window."
          action={
            <Link to="/catalog" className="btn btn-primary btn-sm">
              Start Shopping
            </Link>
          }
        />
      ) : (
        <div className="orders-list-stack">
          {orders.map((ord) => {
            const canReschedule =
              !['Delivered', 'Cancelled'].includes(ord.status) &&
              (ord.status !== 'Out for Delivery' || ord.rescheduleRequested);

            return (
              <div key={ord._id} className="card order-list-card">
                <div className="order-card-head">
                  <div>
                    <Link to={`/orders/${ord._id}`} className="order-link">
                      {ord.orderNumber}
                    </Link>
                    <small className="text-muted" style={{ marginLeft: '0.75rem' }}>
                      Placed {formatDateTime(ord.createdAt)}
                    </small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={getStatusBadgeClass(ord.status)}>{ord.status}</span>
                    <strong>{formatINR(ord.totals?.total)}</strong>
                  </div>
                </div>

                {/* Highlighted USP Delivery Window Strip */}
                <div className="order-slot-strip">
                  <div className="order-slot-strip-left">
                    <Clock size={18} />
                    <strong>{ord.slotDisplayWindow}</strong>
                  </div>
                  <span className="otp-chip">
                    <KeyRound size={14} /> OTP: <strong>{ord.otp}</strong>
                  </span>
                </div>

                {ord.rescheduleRequested && (
                  <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Reschedule instead of Return:</strong> You were unavailable during the
                      delivery attempt. Please choose a new 2-hour slot!
                    </span>
                  </div>
                )}

                <div className="order-card-foot">
                  <div className="order-thumbs">
                    {ord.items.slice(0, 3).map((item, idx) => (
                      <img key={idx} src={item.imageUrl} alt={item.name} title={item.name} />
                    ))}
                    <span className="text-muted">
                      {ord.items.length} item(s) &bull; Reschedules: {ord.rescheduleCount}/2
                    </span>
                  </div>

                  <div className="order-card-actions">
                    {canReschedule && (
                      <button
                        type="button"
                        className="btn btn-emerald-soft btn-sm"
                        onClick={() => setRescheduleTarget(ord)}
                      >
                        <CalendarClock size={15} /> Reschedule Slot
                      </button>
                    )}
                    <Link to={`/orders/${ord._id}`} className="btn btn-outline btn-sm">
                      Track &amp; Details <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rescheduleTarget && (
        <RescheduleModal
          order={rescheduleTarget}
          isOpen={Boolean(rescheduleTarget)}
          onClose={() => setRescheduleTarget(null)}
          onRescheduled={() => {
            setRescheduleTarget(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
