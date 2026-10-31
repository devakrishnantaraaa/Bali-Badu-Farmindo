'use client';

import React from 'react';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex justify-between items-center shadow-xs">
      <div>
        <h1 className="text-base font-extrabold text-slate-900 leading-tight">{title}</h1>
        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
          Sistem Distribusi & Operasional &bull; Dewata Jaya Supplier
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-[11px] text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 flex items-center gap-1.5 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Online</span>
        </div>
      </div>
    </header>
  );
}

