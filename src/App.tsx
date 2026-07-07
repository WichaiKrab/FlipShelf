import React, { useState } from 'react';
import { BookOpen, Sparkles, AlertCircle, Bookmark, ShieldAlert, Library, User } from 'lucide-react';
import EbookList from './components/EbookList';
import FlipbookReader from './components/FlipbookReader';
import AdminDashboard from './components/AdminDashboard';
import { Ebook } from './types';

type PortalMode = 'public' | 'admin';

export default function App() {
  const [portalMode, setPortalMode] = useState<PortalMode>('public');
  const [activeBook, setActiveBook] = useState<Ebook | null>(null);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 flex flex-col font-sans" id="root-app-layout">
      {/* Top Brand Navigation Header */}
      <nav className="border-b border-slate-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-700 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-700/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-slate-900 tracking-tight text-lg">FlipShelf</span>
            <span className="ml-2 text-[10px] font-bold tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-full">ห้องสมุด E-Book ออนไลน์</span>
          </div>
        </div>

        {/* Portal Switcher Buttons */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200/30">
          <button
            onClick={() => setPortalMode('public')}
            className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
              portalMode === 'public'
                ? 'bg-white text-emerald-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Library className="w-4 h-4" />
            <span className="hidden sm:inline">คลังหนังสือ</span>ทั่วไป
          </button>
          <button
            onClick={() => setPortalMode('admin')}
            className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all ${
              portalMode === 'admin'
                ? 'bg-slate-900 text-emerald-400 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            ผู้ดูแลระบบ
          </button>
        </div>
      </nav>

      {/* Main Container Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 sm:py-12 space-y-12">
        {portalMode === 'public' ? (
          /* PUBLIC PORTAL VIEW */
          <div className="space-y-6 animate-fade-in">
            {/* Real-time PDF Gallery Grid */}
            <section className="space-y-6">
              <EbookList onOpenBook={(book) => setActiveBook(book)} />
            </section>
          </div>
        ) : (
          /* ADMIN PORTAL VIEW */
          <div className="animate-fade-in">
            <AdminDashboard onOpenBook={(book) => setActiveBook(book)} />
          </div>
        )}
      </main>

      {/* Fully Immersive E-Book Reader Overlay */}
      {activeBook && (
        <FlipbookReader 
          ebook={activeBook} 
          onClose={() => setActiveBook(null)} 
          isAdminMode={portalMode === 'admin'}
        />
      )}

    </div>
  );
}
