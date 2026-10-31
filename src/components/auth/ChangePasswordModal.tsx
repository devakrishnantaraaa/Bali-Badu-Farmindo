'use client';

import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, X, Loader2 } from 'lucide-react';
import { AuthUser } from '@/lib/auth';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onSuccess: (msg: string) => void;
}

export default function ChangePasswordModal({ isOpen, onClose, user, onSuccess }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!oldPassword || !newPassword) {
      setError('Password lama dan password baru wajib diisi!');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password baru minimal harus 6 karakter!');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok!');
      return;
    }
    if (oldPassword === newPassword) {
      setError('Password baru tidak boleh sama dengan password lama!');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah password');

      onSuccess(data.message || 'Password berhasil diperbarui!');
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 animate-scaleUp">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-slate-900">Ganti Password Akun</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Akun: <strong className="text-slate-800">{user?.full_name || user?.username}</strong> (@{user?.username})
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password Lama:</label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                placeholder="Masukkan password lama Anda"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 pr-10 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password Baru:</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Minimal 6 karakter"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 pr-10 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Minimal 6 karakter kombinasi huruf & angka.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ulangi Password Baru:</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Ketik ulang password baru"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 pr-10 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>{loading ? 'Menyimpan...' : 'Simpan Password Baru'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

