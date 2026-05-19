// ============================================================
// NOTIFICATION CONTEXT — Global notification state
//
// This context manages:
// 1. Notification list (from REST API on page load)
// 2. Unread count (the badge on the bell icon)
// 3. Real-time updates (new notifications via Socket.IO)
// 4. Mark as read / mark all as read
//
// SEPARATION FROM AuthContext:
// Auth state and notification state change for different reasons.
// Keeping them separate prevents unnecessary re-renders.
// When a notification arrives, only notification subscribers re-render.
// Auth state change would re-render the ENTIRE app if they were merged.
// ============================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { notificationAPI } from "../services/api";
import { useAuth } from "./AuthContext";
import { useSocket } from "../hooks/useSocket";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { on, emit } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState(null);

  // Track if we'''ve loaded initial data
  const initialLoadRef = useRef(false);

  // ── LOAD NOTIFICATIONS FROM API ──────────────────────────────
  // Called on mount and when user logs in
  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await notificationAPI.getAll({ page: 1, limit: 20 });
      setNotifications(response.data.notifications);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const loadUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await notificationAPI.getUnreadCount();
      setUnreadCount(response.data.count);
    } catch (error) {
      console.error("Failed to load unread count:", error);
    }
  }, [isAuthenticated]);

  // Load data when user authenticates
  useEffect(() => {
    if (isAuthenticated && !initialLoadRef.current) {
      initialLoadRef.current = true;
      loadNotifications();
      loadUnreadCount();
    }
    if (!isAuthenticated) {
      initialLoadRef.current = false;
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, loadNotifications, loadUnreadCount]);

  // ── SOCKET EVENT LISTENERS ────────────────────────────────────
  // Real-time: new notification arrives
  useEffect(() => {
    const unsubNewNotif = on("new_notification", (data) => {
      const { notification } = data;
      console.log("[Notification] New notification received:", notification);

      // Prepend to list (newest first)
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);

      // Optional: browser native notification
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("New Notification", {
          body: notification.message,
          icon: "/favicon.ico",
        });
      }
    });

    // Offline notifications delivered on reconnect
    const unsubOffline = on("offline_notifications", (data) => {
      const { notifications: offlineNotifs } = data;
      console.log(`[Notification] ${offlineNotifs.length} offline notifications delivered`);

      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const newOnes = offlineNotifs.filter((n) => !existingIds.has(n.id));
        return [...newOnes, ...prev];
      });

      const unreadNew = offlineNotifs.filter((n) => !n.isRead).length;
      setUnreadCount((prev) => prev + unreadNew);
    });

    // Server pushed updated unread count (after mark-as-read from another device)
    const unsubCount = on("unread_count_update", (data) => {
      setUnreadCount(data.count);
    });

    return () => {
      unsubNewNotif();
      unsubOffline();
      unsubCount();
    };
  }, [on]);

  // ── MARK AS READ ─────────────────────────────────────────────
  const markAsRead = useCallback(
    async (notificationId) => {
      try {
        await notificationAPI.markAsRead(notificationId);

        // Optimistic update: update UI immediately, then sync via socket
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        // Tell server via socket (triggers unread_count_update to all devices)
        emit("mark_read", { notificationId });
      } catch (error) {
        console.error("Failed to mark as read:", error);
      }
    },
    [emit]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      emit("mark_all_read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  }, [emit]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        pagination,
        loadNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
