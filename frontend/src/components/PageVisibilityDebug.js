import React, { useState, useEffect } from 'react';

/**
 * Debug component to show page visibility status
 * Only renders in development mode
 */
const PageVisibilityDebug = () => {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [lastChange, setLastChange] = useState(new Date());

  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = new Date();
      setIsVisible(!document.hidden);
      setLastChange(now);
      console.log(`Page visibility changed: ${document.hidden ? 'hidden' : 'visible'} at ${now.toLocaleTimeString()}`);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 rounded text-xs z-50">
      <div>Visibility: {isVisible ? '🟢 Visible' : '🔴 Hidden'}</div>
      <div>Last change: {lastChange.toLocaleTimeString()}</div>
    </div>
  );
};

export default PageVisibilityDebug;
