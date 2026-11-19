import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  KeyRound,
  CalendarClock,
  XCircle,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import {
  formatINR,
  formatDateTime,
  getSlotCountdown,
  getStatusBadgeClass,
} from '../utils/formatters';
import RescheduleModal from '../components/RescheduleModal';

const TIMELINE_STEPS = ['Placed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data.order);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load order details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const { data } = await api.post(`/orders/${order._id}/cancel`);
      toast.success(data.message);
      setOrder(data.order);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="container page-section">
        <div className="skeleton-box" style={{ height: '380px' }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container page-section">
        <div className="card empty-state">
          <h3>Order not found</h3>
          <Link to="/orders" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  const currentIdx = TIMELINE_STEPS.indexOf(order.status);
  const canCancel = ['Placed', 'Packed'].includes(order.status);
  const canReschedule =
    !['Delivered', 'Cancelled'].includes(order.status) &&
    (order.status !== 'Out for Delivery' || order.rescheduleRequested);

  return (
    <div className="container page-section">
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} /> Back to My Orders
      </Link>

      {/* Top Header */}
      <div className="dashboard-header" style={{ marginTop: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1>Order {order.orderNumber}</h1>
            <span className={getStatusBadgeClass(order.status)}>{order.status}</span>
          </div>
          <p className="text-muted">Placed on {formatDateTime(order.createdAt)}</p>
        </div>

        <div className="dashboard-header-actions">
          {canReschedule && (
            <button
              type="button"
              className="btn btn-emerald"
              onClick={() => setRescheduleOpen(true)}
            >
              <CalendarClock size={16} /> Reschedule Slot ({2 - order.rescheduleCount} left)
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="btn btn-danger-soft"
              disabled={cancelling}
              onClick={handleCancel}
            >
              <XCircle size={16} /> {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </button>
          )}
        </div>
      </div>

      {/* Reschedule Instead of Return Alert */}
      {order.rescheduleRequested && (
        <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={20} />
          <div style={{ flex: 1 }}>
            <strong>Reschedule Instead of Return Triggered!</strong>
            <p style={{ marginTop: '0.2rem' }}>
              {order.rescheduleReason ||
                'Our delivery partner could not reach you during your scheduled window.'}{' '}
              Choose a fresh 2-hour slot so we deliver instead of returning your parcel.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-emerald btn-sm"
            onClick={() => setRescheduleOpen(true)}
          >
            Pick New Slot Now
          </button>
        </div>
      )}

      {/* Highlighted Delivery Slot + OTP Hero Card */}
      <div className="order-detail-hero">
        <div className="order-hero-window">
          <div className="order-hero-badge-row">
            <span className="badge badge-emerald-solid">
              <Clock size={14} /> Confirmed 2-Hour Window
            </span>
            {!['Delivered', 'Cancelled'].includes(order.status) && (
              <span className="countdown-pill">
                {getSlotCountdown(order.slotDate, order.slotId)}
              </span>
            )}
          </div>
          <h2>{order.slotDisplayWindow}</h2>
          <p>
            Pincode <strong>{order.pincode}</strong> &bull; Reschedules used:{' '}
            <strong>{order.rescheduleCount} / 2</strong> (cutoff: 3 hours before slot start)
          </p>
        </div>

        <div className="otp-highlight-box">
          <span className="otp-label">
            <KeyRound size={14} /> 4-Digit Delivery OTP
          </span>
          <strong className="otp-digits">{order.otp}</strong>
          <small>Verify with partner on handover</small>
        </div>
      </div>

      {/* Status Timeline (Placed -> Packed -> Shipped -> Out for Delivery -> Delivered) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1.25rem' }}>Delivery Status Timeline</h3>
        {order.status === 'Cancelled' ? (
          <div className="alert alert-danger">
            <XCircle size={18} />
            <span>This order was cancelled. Reserved inventory and delivery slot were released.</span>
          </div>
        ) : (
          <div className="status-timeline">
            {TIMELINE_STEPS.map((stage, idx) => {
              const done = currentIdx >= idx;
              const isCurrent = currentIdx === idx;
              return (
                <div
                  key={stage}
                  className={`timeline-node ${done ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div className="timeline-dot">
                    {done ? <CheckCircle2 size={16} /> : idx + 1}
                  </div>
                  <span className="timeline-label">{stage}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Activity Log */}
        {order.statusHistory?.length > 0 && (
          <div className="history-log">
            <h4>Activity History</h4>
            {order.statusHistory
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={i} className="history-log-row">
                  <span className={getStatusBadgeClass(h.status)}>{h.status}</span>
                  <span className="history-note">{h.note}</span>
                  <small className="text-muted">{formatDateTime(h.timestamp)}</small>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Bottom 2-Col Details */}
      <div className="order-detail-grid">
        <div className="card">
          <h3>Items Ordered</h3>
          <div className="review-items-list" style={{ marginTop: '0.75rem' }}>
            {order.items.map((item, idx) => (
              <div key={idx} className="review-item-row">
                <img src={item.imageUrl} alt={item.name} />
                <div className="review-item-meta">
                  <strong>{item.name}</strong>
                  <span className="text-muted">
                    Qty {item.quantity} &times; {formatINR(item.finalUnitPrice)}
                  </span>
                </div>
                <strong>{formatINR(item.lineTotal)}</strong>
              </div>
            ))}
          </div>

          <div className="summary-rows" style={{ marginTop: '1rem' }}>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatINR(order.totals?.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>GST (18%)</span>
              <span>{formatINR(order.totals?.gst)}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span>
                {order.totals?.shipping === 0 ? 'FREE' : formatINR(order.totals?.shipping)}
              </span>
            </div>
            <div className="summary-row summary-total">
              <strong>Total</strong>
              <strong>{formatINR(order.totals?.total)}</strong>
            </div>
          </div>
        </div>

        <div className="board-side-stack">
          <div className="card">
            <h3>
              <MapPin size={17} /> Shipping Address
            </h3>
            <div style={{ marginTop: '0.75rem' }}>
              <strong>{order.shippingAddress?.fullName}</strong>
              <p>
                {order.shippingAddress?.line1}
                {order.shippingAddress?.line2 ? `, ${order.shippingAddress.line2}` : ''}
              </p>
              <p>
                {order.shippingAddress?.city}, {order.shippingAddress?.state} &ndash;{' '}
                <strong>{order.shippingAddress?.pincode}</strong>
              </p>
              <p className="text-muted">Phone: {order.shippingAddress?.phone}</p>
            </div>
          </div>

          <div className="card">
            <h3>
              <Truck size={17} /> Fulfillment &amp; Payment
            </h3>
            <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.45rem' }}>
              <div>
                <span className="text-muted">Payment Method: </span>
                <strong>{order.paymentMethod}</strong> ({order.paymentStatus})
              </div>
              <div>
                <span className="text-muted">Delivery Partner: </span>
                <strong>
                  {order.deliveryPartnerId?.name || 'Will be assigned before dispatch'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RescheduleModal
        order={order}
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        onRescheduled={(updatedOrder) => {
          setOrder(updatedOrder);
          setRescheduleOpen(false);
        }}
      />
    </div>
  );
}
