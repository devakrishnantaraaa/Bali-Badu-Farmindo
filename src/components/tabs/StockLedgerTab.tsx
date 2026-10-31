'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCw, Download, Plus, Eye, Trash2, Calendar, FileText, Check } from 'lucide-react';
import { formatNumber, formatRupiah, formatDateIndo } from '@/lib/utils';
import { Product, StockMovement } from '@/types';
import * as XLSX from 'xlsx';

interface StockLedgerTabProps {
  initialProductId?: string;
}

export default function StockLedgerTab({ initialProductId = 'ALL' }: StockLedgerTabProps) {
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId);
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Audit Form Modal State
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjProductId, setAdjProductId] = useState('');
  const [adjDamaged, setAdjDamaged] = useState('');
  const [adjPhysical, setAdjPhysical] = useState('');
  const [adjQty, setAdjQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  // Sales Detail Modal State
  const [salesModalData, setSalesModalData] = useState<{
    date: string;
    product: string;
    items: any[];
    totalQty: number;
  } | null>(null);

  // 1. Fetch Products for Filter
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

  // 2. Fetch Stock Movements for Selected Product
  const {
    data: rawMovements = [],
    isLoading,
    refetch,
  } = useQuery<StockMovement[]>({
    queryKey: ['stock-ledger', selectedProductId],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/stock/ledger?product_id=${selectedProductId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal memuat kartu stok');
      return res.json();
    },
  });

  // 3. Mutation: Delete Stock Movement
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/stock/ledger/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal menghapus mutasi stok');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // 4. Mutation: Submit Stock Audit
  const auditMutation = useMutation({
    mutationFn: async (payload: any) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/stock/adjustment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menyimpan audit');
      }
      return res.json();
    },
    onSuccess: () => {
      setShowAuditModal(false);
      setAdjDamaged('');
      setAdjPhysical('');
      setAdjQty('');
      setAdjNotes('');
      queryClient.invalidateQueries({ queryKey: ['stock-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  // 5. Calculate Running Balance Per Product & Group By Date
  const productBalances: Record<string, number> = {};
  const calibratedData = rawMovements.map((item) => {
    const qty = Number(item.quantity || 0);
    const inQty = item.movement_type === 'BARANG_MASUK' ? qty : 0;
    const outQty = item.movement_type === 'PENJUALAN' ? qty : 0;
    const damaged = Number(item.damaged_qty || 0);
    const adj = Number(item.adjustment_qty || 0);
    const phys = item.physical_stock !== null && item.physical_stock !== undefined ? Number(item.physical_stock) : null;

    const pId = String(item.product_id || 'default');
    if (productBalances[pId] === undefined) {
      productBalances[pId] = 0;
    }

    productBalances[pId] += inQty - outQty - damaged + adj;
    const totalRunningSisa = Object.values(productBalances).reduce((acc, val) => acc + val, 0);

    return {
      ...item,
      inQty,
      outQty,
      damaged,
      adj,
      phys,
      sisa: totalRunningSisa,
    };
  });

  // Group by Date Key
  const dateGroups: Record<string, any> = {};
  calibratedData.forEach((item) => {
    const dt = new Date(item.created_at);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const dayStr = String(dt.getDate()).padStart(2, '0');
    const monthShortStr = dt.toLocaleString('id-ID', { month: 'short' });
    const tglStr = `${dayStr}-${monthShortStr}`;

    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = {
        dateKey,
        tglStr,
        y: String(y),
        m,
        inQty: 0,
        outQty: 0,
        damaged: 0,
        physical: null as number | null,
        adj: 0,
        sisa: item.sisa,
        harga: Number(item.price_per_unit || 0),
        product_name: item.product_name || '',
        salesList: [] as any[],
        manualMovements: [] as any[],
      };
    }

    dateGroups[dateKey].inQty += item.inQty;
    dateGroups[dateKey].outQty += item.outQty;
    dateGroups[dateKey].damaged += item.damaged;
    if (item.phys !== null) {
      dateGroups[dateKey].physical = (dateGroups[dateKey].physical ?? 0) + item.phys;
    }
    dateGroups[dateKey].adj += item.adj;
    dateGroups[dateKey].sisa = item.sisa;

    if (item.movement_type === 'PENJUALAN') {
      const rawNote = (item.notes || '').trim();
      let custName = 'Customer Umum';
      if (rawNote.startsWith('Penjualan Import Excel:')) {
        custName = rawNote.replace('Penjualan Import Excel:', '').trim();
      } else if (rawNote.startsWith('Penjualan:')) {
        custName = rawNote.replace('Penjualan:', '').trim();
      } else if (rawNote) {
        custName = rawNote;
      }
      dateGroups[dateKey].salesList.push({
        orderNumber: item.reference_id || '-',
        customerName: custName,
        qty: item.outQty,
        harga: Number(item.price_per_unit || 0),
        subtotal: item.outQty * Number(item.price_per_unit || 0),
      });
    } else {
      dateGroups[dateKey].manualMovements.push(item);
    }
  });

  const groupRows = Object.values(dateGroups);

  // Filter per Month & Year
  const filteredRows = groupRows.filter((g) => {
    if (selectedMonth !== 'ALL' && g.m !== selectedMonth) return false;
    if (selectedYear !== 'ALL' && g.y !== selectedYear) return false;
    return true;
  });

  // Totals for Footer
  const totalIn = filteredRows.reduce((acc, g) => acc + g.inQty, 0);
  const totalOut = filteredRows.reduce((acc, g) => acc + g.outQty, 0);
  const totalDamaged = filteredRows.reduce((acc, g) => acc + g.damaged, 0);
  const totalAdj = filteredRows.reduce((acc, g) => acc + g.adj, 0);
  const totalPhysical = filteredRows.reduce((acc, g) => acc + (g.physical ?? 0), 0);
  const lastSisa = filteredRows.length > 0 ? filteredRows[filteredRows.length - 1].sisa : 0;

  // Export to Excel
  function handleExportExcel() {
    const exportData = filteredRows.map((r) => ({
      Tanggal: r.tglStr,
      'IN / KRAT': r.inQty || 0,
      Harga: r.harga || 0,
      'OUT / KRAT': r.outQty || 0,
      Rusak: r.damaged || 0,
      Penyesuaian: r.adj || 0,
      Sisa: r.sisa || 0,
      'Stok Fisik': r.physical ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kartu_Stok');
    XLSX.writeFile(wb, `Kartu_Stok_${selectedProductId}_${Date.now()}.xlsx`);
  }

  function handleSaveNote(dateKey: string, noteVal: string, manualIds: number[]) {
    localStorage.setItem(`stock_note_${selectedProductId}_${dateKey}`, noteVal);
    if (manualIds.length > 0) {
      const token = localStorage.getItem('token');
      fetch(`/api/stock/ledger/${manualIds[0]}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: noteVal }),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Filter & Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Product Select */}
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="bg-blue-50 border border-blue-300 font-bold text-blue-900 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
          >
            <option value="ALL">SEMUA PRODUK (Semua Telur)</option>
            {products.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name} (Stok: {formatNumber(p.current_stock)} {p.unit})
              </option>
            ))}
          </select>

          {/* Month & Year Select */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none"
            >
              <option value="ALL">Semua Bulan</option>
              <option value="01">Januari</option>
              <option value="02">Februari</option>
              <option value="03">Maret</option>
              <option value="04">April</option>
              <option value="05">Mei</option>
              <option value="06">Juni</option>
              <option value="07">Juli</option>
              <option value="08">Agustus</option>
              <option value="09">September</option>
              <option value="10">Oktober</option>
              <option value="11">November</option>
              <option value="12">Desember</option>
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent font-semibold text-slate-700 text-xs focus:outline-none border-l border-slate-300 pl-1.5"
            >
              <option value="ALL">Semua Thn</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAuditModal(true)}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Input Audit / Rusak / Fisik</span>
          </button>

          <button
            onClick={() => refetch()}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-semibold border border-slate-300 flex items-center gap-1 transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tarik Excel</span>
          </button>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-800 sticky top-0 border-b border-slate-300 font-extrabold uppercase text-[11px] whitespace-nowrap z-10">
              <tr>
                <th className="p-2.5 border border-slate-300">TGL</th>
                <th className="p-2.5 border border-slate-300 text-right text-emerald-800">IN / KRAT</th>
                <th className="p-2.5 border border-slate-300 text-right">HARGA</th>
                <th className="p-2.5 border border-slate-300 text-right text-amber-900">OUT / KRAT</th>
                <th className="p-2.5 border border-slate-300 text-right text-rose-700">RUSAK</th>
                <th className="p-2.5 border border-slate-300 text-right text-purple-700">PENYESUAIAN</th>
                <th className="p-2.5 border border-slate-300 font-black bg-blue-100 text-right">SISA</th>
                <th className="p-2.5 border border-slate-300 text-right text-blue-700">STOK FISIK</th>
                <th className="p-2.5 border border-slate-300">KETERANGAN</th>
                <th className="p-2.5 border border-slate-300 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Memuat riwayat kartu stok...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Belum ada data transaksi kartu stok pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredRows.map((group) => {
                  const savedNote =
                    localStorage.getItem(`stock_note_${selectedProductId}_${group.dateKey}`) || '';
                  const manualIds = group.manualMovements.map((m: any) => m.id);

                  return (
                    <tr key={group.dateKey} className="hover:bg-amber-50/40 transition">
                      <td className="p-2 border border-slate-300 font-bold text-slate-800 whitespace-nowrap bg-slate-50/50">
                        {group.tglStr}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-bold text-emerald-800">
                        {group.inQty > 0 ? formatNumber(group.inQty) : '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-right text-slate-700">
                        {group.harga > 0 ? formatNumber(group.harga) : '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-black text-amber-900 bg-amber-50/30">
                        {group.outQty > 0 ? formatNumber(group.outQty) : '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-bold text-rose-700">
                        {group.damaged > 0 ? formatNumber(group.damaged) : '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-bold text-purple-700">
                        {group.adj !== 0 ? (group.adj > 0 ? `+${group.adj}` : group.adj) : '-'}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-black bg-blue-50 text-slate-900 text-xs">
                        {formatNumber(group.sisa)}
                      </td>
                      <td className="p-2 border border-slate-300 text-right font-bold text-blue-700">
                        {group.physical !== null ? formatNumber(group.physical) : '-'}
                      </td>
                      <td className="p-1 border border-slate-300">
                        <input
                          type="text"
                          defaultValue={savedNote}
                          onBlur={(e) => handleSaveNote(group.dateKey, e.target.value, manualIds)}
                          placeholder="Ketik catatan..."
                          className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-amber-500 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none"
                        />
                      </td>
                      <td className="p-1 border border-slate-300 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {group.salesList.length > 0 && (
                            <button
                              onClick={() =>
                                setSalesModalData({
                                  date: group.tglStr,
                                  product: group.product_name,
                                  items: group.salesList,
                                  totalQty: group.outQty,
                                })
                              }
                              className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 rounded text-[10px] transition"
                            >
                              👁️ {group.salesList.length} Nota
                            </button>
                          )}
                          {group.manualMovements.map((m: any) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                if (confirm(`Hapus mutasi stok ${m.quantity} krat ini?`)) {
                                  deleteMutation.mutate(m.id);
                                }
                              }}
                              className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[10px] transition"
                            >
                              🗑️ Hapus
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Footer Row matching exact requirements: SISA displays last row's sisa */}
            <tfoot className="bg-slate-200 font-extrabold uppercase text-[11px] whitespace-nowrap">
              <tr>
                <td className="p-2.5 border border-slate-400">TOTAL (TERFILTER)</td>
                <td className="p-2.5 border border-slate-400 text-right text-emerald-950 font-black">
                  {totalIn > 0 ? formatNumber(totalIn) : '-'}
                </td>
                <td className="p-2.5 border border-slate-400"></td>
                <td className="p-2.5 border border-slate-400 text-right text-amber-950 font-black">
                  {totalOut > 0 ? formatNumber(totalOut) : '-'}
                </td>
                <td className="p-2.5 border border-slate-400 text-right text-rose-950 font-black">
                  {totalDamaged > 0 ? formatNumber(totalDamaged) : '-'}
                </td>
                <td className="p-2.5 border border-slate-400 text-right text-purple-950 font-black">
                  {totalAdj !== 0 ? (totalAdj > 0 ? `+${totalAdj}` : totalAdj) : '-'}
                </td>
                <td className="p-2.5 border border-slate-400 text-right text-blue-950 font-black bg-blue-200/80 text-xs">
                  {formatNumber(lastSisa)}
                </td>
                <td className="p-2.5 border border-slate-400 text-right text-blue-950 font-black">
                  {totalPhysical > 0 ? formatNumber(totalPhysical) : '-'}
                </td>
                <td className="p-2.5 border border-slate-400"></td>
                <td className="p-2.5 border border-slate-400"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 animate-scaleUp">
            <h3 className="text-base font-black text-slate-900">Form Audit Stok: Rusak, Fisik & Penyesuaian</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Audit:</label>
                <input
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Produk:</label>
                <select
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                >
                  <option value="">Pilih Produk...</option>
                  {products.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} - Stok: {p.current_stock} {p.unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-rose-600 mb-1">Rusak (Qty):</label>
                  <input
                    type="number"
                    value={adjDamaged}
                    onChange={(e) => setAdjDamaged(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-blue-600 mb-1">Stok Fisik:</label>
                  <input
                    type="number"
                    value={adjPhysical}
                    onChange={(e) => setAdjPhysical(e.target.value)}
                    placeholder="Opname"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-purple-700 mb-1">Penyesuaian (+/-):</label>
                  <input
                    type="number"
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan / Keterangan:</label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  placeholder="Misal: Opname fisik gudang"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!adjProductId) return alert('Silakan pilih produk');
                  auditMutation.mutate({
                    product_id: adjProductId,
                    damaged_qty: adjDamaged,
                    physical_stock: adjPhysical,
                    adjustment_qty: adjQty,
                    notes: adjNotes,
                    adjustment_date: adjDate,
                  });
                }}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
              >
                Simpan Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Detail Modal */}
      {salesModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Rincian Nota Penjualan</h3>
                <p className="text-xs text-slate-500">
                  Tanggal {salesModalData.date} &bull; Total {salesModalData.totalQty} krat
                </p>
              </div>
              <button
                onClick={() => setSalesModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {salesModalData.items.map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{item.customerName}</div>
                    <div className="text-[10px] text-slate-400">{item.orderNumber}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-amber-900">{item.qty} krat</div>
                    <div className="text-[10px] text-slate-500">{formatRupiah(item.subtotal)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSalesModalData(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

