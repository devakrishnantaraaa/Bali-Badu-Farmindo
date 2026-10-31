'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { Download, PiggyBank, CheckCircle2, AlertCircle, Search, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DepositRow {
  id: number;
  invoice_id: number;
  invoice_number: string;
  order_id: number;
  created_at: string;
  customer_name: string;
  product_name: string;
  penjualan_qty: number;
  satuan: string;
  harga_satuan: number;
  total_amount: number;
  invoice_status: string;
  amount_paid: number;
  sisa_pembayaran: number;
  last_payment_method?: string;
  transfer_date?: string;
  notes?: string;
}

export default function DailyDepositsTab() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected invoices for bulk deposit
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Bulk Deposit Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bulkMethod, setBulkMethod] = useState('TRANSFER BCA');

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Fetch report data
  const { data: deposits = [], isLoading } = useQuery<DepositRow[]>({
    queryKey: ['daily-deposits', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const res = await fetch(`/api/reports/daily-deposits?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat rekap setoran');
      return res.json();
    },
  });

  // Filtered rows
  const filteredDeposits = useMemo(() => {
    if (!searchQuery) return deposits;
    const q = searchQuery.toLowerCase();
    return deposits.filter(
      (r) =>
        r.customer_name?.toLowerCase().includes(q) ||
        r.invoice_number?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
    );
  }, [deposits, searchQuery]);

  // Bulk Deposit Mutation
  const bulkMutation = useMutation({
    mutationFn: async (payload: { invoice_ids: number[]; transfer_date: string; payment_method: string }) => {
      const res = await fetch('/api/invoices/bulk-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses setoran');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['daily-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      setSelectedIds([]);
      setIsBulkModalOpen(false);
      showToast(data.message || 'Setoran harian berhasil diperbarui!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Toggle selection
  const handleToggleSelect = (invoiceId: number) => {
    setSelectedIds((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredDeposits.map((d) => d.invoice_id));
    } else {
      setSelectedIds([]);
    }
  };

  // Selected totals
  const selectedSummary = useMemo(() => {
    const selectedRows = filteredDeposits.filter((d) => selectedIds.includes(d.invoice_id));
    const totalAmount = selectedRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    return { count: selectedRows.length, totalAmount };
  }, [filteredDeposits, selectedIds]);

  // Totals for table footer
  const { totalQty, totalAmountSum, totalPaidSum, totalSisaSum } = useMemo(() => {
    let tQty = 0;
    let tAmt = 0;
    let tPaid = 0;
    let tSisa = 0;
    for (const r of filteredDeposits) {
      tQty += Number(r.penjualan_qty || 0);
      tAmt += Number(r.total_amount || 0);
      tPaid += Number(r.amount_paid || 0);
      tSisa += Number(r.sisa_pembayaran || 0);
    }
    return { totalQty: tQty, totalAmountSum: tAmt, totalPaidSum: tPaid, totalSisaSum: tSisa };
  }, [filteredDeposits]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredDeposits.map((r) => {
      const dt = new Date(r.created_at);
      return {
        PERIODE: dt.toLocaleString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase(),
        TGL: dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        'NAMA CUSTOMER': r.customer_name,
        PENJUALAN: Number(r.penjualan_qty || 0),
        JENIS: r.satuan || 'krat',
        HARGA: Number(r.harga_satuan || 0),
        TOTAL: Number(r.total_amount || 0),
        STATUS: r.invoice_status === 'LUNAS' ? 'LUNAS' : 'PENDING',
        PEMBAYARAN: Number(r.amount_paid || 0),
        'SISA BAYAR': Number(r.sisa_pembayaran || 0),
        METODE: r.last_payment_method || '',
        'TGL SETOR': r.transfer_date ? r.transfer_date.split('T')[0] : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Setoran_Harian');
    XLSX.writeFile(wb, `Setoran_Harian_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIds.length) return;
    bulkMutation.mutate({
      invoice_ids: selectedIds,
      transfer_date: bulkDate,
      payment_method: bulkMethod,
    });
  };

  return (
    <div className="space-y-4">
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

      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-amber-600" />
              <span>Rekap Setoran Harian Sales</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Centang nota-nota yang sudah disetor dan tandai sekaligus dengan tanggal transfer dan bank.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <label className="text-[11px] font-semibold text-slate-600 pl-1.5">Dari:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700"
              />
              <label className="text-[11px] font-semibold text-slate-600">Sampai:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700"
              />
            </div>

            <button
              onClick={handleExportExcel}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tarik Excel</span>
            </button>
          </div>
        </div>

        {/* Floating Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm animate-in fade-in">
            <div className="text-xs text-amber-900 font-semibold">
              Terpilih <span className="font-extrabold text-amber-950 font-mono text-sm">{selectedSummary.count}</span> nota
              dengan total nominal{' '}
              <span className="font-black text-amber-950 font-mono text-sm">
                {formatRupiah(selectedSummary.totalAmount)}
              </span>
            </div>
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition"
            >
              <span>⚡</span> Tandai Sudah Setor ({selectedIds.length})
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari customer, no nota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-200 text-slate-900 sticky top-0 font-bold uppercase text-[11px] whitespace-nowrap z-10 border-b border-slate-300">
              <tr>
                <th className="p-2 border border-slate-300 text-center w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredDeposits.length > 0 && selectedIds.length === filteredDeposits.length
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded text-amber-500 cursor-pointer"
                  />
                </th>
                <th className="p-2 border border-slate-300">PERIODE</th>
                <th className="p-2 border border-slate-300">TGL</th>
                <th className="p-2 border border-slate-300">NAMA CUSTOMER</th>
                <th className="p-2 border border-slate-300 text-right">PENJUALAN</th>
                <th className="p-2 border border-slate-300 text-center">JENIS</th>
                <th className="p-2 border border-slate-300 text-right">HARGA</th>
                <th className="p-2 border border-slate-300 text-right">TOTAL</th>
                <th className="p-2 border border-slate-300 text-center">STATUS</th>
                <th className="p-2 border border-slate-300 text-right bg-amber-50">PEMBAYARAN</th>
                <th className="p-2 border border-slate-300 text-right">SISA BAYAR</th>
                <th className="p-2 border border-slate-300 text-center">METODE BAYAR</th>
                <th className="p-2 border border-slate-300 text-center">TGL SETORAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400">
                    Memuat data setoran harian...
                  </td>
                </tr>
              ) : filteredDeposits.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400">
                    Tidak ada transaksi setoran pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredDeposits.map((item) => {
                  const dt = new Date(item.created_at);
                  const periodeStr = dt.toLocaleString('id-ID', { month: 'short', year: '2-digit' }).toUpperCase();
                  const tglStr = `${String(dt.getDate()).padStart(2, '0')}-${dt.toLocaleString('id-ID', { month: 'short' })}`;
                  const isSelected = selectedIds.includes(item.invoice_id);
                  const isLunas = item.invoice_status === 'LUNAS';

                  return (
                    <tr
                      key={`${item.id}-${item.invoice_id}`}
                      className={`hover:bg-amber-50/40 transition-colors ${
                        isSelected ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <td className="p-2 border border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.invoice_id)}
                          className="rounded text-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-700">{periodeStr}</td>
                      <td className="p-2 border border-slate-200 whitespace-nowrap">{tglStr}</td>
                      <td className="p-2 border border-slate-200 font-bold text-slate-900">{item.customer_name}</td>
                      <td className="p-2 border border-slate-200 text-right font-bold text-slate-800">
                        {formatNumber(Number(item.penjualan_qty || 0))}
                      </td>
                      <td className="p-2 border border-slate-200 text-center uppercase font-mono">{item.satuan || 'krat'}</td>
                      <td className="p-2 border border-slate-200 text-right font-mono">
                        {formatRupiah(Number(item.harga_satuan || 0))}
                      </td>
                      <td className="p-2 border border-slate-200 text-right font-bold font-mono text-slate-900">
                        {formatRupiah(Number(item.total_amount || 0))}
                      </td>
                      <td className="p-2 border border-slate-200 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isLunas
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {isLunas ? 'LUNAS' : 'PENDING'}
                        </span>
                      </td>
                      <td className="p-2 border border-slate-200 text-right font-mono bg-amber-50/30">
                        {formatRupiah(Number(item.amount_paid || 0))}
                      </td>
                      <td className="p-2 border border-slate-200 text-right font-mono font-bold text-rose-700">
                        {formatRupiah(Number(item.sisa_pembayaran || 0))}
                      </td>
                      <td className="p-2 border border-slate-200 text-center text-slate-700 font-semibold">
                        {item.last_payment_method || '-'}
                      </td>
                      <td className="p-2 border border-slate-200 text-center text-slate-600 font-mono">
                        {item.transfer_date ? item.transfer_date.split('T')[0] : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer */}
            <tfoot className="bg-blue-100/90 font-extrabold text-slate-900 sticky bottom-0 border-t-2 border-slate-300 text-[11px]">
              <tr>
                <td colSpan={4} className="p-2 border border-slate-300 text-center font-bold">
                  TOTAL (TERFILTER)
                </td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatNumber(totalQty)}
                </td>
                <td className="p-2 border border-slate-300 text-center">-</td>
                <td className="p-2 border border-slate-300 text-right">-</td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatRupiah(totalAmountSum)}
                </td>
                <td className="p-2 border border-slate-300 text-center">-</td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatRupiah(totalPaidSum)}
                </td>
                <td className="p-2 border border-slate-300 text-right font-black text-rose-800">
                  {formatRupiah(totalSisaSum)}
                </td>
                <td colSpan={2} className="p-2 border border-slate-300 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bulk Deposit Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Konfirmasi Setoran Masal</h3>
              <p className="text-xs text-slate-500 mt-1">
                Tandai {selectedSummary.count} nota terpilih senilai{' '}
                <strong className="text-slate-900">{formatRupiah(selectedSummary.totalAmount)}</strong>
              </p>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Tanggal Setoran / Transfer
                </label>
                <input
                  type="date"
                  required
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Metode Pembayaran / Bank
                </label>
                <select
                  value={bulkMethod}
                  onChange={(e) => setBulkMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500 font-bold"
                >
                  <option value="TRANSFER BCA">TRANSFER BCA</option>
                  <option value="TRANSFER MANDIRI">TRANSFER MANDIRI</option>
                  <option value="TRANSFER BRI">TRANSFER BRI</option>
                  <option value="TRANSFER BNI">TRANSFER BNI</option>
                  <option value="SETORAN CASH / TUNAI">SETORAN CASH / TUNAI</option>
                  <option value="CEK / GIRO">CEK / GIRO</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={bulkMutation.isPending}
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 rounded-lg disabled:opacity-50"
                >
                  {bulkMutation.isPending ? 'Menyimpan...' : 'Simpan Setoran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

