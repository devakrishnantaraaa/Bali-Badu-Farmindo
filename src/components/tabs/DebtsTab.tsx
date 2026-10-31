'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatRupiah, formatNumber, formatDateIndo } from '@/lib/utils';
import { Download, AlertCircle, Printer, RefreshCw, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DebtInvoice {
  id: number;
  invoice_number: string;
  created_at: string;
  product_name: string;
  penjualan_qty: number;
  total_amount: number;
  sisa_pembayaran: number;
  due_date?: string;
}

interface CustomerDebt {
  customer_id: number;
  customer_name: string;
  customer_phone?: string;
  payment_terms?: string;
  total_customer_debt: number;
  invoices: DebtInvoice[];
}

const TERMS_LABELS: Record<string, string> = {
  REGULER: 'Reguler',
  TGL_15_30: 'Tgl 15 & 30',
  REKAP_BULANAN: 'Rekap 1 Bln',
  GANTUNG_1_NOTA: 'Gantung 1 Nota',
};

export default function DebtsTab() {
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<number[]>([]);
  const [billingCustomer, setBillingCustomer] = useState<CustomerDebt | null>(null);

  // Fetch outstanding debts report
  const { data: debts = [], isLoading, refetch } = useQuery<CustomerDebt[]>({
    queryKey: ['debts'],
    queryFn: async () => {
      const res = await fetch('/api/reports/outstanding-debts');
      if (!res.ok) throw new Error('Gagal memuat rekap piutang');
      return res.json();
    },
  });

  const grandTotalDebt = useMemo(() => {
    return debts.reduce((sum, c) => sum + Number(c.total_customer_debt || 0), 0);
  }, [debts]);

  const toggleExpand = (customerId: number) => {
    setExpandedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const expandAll = () => {
    setExpandedCustomerIds(debts.map((c) => c.customer_id));
  };

  const collapseAll = () => {
    setExpandedCustomerIds([]);
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportRows: any[] = [];
    debts.forEach((c) => {
      exportRows.push({
        'NAMA CUSTOMER': c.customer_name,
        KETENTUAN: TERMS_LABELS[c.payment_terms || ''] || c.payment_terms || 'Reguler',
        'NO NOTA': '',
        TANGGAL: '',
        PRODUK: '',
        QTY: '',
        'TOTAL NOTA': '',
        'SISA PEMBAYARAN': Number(c.total_customer_debt || 0),
      });
      (c.invoices || []).forEach((inv) => {
        exportRows.push({
          'NAMA CUSTOMER': '',
          KETENTUAN: '',
          'NO NOTA': inv.invoice_number || `INV-${inv.id}`,
          TANGGAL: formatDateIndo(inv.created_at),
          PRODUK: inv.product_name,
          QTY: Number(inv.penjualan_qty || 0),
          'TOTAL NOTA': Number(inv.total_amount || 0),
          'SISA PEMBAYARAN': Number(inv.sisa_pembayaran || 0),
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Piutang');
    XLSX.writeFile(wb, `Rekap_Nota_Pending_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <span>REKAP NOTA PENDING & PIUTANG CUSTOMER</span>
            </h3>
            <p className="text-xs font-bold text-rose-600 uppercase">
              Total Piutang Belum Tertagih: {formatRupiah(grandTotalDebt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded font-medium border border-slate-200"
            >
              Buka Semua
            </button>
            <button
              onClick={collapseAll}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded font-medium border border-slate-200"
            >
              Tutup Semua
            </button>
            <button
              onClick={() => refetch()}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded font-medium border border-slate-200 flex items-center gap-1"
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

        {/* Table of Debts */}
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-200 text-slate-900 sticky top-0 font-extrabold uppercase text-[11px] whitespace-nowrap z-10 border-b border-slate-300">
              <tr>
                <th className="p-2.5 border border-slate-300">Customer & No. Nota</th>
                <th className="p-2.5 border border-slate-300">Tanggal Nota</th>
                <th className="p-2.5 border border-slate-300">Produk</th>
                <th className="p-2.5 border border-slate-300 text-right">Qty</th>
                <th className="p-2.5 border border-slate-300 text-right">Total Nota</th>
                <th className="p-2.5 border border-slate-300 text-right">Sisa Pembayaran</th>
                <th className="p-2.5 border border-slate-300 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Memuat data piutang customer...
                  </td>
                </tr>
              ) : debts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Tidak ada nota pending atau piutang yang tertunggak.
                  </td>
                </tr>
              ) : (
                debts.map((customer) => {
                  const isExpanded = expandedCustomerIds.includes(customer.customer_id);
                  const invList = customer.invoices || [];

                  return (
                    <React.Fragment key={customer.customer_id}>
                      {/* Customer Header Row */}
                      <tr className="bg-slate-100/90 font-extrabold border-t-2 border-b border-slate-300">
                        <td className="p-2.5 border border-slate-300">
                          <button
                            onClick={() => toggleExpand(customer.customer_id)}
                            className="flex items-center gap-1.5 text-left text-slate-900 hover:text-amber-700"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                            <span className="text-sm font-black">{customer.customer_name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              {TERMS_LABELS[customer.payment_terms || ''] || customer.payment_terms || 'Reguler'}
                            </span>
                            <span className="text-slate-400 font-normal text-[10px]">
                              ({invList.length} nota pending)
                            </span>
                          </button>
                        </td>
                        <td className="p-2.5 border border-slate-300 text-slate-400">-</td>
                        <td className="p-2.5 border border-slate-300 text-slate-400">-</td>
                        <td className="p-2.5 border border-slate-300 text-slate-400 text-right">-</td>
                        <td className="p-2.5 border border-slate-300 text-slate-400 text-right">-</td>
                        <td className="p-2.5 border border-slate-300 text-right font-black text-rose-700 font-mono text-sm">
                          {formatRupiah(Number(customer.total_customer_debt || 0))}
                        </td>
                        <td className="p-2.5 border border-slate-300 text-center">
                          <button
                            onClick={() => setBillingCustomer(customer)}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10px] rounded shadow-2xs flex items-center gap-1 mx-auto"
                            title="Cetak Faktur Penagihan"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Cetak Faktur</span>
                          </button>
                        </td>
                      </tr>

                      {/* Sub-rows for Invoices */}
                      {isExpanded &&
                        invList.map((inv) => (
                          <tr
                            key={inv.id}
                            className="bg-white hover:bg-slate-50 border-b border-slate-200 text-slate-700"
                          >
                            <td className="p-2 pl-9 border border-slate-200 font-mono font-semibold text-slate-800">
                              {inv.invoice_number || `INV-${inv.id}`}
                            </td>
                            <td className="p-2 border border-slate-200">{formatDateIndo(inv.created_at)}</td>
                            <td className="p-2 border border-slate-200 font-medium">{inv.product_name}</td>
                            <td className="p-2 border border-slate-200 text-right font-mono">
                              {formatNumber(Number(inv.penjualan_qty || 0))}
                            </td>
                            <td className="p-2 border border-slate-200 text-right font-mono">
                              {formatRupiah(Number(inv.total_amount || 0))}
                            </td>
                            <td className="p-2 border border-slate-200 text-right font-mono font-bold text-rose-600">
                              {formatRupiah(Number(inv.sisa_pembayaran || 0))}
                            </td>
                            <td className="p-2 border border-slate-200 text-center text-slate-400 text-[10px]">
                              -
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {/* Table Footer */}
            <tfoot className="bg-blue-200/90 font-black text-slate-900 sticky bottom-0 border-t-2 border-slate-400 text-xs">
              <tr>
                <td colSpan={5} className="p-2.5 border border-slate-300 text-center uppercase tracking-wide">
                  GRAND TOTAL SISA PIUTANG PENDING
                </td>
                <td className="p-2.5 border border-slate-300 text-right font-black text-rose-900 font-mono text-sm">
                  {formatRupiah(grandTotalDebt)}
                </td>
                <td className="p-2.5 border border-slate-300 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Faktur Penagihan Modal */}
      {billingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="text-center border-b border-slate-200 pb-3">
              <h2 className="text-base font-extrabold text-slate-900 uppercase">DEWATA JAYA SUPPLIER</h2>
              <p className="text-[10px] text-slate-600 font-semibold">Telp / WA: +62 823-3903-3923</p>
              <p className="text-xs text-slate-500">FAKTUR PENAGIHAN NOTA PENJUALAN</p>
            </div>

            <div className="grid grid-cols-2 text-xs font-mono">
              <div>
                <span className="text-slate-500 block">Pelanggan:</span>
                <span className="font-bold text-slate-900 text-sm">{billingCustomer.customer_name}</span>
                <span className="text-slate-600 block">{billingCustomer.customer_phone || '-'}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Ketentuan TOP:</span>
                <span className="font-bold text-amber-800">
                  {TERMS_LABELS[billingCustomer.payment_terms || ''] || billingCustomer.payment_terms || 'Reguler'}
                </span>
                <span className="text-slate-500 block text-[10px]">
                  Tanggal Cetak: {formatDateIndo(new Date().toISOString())}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2">No. Nota</th>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2">Produk</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-right">Sisa Tagihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(billingCustomer.invoices || []).map((inv) => (
                    <tr key={inv.id}>
                      <td className="p-2 font-bold">{inv.invoice_number || `INV-${inv.id}`}</td>
                      <td className="p-2">{formatDateIndo(inv.created_at)}</td>
                      <td className="p-2">{inv.product_name}</td>
                      <td className="p-2 text-right">{formatNumber(Number(inv.penjualan_qty))}</td>
                      <td className="p-2 text-right">{formatRupiah(Number(inv.total_amount))}</td>
                      <td className="p-2 text-right font-bold text-rose-600">
                        {formatRupiah(Number(inv.sisa_pembayaran))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                  <tr>
                    <td colSpan={5} className="p-2 text-center">
                      TOTAL TAGIHAN:
                    </td>
                    <td className="p-2 text-right font-black text-rose-700 font-mono text-sm">
                      {formatRupiah(Number(billingCustomer.total_customer_debt))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBillingCustomer(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Faktur</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

