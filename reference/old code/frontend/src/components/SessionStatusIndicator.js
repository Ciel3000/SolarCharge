import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SessionStatusIndicator = () => {
  const { session, isSessionExpired, handleSessionTimeout } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (!session) {
      setTimeRemaining(null);
      setShowWarning(false);
      return;
    }

    const updateTimeRemaining = () => {
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        const remaining = payload.exp - currentTime;
        
        setTimeRemaining(remaining);
        
        // Show warning when less than 5 minutes remaining
        if (remaining <= 300 && remaining > 0) {
          setShowWarning(true);
        } else {
          setShowWarning(false);
        }
        
        // Auto-logout when session expires
        if (remaining <= 0) {
          handleSessionTimeout();
        }
      } catch (error) {
        console.error('Error calculating session time:', error);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [session, handleSessionTimeout]);

  if (!session) return null;

  const formatTime = (seconds) => {
    if (seconds <= 0) return 'Expired';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed top-4 right-4 z-50">
      {showWarning && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded shadow-lg mb-2">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">
              Session expires in {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      )}
      
      <div className={`text-xs px-2 py-1 rounded ${showWarning ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
        Session: {formatTime(timeRemaining)}
      </div>
    </div>
  );
};

export default SessionStatusIndicator;
