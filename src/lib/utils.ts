import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num === null || num === undefined || isNaN(num)) return 'Rp 0';
  return `Rp ${num.toLocaleString('id-ID')}`;
}

export function formatNumber(num: number | string | null | undefined): string {
  const val = typeof num === 'string' ? parseFloat(num) : num;
  if (val === null || val === undefined || isNaN(val)) return '-';
  return val.toLocaleString('id-ID');
}

export function formatDateIndo(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return String(dateStr);
  const d = String(dt.getDate()).padStart(2, '0');
  const m = dt.toLocaleString('id-ID', { month: 'short' });
  const y = dt.getFullYear();
  return `${d}-${m}-${y}`;
}

