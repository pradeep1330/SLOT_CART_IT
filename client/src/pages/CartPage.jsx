import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, ArrowRight, Clock, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatters';
import EmptyState from '../components/EmptyState';

export default function CartPage() {
  const { items, summary, cartLoading, updateQuantity, removeFromCart } = useCart();
  const navigate = useNavigate();

  if (cartLoading && items.length === 0) {
    return (
      <div className="container page-section">
        <div className="skeleton-box" style={{ height: '300px' }} />
      </div>
    );
  }

  return (
    <div className="container page-section">
      <div className="section-heading-row" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1>Shopping Cart</h1>
          <p className="text-muted">
            {items.length} product(s) ready for 2-hour scheduled slot checkout.
          </p>
        </div>
        <Link to="/catalog" className="btn btn-outline btn-sm">
          Continue Shopping
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your shopping cart is empty"
          description="Browse our catalog of 36 curated products and reserve a guaranteed 2-hour delivery window at checkout."
          action={
            <Link to="/catalog" className="btn btn-primary">
              Explore Products
            </Link>
          }
        />
      ) : (
        <div className="cart-layout">
          <div className="cart-items-col">
            {items.map((item) => (
              <div key={item.productId} className="card cart-item-card">
                <Link to={`/product/${item.productId}`} className="cart-item-img">
                  <img src={item.imageUrl} alt={item.name} />
                </Link>

                <div className="cart-item-info">
                  <Link to={`/product/${item.productId}`} className="cart-item-title">
                    {item.name}
                  </Link>
                  <p className="text-muted">{item.brand}</p>
                  <div className="product-price-row">
                    <span className="price-current">{formatINR(item.finalUnitPrice)}</span>
                    {item.discount > 0 && (
                      <>
                        <span className="price-original">{formatINR(item.price)}</span>
                        <span className="badge badge-emerald">-{item.discount}%</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="cart-item-controls">
                  <div className="qty-stepper qty-stepper-sm">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    >
                      &minus;
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      disabled={item.quantity >= item.stock || item.quantity >= 20}
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>

                  <strong className="cart-line-total">{formatINR(item.lineTotal)}</strong>

                  <button
                    type="button"
                    className="btn btn-danger-soft btn-xs"
                    onClick={() => removeFromCart(item.productId)}
                    title="Remove item"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="card summary-card">
            <h3>Order Summary</h3>
            <div className="summary-rows">
              <div className="summary-row">
                <span>Subtotal</span>
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
              {summary.subtotal > 0 && summary.subtotal < summary.freeShippingThreshold && (
                <small className="free-ship-note">
                  Add {formatINR(summary.freeShippingThreshold - summary.subtotal)} more for FREE
                  delivery!
                </small>
              )}
              <div className="summary-row summary-total">
                <strong>Total Payable</strong>
                <strong>{formatINR(summary.total)}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate('/checkout')}
            >
              Proceed to Slot Checkout <ArrowRight size={17} />
            </button>

            <div className="summary-usp-box">
              <div>
                <Clock size={15} className="text-emerald" />
                <span>Next step: pick your exact 2-hour delivery slot</span>
              </div>
              <div>
                <ShieldCheck size={15} className="text-indigo" />
                <span>Prices &amp; stock atomically verified at server</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
