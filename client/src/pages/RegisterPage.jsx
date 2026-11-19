import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Lock,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, getDashboardPathByRole } from '../context/AuthContext';
import { getErrorMessage } from '../api/axios';

export default function RegisterPage() {
  const { register, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getDashboardPathByRole(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const rules = {
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    digit: /\d/.test(form.password),
  };
  const passwordValid = rules.length && rules.upper && rules.lower && rules.digit;

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    if (!passwordValid) {
      setErrorMsg('Password must meet all four security criteria below.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      toast.success('Welcome to SlotKart! Your account is ready.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err, 'Registration failed.');
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="container auth-split">
        <div className="auth-showcase">
          <div className="auth-showcase-badge">
            <Clock size={16} /> Join SlotKart Today
          </div>
          <h1>Shop smarter with guaranteed 2-hour delivery slots.</h1>
          <p>
            Create your free customer account to reserve exact delivery times, save addresses, track
            orders live with OTP security, and reschedule seamlessly when plans change.
          </p>
        </div>

        <div className="auth-form-col">
          <div className="card auth-card">
            <div className="auth-card-header">
              <h2>Create your account</h2>
              <p>Takes less than 30 seconds.</p>
            </div>

            {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

            <form onSubmit={handleSubmit} className="form-stack">
              <div className="form-group">
                <label htmlFor="reg-name">Full Name</label>
                <div className="input-with-icon">
                  <User size={17} className="input-icon" />
                  <input
                    id="reg-name"
                    name="name"
                    type="text"
                    required
                    minLength={2}
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Rohan Mehta"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="reg-email">Email Address</label>
                  <div className="input-with-icon">
                    <Mail size={17} className="input-icon" />
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="rohan@example.com"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-phone">Mobile Number (India)</label>
                  <div className="input-with-icon">
                    <Phone size={17} className="input-icon" />
                    <input
                      id="reg-phone"
                      name="phone"
                      type="tel"
                      required
                      maxLength={10}
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="reg-pass">Password</label>
                  <div className="input-with-icon">
                    <Lock size={17} className="input-icon" />
                    <input
                      id="reg-pass"
                      name="password"
                      type="password"
                      required
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Min 8 chars"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reg-confirm">Confirm Password</label>
                  <div className="input-with-icon">
                    <Lock size={17} className="input-icon" />
                    <input
                      id="reg-confirm"
                      name="confirmPassword"
                      type="password"
                      required
                      value={form.confirmPassword}
                      onChange={handleChange}
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>
              </div>

              <div className="password-rules">
                <span className={rules.length ? 'rule-ok' : ''}>
                  {rules.length ? <CheckCircle2 size={14} /> : <Circle size={14} />} 8+ characters
                </span>
                <span className={rules.upper ? 'rule-ok' : ''}>
                  {rules.upper ? <CheckCircle2 size={14} /> : <Circle size={14} />} Uppercase (A-Z)
                </span>
                <span className={rules.lower ? 'rule-ok' : ''}>
                  {rules.lower ? <CheckCircle2 size={14} /> : <Circle size={14} />} Lowercase (a-z)
                </span>
                <span className={rules.digit ? 'rule-ok' : ''}>
                  {rules.digit ? <CheckCircle2 size={14} /> : <Circle size={14} />} Number (0-9)
                </span>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                {submitting ? 'Creating account...' : 'Create Account'}
                {!submitting && <ArrowRight size={17} />}
              </button>
            </form>

            <p className="auth-switch-text">
              Already have an account? <Link to="/login">Sign in here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
