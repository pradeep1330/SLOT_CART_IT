import React, { useEffect, useState, useCallback } from 'react';
import {
  Truck,
  Clock,
  MapPin,
  Phone,
  KeyRound,
  CheckCircle2,
  UserX,
  RefreshCw,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { formatINR, getStatusBadgeClass } from '../utils/formatters';

export default function DeliveryDashboard() {
  const [payload, setPayload] = useState({
    todayIST: '',
    orders: [],
    todaysOrders: [],
    upcomingOrders: [],
    completedOrders: [],
  });
  const [tab, setTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [otpInputs, setOtpInputs] = useState({});
  const [busyId, setBusyId] = useState(null);

  const fetchDeliveries = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/delivery/orders');
      setPayload(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load assigned deliveries.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const handleStartDelivery = async (orderId) => {
    setBusyId(orderId);
    try {
      const { data } = await api.patch(`/delivery/orders/${orderId}/out-for-delivery`);
      toast.success(data.message);
      fetchDeliveries();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeliverWithOtp = async (e, orderId) => {
    e.preventDefault();
    const otp = (otpInputs[orderId] || '').trim();
    if (!/^\d{4}$/.test(otp)) {
      toast.error('Enter the 4-digit delivery OTP from the customer.');
      return;
    }

    setBusyId(orderId);
    try {
      const { data } = await api.post(`/delivery/orders/${orderId}/deliver`, { otp });
      toast.success(data.message);
      setOtpInputs((prev) => ({ ...prev, [orderId]: '' }));
      fetchDeliveries();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleCustomerUnavailable = async (orderId) => {
    setBusyId(orderId);
    try {
      const { data } = await api.post(`/delivery/orders/${orderId}/unavailable`, {
        reason: 'Customer not available at doorstep during assigned 2-hour slot.',
      });
      toast.success(data.message);
      fetchDeliveries();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const displayedList =
    tab === 'today'
      ? payload.todaysOrders
      : tab === 'upcoming'
        ? payload.upcomingOrders
        : tab === 'completed'
          ? payload.completedOrders
          : payload.orders;

  return (
    <div className="container page-section">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Delivery Partner Board</span>
          <h1>Assigned Slot Deliveries</h1>
          <p className="text-muted">
            Sorted chronologically by 2-hour IST delivery slot. Verify customer&apos;s 4-digit OTP on
            handover or trigger &ldquo;Reschedule instead of Return&rdquo;.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={fetchDeliveries}>
          <RefreshCw size={15} /> Refresh Queue
        </button>
      </div>

      {/* Summary Strip */}
      <div className="kpi-grid kpi-grid-3">
        <div className="card kpi-card">
          <div className="kpi-icon kpi-emerald">
            <Clock size={20} />
          </div>
          <div>
            <span className="kpi-label">Today&apos;s Slots ({payload.todayIST})</span>
            <strong className="kpi-value">{payload.todaysOrders.length}</strong>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon kpi-indigo">
            <Truck size={20} />
          </div>
          <div>
            <span className="kpi-label">Upcoming Scheduled</span>
            <strong className="kpi-value">{payload.upcomingOrders.length}</strong>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon kpi-blue">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span className="kpi-label">Completed Deliveries</span>
            <strong className="kpi-value">{payload.completedOrders.length}</strong>
          </div>
        </div>
      </div>

      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${tab === 'today' ? 'active' : ''}`}
          onClick={() => setTab('today')}
        >
          Today ({payload.todaysOrders.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming ({payload.upcomingOrders.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'completed' ? 'active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed ({payload.completedOrders.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          All Assigned ({payload.orders.length})
        </button>
      </div>

      {loading ? (
        <div className="skeleton-box" style={{ height: '240px' }} />
      ) : displayedList.length === 0 ? (
        <div className="card empty-state">
          <Package size={40} className="empty-icon" />
          <h3>No deliveries in this queue</h3>
          <p className="text-muted">Check Upcoming or All Assigned tabs for scheduled slots.</p>
        </div>
      ) : (
        <div className="delivery-card-list">
          {displayedList.map((order) => {
            const isDelivered = order.status === 'Delivered';
            const isBusy = busyId === order._id;

            return (
              <div key={order._id} className="card delivery-order-card">
                <div className="delivery-card-header">
                  <div className="delivery-slot-pill">
                    <Clock size={16} />
                    <span>
                      <strong>{order.slotLabel}</strong> &bull; {order.slotDate}
                    </span>
                  </div>
                  <div className="delivery-header-badges">
                    <span className="badge badge-neutral">{order.orderNumber}</span>
                    <span className={getStatusBadgeClass(order.status)}>{order.status}</span>
                  </div>
                </div>

                <div className="delivery-card-body">
                  <div className="delivery-customer-info">
                    <h3>{order.customerName}</h3>
                    <p className="delivery-detail-line">
                      <MapPin size={15} />
                      <span>
                        {order.shippingAddress.line1}
                        {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''},{' '}
                        {order.shippingAddress.city} &ndash;{' '}
                        <strong>{order.shippingAddress.pincode}</strong>
                      </span>
                    </p>
                    <p className="delivery-detail-line">
                      <Phone size={15} />
                      <span>
                        Masked Contact: <strong>{order.shippingAddress.phone}</strong>
                      </span>
                    </p>
                    <p className="delivery-detail-line text-muted">
                      <Package size={15} />
                      <span>
                        {order.items.length} item(s) &bull;{' '}
                        {order.paymentMethod === 'COD'
                          ? `Collect Cash on Delivery: ${formatINR(order.totals?.total)}`
                          : `Prepaid Online (${formatINR(order.totals?.total)})`}
                      </span>
                    </p>
                  </div>

                  {/* Partner Actions */}
                  {!isDelivered && (
                    <div className="delivery-actions-box">
                      {order.status !== 'Out for Delivery' && (
                        <button
                          type="button"
                          className="btn btn-indigo-soft btn-sm btn-block"
                          disabled={isBusy}
                          onClick={() => handleStartDelivery(order._id)}
                        >
                          <Truck size={15} /> Mark Out for Delivery &amp; Notify Customer
                        </button>
                      )}

                      <form
                        className="otp-verify-form"
                        onSubmit={(e) => handleDeliverWithOtp(e, order._id)}
                      >
                        <div className="input-with-icon">
                          <KeyRound size={15} className="input-icon" />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="4-digit OTP"
                            value={otpInputs[order._id] || ''}
                            onChange={(e) =>
                              setOtpInputs((prev) => ({
                                ...prev,
                                [order._id]: e.target.value.replace(/\D/g, ''),
                              }))
                            }
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn btn-emerald btn-sm"
                          disabled={isBusy}
                        >
                          <CheckCircle2 size={15} /> Verify &amp; Deliver
                        </button>
                      </form>

                      <button
                        type="button"
                        className="btn btn-amber-soft btn-sm btn-block"
                        disabled={isBusy || order.status === 'Reschedule Requested'}
                        onClick={() => handleCustomerUnavailable(order._id)}
                      >
                        <UserX size={15} />
                        {order.status === 'Reschedule Requested'
                          ? 'Reschedule Request Sent to Customer'
                          : 'Customer Unavailable (Trigger Reschedule)'}
                      </button>
                    </div>
                  )}

                  {isDelivered && (
                    <div className="delivered-stamp">
                      <CheckCircle2 size={20} />
                      <span>OTP Verified &amp; Delivered</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
