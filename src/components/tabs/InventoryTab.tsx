'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { Download, RefreshCw, Warehouse, BookOpen } from 'lucide-react';
import * as XLSX from 'xlsx';

interface InventoryItem {
  product_id: number;
  product_name: string;
  unit: string;
  price: number;
  initial_stock: number;
  in_qty: number;
  out_qty: number;
  damaged_qty: number;
  adjustment_qty: number;
  final_stock: number;
  valuation: number;
  status: string;
}

interface InventoryTabProps {
  onNavigateToLedger?: (productId: number) => void;
}

export default function InventoryTab({ onNavigateToLedger }: InventoryTabProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  const [month, setMonth] = useState<string>(currentMonth);
  const [year, setYear] = useState<string>(String(currentYear));

  const { data: inventory = [], isLoading, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['inventory-global', month, year],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      const res = await fetch(`/api/reports/inventory-global?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat laporan inventory');
      return res.json();
    },
  });

  // Calculate metrics
  const summary = useMemo(() => {
    let totalStock = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalDamaged = 0;
    let totalAdjustment = 0;
    let totalValuation = 0;

    for (const item of inventory) {
      totalStock += Number(item.final_stock || 0);
      totalIn += Number(item.in_qty || 0);
      totalOut += Number(item.out_qty || 0);
      totalDamaged += Number(item.damaged_qty || 0);
      totalAdjustment += Number(item.adjustment_qty || 0);
      totalValuation += Number(item.valuation || 0);
    }

    return { totalStock, totalIn, totalOut, totalDamaged, totalAdjustment, totalValuation };
  }, [inventory]);

  const handleExportExcel = () => {
    const exportData = inventory.map((r, i) => ({
      NO: i + 1,
      PRODUK: r.product_name,
      SATUAN: r.unit,
      HARGA: Number(r.price || 0),
      'STOK AWAL': Number(r.initial_stock || 0),
      'IN / MASUK': Number(r.in_qty || 0),
      'OUT / TERJUAL': Number(r.out_qty || 0),
      RUSAK: Number(r.damaged_qty || 0),
      PENYESUAIAN: Number(r.adjustment_qty || 0),
      'SISA STOK': Number(r.final_stock || 0),
      'VALUASI ASET': Number(r.valuation || 0),
      STATUS: r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Global_Inventory');
    XLSX.writeFile(wb, `Laporan_Global_Inventory_${month}_${year}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-amber-600" />
              <span>LAPORAN GLOBAL INVENTORY</span>
            </h3>
            <p className="text-xs font-bold text-amber-600 uppercase">
              REKAPITULASI STOK KESELURUHAN PRODUK & VALUASI GUDANG
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-none cursor-pointer"
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
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="bg-transparent font-semibold text-slate-700 text-xs focus:outline-none cursor-pointer border-l border-slate-200 pl-1.5"
              >
                <option value="ALL">Semua Thn</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
                <option value="2029">2029</option>
                <option value="2030">2030</option>
              </select>
            </div>

            <button
              onClick={() => refetch()}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded font-medium border border-slate-200 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded shadow-sm flex items-center gap-1 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tarik Excel</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 block mb-0.5">
              📦 Total Sisa Stok
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-slate-900 font-mono">
                {formatNumber(summary.totalStock)}
              </span>
              <span className="text-[10px] text-slate-500 font-bold">krat</span>
            </div>
            <span className="text-[10px] text-blue-600 font-medium">Stok fisik seluruh telur di gudang</span>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block mb-0.5">
              📥 Total Masuk (IN)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-emerald-950 font-mono">
                {formatNumber(summary.totalIn)}
              </span>
              <span className="text-[10px] text-emerald-700 font-bold">krat</span>
            </div>
            <span className="text-[10px] text-emerald-600 font-medium">Penerimaan barang masuk</span>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block mb-0.5">
              📤 Total Terjual (OUT)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-amber-950 font-mono">
                {formatNumber(summary.totalOut)}
              </span>
              <span className="text-[10px] text-amber-800 font-bold">krat</span>
            </div>
            <span className="text-[10px] text-amber-700 font-medium">Penjualan ke pelanggan</span>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border border-purple-200 rounded-xl p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 block mb-0.5">
              💰 Estimasi Valuasi Aset
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-purple-950 font-mono">
                {formatRupiah(summary.totalValuation)}
              </span>
            </div>
            <span className="text-[10px] text-purple-600 font-medium">Nilai modal/pasar persediaan</span>
          </div>
        </div>

        {/* Table Global Inventory */}
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-200 text-slate-900 sticky top-0 font-extrabold uppercase text-[11px] whitespace-nowrap z-10 border-b border-slate-300">
              <tr>
                <th className="p-2 border border-slate-300 text-center w-10">NO</th>
                <th className="p-2 border border-slate-300">PRODUK</th>
                <th className="p-2 border border-slate-300 text-center w-16">SATUAN</th>
                <th className="p-2 border border-slate-300 text-right">HARGA (RP)</th>
                <th className="p-2 border border-slate-300 text-right text-slate-600">STOK AWAL</th>
                <th className="p-2 border border-slate-300 text-right text-emerald-800">IN / MASUK</th>
                <th className="p-2 border border-slate-300 text-right text-amber-900">OUT / TERJUAL</th>
                <th className="p-2 border border-slate-300 text-right text-rose-700">RUSAK</th>
                <th className="p-2 border border-slate-300 text-right text-purple-700">PENYESUAIAN</th>
                <th className="p-2 border border-slate-300 text-right font-black bg-blue-100 text-slate-900">
                  SISA STOK
                </th>
                <th className="p-2 border border-slate-300 text-right font-bold text-purple-900">
                  VALUASI ASET
                </th>
                <th className="p-2 border border-slate-300 text-center">STATUS</th>
                <th className="p-2 border border-slate-300 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400">
                    Memuat laporan global inventory...
                  </td>
                </tr>
              ) : inventory.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400">
                    Belum ada produk yang terdata.
                  </td>
                </tr>
              ) : (
                inventory.map((r, i) => (
                  <tr key={r.product_id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="p-2 border border-slate-200 text-center text-slate-500 font-mono">
                      {i + 1}
                    </td>
                    <td className="p-2 border border-slate-200 font-bold text-slate-900">
                      {r.product_name}
                    </td>
                    <td className="p-2 border border-slate-200 text-center uppercase font-mono text-slate-600">
                      {r.unit}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono">
                      {formatRupiah(Number(r.price))}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono text-slate-600">
                      {formatNumber(Number(r.initial_stock))}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono text-emerald-700 font-semibold">
                      {Number(r.in_qty) > 0 ? formatNumber(Number(r.in_qty)) : '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono text-amber-800 font-semibold">
                      {Number(r.out_qty) > 0 ? formatNumber(Number(r.out_qty)) : '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono text-rose-600">
                      {Number(r.damaged_qty) > 0 ? formatNumber(Number(r.damaged_qty)) : '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono text-purple-700">
                      {Number(r.adjustment_qty) !== 0 ? formatNumber(Number(r.adjustment_qty)) : '-'}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono font-black text-slate-900 bg-blue-50/50">
                      {formatNumber(Number(r.final_stock))}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-mono font-bold text-purple-900">
                      {formatRupiah(Number(r.valuation))}
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          Number(r.final_stock) <= 0
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : Number(r.final_stock) < 20
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {Number(r.final_stock) <= 0
                          ? 'HABIS'
                          : Number(r.final_stock) < 20
                          ? 'MENIPIS'
                          : 'AMAN'}
                      </span>
                    </td>
                    <td className="p-2 border border-slate-200 text-center">
                      {onNavigateToLedger && (
                        <button
                          onClick={() => onNavigateToLedger(r.product_id)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] rounded border border-emerald-200 flex items-center gap-1 mx-auto"
                          title="Buka Kartu Stok & Audit"
                        >
                          <BookOpen className="w-3 h-3" />
                          <span>Kartu Stok</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Table Footer */}
            <tfoot className="bg-blue-100 font-extrabold text-slate-900 sticky bottom-0 border-t-2 border-slate-300 text-xs">
              <tr>
                <td colSpan={4} className="p-2.5 border border-slate-300 text-center">
                  TOTAL REKAPITULASI
                </td>
                <td className="p-2.5 border border-slate-300 text-right">-</td>
                <td className="p-2.5 border border-slate-300 text-right font-black text-emerald-800">
                  {formatNumber(summary.totalIn)}
                </td>
                <td className="p-2.5 border border-slate-300 text-right font-black text-amber-900">
                  {formatNumber(summary.totalOut)}
                </td>
                <td className="p-2.5 border border-slate-300 text-right text-rose-700">
                  {formatNumber(summary.totalDamaged)}
                </td>
                <td className="p-2.5 border border-slate-300 text-right text-purple-700">
                  {formatNumber(summary.totalAdjustment)}
                </td>
                <td className="p-2.5 border border-slate-300 text-right font-black text-slate-900">
                  {formatNumber(summary.totalStock)}
                </td>
                <td className="p-2.5 border border-slate-300 text-right font-black text-purple-950">
                  {formatRupiah(summary.totalValuation)}
                </td>
                <td colSpan={2} className="p-2.5 border border-slate-300 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

