'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatRupiah, formatNumber } from '@/lib/utils';
import { Download, RefreshCw, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MonthlyRecapRow {
  date_label: string;
  total_sales: number;
  total_lunas: number;
  total_pending: number;
  total_krat: number;
  avg_price_per_krat?: number;
}

export default function MonthlyRecapTab() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [month, setMonth] = useState<string>(String(currentMonth));
  const [year, setYear] = useState<string>(String(currentYear));

  const { data: rows = [], isLoading, refetch } = useQuery<MonthlyRecapRow[]>({
    queryKey: ['monthly-recap', month, year],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      const res = await fetch(`/api/reports/monthly-recap?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat rekap bulanan');
      return res.json();
    },
  });

  const totals = useMemo(() => {
    let tSales = 0;
    let tLunas = 0;
    let tPending = 0;
    let tKrat = 0;
    for (const r of rows) {
      tSales += Number(r.total_sales || 0);
      tLunas += Number(r.total_lunas || 0);
      tPending += Number(r.total_pending || 0);
      tKrat += Number(r.total_krat || 0);
    }
    const avgPerKrat = tKrat > 0 ? Math.round(tSales / tKrat) : 0;
    return { tSales, tLunas, tPending, tKrat, avgPerKrat };
  }, [rows]);

  const handleExportExcel = () => {
    const exportData = rows.map((r) => {
      const sales = Number(r.total_sales || 0);
      const krat = Number(r.total_krat || 0);
      const avg = krat > 0 ? Math.round(sales / krat) : 0;
      return {
        'TANGGAL / PERIODE': r.date_label,
        'PENJUALAN (KRAT)': krat,
        'LUNAS (RP)': Number(r.total_lunas || 0),
        'PENDING (RP)': Number(r.total_pending || 0),
        'RATA-RATA / KRAT': avg,
        'TOTAL PENJUALAN': sales,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Bulanan');
    XLSX.writeFile(wb, `Rekap_Bulanan_${month}_${year}.xlsx`);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-600" />
              <span>REKAP PENJUALAN BULANAN</span>
            </h3>
            <p className="text-[11px] font-bold text-amber-600 uppercase">
              DISTRIBUTOR TELUR - FINANCIAL RECAP
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600 border border-slate-200 bg-slate-50 px-2.5 py-1 rounded">
              PERIODE:
            </span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-blue-50 border border-blue-300 font-bold text-blue-900 rounded px-3 py-1 text-xs"
            >
              <option value="ALL">SEMUA BULAN</option>
              <option value="1">JANUARI</option>
              <option value="2">FEBRUARI</option>
              <option value="3">MARET</option>
              <option value="4">APRIL</option>
              <option value="5">MEI</option>
              <option value="6">JUNI</option>
              <option value="7">JULI</option>
              <option value="8">AGUSTUS</option>
              <option value="9">SEPTEMBER</option>
              <option value="10">OKTOBER</option>
              <option value="11">NOVEMBER</option>
              <option value="12">DESEMBER</option>
            </select>

            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-blue-50 border border-blue-300 font-bold text-blue-900 rounded px-3 py-1 text-xs"
            >
              <option value="ALL">SEMUA TAHUN</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
              <option value="2029">2029</option>
              <option value="2030">2030</option>
            </select>

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

        {/* Table */}
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-blue-100/90 text-blue-950 sticky top-0 font-extrabold uppercase text-[11px] whitespace-nowrap z-10 border-b border-slate-300">
              <tr>
                <th className="py-2 px-3 border border-slate-300">Tanggal / Periode</th>
                <th className="py-2 px-3 border border-slate-300 text-right">PENJUALAN (KRAT)</th>
                <th className="py-2 px-3 border border-slate-300 text-right text-emerald-800">LUNAS</th>
                <th className="py-2 px-3 border border-slate-300 text-right text-rose-800">PENDING</th>
                <th className="py-2 px-3 border border-slate-300 text-right text-blue-900">/KRAT</th>
                <th className="py-2 px-3 border border-slate-300 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Memuat rekapitulasi penjualan bulanan...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Tidak ada data penjualan pada periode ini.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const sales = Number(r.total_sales || 0);
                  const lunas = Number(r.total_lunas || 0);
                  const pending = Number(r.total_pending || 0);
                  const krat = Number(r.total_krat || 0);
                  const avg = krat > 0 ? Math.round(sales / krat) : 0;

                  return (
                    <tr key={i} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-2 px-3 border border-slate-200 font-sans font-bold text-slate-900">
                        {r.date_label}
                      </td>
                      <td className="py-2 px-3 border border-slate-200 text-right font-bold text-slate-800">
                        {krat > 0 ? formatNumber(krat) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-slate-200 text-right text-emerald-700 font-semibold">
                        {lunas > 0 ? formatRupiah(lunas) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-slate-200 text-right text-rose-600 font-semibold">
                        {pending > 0 ? formatRupiah(pending) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-slate-200 text-right text-blue-900">
                        {avg > 0 ? formatRupiah(avg) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-slate-200 text-right font-black text-slate-900">
                        {sales > 0 ? formatRupiah(sales) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer */}
            <tfoot className="bg-blue-100 font-black text-slate-900 sticky bottom-0 border-t-2 border-slate-300 text-xs font-mono">
              <tr>
                <td className="py-2.5 px-3 border border-slate-300 font-sans uppercase">TOTAL</td>
                <td className="py-2.5 px-3 border border-slate-300 text-right font-black">
                  {formatNumber(totals.tKrat)}
                </td>
                <td className="py-2.5 px-3 border border-slate-300 text-right text-emerald-800 font-black">
                  {formatRupiah(totals.tLunas)}
                </td>
                <td className="py-2.5 px-3 border border-slate-300 text-right text-rose-800 font-black">
                  {formatRupiah(totals.tPending)}
                </td>
                <td className="py-2.5 px-3 border border-slate-300 text-right text-blue-950 font-black">
                  {formatRupiah(totals.avgPerKrat)}
                </td>
                <td className="py-2.5 px-3 border border-slate-300 text-right font-black">
                  {formatRupiah(totals.tSales)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

