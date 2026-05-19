import React from "react";
import { useNotifications } from "../../context/NotificationContext";

// Icon and color mapping for each notification type
const TYPE_CONFIG = {
  PAYMENT_SUCCESS: { icon: "💳", color: "bg-green-100 text-green-600", label: "Payment" },
  ORDER_PLACED: { icon: "🛒", color: "bg-blue-100 text-blue-600", label: "Order" },
  ORDER_PACKED: { icon: "📦", color: "bg-yellow-100 text-yellow-600", label: "Packed" },
  ORDER_SHIPPED: { icon: "🚚", color: "bg-indigo-100 text-indigo-600", label: "Shipped" },
  ORDER_DELIVERED: { icon: "✅", color: "bg-green-100 text-green-600", label: "Delivered" },
  PROMO_OFFER: { icon: "🎁", color: "bg-pink-100 text-pink-600", label: "Promo" },
  SYSTEM_ALERT: { icon: "⚠️", color: "bg-red-100 text-red-600", label: "Alert" },
  GENERAL: { icon: "📢", color: "bg-gray-100 text-gray-600", label: "General" },
};

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function NotificationItem({ notification, onClose }) {
  const { markAsRead } = useNotifications();
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.GENERAL;

  const handleClick = () => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    onClose?.();
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
        notification.isRead
          ? "hover:bg-gray-50"
          : "bg-blue-50/50 hover:bg-blue-50"
      }`}
    >
      {/* Type icon */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg ${config.color}`}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-500">{config.label}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {timeAgo(notification.createdAt)}
          </span>
        </div>
        <p className="text-sm text-gray-800 leading-snug">{notification.message}</p>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
      )}
    </div>
  );
}

export default NotificationItem;
