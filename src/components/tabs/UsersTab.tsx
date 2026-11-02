'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, Trash2, Edit3, Shield, User, Lock, Check, AlertCircle } from 'lucide-react';
import { AuthUser } from '@/lib/auth';

interface UserRecord {
  id: number;
  username: string;
  full_name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MARKETING';
  created_at: string;
}

interface UsersTabProps {
  currentUser: AuthUser;
}

export default function UsersTab({ currentUser }: UsersTabProps) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'MARKETING' | 'ADMIN' | 'SUPER_ADMIN'>('MARKETING');
  const [formError, setFormError] = useState('');

  // Fetch users
  const { data: users = [], isLoading, error } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal memuat pengguna');
      }
      return res.json();
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { username: string; password: string; full_name: string; role: string }) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menambah user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { full_name: string; role: string; password?: string } }) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal mengedit user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Gagal menghapus user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(err.message);
    },
  });

  const openAddModal = () => {
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setPassword('123456');
    setRole('MARKETING');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user);
    setFullName(user.full_name);
    setUsername(user.username);
    setPassword('');
    setRole(user.role);
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setFormError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (editingUser) {
      const payload: { full_name: string; role: string; password?: string } = {
        full_name: fullName.trim(),
        role,
      };
      if (password.trim()) {
        if (password.trim().length < 6) {
          setFormError('Password baru minimal 6 karakter.');
          return;
        }
        payload.password = password.trim();
      }
      updateMutation.mutate({ id: editingUser.id, payload });
    } else {
      if (!password || password.length < 6) {
        setFormError('Password minimal 6 karakter.');
        return;
      }
      createMutation.mutate({
        username: username.trim().toLowerCase(),
        password: password.trim(),
        full_name: fullName.trim(),
        role,
      });
    }
  };

  const handleDelete = (user: UserRecord) => {
    if (confirm(`Yakin ingin menghapus akun "${user.full_name}" (@${user.username})?`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Kelola Tim & Akun Pengguna</h2>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                Khusus Super Admin
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 max-w-2xl">
            Daftarkan tim marketing/sales baru agar <strong>nama lengkap sales otomatis tercetak di struk nota</strong>, dan atur akun operasional lainnya.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-xl text-xs shadow-md transition flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Anggota Tim</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
            Daftar Akun Pengguna
          </h3>
          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {users.length} Akun Terdaftar
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Memuat daftar akun...</div>
        ) : error ? (
          <div className="py-6 text-center text-rose-500 text-xs font-semibold">{(error as any).message}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] border-b border-slate-200">
                  <th className="p-3 w-12 text-center">No</th>
                  <th className="p-3">Nama Lengkap (Sales di Struk)</th>
                  <th className="p-3">Username Login</th>
                  <th className="p-3 text-center">Hak Akses (Role)</th>
                  <th className="p-3 text-center">Terdaftar</th>
                  <th className="p-3 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {users.map((u, idx) => {
                  const isSelf = currentUser.id === u.id || currentUser.username === u.username;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition border-b border-slate-100">
                      <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 text-xs">{u.full_name}</div>
                        <div className="text-[10px] text-emerald-600 font-medium">✨ Nama di Struk Nota</div>
                      </td>
                      <td className="p-3">
                        <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
                          @{u.username}
                        </span>
                        {isSelf && (
                          <span className="ml-1 text-[9px] font-bold text-amber-600">(Akun Anda)</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {u.role === 'SUPER_ADMIN' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                            SUPER_ADMIN
                          </span>
                        ) : u.role === 'ADMIN' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            ADMIN
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            MARKETING (SALES)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-500 text-[11px]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold text-[11px] transition shadow-xs flex items-center gap-1"
                            title="Edit Nama Sales & Akun"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleDelete(u)}
                              disabled={deleteMutation.isPending}
                              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-bold text-[11px] transition shadow-xs flex items-center gap-1 disabled:opacity-50"
                              title="Hapus Akun"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit User */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  {editingUser ? `Edit Akun @${editingUser.username}` : 'Tambah Anggota Tim Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Lengkap Sales / Petugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Contoh: Budi Santoso / Wayan Surya"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-semibold text-slate-900"
                />
                <p className="text-[10px] text-emerald-600 font-medium mt-1">
                  ✨ Nama ini yang akan otomatis tercetak di struk nota pada baris <strong>Sales: [Nama]</strong>.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  readOnly={!!editingUser}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="Contoh: budi / marketing2 (huruf kecil)"
                  className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-slate-900 ${
                    editingUser ? 'bg-slate-100 cursor-not-allowed' : ''
                  }`}
                />
                <p className="text-[10px] text-slate-400 mt-1">Digunakan untuk login di aplikasi web / HP.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Password {!editingUser && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? 'Kosongkan jika tidak ingin ganti' : 'Minimal 6 karakter'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 text-slate-900"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {editingUser
                    ? 'Kosongkan jika tidak ingin mengganti password akun ini.'
                    : 'Default disarankan: 123456 (bisa diubah nanti).'}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Role / Hak Akses <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white font-semibold text-slate-900"
                >
                  <option value="MARKETING">MARKETING (Sales Lapangan - Input Penjualan & Print Struk)</option>
                  <option value="ADMIN">ADMIN (Operasional Kantor - Stok, Produk, Customer & Tagihan)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Akses Penuh Seluruh Sistem & Kelola Tim)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Menyimpan...' : editingUser ? 'Simpan Perubahan' : 'Simpan Anggota Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

