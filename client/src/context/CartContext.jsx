import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const EMPTY_SUMMARY = {
  subtotal: 0,
  gst: 0,
  shipping: 0,
  total: 0,
  freeShippingThreshold: 999,
};

export function CartProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [itemCount, setItemCount] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [cartLoading, setCartLoading] = useState(false);

  const [wishlist, setWishlist] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const applyCartPayload = (data) => {
    setItems(data.items || []);
    setItemCount(data.itemCount || 0);
    setSummary(data.summary || EMPTY_SUMMARY);
  };

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setItemCount(0);
      setSummary(EMPTY_SUMMARY);
      return;
    }
    try {
      setCartLoading(true);
      const { data } = await api.get('/cart');
      applyCartPayload(data);
    } catch (_err) {
      // Keep UI resilient if session expires mid-flight
    } finally {
      setCartLoading(false);
    }
  }, [isAuthenticated]);

  const refreshWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      setWishlist([]);
      return;
    }
    try {
      const { data } = await api.get('/wishlist');
      setWishlist(data.products || []);
    } catch (_err) {
      setWishlist([]);
    }
  }, [isAuthenticated]);

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const { data } = await api.get('/notifications');
      setUnreadNotifications(data.unreadCount || 0);
    } catch (_err) {
      setUnreadNotifications(0);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user) {
      refreshCart();
      refreshWishlist();
      refreshNotifications();
    } else {
      setItems([]);
      setItemCount(0);
      setSummary(EMPTY_SUMMARY);
      setWishlist([]);
      setUnreadNotifications(0);
    }
  }, [isAuthenticated, user, refreshCart, refreshWishlist, refreshNotifications]);

  const addToCart = async (productId, quantity = 1, { silent = false } = {}) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to add items to your cart.');
      return false;
    }
    try {
      const { data } = await api.post('/cart/items', { productId, quantity });
      applyCartPayload(data);
      if (!silent) toast.success('Added to cart');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not add item to cart.'));
      return false;
    }
  };

  const updateQuantity = async (productId, quantity) => {
    try {
      const { data } = await api.put(`/cart/items/${productId}`, { quantity });
      applyCartPayload(data);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update quantity.'));
      return false;
    }
  };

  const removeFromCart = async (productId) => {
    try {
      const { data } = await api.delete(`/cart/items/${productId}`);
      applyCartPayload(data);
      toast.success('Removed from cart');
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove item.'));
      return false;
    }
  };

  const clearCart = async () => {
    try {
      const { data } = await api.delete('/cart');
      applyCartPayload(data);
    } catch (_err) {
      setItems([]);
      setItemCount(0);
      setSummary(EMPTY_SUMMARY);
    }
  };

  const toggleWishlist = async (productId) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to save items to your wishlist.');
      return false;
    }
    try {
      const { data } = await api.post('/wishlist/toggle', { productId });
      setWishlist(data.products || []);
      toast.success(data.added ? 'Saved to wishlist' : 'Removed from wishlist');
      return data.added;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update wishlist.'));
      return false;
    }
  };

  const isWishlisted = (productId) => {
    return wishlist.some((p) => (p._id || p.id) === productId);
  };

  const value = {
    items,
    itemCount,
    summary,
    cartLoading,
    wishlist,
    unreadNotifications,
    refreshCart,
    refreshWishlist,
    refreshNotifications,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    toggleWishlist,
    isWishlisted,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return ctx;
}
