import React, { useState, useEffect } from "react";
import { authAPI } from "../services/api";
import { notificationAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

const NOTIFICATION_TYPES = [
  { value: "PAYMENT_SUCCESS", label: "💳 Payment Success" },
  { value: "ORDER_PLACED", label: "🛒 Order Placed" },
  { value: "ORDER_PACKED", label: "📦 Order Packed" },
  { value: "ORDER_SHIPPED", label: "🚚 Order Shipped" },
  { value: "ORDER_DELIVERED", label: "✅ Order Delivered" },
  { value: "PROMO_OFFER", label: "🎁 Promo Offer" },
  { value: "SYSTEM_ALERT", label: "⚠️ System Alert" },
  { value: "GENERAL", label: "📢 General" },
];

function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ userId: "", type: "GENERAL", message: "" });
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message: string }
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    authAPI.getAllUsers().then((res) => setUsers(res.data.users)).catch(console.error);
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setStatus(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.userId) {
      setStatus({ type: "error", message: "Please select a user." });
      return;
    }
    setIsSending(true);
    setStatus(null);

    try {
      await notificationAPI.send({
        userId: parseInt(form.userId),
        type: form.type,
        message: form.message,
      });
      setStatus({ type: "success", message: "Notification sent! The user will receive it in real-time if online." });
      setForm((prev) => ({ ...prev, message: "" }));
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Failed to send notification." });
    } finally {
      setIsSending(false);
    }
  };

  const selectedUser = users.find((u) => u.id === parseInt(form.userId));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
        <p className="text-gray-500">Send real-time notifications to users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send notification form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-5">Send Notification</h2>

          {status && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                status.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {status.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select User
              </label>
              <select
                name="userId"
                value={form.userId}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">-- Choose a user --</option>
                {users
                  .filter((u) => u.id !== user?.id) // Don't send to yourself
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) — {u.role}
                    </option>
                  ))}
              </select>
              {selectedUser && (
                <p className="text-xs text-gray-500 mt-1">
                  User ID: {selectedUser.id} — Role: {selectedUser.role}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notification Type
              </label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {NOTIFICATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                placeholder="Enter notification message..."
                required
                maxLength={500}
              />
              <p className="text-xs text-gray-400 text-right mt-1">
                {form.message.length}/500
              </p>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {isSending ? "Sending..." : "Send Notification"}
            </button>
          </form>
        </div>

        {/* Architecture explanation */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Real-time Flow</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              {[
                "Admin fills out this form and clicks Send",
                "Frontend sends POST /api/notifications/send (REST)",
                "Backend validates admin JWT + RBAC role check",
                "Notification saved to PostgreSQL (persistent)",
                "Backend emits socket event to user room 'user:ID'",
                "Redis Pub/Sub broadcasts to all server instances",
                "User's browser receives event via WebSocket",
                "React state updates → notification appears instantly",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center justify-center flex-shrink-0 font-medium mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
            <h4 className="font-medium text-purple-900 mb-2">Users registered</h4>
            <p className="text-2xl font-bold text-purple-700">{users.length}</p>
            <p className="text-xs text-purple-600 mt-1">Total accounts in the system</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default AdminDashboard;
