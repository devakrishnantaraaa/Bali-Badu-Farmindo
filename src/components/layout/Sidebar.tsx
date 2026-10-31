'use client';

import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  PiggyBank,
  CalendarDays,
  PackagePlus,
  BookOpen,
  Warehouse,
  AlertCircle,
  Users,
  Boxes,
  KeyRound,
  LogOut,
  Egg,
} from 'lucide-react';
import { AuthUser } from '@/lib/auth';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  user: AuthUser;
  onLogout: () => void;
  onOpenChangePassword: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  user,
  onLogout,
  onOpenChangePassword,
}: SidebarProps) {
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isMarketing = user.role === 'MARKETING';

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'sales',
      label: 'Input Penjualan',
      icon: ShoppingCart,
      visible: !isAdmin, // Marketing & SuperAdmin
    },
    {
      id: 'daily-sales',
      label: 'Rekap Penjualan',
      icon: Receipt,
      visible: true,
    },
    {
      id: 'daily-deposits',
      label: 'Setoran Harian',
      icon: PiggyBank,
      visible: !isAdmin, // Marketing & SuperAdmin
    },
    {
      id: 'monthly-recap',
      label: 'Rekap Bulanan',
      icon: CalendarDays,
      visible: isSuperAdmin,
    },
    {
      id: 'stock',
      label: 'Barang Masuk',
      icon: PackagePlus,
      visible: isSuperAdmin || isAdmin,
    },
    {
      id: 'ledger',
      label: 'Kartu Stok & Audit',
      icon: BookOpen,
      visible: true,
    },
    {
      id: 'inventory',
      label: 'Laporan Gudang',
      icon: Warehouse,
      visible: true,
    },
    {
      id: 'debts',
      label: 'Nota Pending',
      icon: AlertCircle,
      visible: true,
    },
    {
      id: 'customer',
      label: 'Pelanggan',
      icon: Users,
      visible: true,
    },
    {
      id: 'product',
      label: 'Master Produk',
      icon: Boxes,
      visible: isSuperAdmin || isAdmin,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed inset-y-0 left-0 z-40">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
          <Egg className="w-5 h-5 fill-amber-500/20" />
        </div>
        <div className="overflow-hidden">
          <h2 className="text-sm font-black text-white truncate">Bali Badu Farmindo</h2>
          <p className="text-[10px] text-slate-400 truncate">Sistem Distribusi Telur</p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950 stroke-[2.5]' : ''}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between">
          <div className="overflow-hidden pr-2">
            <div className="text-xs font-bold text-white truncate">{user.full_name || user.username}</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 mt-0.5">
              {user.role}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenChangePassword}
              className="p-2 rounded-lg bg-slate-800 hover:bg-amber-900/40 text-slate-400 hover:text-amber-400 transition"
              title="Ganti Password Akun"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

