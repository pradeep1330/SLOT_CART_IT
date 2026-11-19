import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Clock,
  Search,
  ShoppingCart,
  Bell,
  User,
  LogOut,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Truck,
  Menu,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, getDashboardPathByRole } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount, unreadNotifications } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    navigate(q ? `/catalog?search=${encodeURIComponent(q)}` : '/catalog');
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out cleanly');
    navigate('/login');
  };

  const dashboardPath = user ? getDashboardPathByRole(user.role) : '/dashboard';

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">
            <Clock size={20} strokeWidth={2.4} />
          </span>
          <span className="brand-text">
            Slot<strong>Kart</strong>
          </span>
        </Link>

        <form className="navbar-search" onSubmit={handleSearch}>
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search headphones, sneakers, air fryer, books..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search products"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
        </form>

        <nav className={`navbar-links ${mobileOpen ? 'open' : ''}`}>
          <Link to="/catalog" className="nav-link">
            Catalog
          </Link>

          {isAuthenticated && user.role === 'customer' && (
            <>
              <Link to="/orders" className="nav-link">
                My Orders
              </Link>
              <Link to="/dashboard?tab=notifications" className="nav-icon-btn" title="Notifications">
                <Bell size={20} />
                {unreadNotifications > 0 && (
                  <span className="nav-badge nav-badge-emerald">{unreadNotifications}</span>
                )}
              </Link>
            </>
          )}

          {isAuthenticated && user.role === 'admin' && (
            <Link to="/admin" className="nav-link nav-link-accent">
              <ShieldCheck size={16} /> Admin Console
            </Link>
          )}

          {isAuthenticated && user.role === 'delivery' && (
            <Link to="/delivery" className="nav-link nav-link-emerald">
              <Truck size={16} /> Delivery Board
            </Link>
          )}

          {(!isAuthenticated || user.role !== 'delivery') && (
            <Link to="/cart" className="nav-icon-btn" title="Shopping Cart">
              <ShoppingCart size={20} />
              {itemCount > 0 && <span className="nav-badge">{itemCount}</span>}
            </Link>
          )}

          {isAuthenticated ? (
            <div className="user-menu" ref={dropdownRef}>
              <button
                type="button"
                className="user-menu-trigger"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <span className="user-avatar">{user.name?.charAt(0).toUpperCase() || 'U'}</span>
                <span className="user-trigger-meta">
                  <span className="user-trigger-name">{user.name.split(' ')[0]}</span>
                  <span className="user-trigger-role">{user.role}</span>
                </span>
              </button>

              {menuOpen && (
                <div className="user-dropdown">
                  <div className="user-dropdown-header">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <Link to={dashboardPath} className="dropdown-item">
                    <LayoutDashboard size={16} />
                    {user.role === 'admin'
                      ? 'Admin Dashboard'
                      : user.role === 'delivery'
                        ? 'Delivery Dashboard'
                        : 'My Board'}
                  </Link>
                  {user.role === 'customer' && (
                    <Link to="/orders" className="dropdown-item">
                      <Package size={16} /> My Orders
                    </Link>
                  )}
                  {user.role === 'admin' && (
                    <>
                      <Link to="/admin/products" className="dropdown-item">
                        <Package size={16} /> Manage Products
                      </Link>
                      <Link to="/admin/orders" className="dropdown-item">
                        <Truck size={16} /> Manage Orders
                      </Link>
                      <Link to="/admin/slots" className="dropdown-item">
                        <Clock size={16} /> Slot Capacity
                      </Link>
                    </>
                  )}
                  <button type="button" className="dropdown-item danger" onClick={handleLogout}>
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-nav-actions">
              <Link to="/login" className="btn btn-outline btn-sm">
                <User size={15} /> Sign In
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Register
              </Link>
            </div>
          )}
        </nav>

        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  );
}
