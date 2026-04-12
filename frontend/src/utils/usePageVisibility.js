import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for managing intervals based on page visibility
 * @param {Function} onVisible - Function to call when page becomes visible
 * @param {Function} onHidden - Function to call when page becomes hidden
 * @param {Function} startInterval - Function to start the interval
 * @param {Function} stopInterval - Function to stop the interval
 * @param {boolean} enabled - Whether the visibility handling is enabled
 */
export const usePageVisibility = ({
  onVisible,
  onHidden,
  startInterval,
  stopInterval,
  enabled = true
}) => {
  const isPageVisibleRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden
        console.log('Page visibility: Tab hidden');
        isPageVisibleRef.current = false;
        stopInterval?.();
        onHidden?.();
      } else {
        // Page is visible again
        console.log('Page visibility: Tab visible');
        isPageVisibleRef.current = true;
        onVisible?.();
        startInterval?.();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopInterval?.();
    };
  }, [onVisible, onHidden, startInterval, stopInterval, enabled]);

  return {
    isPageVisible: isPageVisibleRef.current
  };
};

/**
 * Custom hook for managing a single interval with page visibility awareness
 * @param {Function} callback - Function to call on interval
 * @param {number} delay - Interval delay in milliseconds
 * @param {boolean} enabled - Whether the interval is enabled
 */
export const useIntervalWithVisibility = (callback, delay, enabled = true) => {
  const intervalRef = useRef(null);
  const isPageVisibleRef = useRef(true);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(callback, delay);
  }, [callback, delay]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - stop interval to save resources
        console.log('Interval visibility: Tab hidden, stopping interval');
        isPageVisibleRef.current = false;
        stopInterval();
      } else {
        // Page is visible again - restart interval and call callback immediately
        console.log('Interval visibility: Tab visible, restarting interval');
        isPageVisibleRef.current = true;
        
        // Immediately call callback for fresh data
        callback();
        
        // Restart interval
        startInterval();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup
    callback();
    startInterval();

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopInterval();
    };
  }, [callback, delay, enabled, startInterval, stopInterval]);

  return {
    isPageVisible: isPageVisibleRef.current,
    startInterval,
    stopInterval
  };
};
