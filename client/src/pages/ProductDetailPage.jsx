import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Star,
  ShoppingCart,
  Zap,
  Heart,
  Clock,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatINR, formatDateTime } from '../utils/formatters';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addToCart, toggleWishlist, isWishlisted } = useCart();

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  // Quick pincode slot preview
  const [checkPin, setCheckPin] = useState('302001');
  const [pinPreview, setPinPreview] = useState(null);
  const [checkingPin, setCheckingPin] = useState(false);

  // Review submission state
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/products/${id}`);
        setProduct(data.product);
        setReviews(data.reviews || []);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Product not found.'));
        navigate('/catalog');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  const handleCheckPincode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(checkPin.trim())) {
      toast.error('Enter a valid 6-digit Indian pincode.');
      return;
    }
    setCheckingPin(true);
    try {
      const { data } = await api.get('/slots/week', { params: { pincode: checkPin.trim() } });
      const firstOpen = (data.days || []).find((d) => d.available_slots_count > 0);
      setPinPreview(
        firstOpen
          ? `Next open 2-hr delivery slot: ${firstOpen.display_date} (${firstOpen.available_slots_count} windows available)`
          : 'All upcoming slots are currently full for this pincode.'
      );
    } catch (err) {
      setPinPreview(getErrorMessage(err, 'Slot service busy, please retry'));
    } finally {
      setCheckingPin(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to proceed to checkout.');
      navigate('/login', { state: { from: `/product/${id}` } });
      return;
    }
    const ok = await addToCart(product._id, qty, { silent: true });
    if (ok) {
      navigate('/checkout');
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Sign in to write a product review.');
      navigate('/login');
      return;
    }
    setSubmittingReview(true);
    try {
      const { data } = await api.post(`/products/${product._id}/reviews`, reviewForm);
      toast.success('Review saved!');
      setReviewForm({ rating: 5, comment: '' });
      // Refresh product & reviews
      const refreshed = await api.get(`/products/${product._id}`);
      setProduct(refreshed.data.product);
      setReviews(refreshed.data.reviews || []);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading || !product) {
    return (
      <div className="container page-section">
        <div className="skeleton-box" style={{ height: '420px' }} />
      </div>
    );
  }

  const finalPrice =
    product.finalPrice ?? Math.round(product.price * (1 - (product.discount || 0) / 100));
  const outOfStock = product.stock <= 0;
  const wishlisted = isWishlisted(product._id);

  return (
    <div className="container page-section">
      <Link to="/catalog" className="back-link">
        <ArrowLeft size={16} /> Back to Catalog
      </Link>

      <div className="product-detail-grid">
        <div className="card product-detail-img-card">
          <img src={product.imageUrl} alt={product.name} />
          {product.discount > 0 && (
            <span className="discount-tag">Save {product.discount}%</span>
          )}
        </div>

        <div className="product-detail-info">
          <div className="detail-meta-row">
            <span className="badge badge-indigo">{product.category?.name}</span>
            <span className="text-muted">{product.brand}</span>
          </div>

          <h1>{product.name}</h1>

          <div className="detail-rating-row">
            <span className="rating-pill">
              <Star size={14} fill="currentColor" /> {Number(product.rating).toFixed(1)}
            </span>
            <span className="text-muted">{product.numReviews} verified review(s)</span>
            <span className={`badge ${outOfStock ? 'badge-danger' : 'badge-emerald'}`}>
              {outOfStock ? 'Out of Stock' : `In Stock (${product.stock} left)`}
            </span>
          </div>

          <div className="detail-price-box">
            <span className="detail-price-current">{formatINR(finalPrice)}</span>
            {product.discount > 0 && (
              <>
                <span className="detail-price-original">{formatINR(product.price)}</span>
                <span className="detail-savings">
                  You save {formatINR(product.price - finalPrice)}
                </span>
              </>
            )}
          </div>

          <p className="detail-description">{product.description}</p>

          {/* Quantity & Action Buttons */}
          <div className="detail-purchase-row">
            <div className="qty-stepper">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
              >
                &minus;
              </button>
              <span>{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(Math.min(product.stock, 20), q + 1))}
                disabled={qty >= product.stock || qty >= 20}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={outOfStock}
              onClick={() => addToCart(product._id, qty)}
            >
              <ShoppingCart size={17} /> Add to Cart
            </button>

            <button
              type="button"
              className="btn btn-emerald"
              disabled={outOfStock}
              onClick={handleBuyNow}
            >
              <Zap size={17} /> Buy Now
            </button>

            <button
              type="button"
              className={`btn btn-outline ${wishlisted ? 'wishlist-btn-active' : ''}`}
              onClick={() => toggleWishlist(product._id)}
              title="Toggle wishlist"
            >
              <Heart size={17} fill={wishlisted ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Live Smart Delivery Slot Availability Checker */}
          <div className="card slot-preview-card">
            <div className="slot-preview-head">
              <Clock size={18} className="text-emerald" />
              <strong>Check 2-Hour Delivery Slot Availability</strong>
            </div>
            <form className="pin-check-form" onSubmit={handleCheckPincode}>
              <div className="input-with-icon">
                <MapPin size={15} className="input-icon" />
                <input
                  type="text"
                  maxLength={6}
                  value={checkPin}
                  onChange={(e) => setCheckPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit pincode (e.g. 302001)"
                />
              </div>
              <button type="submit" className="btn btn-outline btn-sm" disabled={checkingPin}>
                {checkingPin ? 'Checking...' : 'Check Slots'}
              </button>
            </form>
            {pinPreview && (
              <p className="pin-preview-result">
                <CheckCircle2 size={15} /> {pinPreview}
              </p>
            )}
            <div className="detail-trust-notes">
              <span>
                <ShieldCheck size={14} /> 4-digit OTP verified doorstep delivery
              </span>
              <span>
                <Clock size={14} /> Free reschedule up to 2x (3h before slot)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <section className="reviews-section">
        <div className="card">
          <h3>Customer Reviews ({reviews.length})</h3>
          <div className="reviews-layout">
            <div className="reviews-list">
              {reviews.length === 0 ? (
                <p className="text-muted">Be the first to review this product.</p>
              ) : (
                reviews.map((rev) => (
                  <div key={rev._id} className="review-item">
                    <div className="review-item-top">
                      <strong>{rev.userName}</strong>
                      <span className="rating-pill rating-pill-sm">
                        <Star size={12} fill="currentColor" /> {rev.rating}
                      </span>
                    </div>
                    <p>{rev.comment}</p>
                    <small className="text-muted">{formatDateTime(rev.createdAt)}</small>
                  </div>
                ))
              )}
            </div>

            <form className="review-form-box" onSubmit={handleReviewSubmit}>
              <h4>Write a Review</h4>
              <div className="form-group">
                <label>Rating</label>
                <select
                  value={reviewForm.rating}
                  onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
                >
                  <option value={5}>5 Stars — Excellent</option>
                  <option value={4}>4 Stars — Very Good</option>
                  <option value={3}>3 Stars — Good</option>
                  <option value={2}>2 Stars — Fair</option>
                  <option value={1}>1 Star — Poor</option>
                </select>
              </div>
              <div className="form-group">
                <label>Your Review</label>
                <textarea
                  rows={3}
                  required
                  minLength={3}
                  maxLength={600}
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  placeholder="Share product quality and delivery slot experience..."
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={submittingReview}>
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
