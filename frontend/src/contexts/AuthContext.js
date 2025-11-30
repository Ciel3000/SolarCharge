// frontend/src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false); // Add recovery state
  const [sessionTimeout, setSessionTimeout] = useState(null); // Track session timeout

  // --- Session timeout handler ---
  const handleSessionTimeout = useCallback(() => {
    console.log("AuthContext: Session timeout detected");
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setSubscription(null);
    setPlans([]);
    setError("Session expired. Please log in again.");
    setInitialized(false);
  }, []);

  // --- Check if session is expired ---
  const isSessionExpired = useCallback((currentSession) => {
    if (!currentSession?.access_token) return true;
    
    try {
      // Decode JWT token to check expiration
      const payload = JSON.parse(atob(currentSession.access_token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      console.error("AuthContext: Error checking session expiration:", error);
      return true; // Assume expired if we can't decode
    }
  }, []);

  // --- Helper to check admin status by calling backend API ---
  const checkAdminStatus = useCallback(async (currentSession) => {
    if (!currentSession || !currentSession.access_token) {
      setIsAdmin(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me`, {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });

      if (res.ok) {
        const userData = await res.json();
        setIsAdmin(userData.is_admin);
      } else if (res.status === 401) {
        console.error("AuthContext: Unauthorized - session may be expired");
        handleSessionTimeout();
      } else {
        console.error("AuthContext: Failed to fetch /api/me status:", res.status, await res.text());
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("AuthContext: Error checking admin status:", err);
      setIsAdmin(false);
    }
  }, [handleSessionTimeout]);

  // --- Helper to fetch user subscription and all plans ---
  const fetchSubscriptionAndPlans = useCallback(async (currentSession) => {
    if (!currentSession) {
      setSubscription(null);
      setPlans([]);
      return;
    }
    try {
      // First, fetch all available plans (this should always work)
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*');

      if (plansError) {
        console.error("AuthContext: Error fetching plans:", plansError);
      } else {
        setPlans(plansData || []);
      }

      // Then fetch user's active subscription (this might not exist)
      try {
        const { data: subData, error: subError } = await supabase
          .from('user_subscription')
          .select(`
            *,
            subscription_plans (*)
          `)
          .eq('user_id', currentSession.user.id)
          .eq('is_active', true)
          .limit(1);

        if (subError) {
          console.error("AuthContext: Error fetching subscription:", subError);
          setSubscription(null);
        } else {
          // Take the first result if any, or null if empty array
          setSubscription(subData && subData.length > 0 ? subData[0] : null);
        }
      } catch (subscriptionError) {
        console.error("AuthContext: Subscription fetch failed:", subscriptionError);
        setSubscription(null);
      }

    } catch (error) {
      console.error("AuthContext: Error fetching subscription or plans:", error.message);
      setSubscription(null);
      setPlans([]);
    }
  }, []);

  // --- Session recovery function ---
  const recoverSession = useCallback(async () => {
    if (isRecovering) return; // Prevent multiple simultaneous recoveries
    
    try {
      console.log("AuthContext: Attempting session recovery...");
      setIsRecovering(true);
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session recovery timeout')), 15000) // Increased timeout
      );
      
      const sessionPromise = supabase.auth.getSession();
      
      const { data: { session: recoveredSession }, error } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]);
      
      if (error) {
        throw error;
      }
      
      if (recoveredSession) {
        console.log("AuthContext: Session recovered successfully");
        setSession(recoveredSession);
        setUser(recoveredSession.user);
        
        // Run these sequentially to avoid race conditions
        await checkAdminStatus(recoveredSession);
        await fetchSubscriptionAndPlans(recoveredSession);
      } else {
        console.log("AuthContext: No session to recover");
        setSession(null);
        setUser(null);
        setIsAdmin(false);
        setSubscription(null);
        setPlans([]);
      }
    } catch (err) {
      console.error("AuthContext: Session recovery failed:", err);
      setError(err.message);
      // Reset auth state on recovery failure
      setSession(null);
      setUser(null);
      setIsAdmin(false);
      setSubscription(null);
      setPlans([]);
    } finally {
      setLoading(false);
      setIsRecovering(false);
    }
  }, [checkAdminStatus, fetchSubscriptionAndPlans, isRecovering]);

  useEffect(() => {
    let mounted = true;
    let authSubscription = null;

    const initializeAuth = async () => {
      try {
        // 1. Get the initial session when the app loads
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user || null);
          
          if (initialSession) {
            // Run these sequentially to avoid race conditions
            await checkAdminStatus(initialSession);
            await fetchSubscriptionAndPlans(initialSession);
          }
          
          setLoading(false);
          setInitialized(true);
        }

        // 2. Listen for real-time authentication state changes
        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
          async (event, currentSession) => {
            if (!mounted) return;

            console.log("AuthContext: onAuthStateChange event:", event, "Session:", currentSession);

            // Handle different auth events
            switch (event) {
              case 'SIGNED_IN':
                console.log("AuthContext: User signed in");
                if (!initialized || !session) {
                  setLoading(true);
                }
                setError(null);
                setSession(currentSession);
                setUser(currentSession?.user || null);
                // Run these sequentially
                await checkAdminStatus(currentSession);
                await fetchSubscriptionAndPlans(currentSession);
                setLoading(false);
                setInitialized(true);
                break;
                
              case 'SIGNED_OUT':
                console.log("AuthContext: User signed out");
                setSession(null);
                setUser(null);
                setIsAdmin(false);
                setSubscription(null);
                setPlans([]);
                setError(null);
                setInitialized(false);
                break;
                
              case 'TOKEN_REFRESHED':
                console.log("AuthContext: Token refreshed");
                if (currentSession) {
                  setSession(currentSession);
                  setUser(currentSession.user);
                }
                break;
                
              default:
                console.log("AuthContext: Other auth event:", event);
                if (currentSession !== session) {
                  setSession(currentSession);
                  setUser(currentSession?.user || null);
                }
            }
          }
        );
        
        authSubscription = sub;

      } catch (err) {
        console.error("AuthContext: Initialization error:", err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Cleanup function
    return () => {
      mounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
    };
  }, []);

  // --- Session monitoring effect ---
  useEffect(() => {
    if (!session) {
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        setSessionTimeout(null);
      }
      return;
    }

    // Check if session is already expired
    if (isSessionExpired(session)) {
      handleSessionTimeout();
      return;
    }

    // Calculate time until session expires
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = (payload.exp - currentTime) * 1000; // Convert to milliseconds
      
      // Set timeout to handle session expiration
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
      
      const timeoutId = setTimeout(() => {
        handleSessionTimeout();
      }, timeUntilExpiry);
      
      setSessionTimeout(timeoutId);
      
      console.log(`AuthContext: Session will expire in ${Math.floor(timeUntilExpiry / 1000)} seconds`);
    } catch (error) {
      console.error("AuthContext: Error setting session timeout:", error);
    }
  }, [session, isSessionExpired, handleSessionTimeout]);

  // --- Page visibility change handler ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && session && isSessionExpired(session)) {
        console.log("AuthContext: Page became visible and session is expired");
        handleSessionTimeout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, isSessionExpired, handleSessionTimeout]);

  // Error recovery function
  const clearError = () => setError(null);

  // Value provided by the context to all consuming components
  const value = {
    session,
    user,
    isAdmin,
    isLoading: loading,
    subscription,
    plans,
    error,
    clearError,
    recoverSession,
    isRecovering,
    handleSessionTimeout,
    isSessionExpired,
    // Authentication methods
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for easy consumption of the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
