import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { CheckCircle2, Clock, KeyRound, MapPin, Package, ArrowRight } from 'lucide-react';
import api from '../api/axios';
import { formatINR } from '../utils/formatters';

export default function OrderConfirmationPage() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order);

  useEffect(() => {
    if (order) return;
    api
      .get(`/orders/${id}`)
      .then((res) => setOrder(res.data.order))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, order]);

  if (loading) {
    return (
      <div className="container page-section">
        <div className="skeleton-box" style={{ height: '340px' }} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container page-section">
        <div className="card empty-state">
          <h3>Order not found</h3>
          <Link to="/orders" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            View My Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-section">
      <div className="card confirmation-card">
        <div className="confirmation-icon">
          <CheckCircle2 size={44} />
        </div>
        <span className="badge badge-emerald-solid">Slot Reserved &amp; Order Confirmed</span>
        <h1>Thank you! Your delivery window is locked in.</h1>
        <p className="text-muted">
          Order ID: <strong>{order.orderNumber}</strong> &bull; Total Paid:{' '}
          <strong>{formatINR(order.totals?.total)}</strong> ({order.paymentMethod})
        </p>

        {/* Highlighted Delivery Window Banner */}
        <div className="confirmation-slot-banner">
          <Clock size={26} />
          <div>
            <span>Scheduled Delivery Window</span>
            <h2>{order.slotDisplayWindow}</h2>
          </div>
        </div>

        {/* 4-Digit Delivery OTP Showcase */}
        <div className="confirmation-otp-card">
          <div className="confirmation-otp-left">
            <KeyRound size={22} />
            <div>
              <strong>4-Digit Doorstep Handover OTP</strong>
              <p>
                Share this code with your SlotKart delivery partner when your parcel arrives in your
                2-hour window.
              </p>
            </div>
          </div>
          <div className="confirmation-otp-digits">{order.otp}</div>
        </div>

        <div className="confirmation-details-grid">
          <div className="review-box">
            <h4>
              <MapPin size={15} /> Delivery Address
            </h4>
            <strong>{order.shippingAddress?.fullName}</strong>
            <p>
              {order.shippingAddress?.line1}, {order.shippingAddress?.city} &ndash;{' '}
              <strong>{order.pincode}</strong>
            </p>
          </div>
          <div className="review-box">
            <h4>
              <Package size={15} /> Items Ordered ({order.items?.length})
            </h4>
            {order.items?.map((item, idx) => (
              <p key={idx}>
                {item.name} &times; {item.quantity} ({formatINR(item.lineTotal)})
              </p>
            ))}
          </div>
        </div>

        <div className="confirmation-actions">
          <Link to={`/orders/${order._id}`} className="btn btn-primary">
            Track Order &amp; Reschedule Options <ArrowRight size={16} />
          </Link>
          <Link to="/dashboard" className="btn btn-outline">
            Go to My Board
          </Link>
        </div>
      </div>
    </div>
  );
}
