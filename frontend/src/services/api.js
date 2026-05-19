// ============================================================
// API SERVICE — Centralized Axios configuration
//
// WHY AXIOS OVER FETCH?
// - Automatic JSON parsing
// - Request/response interceptors (add auth headers globally)
// - Better error handling (fetch doesn'''t reject on 4xx/5xx)
// - Request cancellation
// - Progress tracking for file uploads
//
// INTERCEPTOR PATTERN:
// Instead of adding Authorization header in every API call,
// one interceptor adds it automatically to ALL requests.
// This is the "don'''t repeat yourself" principle for HTTP.
//
// This pattern is used in every professional React application.
// ============================================================

import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 second timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// ── REQUEST INTERCEPTOR ──────────────────────────────────────
// Runs before EVERY request
// Automatically adds JWT token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR ─────────────────────────────────────
// Runs after EVERY response
// Handle 401 (token expired) globally
api.interceptors.response.use(
  (response) => response.data, // Unwrap { data: ... } automatically
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear auth and redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    // Re-throw for component-level handling
    return Promise.reject(error.response?.data || error);
  }
);

// ── AUTH ENDPOINTS ───────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post("/api/auth/register", data),
  login: (data) => api.post("/api/auth/login", data),
  getProfile: () => api.get("/api/auth/profile"),
  getAllUsers: () => api.get("/api/auth/users"),
};

// ── NOTIFICATION ENDPOINTS ───────────────────────────────────
export const notificationAPI = {
  getAll: (params) => api.get("/api/notifications", { params }),
  getUnreadCount: () => api.get("/api/notifications/unread-count"),
  markAsRead: (id) => api.patch(`/api/notifications/${id}/read`),
  markAllAsRead: () => api.patch("/api/notifications/read-all"),
  send: (data) => api.post("/api/notifications/send", data),
};

export default api;
