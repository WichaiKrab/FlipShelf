import React from 'react';
import { BookOpen, Calendar, Trash2, FileText } from 'lucide-react';
import { Ebook } from '../types';

interface BookCoverCardProps {
  key?: React.Key | string;
  ebook: Ebook;
  onOpen: (ebook: Ebook) => void;
  onDelete?: (id: string) => void | Promise<void>;
}

export default function BookCoverCard({ ebook, onOpen, onDelete }: BookCoverCardProps) {
  const formattedDate = new Date(ebook.uploadedAt).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div 
      className="group bg-white rounded-3xl border border-slate-200/50 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-500 overflow-hidden flex flex-col justify-between h-full"
      id={`book-card-${ebook.id}`}
    >
      {/* Visual Cover Stage */}
      <div 
        onClick={() => onOpen(ebook)}
        className="relative bg-slate-100 aspect-[4/5.5] overflow-hidden flex items-center justify-center p-6 cursor-pointer"
      >
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {ebook.coverUrl ? (
          <div className="relative w-full h-full flex items-center justify-center shadow-lg group-hover:shadow-2xl group-hover:scale-102 transition-all duration-500 rounded-lg overflow-hidden border border-slate-200">
            <img 
              src={ebook.coverUrl} 
              alt={ebook.name} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            {/* Real book spine layout */}
            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-black/10 shadow-[1px_0_3px_rgba(0,0,0,0.15)]" />
          </div>
        ) : (
          /* Text-based fallback book spine cover */
          <div className="relative w-full h-full bg-gradient-to-br from-emerald-800 to-slate-900 rounded-lg p-5 flex flex-col justify-between text-white shadow-md group-hover:shadow-xl group-hover:scale-102 transition-all duration-500 border border-emerald-950">
            {/* Spine */}
            <div className="absolute top-0 bottom-0 left-0 w-2 bg-emerald-950/40" />
            
            <div className="space-y-2 pl-2">
              <FileText className="w-8 h-8 text-emerald-300" />
              <h4 className="font-bold text-sm tracking-tight line-clamp-3 leading-snug">{ebook.name}</h4>
            </div>

            <div className="pl-2 flex items-center justify-between text-[10px] text-emerald-300 font-medium">
              <span>PDF E-BOOK</span>
              <span className="font-mono">{ebook.totalPages} หน้า</span>
            </div>
          </div>
        )}

        {/* Hover Quick Read Badge */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
          <span className="px-5 py-2.5 bg-white text-slate-900 font-semibold rounded-2xl text-xs shadow-xl flex items-center gap-1.5 transform translate-y-3 group-hover:translate-y-0 transition-all duration-500">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            เปิดอ่านทันที
          </span>
        </div>
      </div>

      {/* Book Metadata Description details */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-1.5">
          <h3 
            onClick={() => onOpen(ebook)}
            className="font-bold text-slate-800 hover:text-emerald-700 transition-colors text-base line-clamp-2 cursor-pointer leading-tight tracking-tight"
          >
            {ebook.name}
          </h3>
          
          <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-400 font-medium">
            <span className="font-mono">{ebook.totalPages} หน้า</span>
            <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
            <span className="font-mono">{ebook.fileSize || 'N/A'}</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formattedDate}</span>
          </div>

          {onDelete && (
            <button
              onClick={() => onDelete(ebook.id)}
              className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-400 transition-all active:scale-90"
              title="ลบหนังสือ"
              id={`delete-book-btn-${ebook.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
