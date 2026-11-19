import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatters';

export default function ProductCard({ product }) {
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const id = product._id || product.id;
  const finalPrice =
    product.finalPrice ?? Math.round(product.price * (1 - (product.discount || 0) / 100));
  const wishlisted = isWishlisted(id);
  const outOfStock = product.stock <= 0;

  return (
    <div className="product-card">
      <div className="product-img-wrap">
        <Link to={`/product/${id}`}>
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        </Link>

        {product.discount > 0 && (
          <span className="discount-tag">-{product.discount}% OFF</span>
        )}

        <button
          type="button"
          className={`wishlist-float-btn ${wishlisted ? 'active' : ''}`}
          onClick={() => toggleWishlist(id)}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={16} fill={wishlisted ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="product-card-body">
        <div className="product-card-meta">
          <span className="product-brand">{product.brand || product.category?.name}</span>
          <span className="product-rating">
            <Star size={13} fill="#F59E0B" color="#F59E0B" />
            {Number(product.rating || 4.5).toFixed(1)}
          </span>
        </div>

        <Link to={`/product/${id}`} className="product-title">
          {product.name}
        </Link>

        <div className="product-price-row">
          <span className="price-current">{formatINR(finalPrice)}</span>
          {product.discount > 0 && (
            <span className="price-original">{formatINR(product.price)}</span>
          )}
        </div>

        <div className="product-stock-line">
          {outOfStock ? (
            <span className="text-danger">Out of stock</span>
          ) : product.stock <= 5 ? (
            <span className="text-amber">Only {product.stock} left</span>
          ) : (
            <span className="text-emerald">2-Hr Smart Slot Eligible</span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-sm btn-block"
          disabled={outOfStock}
          onClick={() => addToCart(id, 1)}
        >
          <ShoppingCart size={15} />
          {outOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
}
