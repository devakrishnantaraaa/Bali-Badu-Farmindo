'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Product, Customer } from '@/types';
import { formatRupiah, formatNumber, formatDateIndo } from '@/lib/utils';
import { ShoppingCart, AlertTriangle, Printer, CheckCircle2, AlertCircle, Bluetooth, Zap } from 'lucide-react';
import { printDirectWebBluetooth, printViaRawBT } from '@/lib/thermalPrinter';

interface SalesFormTabProps {
  currentUser?: { full_name?: string; role?: string } | null;
}

export default function SalesFormTab({ currentUser }: SalesFormTabProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Form State
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>('');
  const [paymentType, setPaymentType] = useState<'LUNAS' | 'PENDING'>('LUNAS');
  const [dueDate, setDueDate] = useState<string>('');

  // Modals
  const [receiptData, setReceiptData] = useState<any | null>(null);
  const [pendingWarning, setPendingWarning] = useState<any | null>(null);

  // Load Customers & Products
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await fetch('/api/customers');
      if (!res.ok) throw new Error('Gagal memuat customer');
      return res.json();
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Gagal memuat produk');
      return res.json();
    },
  });

  // Automatically update unit price when product changes if empty or matching old price
  useEffect(() => {
    if (productId) {
      const selectedProduct = products.find((p) => String(p.id) === String(productId));
      if (selectedProduct && (unitPrice === '' || unitPrice === 0)) {
        setUnitPrice(selectedProduct.price);
      }
    }
  }, [productId, products]);

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3500);
  };

  const qtyNum = typeof quantity === 'number' ? quantity : 0;
  const priceNum = typeof unitPrice === 'number' ? unitPrice : 0;
  const totalAmount = qtyNum * priceNum;

  // Submit Order Mutation
  const orderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses transaksi');
      return data;
    },
    onSuccess: (data) => {
      // Refresh relevant data caches
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });

      const customerObj = customers.find((c) => String(c.id) === String(customerId));
      const productObj = products.find((p) => String(p.id) === String(productId));

      const receipt = {
        invoice_number: data.invoice?.invoice_number || 'INV-001',
        order_date: orderDate,
        sales_name: currentUser?.full_name || 'Sales DJS',
        customer_name: customerObj?.name || 'Pelanggan',
        product_name: productObj?.name || 'Telur Ayam Ras',
        quantity: qtyNum,
        unit: productObj?.unit || 'krat',
        unit_price: priceNum,
        total_amount: totalAmount,
        payment_type: paymentType,
        due_date: dueDate || null,
        pending_warning: data.pending_warning || null,
      };

      setReceiptData(receipt);
      if (data.pending_warning) {
        setPendingWarning(data.pending_warning);
      }

      // Reset form fields
      setQuantity('');
      setDueDate('');
      showToast('Transaksi berhasil diproses & stok terupdate!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDate) return showToast('Pilih tanggal transaksi terlebih dahulu', true);
    if (!customerId) return showToast('Pilih customer terlebih dahulu', true);
    if (!productId) return showToast('Pilih produk terlebih dahulu', true);
    if (!qtyNum || qtyNum <= 0) return showToast('Masukkan jumlah qty yang valid', true);
    if (priceNum <= 0) return showToast('Masukkan harga satuan yang valid', true);

    orderMutation.mutate({
      order_date: orderDate,
      customer_id: Number(customerId),
      product_id: Number(productId),
      quantity: qtyNum,
      unit_price: priceNum,
      payment_type: paymentType,
      due_date: paymentType === 'PENDING' && dueDate ? dueDate : null,
    });
  };

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
            <ShoppingCart className="w-5 h-5 text-amber-600" />
            <span>Form Input Penjualan Sales</span>
          </h2>
          <span className="text-xs bg-amber-50 text-amber-800 px-2.5 py-1 rounded border border-amber-200 font-medium">
            Kasir Cepat & Struk
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Tanggal Penjualan / Nota
            </label>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Pelanggan / Customer
            </label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="">Pilih Customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Produk Telur
            </label>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="">Pilih Produk...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} - Stok: {formatNumber(p.stock)} {p.unit} (Rp {formatNumber(p.price)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Jumlah Qty (krat/kg/tray)
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-amber-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Harga Satuan (Rp) <span className="text-[10px] text-amber-700 font-bold lowercase">(bisa diedit)</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="100"
                placeholder="Harga..."
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-amber-50/70 border border-amber-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-bold"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center shadow-sm">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                Total Penjualan Nota
              </span>
              <span className="text-xs text-slate-600 font-mono">
                {qtyNum} x {formatRupiah(priceNum)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Bayar:</span>
              <span className="text-lg font-black text-slate-900 font-mono">
                {formatRupiah(totalAmount)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Tipe Pembayaran (TOP)
            </label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as 'LUNAS' | 'PENDING')}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="LUNAS">LUNAS</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>

          {paymentType === 'PENDING' && (
            <div>
              <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">
                Jatuh Tempo (Due Date){' '}
                <span className="text-[10px] lowercase font-normal text-slate-500">(opsional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-amber-50 border border-amber-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-800"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={orderMutation.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 px-4 rounded-lg shadow-sm transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>🧾</span>
            {orderMutation.isPending ? 'Memproses Transaksi...' : 'Proses Transaksi & Update Stok'}
          </button>
        </form>
      </div>

      {/* Warning Modal (Gantung / Belum Lunas) */}
      {pendingWarning && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-amber-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Perhatian: Ada Nota Belum Lunas!</span>
            </div>
            <p className="text-xs text-slate-600">
              Customer ini masih memiliki tagihan pending pada nota{' '}
              <strong className="text-slate-900">{pendingWarning.invoice_number || 'INV-XXX'}</strong> sebesar{' '}
              <span className="font-bold text-rose-600">
                {formatRupiah(Number(pendingWarning.remaining || 0))}
              </span>.
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingWarning(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-sm w-full p-4 sm:p-5 shadow-2xl border border-slate-200 space-y-3 my-auto">
            <div id="salesReceiptPaper" className="bg-white text-slate-900 p-2 font-sans">
              <div className="text-center border-b-2 border-dashed border-slate-300 pb-2.5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider">DEWATA JAYA SUPPLIER</h3>
                <p className="text-[10px] text-slate-500">Distribusi Telur Segar Berkualitas</p>
                <p className="text-[10px] text-slate-700 font-bold mt-0.5">Telp / WA: +62 823-3903-3923</p>
              </div>

              <div className="text-xs space-y-1 py-2 border-b border-dashed border-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">No. Nota:</span>
                  <span className="font-mono font-black text-slate-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[11px]">
                    {receiptData.invoice_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal:</span>
                  <span className="font-semibold text-slate-800">{formatDateIndo(receiptData.order_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-black text-slate-950">{receiptData.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sales:</span>
                  <span className="font-semibold text-slate-800">{receiptData.sales_name}</span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-slate-500">Tipe Pembayaran:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    receiptData.payment_type === 'LUNAS'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    {receiptData.payment_type === 'LUNAS' ? 'LUNAS (CASH/TF)' : 'PENDING (TEMPO)'}
                  </span>
                </div>
              </div>

              <div className="py-2 border-b-2 border-dashed border-slate-300">
                <div className="flex justify-between font-bold text-xs">
                  <span>{receiptData.product_name}</span>
                  <span>{receiptData.quantity} {receiptData.unit}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>@ {formatRupiah(receiptData.unit_price)}</span>
                  <span className="font-semibold text-slate-900">{formatRupiah(receiptData.total_amount)}</span>
                </div>
              </div>

              <div className="py-2 border-b border-dashed border-slate-300 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-800">TOTAL NOTA:</span>
                  <span className="font-mono font-black text-sm text-slate-950">{formatRupiah(receiptData.total_amount)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Status Pembayaran:</span>
                  <span className={`font-bold ${receiptData.payment_type === 'LUNAS' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {receiptData.payment_type === 'LUNAS' ? 'LUNAS' : 'BELUM LUNAS'}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-center text-[9px] text-slate-500 space-y-1">
                <p className="font-semibold text-slate-700">Pembayaran Transfer Bank BCA:</p>
                <p className="font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 py-0.5 rounded">
                  1468924624 (Dewata Jaya Supplier)
                </p>
                <p className="italic text-[8.5px] text-slate-400">Simpan nota ini sebagai bukti transaksi yang sah.</p>
                <p className="font-bold text-slate-800 text-[9px]">Terima Kasih Atas Kepercayaannya! 🙏</p>
              </div>

              <div className="grid grid-cols-2 text-center text-[9px] text-slate-600 pt-3 mt-2 border-t border-dashed border-slate-200">
                <div>
                  <p className="text-[8px] text-slate-400 mb-6">Penerima / Toko</p>
                  <p className="font-bold border-t border-slate-300 mx-3 pt-0.5">( ................... )</p>
                </div>
                <div>
                  <p className="text-[8px] text-slate-400 mb-6">Hormat Kami</p>
                  <p className="font-bold border-t border-slate-300 mx-3 pt-0.5">( DJS Farmindo )</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-3 border-t border-slate-100 no-print">
              <button
                type="button"
                onClick={() => setReceiptData(null)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg order-last sm:order-first"
              >
                Tutup
              </button>

              <div className="flex flex-wrap items-center justify-end gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await printDirectWebBluetooth(receiptData);
                      showToast('Nota berhasil dicetak via Bluetooth!');
                    } catch (err: any) {
                      showToast(err.message || 'Gagal koneksi Bluetooth', true);
                    }
                  }}
                  className="px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1 shadow-sm transition"
                  title="Print langsung ke Printer Thermal Bluetooth (Chrome HP / PC)"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>Bluetooth</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    printViaRawBT(receiptData);
                  }}
                  className="px-3 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg flex items-center gap-1 shadow-sm transition"
                  title="Print instan 1-klik lewat aplikasi RawBT di HP Android"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>RawBT</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-lg flex items-center gap-1 shadow-sm transition"
                  title="Cetak struk ukuran 58mm ke printer RPP02N"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak 58mm</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
