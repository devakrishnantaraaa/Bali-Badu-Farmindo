'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatRupiah, formatNumber, formatDateIndo } from '@/lib/utils';
import { Download, Upload, Trash2, Printer, CheckCircle2, AlertCircle, Search, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DailySalesRow {
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

interface DailySalesTabProps {
  currentUser?: { full_name?: string; role?: string } | null;
}

export default function DailySalesTab({ currentUser }: DailySalesTabProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected row for receipt / delete
  const [printRow, setPrintRow] = useState<DailySalesRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailySalesRow | null>(null);

  // Import Excel Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Fetch daily sales report
  const { data: sales = [], isLoading, refetch } = useQuery<DailySalesRow[]>({
    queryKey: ['daily-sales', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const res = await fetch(`/api/reports/daily-sales?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat rekap penjualan');
      return res.json();
    },
  });

  // Save invoice inline fields
  const saveFieldsMutation = useMutation({
    mutationFn: async ({
      invoiceId,
      fields,
    }: {
      invoiceId: number;
      fields: { transfer_date?: string; payment_method?: string; notes?: string };
    }) => {
      const res = await fetch(`/api/invoices/${invoiceId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui catatan');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] });
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Delete Order mutation
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus nota');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      setDeleteTarget(null);
      showToast('Nota penjualan berhasil dihapus & stok dikembalikan!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Filtered rows
  const filteredSales = useMemo(() => {
    if (!searchQuery) return sales;
    const q = searchQuery.toLowerCase();
    return sales.filter(
      (r) =>
        r.customer_name?.toLowerCase().includes(q) ||
        r.invoice_number?.toLowerCase().includes(q) ||
        r.product_name?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q)
    );
  }, [sales, searchQuery]);

  // Totals
  const { totalQty, totalAmount, totalPaid, totalSisa } = useMemo(() => {
    let tQty = 0;
    let tAmt = 0;
    let tPaid = 0;
    let tSisa = 0;
    for (const r of filteredSales) {
      tQty += Number(r.penjualan_qty || 0);
      tAmt += Number(r.total_amount || 0);
      tPaid += Number(r.amount_paid || 0);
      tSisa += Number(r.sisa_pembayaran || 0);
    }
    return { totalQty: tQty, totalAmount: tAmt, totalPaid: tPaid, totalSisa: tSisa };
  }, [filteredSales]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredSales.map((r) => {
      const dt = new Date(r.created_at);
      return {
        PERIODE: dt.toLocaleString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase(),
        TGL: dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        'NO NOTA': r.invoice_number || `INV-${r.id}`,
        'NAMA CUSTOMER': r.customer_name,
        PRODUK: r.product_name,
        PENJUALAN: Number(r.penjualan_qty || 0),
        JENIS: r.satuan || 'krat',
        HARGA: Number(r.harga_satuan || 0),
        TOTAL: Number(r.total_amount || 0),
        TOP: r.invoice_status === 'LUNAS' ? 'LUNAS' : 'PENDING',
        PEMBAYARAN: Number(r.amount_paid || 0),
        'SISA PEMBAYARAN': Number(r.sisa_pembayaran || 0),
        CEK: r.last_payment_method || '',
        TRANSFER: r.transfer_date ? r.transfer_date.split('T')[0] : '',
        KETERANGAN: r.notes || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Penjualan');
    XLSX.writeFile(wb, `Rekap_Penjualan_Harian_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Handle Excel File Drop/Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!json || json.length === 0) {
          setImportError('File Excel kosong atau format tabel tidak terdeteksi.');
          return;
        }

        setImportRows(json);
      } catch (err: any) {
        setImportError(`Gagal membaca Excel: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Execute Import
  const handleExecuteImport = async () => {
    if (!importRows.length) return;
    setIsImporting(true);
    setImportError('');

    try {
      const res = await fetch('/api/orders/import-daily-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan data import');

      showToast(data.message || 'Import data penjualan berhasil!');
      setIsImportModalOpen(false);
      setImportRows([]);
      queryClient.invalidateQueries({ queryKey: ['daily-sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setIsImporting(false);
    }
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Rekap Penjualan Harian</h3>
            <p className="text-[11px] text-slate-500">
              Pantau seluruh riwayat transaksi penjualan, status pembayaran, dan nota pelanggan.
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

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium border border-slate-200 transition"
              >
                Semua Data
              </button>
            )}

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tarik Excel</span>
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Transaksi</div>
            <div className="text-xl font-bold text-slate-900">{filteredSales.length} Nota</div>
          </div>
          <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
            <div className="text-[11px] font-semibold text-emerald-700 uppercase">Total Omset Penjualan</div>
            <div className="text-xl font-bold text-emerald-800">{formatRupiah(totalAmount)}</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-[11px] font-semibold text-blue-700 uppercase">Total Terbayar</div>
            <div className="text-xl font-bold text-blue-800">{formatRupiah(totalPaid)}</div>
          </div>
          <div className="bg-rose-50 p-4 rounded-lg border border-rose-200">
            <div className="text-[11px] font-semibold text-rose-700 uppercase">Sisa Piutang Pending</div>
            <div className="text-xl font-bold text-rose-800">{formatRupiah(totalSisa)}</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari customer, no nota, produk..."
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
                <th className="p-2 border border-slate-300">PERIODE</th>
                <th className="p-2 border border-slate-300">TGL</th>
                <th className="p-2 border border-slate-300">NAMA CUSTOMER</th>
                <th className="p-2 border border-slate-300 text-right">PENJUALAN</th>
                <th className="p-2 border border-slate-300 text-center">JENIS</th>
                <th className="p-2 border border-slate-300 text-right">HARGA</th>
                <th className="p-2 border border-slate-300 text-right">TOTAL</th>
                <th className="p-2 border border-slate-300 text-center">TOP</th>
                <th className="p-2 border border-slate-300 text-right bg-amber-50">PEMBAYARAN</th>
                <th className="p-2 border border-slate-300 text-right">SISA PEMBAYARAN</th>
                <th className="p-2 border border-slate-300 text-center min-w-[110px]">CEK</th>
                <th className="p-2 border border-slate-300 text-center min-w-[120px]">TRANSFER</th>
                <th className="p-2 border border-slate-300 text-center min-w-[140px]">KETERANGAN</th>
                <th className="p-2 border border-slate-300 text-center bg-amber-100 text-amber-950">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-400">
                    Memuat rekap data penjualan...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-400">
                    Tidak ada data penjualan pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredSales.map((item) => {
                  const dt = new Date(item.created_at);
                  const periodeStr = dt.toLocaleString('id-ID', { month: 'short', year: '2-digit' }).toUpperCase();
                  const tglStr = `${String(dt.getDate()).padStart(2, '0')}-${dt.toLocaleString('id-ID', { month: 'short' })}`;

                  const isLunas = item.invoice_status === 'LUNAS';

                  return (
                    <tr key={`${item.id}-${item.invoice_id}`} className="hover:bg-amber-50/40 transition-colors">
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
                      {/* CEK field */}
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="text"
                          defaultValue={item.last_payment_method || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (item.last_payment_method || '')) {
                              saveFieldsMutation.mutate({
                                invoiceId: item.invoice_id,
                                fields: { payment_method: e.target.value },
                              });
                            }
                          }}
                          placeholder="Bank/Cek..."
                          className="w-full text-center bg-transparent focus:bg-white border-b border-transparent focus:border-amber-400 text-[11px] px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      {/* TRANSFER field */}
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="date"
                          defaultValue={item.transfer_date ? item.transfer_date.split('T')[0] : ''}
                          onBlur={(e) => {
                            const cur = item.transfer_date ? item.transfer_date.split('T')[0] : '';
                            if (e.target.value !== cur) {
                              saveFieldsMutation.mutate({
                                invoiceId: item.invoice_id,
                                fields: { transfer_date: e.target.value },
                              });
                            }
                          }}
                          className="w-full text-center bg-transparent focus:bg-white border-b border-transparent focus:border-amber-400 text-[11px] px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      {/* KETERANGAN field */}
                      <td className="p-1 border border-slate-200 text-center">
                        <input
                          type="text"
                          defaultValue={item.notes || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (item.notes || '')) {
                              saveFieldsMutation.mutate({
                                invoiceId: item.invoice_id,
                                fields: { notes: e.target.value },
                              });
                            }
                          }}
                          placeholder="Catatan..."
                          className="w-full bg-transparent focus:bg-white border-b border-transparent focus:border-amber-400 text-[11px] px-1 py-0.5 focus:outline-none"
                        />
                      </td>
                      {/* AKSI */}
                      <td className="p-1 border border-slate-200 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPrintRow(item)}
                            className="p-1 text-slate-600 hover:text-amber-700 hover:bg-amber-100 rounded"
                            title="Cetak Struk"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {isSuperAdmin && (
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Hapus Nota"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer */}
            <tfoot className="bg-blue-100/90 font-extrabold text-slate-900 sticky bottom-0 border-t-2 border-slate-300 text-[11px]">
              <tr>
                <td colSpan={3} className="p-2 border border-slate-300 text-center font-bold">
                  TOTAL (TERFILTER)
                </td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatNumber(totalQty)}
                </td>
                <td className="p-2 border border-slate-300 text-center">-</td>
                <td className="p-2 border border-slate-300 text-right">-</td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatRupiah(totalAmount)}
                </td>
                <td className="p-2 border border-slate-300 text-center">-</td>
                <td className="p-2 border border-slate-300 text-right font-black">
                  {formatRupiah(totalPaid)}
                </td>
                <td className="p-2 border border-slate-300 text-right font-black text-rose-800">
                  {formatRupiah(totalSisa)}
                </td>
                <td colSpan={4} className="p-2 border border-slate-300 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Import Excel Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>Import File Excel Penjualan</span>
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {importError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                {importError}
              </div>
            )}

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer bg-slate-50">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Format file didukung: .xlsx atau .xls dengan header standar tabel harian.
              </p>
            </div>

            {importRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                  <span>Preview Baris Terbaca:</span>
                  <span className="font-bold text-blue-600">{importRows.length} Baris Ditemukan</span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 text-[10px] font-mono bg-slate-50">
                  <pre>{JSON.stringify(importRows.slice(0, 3), null, 2)}</pre>
                  {importRows.length > 3 && (
                    <div className="text-slate-400 italic text-center pt-1">
                      ... dan {importRows.length - 3} baris lainnya
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isImporting || importRows.length === 0}
                onClick={handleExecuteImport}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <span>Simpan Data Import ({importRows.length})</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Nota</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus transaksi nota{' '}
              <strong className="text-slate-900">{deleteTarget.invoice_number}</strong> customer{' '}
              <strong className="text-slate-900">{deleteTarget.customer_name}</strong>?
              <br />
              <span className="text-rose-600 font-semibold block mt-1">
                Stok produk akan otomatis dikembalikan ke gudang.
              </span>
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
                onClick={() => deleteOrderMutation.mutate(deleteTarget.order_id || deleteTarget.id)}
                disabled={deleteOrderMutation.isPending}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {deleteOrderMutation.isPending ? 'Menghapus...' : 'Ya, Hapus Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print / Struk Modal */}
      {printRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="text-center border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase">CV DJS TELUR</h3>
              <p className="text-[10px] text-slate-500">Struk Bukti Transaksi Penjualan</p>
            </div>

            <div className="text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">No Nota:</span>
                <span className="font-bold text-slate-900">{printRow.invoice_number || `INV-${printRow.id}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tanggal:</span>
                <span>{formatDateIndo(printRow.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">{printRow.customer_name}</span>
              </div>

              <div className="border-t border-dashed border-slate-300 my-2 pt-2">
                <div className="flex justify-between font-bold">
                  <span>{printRow.product_name}</span>
                  <span>{formatNumber(Number(printRow.penjualan_qty))} {printRow.satuan || 'krat'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>@ {formatRupiah(Number(printRow.harga_satuan))}</span>
                  <span>{formatRupiah(Number(printRow.total_amount))}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 flex justify-between font-black text-sm">
                <span>TOTAL:</span>
                <span className="text-amber-800">{formatRupiah(Number(printRow.total_amount))}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-500">Status Bayar:</span>
                <span className={`font-bold ${printRow.invoice_status === 'LUNAS' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {printRow.invoice_status === 'LUNAS' ? 'LUNAS' : 'PENDING'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPrintRow(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Nota</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

