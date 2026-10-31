'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Boxes, AlertCircle, ShoppingCart, BookOpen, PackagePlus } from 'lucide-react';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { Product, Customer } from '@/types';

interface DashboardTabProps {
  onNavigateTab: (tabId: string) => void;
}

export default function DashboardTab({ onNavigateTab }: DashboardTabProps) {
  // 1. Fetch Customers
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal memuat customer');
      return res.json();
    },
  });

  // 2. Fetch Products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal memuat produk');
      return res.json();
    },
  });

  // 3. Fetch Outstanding Debts
  const { data: debts = [] } = useQuery<any[]>({
    queryKey: ['outstanding-debts'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/reports/outstanding-debts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal memuat piutang');
      return res.json();
    },
  });

  const totalDebts = debts.reduce(
    (acc, c) => acc + (parseFloat(c.total_remaining_debt) || parseFloat(c.total_customer_debt) || 0),
    0
  );

  const tbProduct = products.find((p) => p.name.toUpperCase().includes('TB') || p.name.toUpperCase().includes('SUPER'));
  const tgProduct = products.find((p) => p.name.toUpperCase().includes('TG') || p.name.toUpperCase().includes('MEDIUM'));

  return (
    <div className="space-y-6">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Customer</div>
            <div className="text-2xl font-black text-slate-900">{customers.length} Orang</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Stok TB */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Stok {tbProduct?.name || 'TB'}
            </div>
            <div className="text-2xl font-black text-amber-600">
              {formatNumber(tbProduct?.current_stock ?? 0)} {tbProduct?.unit || 'krat'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Stok TG */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Stok {tgProduct?.name || 'TG'}
            </div>
            <div className="text-2xl font-black text-emerald-600">
              {formatNumber(tgProduct?.current_stock ?? 0)} {tgProduct?.unit || 'krat'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Piutang Gantung */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Piutang Gantung</div>
            <div className="text-2xl font-black text-rose-600">{formatRupiah(totalDebts)}</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Shortcuts */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Pintasan Cepat Operasional</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => onNavigateTab('sales')}
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 transition text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Input Penjualan Kasir</div>
              <div className="text-[11px] text-slate-400">Catat nota penjualan baru</div>
            </div>
          </button>

          <button
            onClick={() => onNavigateTab('stock')}
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Input Barang Masuk</div>
              <div className="text-[11px] text-slate-400">Catat kiriman telur dari supplier</div>
            </div>
          </button>

          <button
            onClick={() => onNavigateTab('ledger')}
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center group-hover:scale-110 transition">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Buka Kartu Stok</div>
              <div className="text-[11px] text-slate-400">Audit mutasi & sisa stok gudang</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

