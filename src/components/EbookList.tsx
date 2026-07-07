import React, { useState, useEffect } from 'react';
import { Ebook } from '../types';
import BookCoverCard from './BookCoverCard';
import { BookCopy, Search, Sparkles, Loader2, Filter, Layers } from 'lucide-react';
import { getAbsoluteUrl } from '../lib/firebase';

interface EbookListProps {
  onOpenBook: (ebook: Ebook) => void;
}

const CATEGORIES = ["ทั้งหมด", "นิยาย", "คู่มือ", "การศึกษา", "นิตยสาร", "การ์ตูน", "ทั่วไป"];

export default function EbookList({ onOpenBook }: EbookListProps) {
  const [ebooks, setEbooks] = useState<Ebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');

  // Load ebooks from backend API and combine with local storage
  const fetchEbooks = async () => {
    try {
      const response = await fetch(getAbsoluteUrl('/api/ebooks'));
      if (!response.ok) {
        throw new Error(`Server returned error status: ${response.status}`);
      }
      const serverBooks: Ebook[] = await response.json();

      // Merge local ebooks from localStorage
      let localBooks: Ebook[] = [];
      try {
        const localBooksStr = localStorage.getItem('local_ebooks');
        if (localBooksStr) {
          localBooks = JSON.parse(localBooksStr);
        }
      } catch (e) {
        console.error('Error parsing local books:', e);
      }

      const combined = [...serverBooks];
      localBooks.forEach((lb) => {
        if (!combined.some((b) => b.id === lb.id)) {
          combined.push(lb);
        }
      });

      // Sort combined books by uploadedAt desc
      combined.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setEbooks(combined);
    } catch (error) {
      console.error('Failed to fetch ebooks from backend, falling back to local only:', error);
      
      // Fallback to only local ebooks
      let localBooks: Ebook[] = [];
      try {
        const localBooksStr = localStorage.getItem('local_ebooks');
        if (localBooksStr) {
          localBooks = JSON.parse(localBooksStr);
        }
      } catch (e) {
        console.error('Error parsing local books:', e);
      }
      localBooks.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setEbooks(localBooks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEbooks();
    // Poll for changes every 5 seconds to provide simulated real-time updates
    const interval = setInterval(fetchEbooks, 5000);
    return () => clearInterval(interval);
  }, []);

  // Only display books that are PUBLISHED (non-draft) for public readers
  const publishedEbooks = ebooks.filter(book => book.publishStatus !== 'draft');

  const filteredEbooks = publishedEbooks.filter((book) => {
    const matchesSearch = book.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (book.description && book.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'ทั้งหมด' || book.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[250px] gap-3 text-slate-400 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="text-sm font-medium">กำลังโหลดรายการคลังหนังสือแบบเรียลไทม์...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="ebook-list-section">
      {/* Search and Section Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/50 pb-4">
        <div className="flex items-center gap-2">
          <BookCopy className="w-5 h-5 text-slate-700" />
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">คลังหนังสือพร้อมอ่าน ({filteredEbooks.length})</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Category Chips Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none" id="category-filter-chips">
            <Filter className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อหนังสือ / คำอธิบาย..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-medium"
            />
          </div>
        </div>
      </div>

      {filteredEbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-slate-200/40 rounded-3xl min-h-[300px]">
          <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 mb-4">
            <Layers className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg mb-1">
            {searchQuery || selectedCategory !== 'ทั้งหมด' ? 'ไม่พบหนังสือในหมวดหมู่นี้' : 'ยังไม่มีหนังสือในคลัง'}
          </h3>
          <p className="text-slate-400 text-sm max-w-sm mb-4 leading-relaxed">
            {searchQuery || selectedCategory !== 'ทั้งหมด'
              ? 'กรุณาลองเปลี่ยนคำค้นหาหรือเลือกหมวดหมู่อื่นดูอีกครั้ง' 
              : 'ขณะนี้ยังไม่มีหนังสือที่เผยแพร่สู่คลัง คุณสามารถล็อกอินเข้าระบบผู้ดูแลระบบที่มุมขวาบนเพื่ออัปโหลดหนังสือเล่มแรกได้!'}
          </p>
        </div>
      ) : (
        /* Grid Layout */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" id="ebook-grid-cards">
          {filteredEbooks.map((book) => (
            <BookCoverCard
              key={book.id}
              ebook={book}
              onOpen={onOpenBook}
            />
          ))}
        </div>
      )}
    </div>
  );
}
