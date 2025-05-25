'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Navigation() {
  const { user, isManager, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) =>
    pathname === path ? 'text-blue-700 font-semibold' : 'text-gray-700';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <nav className="border-b border-gray-200 bg-white px-4 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Left: Logo */}
        <Link href="/dashboard" className="flex items-center">
          <img src="/logo.png" alt="Brand Care Logo" className="h-10 w-auto" />
        </Link>

        {/* Right: Desktop links */}
        <div className="hidden md:flex items-center space-x-6">
          <Link href="/dashboard" className={`text-sm ${isActive('/dashboard')}`}>
            Dashboard
          </Link>
          <Link href="/dashboard/my-attendance" className={`text-sm ${isActive('/dashboard/my-attendance')}`}>
            My Attendance
          </Link>
          {isManager && (
            <Link href="/dashboard/reports" className={`text-sm ${isActive('/dashboard/reports')}`}>
              Reports
            </Link>
          )}
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={`text-sm px-4 py-2 rounded-md transition ${
              isLoggingOut
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>

        {/* Toggle button for mobile */}
        <div className="md:hidden">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-2xl focus:outline-none"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile menu (slide from right) */}
      <div
        className={`fixed top-0 right-0 h-full w-3/4 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        } md:hidden`}
      >
        <div className="flex flex-col items-start p-6 space-y-4">
          <Link
            href="/dashboard"
            className={`text-sm ${isActive('/dashboard')}`}
            onClick={() => setMenuOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/my-attendance"
            className={`text-sm ${isActive('/dashboard/my-attendance')}`}
            onClick={() => setMenuOpen(false)}
          >
            My Attendance
          </Link>
          {isManager && (
            <Link
              href="/dashboard/reports"
              className={`text-sm ${isActive('/dashboard/reports')}`}
              onClick={() => setMenuOpen(false)}
            >
              Reports
            </Link>
          )}
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={async () => {
              await handleLogout();
              setMenuOpen(false);
            }}
            disabled={isLoggingOut}
            className={`text-sm px-4 py-2 rounded-md transition ${
              isLoggingOut
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Optional overlay when menu is open */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 bg-black bg-opacity-30 md:hidden z-40"
        />
      )}
    </nav>
  );
}
