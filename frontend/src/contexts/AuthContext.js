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
  const [initialized, setInitialized] = useState(false); // Track if auth has been initialized

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
      } else {
        console.error("AuthContext: Failed to fetch /api/me status:", res.status, await res.text());
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("AuthContext: Error checking admin status:", err);
      setIsAdmin(false);
    }
  }, []);

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
           .limit(1); // Use limit instead of maybeSingle to handle multiple or no results

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
    try {
      console.log("AuthContext: Attempting session recovery...");
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session recovery timeout')), 10000)
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
        
        // Run these in parallel to speed up recovery
        await Promise.allSettled([
          checkAdminStatus(recoveredSession),
          fetchSubscriptionAndPlans(recoveredSession)
        ]);
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
    }
  }, [checkAdminStatus, fetchSubscriptionAndPlans]); // Include dependencies

  useEffect(() => {
    let mounted = true; // Flag to prevent state updates if component unmounted
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
            await checkAdminStatus(initialSession);
            await fetchSubscriptionAndPlans(initialSession);
          }
          
          setLoading(false);
          setInitialized(true); // Mark as initialized
        }

        // 2. Listen for real-time authentication state changes
        const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
          async (event, currentSession) => {
            if (!mounted) return; // Don't process if component unmounted

            console.log("AuthContext: onAuthStateChange event:", event, "Session:", currentSession);

            // Handle different auth events
            switch (event) {
              case 'SIGNED_IN':
                console.log("AuthContext: User signed in");
                // Only show loading if this is a fresh sign-in, not a tab switch
                if (!initialized || !session) {
                  setLoading(true);
                }
                setError(null);
                setSession(currentSession);
                setUser(currentSession?.user || null);
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
                  // Don't re-fetch admin status and subscription on token refresh
                  // to avoid unnecessary API calls
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this effect runs once on mount

  // Separate useEffect for handling tab visibility to prevent unnecessary loading
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Don't trigger any loading states when tab becomes visible again
      if (!document.hidden && session) {
        console.log("AuthContext: Tab became visible, but not triggering reload");
      }
    };

    const handleFocus = () => {
      // Don't trigger any loading states when window gets focus
      if (session) {
        console.log("AuthContext: Window focused, but not triggering reload");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session]);



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
    // Authentication methods
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Always render children, let individual components handle loading/error states */}
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
