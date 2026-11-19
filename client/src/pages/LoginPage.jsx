import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Clock,
  Lock,
  Mail,
  ArrowRight,
  User,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, getDashboardPathByRole } from '../context/AuthContext';
import { getErrorMessage } from '../api/axios';

const DEMO_ACCOUNTS = [
  {
    role: 'Customer',
    email: 'customer@demo.com',
    password: 'Customer@123',
    icon: User,
    badgeClass: 'badge-indigo',
    hint: 'Shop, book 2-hr slots, view OTP & reschedule',
  },
  {
    role: 'Admin',
    email: 'admin@demo.com',
    password: 'Admin@123',
    icon: ShieldCheck,
    badgeClass: 'badge-purple',
    hint: 'Analytics charts, order dispatch & slot capacity',
  },
  {
    role: 'Delivery Partner',
    email: 'delivery@demo.com',
    password: 'Delivery@123',
    icon: Truck,
    badgeClass: 'badge-emerald',
    hint: 'Slot-sorted deliveries, OTP handover & reschedule',
  },
];

export default function LoginPage() {
  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getDashboardPathByRole(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleAutofill = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrorMsg('');
    toast.success(`Filled ${account.role} demo credentials`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      const loggedInUser = await login(email.trim(), password);
      toast.success(`Welcome back, ${loggedInUser.name.split(' ')[0]}!`);
      const from = location.state?.from;
      const target =
        from && loggedInUser.role === 'customer'
          ? from
          : getDashboardPathByRole(loggedInUser.role);
      navigate(target, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err, 'Invalid credentials.');
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="container auth-split">
        {/* Left USP Showcase Panel */}
        <div className="auth-showcase">
          <div className="auth-showcase-badge">
            <Clock size={16} /> Smart Delivery Slot Engine
          </div>
          <h1>Never miss a parcel again. Pick your exact 2-hour window.</h1>
          <p>
            Unlike traditional stores that only promise a vague delivery date, SlotKart reserves a
            real-time 2-hour delivery window per pincode — powered by our atomic Python Slot Engine.
          </p>

          <ul className="auth-benefits">
            <li>
              <CheckCircle2 size={18} />
              <span>5 precision daily IST windows (10 AM – 8 PM) with live capacity meters</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>Smart &ldquo;Recommended Slot&rdquo; picks the least-loaded upcoming window</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>Reschedule up to 2 times (3h before start) + 4-digit OTP verified handover</span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>&ldquo;Reschedule instead of Return&rdquo; if you step away unexpectedly</span>
            </li>
          </ul>
        </div>

        {/* Right Login Form + Demo Credentials Card */}
        <div className="auth-form-col">
          <div className="card auth-card">
            <div className="auth-card-header">
              <h2>Sign in to SlotKart</h2>
              <p>Access your personal board, live delivery slots, or partner console.</p>
            </div>

            {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

            <form onSubmit={handleSubmit} className="form-stack">
              <div className="form-group">
                <label htmlFor="login-email">Email Address</label>
                <div className="input-with-icon">
                  <Mail size={17} className="input-icon" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <div className="input-with-icon">
                  <Lock size={17} className="input-icon" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
                {!submitting && <ArrowRight size={17} />}
              </button>
            </form>

            <p className="auth-switch-text">
              New to SlotKart? <Link to="/register">Create a customer account</Link>
            </p>
          </div>

          {/* Demo Credentials One-Click Autofill Card */}
          <div className="card demo-card">
            <div className="demo-card-header">
              <span className="badge badge-emerald">Demo Mode</span>
              <h3>One-Click Demo Credentials</h3>
            </div>
            <div className="demo-list">
              {DEMO_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                return (
                  <div key={acc.email} className="demo-row">
                    <div className="demo-row-info">
                      <div className="demo-row-title">
                        <Icon size={15} />
                        <strong>{acc.role}</strong>
                        <span className={`badge ${acc.badgeClass}`}>{acc.email}</span>
                      </div>
                      <small>{acc.hint}</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      onClick={() => handleAutofill(acc)}
                    >
                      Autofill
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
