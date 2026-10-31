'use client';

import React, { useState, useEffect } from 'react';
import { AuthUser } from '@/lib/auth';
import LoginView from '@/components/auth/LoginView';
import ChangePasswordModal from '@/components/auth/ChangePasswordModal';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

// Tab Components
import DashboardTab from '@/components/tabs/DashboardTab';
import StockLedgerTab from '@/components/tabs/StockLedgerTab';
import CustomerTab from '@/components/tabs/CustomerTab';
import ProductTab from '@/components/tabs/ProductTab';
import SalesFormTab from '@/components/tabs/SalesFormTab';
import IncomingStockTab from '@/components/tabs/IncomingStockTab';
import DailySalesTab from '@/components/tabs/DailySalesTab';
import DailyDepositsTab from '@/components/tabs/DailyDepositsTab';
import DebtsTab from '@/components/tabs/DebtsTab';
import MonthlyRecapTab from '@/components/tabs/MonthlyRecapTab';
import InventoryTab from '@/components/tabs/InventoryTab';

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Ringkasan Dashboard Operasional',
  sales: 'Input Transaksi Penjualan Sales',
  'daily-sales': 'Rekapitulasi Penjualan Harian',
  'daily-deposits': 'Rekapitulasi Setoran Harian',
  'monthly-recap': 'Rekapitulasi Penjualan Bulanan',
  stock: 'Penerimaan Barang Masuk (Restock)',
  ledger: 'Kartu Stok & Audit Opname Gudang',
  inventory: 'Laporan Global Persediaan & Valuasi Gudang',
  debts: 'Rekap Nota Pending & Piutang Customer',
  customer: 'Data Master Pelanggan',
  product: 'Data Master Varian Produk Telur',
};

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [ledgerInitialProductId, setLedgerInitialProductId] = useState<number | undefined>();

  // Initialize session from localStorage
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      if (storedToken && storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Session load error:', e);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const handleLoginSuccess = (user: AuthUser, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setCurrentUser(user);
    // Role based default tab
    if (user.role === 'MARKETING') {
      setActiveTab('sales');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
  };

  const handleNavigateToLedger = (productId: number) => {
    setLedgerInitialProductId(productId);
    setActiveTab('ledger');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold tracking-wide">Memuat Sistem Bali Badu Farmindo...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-800">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'ledger') {
            setLedgerInitialProductId(undefined);
          }
        }}
        user={currentUser}
        onLogout={handleLogout}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Header title={TAB_TITLES[activeTab] || 'Sistem Distribusi Telur'} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardTab
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'sales' && (
              <SalesFormTab currentUser={currentUser} />
            )}

            {activeTab === 'daily-sales' && (
              <DailySalesTab currentUser={currentUser} />
            )}

            {activeTab === 'daily-deposits' && (
              <DailyDepositsTab />
            )}

            {activeTab === 'monthly-recap' && (
              <MonthlyRecapTab />
            )}

            {activeTab === 'stock' && (
              <IncomingStockTab />
            )}

            {activeTab === 'ledger' && (
              <StockLedgerTab
                initialProductId={ledgerInitialProductId ? String(ledgerInitialProductId) : 'ALL'}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryTab onNavigateToLedger={handleNavigateToLedger} />
            )}

            {activeTab === 'debts' && (
              <DebtsTab />
            )}

            {activeTab === 'customer' && (
              <CustomerTab />
            )}

            {activeTab === 'product' && (
              <ProductTab onNavigateToLedger={handleNavigateToLedger} />
            )}
          </div>
        </main>
      </div>

      {/* Ganti Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        user={currentUser}
        onClose={() => setIsChangePasswordOpen(false)}
        onSuccess={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}

