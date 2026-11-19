import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ShieldCheck, Truck, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-brand-col">
          <div className="navbar-brand" style={{ marginBottom: '0.75rem' }}>
            <span className="brand-icon">
              <Clock size={18} strokeWidth={2.4} />
            </span>
            <span className="brand-text">
              Slot<strong>Kart</strong>
            </span>
          </div>
          <p className="footer-desc">
            India&apos;s precision-scheduled e-commerce platform. Choose your exact 2-hour delivery
            window at checkout and eliminate missed deliveries forever.
          </p>
          <div className="footer-pincodes">
            <MapPin size={14} /> Active Demo Pincodes: <strong>302001</strong>,{' '}
            <strong>302017</strong>, <strong>324001</strong>
          </div>
        </div>

        <div>
          <h4 className="footer-heading">Shop</h4>
          <ul className="footer-links">
            <li><Link to="/catalog">All Products</Link></li>
            <li><Link to="/catalog?category=electronics">Electronics</Link></li>
            <li><Link to="/catalog?category=fashion">Fashion</Link></li>
            <li><Link to="/catalog?category=home">Home &amp; Kitchen</Link></li>
            <li><Link to="/catalog?deals=true">Top Deals</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="footer-heading">Smart Delivery</h4>
          <ul className="footer-links">
            <li><span className="footer-feature"><Clock size={14} /> 5 Daily 2-Hour IST Windows</span></li>
            <li><span className="footer-feature"><ShieldCheck size={14} /> 4-Digit OTP Verified Handover</span></li>
            <li><span className="footer-feature"><Truck size={14} /> Reschedule Instead of Return</span></li>
          </ul>
        </div>

        <div>
          <h4 className="footer-heading">Portals</h4>
          <ul className="footer-links">
            <li><Link to="/login">Customer Sign In</Link></li>
            <li><Link to="/dashboard">Customer My Board</Link></li>
            <li><Link to="/admin">Admin Operations</Link></li>
            <li><Link to="/delivery">Delivery Partner App</Link></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <span>&copy; {new Date().getFullYear()} SlotKart Commerce. Built with MERN + Python FastAPI Slot Engine.</span>
          <span>All delivery schedules operate in IST (Asia/Kolkata).</span>
        </div>
      </div>
    </footer>
  );
}
