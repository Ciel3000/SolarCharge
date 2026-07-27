import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    return JSON.parse(atob(base64));
  } catch (e) {
    console.error('AuthContext: JWT payload decode failed:', e);
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [usageAggregate, setUsageAggregate] = useState({
    daily_limit: 0,
    total_consumed: 0,
    remaining: 0,
  });
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);

  // Check token expiry
  const isTokenExpired = useCallback((token) => {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    return payload.exp < Math.floor(Date.now() / 1000);
  }, []);

  // Fetch plans from backend
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/subscription/plans`);
      if (res.ok) {
        const data = await res.json();
        setPlans(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  }, []);

  // Fetch subscription data
  const fetchSubscription = useCallback(async (token) => {
    try {
      const res = await fetch(`${API_BASE}/api/user/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setActiveSubscriptions(data.active_subscriptions || []);
        setUsageAggregate(data.aggregate || { daily_limit: 0, total_consumed: 0, remaining: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
    }
  }, []);

  // Check admin status
  const checkAdminStatus = useCallback(async (token) => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(data.is_admin);
      }
    } catch (err) {
      console.error('Failed to check admin status:', err);
    }
  }, []);

  // Initialize auth from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');

      if (token && !isTokenExpired(token)) {
        const payload = decodeJwtPayload(token);
        setSession({ access_token: token, user: { id: payload.user_id, email: payload.email } });
        setUser({ user_id: payload.user_id, email: payload.email });

        await Promise.all([
          checkAdminStatus(token),
          fetchPlans(),
          fetchSubscription(token),
        ]);
      } else if (refreshToken) {
        // Try to refresh
        try {
          const res = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            const payload = decodeJwtPayload(data.access_token);
            setSession({ access_token: data.access_token, user: { id: payload.user_id, email: payload.email } });
            setUser({ user_id: payload.user_id, email: payload.email });
            await Promise.all([
              checkAdminStatus(data.access_token),
              fetchPlans(),
              fetchSubscription(data.access_token),
            ]);
          } else {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
          }
        } catch (err) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }

      setLoading(false);
    };

    initAuth();
  }, [isTokenExpired, checkAdminStatus, fetchPlans, fetchSubscription]);

  // Sign in
  const signIn = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Login failed');
      }

      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setSession({ access_token: data.access_token, user: data.user });
      setUser(data.user);

      await Promise.all([
        checkAdminStatus(data.access_token),
        fetchPlans(),
        fetchSubscription(data.access_token),
      ]);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Sign up
  const signUp = async (email, password, fname, lname, contact_number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fname, lname, contact_number }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Signup failed');
      }

      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setSession({ access_token: data.access_token, user: data.user });
      setUser(data.user);

      await Promise.all([
        checkAdminStatus(data.access_token),
        fetchPlans(),
        fetchSubscription(data.access_token),
      ]);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setSubscription(null);
    setActiveSubscriptions([]);
    setUsageAggregate({ daily_limit: 0, total_consumed: 0, remaining: 0 });
    setPlans([]);
    setError(null);
  };

  // Refresh subscription
  const refreshSubscription = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      await fetchSubscription(token);
      await fetchPlans();
    }
  }, [fetchSubscription, fetchPlans]);

  const value = {
    session,
    user,
    isAdmin,
    isLoading: loading,
    subscription,
    activeSubscriptions,
    usageAggregate,
    plans,
    error,
    clearError: () => setError(null),
    signIn,
    signUp,
    signOut,
    refreshSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
