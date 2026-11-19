import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock,
  Package,
  Bell,
  Heart,
  MapPin,
  User,
  Lock,
  CalendarClock,
  Plus,
  Trash2,
  Edit3,
  CheckCheck,
  ShoppingCart,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import {
  formatINR,
  formatDateTime,
  getSlotCountdown,
  getStatusBadgeClass,
} from '../utils/formatters';
import RescheduleModal from '../components/RescheduleModal';

const EMPTY_ADDRESS = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
  isDefault: false,
};

export default function CustomerDashboard() {
  const { user, updateProfile } = useAuth();
  const { wishlist, toggleWishlist, addToCart, refreshNotifications } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab) => setSearchParams({ tab });

  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  // Reschedule modal state
  const [rescheduleOrder, setRescheduleOrder] = useState(null);

  // Address form state
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState(null);
  const [addrForm, setAddrForm] = useState(EMPTY_ADDRESS);
  const [savingAddr, setSavingAddr] = useState(false);

  // Profile & password forms
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [passForm, setPassForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPass, setSavingPass] = useState(false);

  const fetchBoardData = useCallback(async () => {
    try {
      setLoading(true);
      const [ordRes, notifRes, addrRes] = await Promise.all([
        api.get('/orders'),
        api.get('/notifications'),
        api.get('/addresses'),
      ]);
      setOrders(ordRes.data.orders || []);
      setNotifications(notifRes.data.notifications || []);
      setAddresses(addrRes.data.addresses || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load dashboard data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoardData();
  }, [fetchBoardData]);

  // Refresh live slot countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name, phone: user.phone });
    }
  }, [user]);

  const upcomingOrders = orders
    .filter((o) => !['Delivered', 'Cancelled'].includes(o.status))
    .sort((a, b) => a.slotDate.localeCompare(b.slotDate));
  const nextDelivery = upcomingOrders[0] || null;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshNotifications();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleMarkOneRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
      refreshNotifications();
    } catch (_err) {
      // ignore
    }
  };

  const openAddAddress = () => {
    setEditingAddrId(null);
    setAddrForm({
      ...EMPTY_ADDRESS,
      fullName: user?.name || '',
      phone: user?.phone || '',
    });
    setShowAddrForm(true);
  };

  const openEditAddress = (addr) => {
    setEditingAddrId(addr._id);
    setAddrForm({
      label: addr.label || 'Home',
      fullName: addr.fullName,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      landmark: addr.landmark || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      isDefault: Boolean(addr.isDefault),
    });
    setShowAddrForm(true);
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    setSavingAddr(true);
    try {
      if (editingAddrId) {
        await api.put(`/addresses/${editingAddrId}`, addrForm);
        toast.success('Address updated');
      } else {
        await api.post('/addresses', addrForm);
        toast.success('Address saved');
      }
      setShowAddrForm(false);
      setEditingAddrId(null);
      const { data } = await api.get('/addresses');
      setAddresses(data.addresses || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingAddr(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    try {
      await api.delete(`/addresses/${id}`);
      toast.success('Address deleted');
      setAddresses((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile(profileForm);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPass(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: passForm.currentPassword,
        newPassword: passForm.newPassword,
      });
      toast.success('Password changed successfully');
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="container page-section">
      {/* Greeting Header */}
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Customer Board</span>
          <h1>Hello, {user?.name?.split(' ')[0]}</h1>
          <p className="text-muted">
            Track your scheduled 2-hour delivery slots, manage addresses, and view live alerts.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/catalog" className="btn btn-primary">
            Continue Shopping
          </Link>
          <Link to="/orders" className="btn btn-outline">
            All Orders ({orders.length})
          </Link>
        </div>
      </div>

      {/* Hero Upcoming Delivery Card with Live Countdown */}
      {nextDelivery && (
        <div className="upcoming-delivery-hero">
          <div className="upcoming-hero-left">
            <div className="upcoming-hero-top">
              <span className="badge badge-emerald-solid">
                <Clock size={14} /> Next Scheduled Delivery
              </span>
              <span className={getStatusBadgeClass(nextDelivery.status)}>{nextDelivery.status}</span>
              <span className="countdown-pill">
                <CalendarClock size={14} />{' '}
                {getSlotCountdown(nextDelivery.slotDate, nextDelivery.slotId)}
              </span>
            </div>

            <h2 className="upcoming-window-title">{nextDelivery.slotDisplayWindow}</h2>
            <p className="upcoming-meta">
              Order <strong>{nextDelivery.orderNumber}</strong> &bull; {nextDelivery.items.length}{' '}
              item(s) &bull; Delivering to Pincode <strong>{nextDelivery.pincode}</strong>
            </p>

            {nextDelivery.rescheduleRequested && (
              <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
                <AlertTriangle size={16} />
                <span>
                  Delivery partner marked you unavailable. Pick a new slot now to avoid parcel
                  return!
                </span>
              </div>
            )}
          </div>

          <div className="upcoming-hero-right">
            <div className="otp-highlight-box">
              <span className="otp-label">
                <KeyRound size={14} /> Handover OTP
              </span>
              <strong className="otp-digits">{nextDelivery.otp}</strong>
              <small>Share only at doorstep</small>
            </div>
            <div className="upcoming-hero-btns">
              <Link to={`/orders/${nextDelivery._id}`} className="btn btn-white btn-sm">
                Track Order
              </Link>
              {!['Delivered', 'Cancelled'].includes(nextDelivery.status) && (
                <button
                  type="button"
                  className="btn btn-emerald btn-sm"
                  onClick={() => setRescheduleOrder(nextDelivery)}
                >
                  <CalendarClock size={15} /> Reschedule Slot
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Board Navigation Tabs */}
      <div className="tabs-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Package size={16} /> Overview &amp; Orders
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={16} /> Notifications
          {unreadCount > 0 && <span className="tab-count">{unreadCount}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'wishlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('wishlist')}
        >
          <Heart size={16} /> Wishlist ({wishlist.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'addresses' ? 'active' : ''}`}
          onClick={() => setActiveTab('addresses')}
        >
          <MapPin size={16} /> Saved Addresses ({addresses.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={16} /> Profile &amp; Security
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="board-overview-grid">
          <div className="card">
            <div className="card-header-row">
              <h3>Recent Orders</h3>
              <Link to="/orders" className="text-link">
                View all
              </Link>
            </div>
            {loading ? (
              <div className="skeleton-box" style={{ height: '180px' }} />
            ) : orders.length === 0 ? (
              <p className="text-muted">No orders yet. Start shopping and pick a 2-hour slot!</p>
            ) : (
              <div className="mini-order-list">
                {orders.slice(0, 5).map((ord) => (
                  <div key={ord._id} className="mini-order-row">
                    <div>
                      <div className="mini-order-top">
                        <Link to={`/orders/${ord._id}`} className="order-link">
                          {ord.orderNumber}
                        </Link>
                        <span className={getStatusBadgeClass(ord.status)}>{ord.status}</span>
                      </div>
                      <p className="slot-window-inline">
                        <Clock size={14} /> {ord.slotDisplayWindow}
                      </p>
                      <small className="text-muted">
                        {ord.items.length} item(s) &bull; {formatINR(ord.totals?.total)} &bull; OTP:{' '}
                        <strong>{ord.otp}</strong>
                      </small>
                    </div>
                    <div className="mini-order-actions">
                      <Link to={`/orders/${ord._id}`} className="btn btn-outline btn-xs">
                        Details
                      </Link>
                      {!['Delivered', 'Cancelled', 'Out for Delivery'].includes(ord.status) ||
                      ord.rescheduleRequested ? (
                        <button
                          type="button"
                          className="btn btn-emerald-soft btn-xs"
                          onClick={() => setRescheduleOrder(ord)}
                        >
                          Reschedule
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="board-side-stack">
            <div className="card">
              <div className="card-header-row">
                <h3>Latest Slot Alerts</h3>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => setActiveTab('notifications')}
                >
                  Open inbox
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-muted">No notifications yet.</p>
              ) : (
                <div className="notif-preview-list">
                  {notifications.slice(0, 4).map((n) => (
                    <div
                      key={n._id}
                      className={`notif-item ${!n.isRead ? 'unread' : ''}`}
                      onClick={() => !n.isRead && handleMarkOneRead(n._id)}
                    >
                      <div className="notif-title">{n.title}</div>
                      <p className="notif-msg">{n.message}</p>
                      <small className="text-muted">{formatDateTime(n.createdAt)}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header-row">
                <h3>Wishlist Preview</h3>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => setActiveTab('wishlist')}
                >
                  See all ({wishlist.length})
                </button>
              </div>
              {wishlist.length === 0 ? (
                <p className="text-muted">Save products you love for faster slot checkout.</p>
              ) : (
                <div className="wishlist-mini-grid">
                  {wishlist.slice(0, 3).map((prod) => (
                    <Link key={prod._id} to={`/product/${prod._id}`} className="wishlist-mini-item">
                      <img src={prod.imageUrl} alt={prod.name} />
                      <div>
                        <div className="truncate-1">{prod.name}</div>
                        <strong>{formatINR(prod.finalPrice || prod.price)}</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-header-row">
            <div>
              <h3>Notifications Inbox</h3>
              <p className="text-muted">
                Simulated in-app delivery updates, 1-hour slot reminders, and reschedule alerts.
              </p>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={handleMarkAllRead}>
                <CheckCheck size={16} /> Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-muted">Your inbox is all caught up.</p>
          ) : (
            <div className="notif-full-list">
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className={`notif-item ${!n.isRead ? 'unread' : ''}`}
                  onClick={() => !n.isRead && handleMarkOneRead(n._id)}
                >
                  <div className="notif-header-row">
                    <strong>{n.title}</strong>
                    <span className="text-muted">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="notif-msg">{n.message}</p>
                  {n.orderId && (
                    <Link to={`/orders/${n.orderId}`} className="text-link">
                      View Order &rarr;
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WISHLIST */}
      {activeTab === 'wishlist' && (
        <div className="card">
          <div className="card-header-row">
            <h3>Saved Wishlist ({wishlist.length})</h3>
            <Link to="/catalog" className="btn btn-outline btn-sm">
              Explore More
            </Link>
          </div>
          {wishlist.length === 0 ? (
            <p className="text-muted">No items saved in your wishlist yet.</p>
          ) : (
            <div className="product-grid">
              {wishlist.map((prod) => (
                <div key={prod._id} className="product-card">
                  <Link to={`/product/${prod._id}`} className="product-img-wrap">
                    <img src={prod.imageUrl} alt={prod.name} />
                  </Link>
                  <div className="product-card-body">
                    <Link to={`/product/${prod._id}`} className="product-title">
                      {prod.name}
                    </Link>
                    <div className="product-price-row">
                      <span className="price-current">
                        {formatINR(prod.finalPrice || prod.price)}
                      </span>
                      {prod.discount > 0 && (
                        <span className="price-original">{formatINR(prod.price)}</span>
                      )}
                    </div>
                    <div className="card-btn-row">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => addToCart(prod._id, 1)}
                      >
                        <ShoppingCart size={15} /> Add to Cart
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => toggleWishlist(prod._id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SAVED ADDRESSES CRUD */}
      {activeTab === 'addresses' && (
        <div className="card">
          <div className="card-header-row">
            <div>
              <h3>Saved Delivery Addresses</h3>
              <p className="text-muted">
                Your pincode determines live 2-hour delivery slot availability (try 302001, 302017,
                or 324001).
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={openAddAddress}>
              <Plus size={16} /> Add New Address
            </button>
          </div>

          {showAddrForm && (
            <form onSubmit={handleSaveAddress} className="inline-form-card">
              <h4>{editingAddrId ? 'Edit Address' : 'Add New Address'}</h4>
              <div className="form-grid-3">
                <div className="form-group">
                  <label>Label</label>
                  <select
                    value={addrForm.label}
                    onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}
                  >
                    <option value="Home">Home</option>
                    <option value="Office">Office</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Recipient Full Name</label>
                  <input
                    required
                    value={addrForm.fullName}
                    onChange={(e) => setAddrForm({ ...addrForm, fullName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>10-Digit Mobile</label>
                  <input
                    required
                    maxLength={10}
                    value={addrForm.phone}
                    onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Address Line 1</label>
                  <input
                    required
                    value={addrForm.line1}
                    onChange={(e) => setAddrForm({ ...addrForm, line1: e.target.value })}
                    placeholder="Flat, House No, Street"
                  />
                </div>
                <div className="form-group">
                  <label>Address Line 2 / Landmark</label>
                  <input
                    value={addrForm.line2}
                    onChange={(e) => setAddrForm({ ...addrForm, line2: e.target.value })}
                    placeholder="Locality, Landmark"
                  />
                </div>
              </div>

              <div className="form-grid-3">
                <div className="form-group">
                  <label>City</label>
                  <input
                    required
                    value={addrForm.city}
                    onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    required
                    value={addrForm.state}
                    onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>6-Digit Pincode</label>
                  <input
                    required
                    maxLength={6}
                    value={addrForm.pincode}
                    onChange={(e) => setAddrForm({ ...addrForm, pincode: e.target.value })}
                    placeholder="302001"
                  />
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={addrForm.isDefault}
                  onChange={(e) => setAddrForm({ ...addrForm, isDefault: e.target.checked })}
                />
                <span>Set as default delivery address</span>
              </label>

              <div className="form-actions-row">
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingAddr}>
                  {savingAddr ? 'Saving...' : editingAddrId ? 'Update Address' : 'Save Address'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowAddrForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="address-grid">
            {addresses.map((addr) => (
              <div key={addr._id} className={`address-card ${addr.isDefault ? 'default' : ''}`}>
                <div className="address-card-top">
                  <span className="badge badge-indigo">{addr.label}</span>
                  {addr.isDefault && <span className="badge badge-emerald">Default</span>}
                </div>
                <strong>{addr.fullName}</strong>
                <p>
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ''}
                </p>
                <p>
                  {addr.city}, {addr.state} &ndash; <strong>{addr.pincode}</strong>
                </p>
                <p className="text-muted">Phone: {addr.phone}</p>
                <div className="address-card-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={() => openEditAddress(addr)}
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-soft btn-xs"
                    onClick={() => handleDeleteAddress(addr._id)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: PROFILE & PASSWORD */}
      {activeTab === 'profile' && (
        <div className="profile-grid">
          <div className="card">
            <h3>
              <User size={18} /> Edit Profile
            </h3>
            <form onSubmit={handleSaveProfile} className="form-stack" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Email (cannot be changed)</label>
                <input value={user?.email || ''} disabled />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>10-Digit Mobile Number</label>
                <input
                  required
                  maxLength={10}
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3>
              <Lock size={18} /> Change Password
            </h3>
            <form
              onSubmit={handleChangePassword}
              className="form-stack"
              style={{ marginTop: '1rem' }}
            >
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  required
                  value={passForm.currentPassword}
                  onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>New Password (8+ chars, Upper, Lower, Digit)</label>
                <input
                  type="password"
                  required
                  value={passForm.newPassword}
                  onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={passForm.confirmPassword}
                  onChange={(e) => setPassForm({ ...passForm, confirmPassword: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={savingPass}>
                {savingPass ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleOrder && (
        <RescheduleModal
          order={rescheduleOrder}
          isOpen={Boolean(rescheduleOrder)}
          onClose={() => setRescheduleOrder(null)}
          onRescheduled={() => {
            setRescheduleOrder(null);
            fetchBoardData();
            refreshNotifications();
          }}
        />
      )}
    </div>
  );
}
