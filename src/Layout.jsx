import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { Package, Menu, X, Archive, Printer, LogIn, LogOut, Warehouse } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function Layout({ children, currentPageName }) {
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(true);

  const isAdmin = user?.role === 'admin';

  const handleLoginClick = () => {
    const returnTo = window.location.pathname || '/';
    window.location.href = `${createPageUrl('Login')}?return_to=${encodeURIComponent(returnTo)}`;
  };

  const navItems = [
        { name: 'Home', icon: Package, label: t('layout.navTonerFind'), show: true },
        { name: 'Cabinets', icon: Warehouse, label: t('layout.navCabinets'), show: true },
        // { name: 'TonerOverview', icon: ListChecks, label: t('layout.navTonerOverview'), show: true },
        { name: 'Admin', icon: Archive, label: t('layout.navAdmin'), show: isAdmin }
      ];

  return (
    <div className="min-h-screen bg-slate-50">
      {!menuOpen && (
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="hidden md:flex fixed top-4 left-4 z-50 items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-800"
          aria-label="Menü einblenden"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Bottom Navigation für Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 md:hidden">
        <div className="flex justify-around items-center h-16 px-4">
          {navItems.filter(n => n.show).map((item) => {
            const Icon = item.icon;
            const isActive = currentPageName === item.name;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.name)}
                className={cn(
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all",
                  isActive 
                    ? "text-slate-800 bg-yellow-100" 
                    : "text-slate-500 hover:text-slate-700"
                )}
                >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => logout()}
              className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-slate-500 hover:text-slate-700"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-xs font-medium">{t('common.logout')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLoginClick}
              className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-slate-500 hover:text-slate-700"
            >
              <LogIn className="w-5 h-5" />
              <span className="text-xs font-medium">{t('common.login')}</span>
            </button>
          )}
        </div>
        </nav>

        {/* Desktop Sidebar */}
        <aside className={cn(
          "hidden md:fixed md:flex md:flex-col md:left-0 md:top-0 md:h-screen md:w-64 bg-white border-r border-slate-200 z-40 transition-transform duration-300",
          menuOpen ? "md:translate-x-0" : "md:-translate-x-full"
        )}>
        <div className="p-6 border-b border-slate-100 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFCB00' }}>
              <Printer className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800">{t('layout.appName')}</h1>
              <p className="text-xs text-slate-500">{t('layout.appSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="hidden md:flex absolute top-4 right-4 items-center justify-center w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800"
            aria-label="Menü ausblenden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navItems.filter(n => n.show).map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.name;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.name)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    isActive 
                      ? "bg-yellow-100 text-slate-800" 
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                  >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium">
                  {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {user.full_name || user.email}
                  </div>
                  <div className="text-xs text-slate-500">
                    {isAdmin ? t('common.admin') : t('common.user')}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()} className="w-full">
                {t('common.logout')}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleLoginClick} className="w-full">
              {t('common.login')}
            </Button>
          )}
        </div>
          </aside>

          {/* Main Content */}
          <main className={cn(
            "pb-20 md:pb-0 transition-[margin] duration-300 min-h-screen flex flex-col",
            menuOpen ? "md:ml-64" : "md:ml-0"
          )}>
            <div className="flex-1">
              {children}
            </div>
            <footer className="text-xs text-slate-400 py-4 px-4 relative">
              <span className="block text-center">© 2026 Wagner GROUP . All rights reserved.</span>
              <span className="block text-center text-slate-300 mt-0.5">v2.0.0</span>
              <a
                href="mailto:basile.schoeb@wagner-group.com"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 opacity-10 hover:opacity-30"
              >
                Built by Basile Schoeb
              </a>
            </footer>
          </main>
    </div>
  );
}
