import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!session?.access_token) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/user/notifications`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/notifications/unread-count`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [session]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(notification => 
            notification.notification_id === notificationId 
              ? { ...notification, is_read: true }
              : notification
          )
        );
        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [session]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(notification => ({ ...notification, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, [session]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    if (!session?.access_token) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        // Update local state
        const deletedNotification = notifications.find(n => n.notification_id === notificationId);
        setNotifications(prev => prev.filter(n => n.notification_id !== notificationId));
        
        // Update unread count if the deleted notification was unread
        if (deletedNotification && !deletedNotification.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [session, notifications]);

  // Refresh notifications
  const refreshNotifications = useCallback(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  // Initial fetch when session is available
  useEffect(() => {
    if (session) {
      fetchNotifications();
      fetchUnreadCount();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [session, fetchNotifications, fetchUnreadCount]);

  // Set up polling for new notifications (every 30 seconds)
  useEffect(() => {
    if (!session) return;
    
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [session, fetchUnreadCount]);

  const value = {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
