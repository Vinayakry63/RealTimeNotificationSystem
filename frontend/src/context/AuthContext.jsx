// ============================================================
// AUTH CONTEXT — Global authentication state
//
// WHY REACT CONTEXT FOR AUTH?
// Authentication state (user, token, isLoggedIn) is needed across
// the entire app: Navbar (show user name), ProtectedRoutes (redirect),
// API calls (attach token), Socket connection (send JWT).
//
// Without Context: prop drilling through 5+ component levels.
// With Context: any component subscribes directly.
//
// ALTERNATIVES:
// - Redux: more powerful, more boilerplate. Overkill for auth state.
// - Zustand: simpler Redux alternative. Good choice too.
// - Context API: built into React, perfect for global state that
//   doesn'''t change every frame (auth state changes rarely).
//
// Industry pattern: auth in Context, complex UI state in Redux/Zustand.
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true during initial auth check

  // On app start: restore auth state from localStorage
  // Without this: user gets logged out on every page refresh
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        // Corrupted localStorage — clear it
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }

    setIsLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await authAPI.login({ email, password });
    const { user: userData, token: userToken } = response.data;

    // Persist to localStorage (survives page refresh)
    localStorage.setItem("token", userToken);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setToken(userToken);

    return userData;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const response = await authAPI.register({ name, email, password });
    const { user: userData, token: userToken } = response.data;

    localStorage.setItem("token", userToken);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    setToken(userToken);

    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
  }, []);

  const isAdmin = user?.role === "ADMIN";
  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated,
        isAdmin,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
