// ============================================================
// useSocket — Custom hook for Socket.IO connection management
//
// WHY A CUSTOM HOOK?
// Socket.IO connection logic is complex:
// - Connect with JWT authentication
// - Handle reconnection
// - Clean up on unmount (prevent memory leaks)
// - Only connect when authenticated
//
// Without a hook: this logic would live in every component that needs sockets.
// With a hook: write once, use anywhere. Classic React pattern.
//
// SOCKET LIFECYCLE:
// 1. User logs in → token becomes available
// 2. Hook detects token → creates socket connection with JWT
// 3. Socket authenticates on server → joins personal room
// 4. App renders → socket receives real-time events
// 5. User logs out OR component unmounts → socket disconnects (cleanup)
//
// The cleanup (return function in useEffect) is CRITICAL.
// Without it: orphaned sockets accumulate → memory leak → browser freezes.
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

export function useSocket() {
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Create socket connection with JWT authentication
    // Socket.IO sends this during the HTTP handshake (before WebSocket upgrade)
    const socket = io(SOCKET_URL, {
      auth: { token }, // Server reads socket.handshake.auth.token
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // ── EVENT HANDLERS ────────────────────────────────────────
    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionError(null);
      console.log("[Socket] Connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      console.log("[Socket] Disconnected:", reason);

      // Socket.IO auto-reconnects for these reasons:
      if (reason === "io server disconnect") {
        // Server explicitly disconnected us (e.g., invalid token)
        // Don'''t auto-reconnect — force re-login
        socket.connect();
      }
    });

    socket.on("connect_error", (error) => {
      setConnectionError(error.message);
      console.error("[Socket] Connection error:", error.message);
    });

    socket.on("connected", (data) => {
      console.log("[Socket] Joined room:", data.room);
    });

    // ── CLEANUP ───────────────────────────────────────────────
    // This runs when: component unmounts, token changes, user logs out
    return () => {
      console.log("[Socket] Cleaning up connection");
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token, isAuthenticated]);

  // Subscribe to a socket event
  // Returns an unsubscribe function for cleanup
  const on = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
      return () => socketRef.current?.off(event, handler);
    }
    return () => {};
  }, []);

  // Emit an event to the server
  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    on,
    emit,
  };
}
