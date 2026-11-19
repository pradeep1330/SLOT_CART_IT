import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  CreditCard,
  CheckCircle2,
  Plus,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Banknote,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatters';
import SlotPicker from '../components/SlotPicker';

const STEPS = [
  { num: 1, title: 'Address', icon: MapPin },
  { num: 2, title: 'Delivery Slot', icon: Clock },
  { num: 3, title: 'Payment', icon: CreditCard },
  { num: 4, title: 'Review & Place', icon: CheckCircle2 },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, summary, refreshCart, refreshNotifications } = useCart();

  const [step, setStep] = useState(1);
  const [addresses, setAddresses] = useState([]);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  // Quick inline new address form
  const [showNewAddr, setShowNewAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({
    label: 'Home',
    fullName: user?.name || '',
    phone: user?.phone || '',
    line1: '',
    line2: '',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    isDefault: true,
  });
  const [savingAddr, setSavingAddr] = useState(false);

  // Selected Smart Delivery Slot
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    const loadAddresses = async () => {
      setLoadingAddr(true);
      try {
        const { data } = await api.get('/addresses');
        const list = data.addresses || [];
        setAddresses(list);
        if (list.length > 0) {
          const def = list.find((a) => a.isDefault) || list[0];
          setSelectedAddressId(def._id);
        } else {
          setShowNewAddr(true);
        }
      } catch (err) {
        toast.error(getErrorMessage(err));
      } finally {
        setLoadingAddr(false);
      }
    };
    loadAddresses();
  }, []);

  const selectedAddress = addresses.find((a) => a._id === selectedAddressId) || null;

  const handleAddressSelect = (addrId) => {
    if (addrId !== selectedAddressId) {
      setSelectedAddressId(addrId);
      // Clear previously selected slot if pincode changes
      setSelectedSlot(null);
    }
  };

  const handleSaveNewAddress = async (e) => {
    e.preventDefault();
    setSavingAddr(true);
    try {
      const { data } = await api.post('/addresses', newAddr);
      toast.success('Address added');
      const created = data.address;
      setAddresses((prev) => [created, ...prev]);
      setSelectedAddressId(created._id);
      setSelectedSlot(null);
      setShowNewAddr(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingAddr(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress || !selectedSlot) {
      toast.error('Please select both an address and a 2-hour delivery slot.');
      return;
    }

    setPlacingOrder(true);
    try {
      const { data } = await api.post('/orders', {
        addressId: selectedAddress._id,
        slotDate: selectedSlot.slotDate,
        slotId: selectedSlot.slotId,
        paymentMethod,
      });

      await refreshCart();
      await refreshNotifications();
      toast.success('Order placed! Delivery slot reserved.');
      navigate(`/order-confirmation/${data.order._id}`, {
        state: { order: data.order },
        replace: true,
      });
    } catch (err) {
      const msg = getErrorMessage(err, 'Could not place order. Please retry.');
      toast.error(msg);
      if (err?.response?.status === 409) {
        // Slot just filled up concurrently — jump straight back to Step 2 so user picks another slot
        setStep(2);
        setSelectedSlot(null);
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container page-section">
        <div className="card empty-state">
          <h3>Your cart is empty</h3>
          <p className="text-muted">Add at least one product before starting checkout.</p>
          <Link to="/catalog" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Browse Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-section">
      <div className="checkout-header">
        <h1>Smart Slot Checkout</h1>
        <p className="text-muted">
          Reserve your exact 2-hour delivery window in 4 quick steps.
        </p>
      </div>

      {/* Stepper Header */}
      <div className="stepper">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isCompleted = step > s.num;
          const isActive = step === s.num;
          return (
            <div
              key={s.num}
              className={`stepper-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <div className="stepper-circle">
                {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={17} />}
              </div>
              <div className="stepper-text">
                <span>Step {s.num}</span>
                <strong>{s.title}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="checkout-layout">
        {/* Main Stepper Card */}
        <div className="checkout-main">
          {/* STEP 1: ADDRESS */}
          {step === 1 && (
            <div className="card">
              <div className="card-header-row" style={{ marginBottom: '1rem' }}>
                <div>
                  <h2>1. Select Delivery Address</h2>
                  <p className="text-muted">
                    Smart slot availability is fetched live for your address pincode.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowNewAddr((p) => !p)}
                >
                  <Plus size={15} /> {showNewAddr ? 'Close Form' : 'Add Address'}
                </button>
              </div>

              {showNewAddr && (
                <form onSubmit={handleSaveNewAddress} className="inline-form-card">
                  <h4>New Delivery Address</h4>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>Label</label>
                      <select
                        value={newAddr.label}
                        onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })}
                      >
                        <option value="Home">Home</option>
                        <option value="Office">Office</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        required
                        value={newAddr.fullName}
                        onChange={(e) => setNewAddr({ ...newAddr, fullName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>10-Digit Mobile</label>
                      <input
                        required
                        maxLength={10}
                        value={newAddr.phone}
                        onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Street / Flat / Building</label>
                      <input
                        required
                        value={newAddr.line1}
                        onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })}
                        placeholder="Flat 402, Emerald Heights"
                      />
                    </div>
                    <div className="form-group">
                      <label>Locality / Landmark</label>
                      <input
                        value={newAddr.line2}
                        onChange={(e) => setNewAddr({ ...newAddr, line2: e.target.value })}
                        placeholder="Near Central Park"
                      />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>City</label>
                      <input
                        required
                        value={newAddr.city}
                        onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <input
                        required
                        value={newAddr.state}
                        onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>6-Digit Pincode (Demo: 302001, 302017, 324001)</label>
                      <input
                        required
                        maxLength={6}
                        value={newAddr.pincode}
                        onChange={(e) =>
                          setNewAddr({ ...newAddr, pincode: e.target.value.replace(/\D/g, '') })
                        }
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingAddr}>
                    {savingAddr ? 'Saving...' : 'Save & Use Address'}
                  </button>
                </form>
              )}

              {loadingAddr ? (
                <div className="skeleton-box" style={{ height: '130px' }} />
              ) : (
                <div className="address-select-grid">
                  {addresses.map((addr) => {
                    const active = addr._id === selectedAddressId;
                    return (
                      <button
                        key={addr._id}
                        type="button"
                        className={`address-select-card ${active ? 'selected' : ''}`}
                        onClick={() => handleAddressSelect(addr._id)}
                      >
                        <div className="address-card-top">
                          <span className="badge badge-indigo">{addr.label}</span>
                          <span className="badge badge-emerald">PIN {addr.pincode}</span>
                        </div>
                        <strong>{addr.fullName}</strong>
                        <p>
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ''}
                        </p>
                        <p>
                          {addr.city}, {addr.state}
                        </p>
                        <small className="text-muted">Mobile: {addr.phone}</small>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="step-nav-footer">
                <Link to="/cart" className="btn btn-outline">
                  <ArrowLeft size={16} /> Back to Cart
                </Link>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedAddress}
                  onClick={() => setStep(2)}
                >
                  Continue to Smart Delivery Slots <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SMART DELIVERY SLOT PICKER (THE USP) */}
          {step === 2 && selectedAddress && (
            <div className="card">
              <SlotPicker
                pincode={selectedAddress.pincode}
                selectedDate={selectedSlot?.slotDate || ''}
                selectedSlotId={selectedSlot?.slotId || ''}
                onSelect={(choice) => setSelectedSlot(choice)}
              />

              {selectedSlot && (
                <div className="selected-slot-confirmation">
                  <CheckCircle2 size={20} />
                  <div>
                    <span>Selected Delivery Window:</span>
                    <strong>
                      Arriving {selectedSlot.displayDate} between {selectedSlot.slotLabel}
                    </strong>
                  </div>
                </div>
              )}

              <div className="step-nav-footer">
                <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Change Address
                </button>
                <button
                  type="button"
                  className="btn btn-emerald"
                  disabled={!selectedSlot}
                  onClick={() => setStep(3)}
                >
                  Continue to Payment <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PAYMENT */}
          {step === 3 && (
            <div className="card">
              <h2>3. Choose Payment Method</h2>
              <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
                Select Cash on Delivery or our instant Demo Online Payment (no real gateway charge).
              </p>

              <div className="payment-options-grid">
                <button
                  type="button"
                  className={`payment-option-card ${paymentMethod === 'COD' ? 'selected' : ''}`}
                  onClick={() => setPaymentMethod('COD')}
                >
                  <Banknote size={26} className="text-emerald" />
                  <div>
                    <strong>Cash on Delivery (COD)</strong>
                    <p>Pay cash or UPI at your doorstep during your chosen 2-hour slot.</p>
                  </div>
                </button>

                <button
                  type="button"
                  className={`payment-option-card ${
                    paymentMethod === 'ONLINE_DEMO' ? 'selected' : ''
                  }`}
                  onClick={() => setPaymentMethod('ONLINE_DEMO')}
                >
                  <Smartphone size={26} className="text-indigo" />
                  <div>
                    <strong>Demo Online Payment (Simulated UPI / Card)</strong>
                    <p>Instant simulated authorization — marks order Paid immediately for demo.</p>
                  </div>
                </button>
              </div>

              <div className="step-nav-footer">
                <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Change Slot
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
                  Review Order <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & PLACE ORDER */}
          {step === 4 && selectedAddress && selectedSlot && (
            <div className="card">
              <h2>4. Review &amp; Confirm Order</h2>
              <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
                Stock reduction and delivery slot booking execute atomically on confirmation.
              </p>

              <div className="review-highlight-slot">
                <Clock size={22} />
                <div>
                  <span className="eyebrow-light">Guaranteed 2-Hour Delivery Window</span>
                  <h3>
                    Arriving {selectedSlot.displayDate} between {selectedSlot.slotLabel}
                  </h3>
                </div>
              </div>

              <div className="review-two-col">
                <div className="review-box">
                  <h4>Shipping Address</h4>
                  <strong>{selectedAddress.fullName}</strong>
                  <p>
                    {selectedAddress.line1}
                    {selectedAddress.line2 ? `, ${selectedAddress.line2}` : ''}
                  </p>
                  <p>
                    {selectedAddress.city}, {selectedAddress.state} &ndash;{' '}
                    <strong>{selectedAddress.pincode}</strong>
                  </p>
                  <small className="text-muted">Phone: {selectedAddress.phone}</small>
                </div>

                <div className="review-box">
                  <h4>Payment Method</h4>
                  <strong>
                    {paymentMethod === 'ONLINE_DEMO'
                      ? 'Demo Online Payment (Instant Paid)'
                      : 'Cash on Delivery (Pay at Handover)'}
                  </strong>
                  <p className="text-muted" style={{ marginTop: '0.35rem' }}>
                    A unique 4-digit handover OTP will be generated upon confirmation.
                  </p>
                </div>
              </div>

              <div className="review-items-list">
                <h4>Items ({items.length})</h4>
                {items.map((item) => (
                  <div key={item.productId} className="review-item-row">
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

              <div className="step-nav-footer">
                <button type="button" className="btn btn-outline" onClick={() => setStep(3)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  type="button"
                  className="btn btn-emerald btn-lg"
                  disabled={placingOrder}
                  onClick={handlePlaceOrder}
                >
                  <ShieldCheck size={18} />
                  {placingOrder
                    ? 'Reserving Slot & Placing Order...'
                    : `Place Order (${formatINR(summary.total)})`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Checkout Summary Sidebar */}
        <aside className="card summary-card">
          <h3>Price Breakdown</h3>
          <div className="summary-rows">
            <div className="summary-row">
              <span>Items ({items.length})</span>
              <span>{formatINR(summary.subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>GST (18%)</span>
              <span>{formatINR(summary.gst)}</span>
            </div>
            <div className="summary-row">
              <span>Shipping</span>
              <span className={summary.shipping === 0 ? 'text-emerald' : ''}>
                {summary.shipping === 0 ? 'FREE' : formatINR(summary.shipping)}
              </span>
            </div>
            <div className="summary-row summary-total">
              <strong>Total</strong>
              <strong>{formatINR(summary.total)}</strong>
            </div>
          </div>

          {selectedSlot && (
            <div className="sidebar-slot-badge">
              <Clock size={16} />
              <div>
                <small>Selected Window</small>
                <strong>
                  {selectedSlot.displayDate} &bull; {selectedSlot.slotLabel}
                </strong>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
