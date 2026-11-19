import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const getDashboardPathByRole = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'delivery') return '/delivery';
  return '/dashboard';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user || null);
    } catch (_err) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  };

  const register = async ({ name, email, phone, password }) => {
    const { data } = await api.post('/auth/register', { name, email, phone, password });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  const updateProfile = async ({ name, phone }) => {
    const { data } = await api.put('/auth/profile', { name, phone });
    setUser(data.user);
    return data.user;
  };

  const value = {
    user,
    authLoading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    refreshUser,
    updateProfile,
    getDashboardPathByRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
