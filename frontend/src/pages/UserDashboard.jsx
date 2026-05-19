import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { useSocket } from "../hooks/useSocket";
import NotificationItem from "../components/notifications/NotificationItem";

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function UserDashboard() {
  const { user } = useAuth();
  const { notifications, unreadCount, isLoading, markAllAsRead } = useNotifications();
  const { isConnected } = useSocket();

  const totalCount = notifications.length;
  const readCount = totalCount - unreadCount;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name}! 👋
        </h1>
        <p className="text-gray-500 mt-1">
          {isConnected
            ? "You're connected — notifications will appear in real-time."
            : "Connecting to real-time server..."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon="🔔" label="Total Notifications" value={totalCount} color="bg-blue-100" />
        <StatCard icon="📬" label="Unread" value={unreadCount} color="bg-red-100" />
        <StatCard icon="✅" label="Read" value={readCount} color="bg-green-100" />
      </div>

      {/* Notifications panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">All Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-5xl mb-4">🔔</div>
              <h3 className="text-gray-700 font-medium mb-1">No notifications yet</h3>
              <p className="text-gray-400 text-sm">
                Ask an admin to send you a notification to test the system.
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))
          )}
        </div>
      </div>

      {/* Architecture info panel */}
      <div className="mt-6 bg-blue-50 rounded-xl p-5 border border-blue-100">
        <h3 className="font-medium text-blue-900 mb-2">How this works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• You are connected via WebSocket to the server (persistent connection)</li>
          <li>• When an admin sends you a notification, it arrives instantly via Socket.IO</li>
          <li>• Notifications are persisted in PostgreSQL — they survive page refreshes</li>
          <li>• If you were offline, Redis queued your missed notifications</li>
        </ul>
      </div>
    </main>
  );
}

export default UserDashboard;
