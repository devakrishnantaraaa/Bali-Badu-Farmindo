'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Customer } from '@/types';
import { UserPlus, Edit2, Trash2, Search, CheckCircle2, AlertCircle } from 'lucide-react';

const TERMS_LABELS: Record<string, string> = {
  REGULER: 'Reguler (Langsung / H+7)',
  TGL_15_30: 'Tempo Tgl 15 & 30',
  REKAP_BULANAN: 'Rekap Bulanan (Akhir Bln)',
  GANTUNG_1_NOTA: 'Gantung 1 Nota (Lunas saat Order)',
};

export default function CustomerTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  // Form New Customer State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newTerms, setNewTerms] = useState('REGULER');

  // Edit Modal State
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editTerms, setEditTerms] = useState('REGULER');

  // Delete Confirm State
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  // Fetch Customers with TanStack Query
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await fetch('/api/customers');
      if (!res.ok) throw new Error('Gagal memuat data pelanggan');
      return res.json();
    },
  });

  const showToast = (message: string, isError = false) => {
    setFeedback({ message, isError });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Mutation: Create
  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Customer>) => {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setNewTerms('REGULER');
      showToast(`Customer "${data.name || newName}" berhasil disimpan!`);
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Mutation: Update
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Customer> & { id: number }) => {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui data');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditCustomer(null);
      showToast('Data customer berhasil diperbarui!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  // Mutation: Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus customer');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
      showToast('Customer berhasil dihapus!');
    },
    onError: (err: any) => {
      showToast(err.message, true);
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({
      name: newName.trim(),
      phone: newPhone.trim(),
      address: newAddress.trim(),
      payment_terms: newTerms,
    });
  };

  const handleStartEdit = (c: Customer) => {
    setEditCustomer(c);
    setEditName(c.name);
    setEditPhone(c.phone || '');
    setEditAddress(c.address || '');
    setEditTerms(c.payment_terms || 'REGULER');
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomer || !editName.trim()) return;
    updateMutation.mutate({
      id: editCustomer.id,
      name: editName.trim(),
      phone: editPhone.trim(),
      address: editAddress.trim(),
      payment_terms: editTerms,
    });
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.address && c.address.toLowerCase().includes(searchTerm.toLowerCase()))
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
        {/* Form Tambah Customer (5 Kolom) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>Form Tambah Customer</span>
            </h2>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded border border-emerald-200 font-semibold">
              Input Baru
            </span>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Nama Customer / Toko / Depo
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: WARUNG BU TIEN / DEPOT LARIS"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Nomor HP / WhatsApp
              </label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Ketentuan Pembayaran (Terms)
              </label>
              <select
                value={newTerms}
                onChange={(e) => setNewTerms(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="REGULER">Reguler (Langsung / H+7)</option>
                <option value="TGL_15_30">Tempo Tgl 15 & 30</option>
                <option value="REKAP_BULANAN">Rekap Bulanan (Akhir Bln)</option>
                <option value="GANTUNG_1_NOTA">Gantung 1 Nota (Lunas saat Order Berikutnya)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Alamat / Keterangan Lokasi
              </label>
              <textarea
                rows={3}
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Alamat pengiriman / penagihan..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Customer'}
            </button>
          </form>
        </div>

        {/* Tabel Daftar Customer (7 Kolom) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>📋</span> Daftar Customer Terdaftar
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari customer / HP / alamat..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Nama Customer</th>
                  <th className="p-2.5">No HP / WA</th>
                  <th className="p-2.5">Ketentuan Bayar</th>
                  <th className="p-2.5">Alamat</th>
                  <th className="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      Memuat data customer...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      Tidak ada customer ditemukan
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-bold text-slate-900">{c.name}</td>
                      <td className="p-2.5 font-mono text-slate-600">{c.phone || '-'}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          {TERMS_LABELS[c.payment_terms || ''] || c.payment_terms || 'Reguler'}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-500 max-w-xs truncate" title={c.address}>
                        {c.address || '-'}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleStartEdit(c)}
                            className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Hapus"
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

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Edit Data Customer
            </h3>
            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Nama Customer
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Nomor HP
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Ketentuan Bayar
                </label>
                <select
                  value={editTerms}
                  onChange={(e) => setEditTerms(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="REGULER">Reguler (Langsung / H+7)</option>
                  <option value="TGL_15_30">Tempo Tgl 15 & 30</option>
                  <option value="REKAP_BULANAN">Rekap Bulanan (Akhir Bln)</option>
                  <option value="GANTUNG_1_NOTA">Gantung 1 Nota</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Alamat
                </label>
                <textarea
                  rows={3}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditCustomer(null)}
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
              Apakah Anda yakin ingin menghapus customer{' '}
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

