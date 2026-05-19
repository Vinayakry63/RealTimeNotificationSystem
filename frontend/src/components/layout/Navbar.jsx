import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import NotificationBell from "../notifications/NotificationBell";
import { useSocket } from "../../hooks/useSocket";

function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const { isConnected } = useSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">NotifyPro</span>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
            >
              Dashboard
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                Admin Panel
              </Link>
            )}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-4">
            {/* Connection status indicator */}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-400"
                }`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* User menu */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-gray-900">
                  {user?.name}
                </span>
                <span className="text-xs text-gray-500 capitalize">
                  {user?.role?.toLowerCase()}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
