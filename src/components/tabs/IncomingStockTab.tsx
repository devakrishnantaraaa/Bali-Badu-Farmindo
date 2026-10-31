'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Product } from '@/types';
import { formatNumber, formatRupiah } from '@/lib/utils';
import { PackagePlus, CheckCircle2, AlertCircle } from 'lucide-react';

export default function IncomingStockTab() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Form State
  const [productId, setProductId] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
  const [notes, setNotes] = useState<string>('');

  const { data: products = [] } = useQuery<Product[]>({
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

  const incomingMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/stock/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan stok masuk');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-global'] });

      setQuantity('');
      setPurchasePrice('');
      setNotes('');
      showToast('Barang masuk berhasil disimpan & stok bertambah!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return showToast('Silakan pilih produk terlebih dahulu', true);
    if (!date) return showToast('Silakan isi tanggal masuk', true);
    const qtyNum = Number(quantity);
    if (!qtyNum || qtyNum <= 0) return showToast('Jumlah masuk harus lebih besar dari 0', true);

    incomingMutation.mutate({
      product_id: Number(productId),
      date,
      quantity: qtyNum,
      purchase_price: purchasePrice !== '' ? Number(purchasePrice) : 0,
      notes: notes.trim(),
    });
  };

  const selectedProduct = products.find((p) => String(p.id) === String(productId));

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

      <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-600" />
            <span>Input Barang Masuk (Restock Gudang)</span>
          </h2>
          <span className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded border border-emerald-200 font-medium">
            Penambahan Stok
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Pilih Produk
            </label>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Pilih Produk...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Stok Saat Ini: {formatNumber(p.stock)} {p.unit})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Tanggal Masuk
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Jumlah Masuk ({selectedProduct ? selectedProduct.unit : 'krat/kg'})
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Harga Beli / Satuan (Rp) <span className="text-[10px] text-slate-400 lowercase">(opsional)</span>
              </label>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Catatan / Supplier
              </label>
              <input
                type="text"
                placeholder="Misal: Penerimaan dari Peternakan Blitar"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {quantity !== '' && Number(quantity) > 0 && selectedProduct && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex justify-between items-center">
              <span>Stok Baru Setelah Masuk:</span>
              <span className="font-bold font-mono text-sm">
                {formatNumber(Number(selectedProduct.stock) + Number(quantity))} {selectedProduct.unit}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={incomingMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg shadow-sm transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <PackagePlus className="w-4 h-4" />
            {incomingMutation.isPending ? 'Menyimpan Barang Masuk...' : 'Simpan Barang Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}

