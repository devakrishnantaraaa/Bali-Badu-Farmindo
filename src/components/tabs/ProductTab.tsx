'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Product } from '@/types';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { PackagePlus, Edit2, Trash2, Search, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProductTabProps {
  onNavigateToLedger?: (productId: number) => void;
}

export default function ProductTab({ onNavigateToLedger }: ProductTabProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // New Product Form State
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('krat');
  const [price, setPrice] = useState<number | ''>('');
  const [stock, setStock] = useState<number | ''>('');

  // Edit Modal State
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('krat');
  const [editPrice, setEditPrice] = useState<number | ''>('');
  const [editStock, setEditStock] = useState<number | ''>('');

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Fetch Products
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Gagal memuat produk');
      return res.json();
    },
  });

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Product>) => {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan produk');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setName('');
      setPrice('');
      setStock('');
      showToast(`Produk "${data.name || name}" berhasil ditambahkan!`);
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Product> & { id: number }) => {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui produk');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditProduct(null);
      showToast('Data produk berhasil diperbarui!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus produk');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteTarget(null);
      showToast('Produk berhasil dihapus!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      unit,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
    });
  };

  const handleStartEdit = (p: Product) => {
    setEditProduct(p);
    setEditName(p.name);
    setEditUnit(p.unit || 'krat');
    setEditPrice(p.price);
    setEditStock(p.stock);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct || !editName.trim()) return;
    updateMutation.mutate({
      id: editProduct.id,
      name: editName.trim(),
      unit: editUnit,
      price: Number(editPrice) || 0,
      stock: Number(editStock) || 0,
    });
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {feedback && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-semibold transition-all ${
            feedback.isError
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {feedback.isError ? (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Tambah Produk Baru (5 Kolom) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <PackagePlus className="w-4 h-4 text-amber-600" />
              <span>Form Tambah Produk Baru</span>
            </h2>
            <span className="text-[10px] bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded border border-amber-200 font-semibold">
              Katalog Master
            </span>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Nama Varian Produk Telur
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Telur Ayam Ras Super"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Satuan
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="krat">Krat (Tray)</option>
                  <option value="kg">Kg (Kilogram)</option>
                  <option value="butir">Butir</option>
                  <option value="ikat">Ikat</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Stok Awal
                </label>
                <input
                  type="number"
                  step="any"
                  value={stock}
                  onChange={(e) => setStock(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Harga Jual Standar (Rp)
              </label>
              <input
                type="number"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Contoh: 42000"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Produk'}
            </button>
          </form>
        </div>

        {/* Tabel Daftar Produk (7 Kolom) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>📋</span> Daftar Varian Telur Terdaftar
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari varian telur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Nama Produk</th>
                  <th className="p-2.5">Satuan</th>
                  <th className="p-2.5 text-right">Harga Jual</th>
                  <th className="p-2.5 text-right">Stok Sekarang</th>
                  <th className="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      Memuat daftar produk...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      Belum ada produk yang terdaftar
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {p.name}
                      </td>
                      <td className="p-2.5 text-slate-600 uppercase font-mono">{p.unit}</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-slate-800">
                        {formatRupiah(p.price)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                        {formatNumber(p.stock)}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {onNavigateToLedger && (
                            <button
                              onClick={() => onNavigateToLedger(p.id)}
                              className="p-1 text-emerald-700 hover:bg-emerald-50 rounded"
                              title="Buka Kartu Stok"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                            title="Edit Produk"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Hapus Produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Edit Varian Produk
            </h3>
            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Satuan
                  </label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="krat">Krat (Tray)</option>
                    <option value="kg">Kg (Kilogram)</option>
                    <option value="butir">Butir</option>
                    <option value="ikat">Ikat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                    Stok Saat Ini
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Harga Jual Satuan (Rp)
                </label>
                <input
                  type="number"
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditProduct(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Menyimpan...' : 'Perbarui'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus</h3>
            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin menghapus produk{' '}
              <strong className="text-slate-900 font-bold">{deleteTarget.name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

