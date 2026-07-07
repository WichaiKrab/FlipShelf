import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  Key, 
  LayoutDashboard, 
  FileText, 
  BookOpen, 
  Plus, 
  CheckCircle, 
  AlertCircle, 
  Settings, 
  Layers, 
  RefreshCw, 
  Eye, 
  Edit, 
  Trash2, 
  Database, 
  TrendingUp, 
  ArrowLeft, 
  Image as ImageIcon,
  Book,
  X,
  Sparkles
} from 'lucide-react';
import { getAbsoluteUrl } from '../lib/firebase';
import { Ebook } from '../types';
import UploadZone from './UploadZone';

interface AdminDashboardProps {
  onOpenBook: (ebook: Ebook) => void;
}

export default function AdminDashboard({ onOpenBook }: AdminDashboardProps) {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('is_admin_authenticated') === 'true';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Books State
  const [ebooks, setEbooks] = useState<Ebook[]>([]);
  const [loading, setLoading] = useState(true);

  // CMS Views: 'dashboard' | 'upload'
  const [adminView, setAdminView] = useState<'dashboard' | 'upload'>('dashboard');

  // Edit Modal State
  const [editingBook, setEditingBook] = useState<Ebook | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<'published' | 'draft'>('published');
  const [editCover, setEditCover] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualFileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Alert/Notification Modal State
  interface AdminModalAlert {
    type: 'success' | 'error' | 'confirm' | 'info';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
  }
  const [alertModal, setAlertModal] = useState<AdminModalAlert | null>(null);

  // Manual Create State
  const [createMethod, setCreateMethod] = useState<'upload' | 'manual'>('upload');
  const [newTitle, setNewTitle] = useState('');
  const [newPdfUrl, setNewPdfUrl] = useState('');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [newTotalPages, setNewTotalPages] = useState<number>(1);
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('ทั่วไป');
  const [newStatus, setNewStatus] = useState<'published' | 'draft'>('published');
  const [newFileSize, setNewFileSize] = useState('1.5 MB');
  const [isCreatingManual, setIsCreatingManual] = useState(false);

  // Load ebooks from backend API and combine with local storage
  const fetchAdminEbooks = async () => {
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
      setLoading(false);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAdminEbooks();
    // Poll every 5 seconds for backend updates
    const interval = setInterval(fetchAdminEbooks, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Handle simple credentials login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() === 'admin' && password === 'admin123') {
      setIsAuthenticated(true);
      localStorage.setItem('is_admin_authenticated', 'true');
      setLoginError(null);
    } else {
      setLoginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('is_admin_authenticated');
    setEbooks([]);
  };

  // Open Edit Modal with book details
  const startEdit = (book: Ebook) => {
    setEditingBook(book);
    setEditTitle(book.name);
    setEditDesc(book.description || '');
    setEditCategory(book.category || 'ทั่วไป');
    setEditStatus(book.publishStatus || 'published');
    setEditCover(book.coverUrl || '');
  };

  // Manual Create Cover Change
  const handleManualCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewCoverUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Book Metadata
  const saveBookEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;

    setIsSavingEdit(true);
    try {
      if (editingBook.id.startsWith('local-')) {
        // Update in localStorage
        const localBooksStr = localStorage.getItem('local_ebooks');
        if (localBooksStr) {
          const localBooks: Ebook[] = JSON.parse(localBooksStr);
          const updated = localBooks.map(b => b.id === editingBook.id ? {
            ...b,
            name: editTitle.trim(),
            description: editDesc.trim(),
            category: editCategory,
            publishStatus: editStatus,
            coverUrl: editCover || undefined
          } : b);
          localStorage.setItem('local_ebooks', JSON.stringify(updated));
        }
      } else {
        // Update via server API
        const updateResponse = await fetch(getAbsoluteUrl(`/api/ebooks/${editingBook.id}`), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: editTitle.trim(),
            description: editDesc.trim(),
            category: editCategory,
            publishStatus: editStatus,
            coverUrl: editCover || undefined,
          }),
        });
        if (!updateResponse.ok) {
          const errData = await updateResponse.json();
          throw new Error(errData.error || 'Failed to update ebook via server API');
        }
      }

      // Update in local state to force direct feedback
      setEbooks(prev => prev.map(b => b.id === editingBook.id ? {
        ...b,
        name: editTitle.trim(),
        description: editDesc.trim(),
        category: editCategory,
        publishStatus: editStatus,
        coverUrl: editCover || undefined
      } : b));

      setEditingBook(null);
      setIsSavingEdit(false);

      setAlertModal({
        type: 'success',
        title: 'บันทึกการแก้ไขสำเร็จ!',
        message: 'แก้ไขรายละเอียดหนังสือในระบบเรียบร้อยแล้ว'
      });
    } catch (err) {
      console.error('Firestore update error:', err);
      setIsSavingEdit(false);
      setAlertModal({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถอัปเดตข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
      });
    }
  };

  // Delete Book with Custom Modal Confirmation
  const deleteBook = (id: string) => {
    setAlertModal({
      type: 'confirm',
      title: 'ยืนยันการลบหนังสือ',
      message: 'คุณแน่ใจหรือไม่ที่จะลบหนังสือเล่มนี้อย่างถาวร? ข้อมูลนี้ไม่สามารถกู้คืนได้',
      confirmText: 'ลบถาวร',
      cancelText: 'ยกเลิก',
      onConfirm: async () => {
        try {
          if (!id.startsWith('local-')) {
            const deleteResponse = await fetch(getAbsoluteUrl(`/api/ebooks/${id}`), {
              method: 'DELETE',
            });
            if (!deleteResponse.ok) {
              throw new Error('Failed to delete book from server database');
            }
          }
        } catch (err) {
          console.error('Error deleting book:', err);
        }

        try {
          const localBooksStr = localStorage.getItem('local_ebooks');
          if (localBooksStr) {
            const localBooks: Ebook[] = JSON.parse(localBooksStr);
            const filtered = localBooks.filter(b => b.id !== id);
            localStorage.setItem('local_ebooks', JSON.stringify(filtered));
          }
        } catch (e) {
          console.error('Error removing local book:', e);
        }

        setEbooks(prev => prev.filter(b => b.id !== id));
        setAlertModal({
          type: 'success',
          title: 'ลบหนังสือสำเร็จ!',
          message: 'ลบหนังสือเล่มนี้ออกจากคลังข้อมูลเรียบร้อยแล้ว'
        });
      }
    });
  };

  // Manual Book Creation
  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPdfUrl.trim()) {
      setAlertModal({
        type: 'error',
        title: 'ข้อมูลไม่ครบถ้วน',
        message: 'กรุณากรอกชื่อหนังสือและลิงก์ไฟล์ PDF'
      });
      return;
    }

    setIsCreatingManual(true);
    
    const ebookData = {
      name: newTitle.trim(),
      pdfUrl: newPdfUrl.trim(),
      coverUrl: newCoverUrl.trim() || undefined,
      totalPages: Number(newTotalPages) || 1,
      uploadedAt: Date.now(),
      status: 'ready' as const,
      publishStatus: newStatus,
      description: newDesc.trim(),
      category: newCategory,
      fileSize: newFileSize.trim() || '1.5 MB',
    };

    try {
      let savedId = '';
      let isLocal = false;

      try {
        // Fetch the next seq ID from our server API
        const nextSeqResponse = await fetch(getAbsoluteUrl('/api/ebooks/next-id'));
        if (!nextSeqResponse.ok) throw new Error('Failed to fetch next sequential book ID');
        const nextSeqData = await nextSeqResponse.json();
        const nextSeqId = nextSeqData.nextId;

        // Save book to our backend API
        const saveResponse = await fetch(getAbsoluteUrl('/api/ebooks'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: nextSeqId,
            ...ebookData,
          }),
        });
        
        if (!saveResponse.ok) {
          const errData = await saveResponse.json();
          throw new Error(errData.error || 'Server error saving ebook');
        }

        savedId = nextSeqId;
      } catch (dbErr) {
        console.error('Database manual create error, fallback to local:', dbErr);
        isLocal = true;

        const localBooksStr = localStorage.getItem('local_ebooks');
        const localBooks = localBooksStr ? JSON.parse(localBooksStr) : [];
        
        let maxLocalNum = 0;
        localBooks.forEach((b: Ebook) => {
          const numPart = b.id.replace('local-', '');
          if (/^\d+$/.test(numPart)) {
            const num = parseInt(numPart, 10);
            if (num > maxLocalNum) maxLocalNum = num;
          }
        });
        savedId = `local-${String(maxLocalNum + 1).padStart(5, '0')}`;

        localBooks.push({ id: savedId, ...ebookData });
        localStorage.setItem('local_ebooks', JSON.stringify(localBooks));
      }

      setAlertModal({
        type: 'success',
        title: 'เพิ่มหนังสือสำเร็จ!',
        message: `หนังสือ "${newTitle}" ได้รับการเพิ่มเข้าสู่คลังเรียบร้อยแล้ว`,
        onConfirm: () => {
          setAdminView('dashboard');
          // Reset fields
          setNewTitle('');
          setNewPdfUrl('');
          setNewCoverUrl('');
          setNewTotalPages(1);
          setNewDesc('');
          setNewCategory('ทั่วไป');
          setNewStatus('published');
          setNewFileSize('1.5 MB');
        }
      });
    } catch (err) {
      console.error('Error creating manual book:', err);
      setAlertModal({
        type: 'error',
        title: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถเพิ่มหนังสือได้ กรุณาลองใหม่อีกครั้ง'
      });
    } finally {
      setIsCreatingManual(false);
    }
  };

  // Custom cover upload reader inside edit modal
  const handleEditCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setEditCover(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Statistics calculation
  const totalBooks = ebooks.length;
  const publishedCount = ebooks.filter(b => b.publishStatus === 'published').length;
  const draftCount = ebooks.filter(b => b.publishStatus === 'draft').length;
  const totalPagesSum = ebooks.reduce((sum, b) => sum + (b.totalPages || 0), 0);

  // 1. Return Login View if not Authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 px-4" id="admin-login-stage">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white mx-auto shadow-md">
              <Lock className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">เข้าสู่ระบบผู้ดูแลหลังบ้าน (Admin System)</h2>
            <p className="text-xs text-slate-400">ระบุชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งานระบบ CMS และแก้ไขข้อมูลคลัง</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">ชื่อผู้ใช้ (Username)</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ระบุชื่อผู้ใช้..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">รหัสผ่าน (Password)</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ระบุรหัสผ่าน..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-mono"
                />
                <Key className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-medium flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl text-sm hover:bg-slate-800 transition-all shadow-md active:scale-98"
            >
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" id="admin-dashboard-container">
      {/* Header and CMS View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-900 rounded-xl text-white">
            <LayoutDashboard className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">แผงควบคุมผู้ดูแลระบบ (Dashboard CMS)</h2>
            <p className="text-xs text-slate-400">ควบคุมข้อมูลสถิติ เผยแพร่ หรือแก้ไขข้อมูลรายละเอียดของแต่ละหน้ากระดาษ</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {adminView === 'upload' ? (
            <button
              onClick={() => setAdminView('dashboard')}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าตารางควบคุม
            </button>
          ) : (
            <button
              onClick={() => setAdminView('upload')}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md shadow-emerald-700/10"
            >
              <Plus className="w-4 h-4" />
              อัปโหลดหนังสือใหม่
            </button>
          )}

          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 text-rose-700 font-semibold rounded-xl text-xs sm:text-sm transition-all"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      {/* 2. CMS CONTENT */}
      {adminView === 'upload' ? (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Method Switcher */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
              <button
                type="button"
                onClick={() => setCreateMethod('upload')}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
                  createMethod === 'upload'
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-emerald-600" />
                อัปโหลดไฟล์ PDF (ดึงข้อมูลอัตโนมัติ)
              </button>
              <button
                type="button"
                onClick={() => setCreateMethod('manual')}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
                  createMethod === 'manual'
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-4 h-4 text-emerald-600" />
                กรอกข้อมูลด้วยตนเอง (Manual Entry)
              </button>
            </div>
          </div>

          {createMethod === 'upload' ? (
            <div className="space-y-6">
              <div className="max-w-xl mx-auto text-center space-y-1">
                <h3 className="text-lg font-bold text-slate-800">อัปโหลดหนังสือเล่มใหม่</h3>
                <p className="text-xs text-slate-400">ทำการเรนเดอร์ สแกนหน้ากระดาษ และสร้างหน้าปกแบบอิงภาพถ่ายต้นฉบับอัตโนมัติ</p>
              </div>
              <UploadZone onUploadSuccess={() => {
                setAdminView('dashboard');
                setAlertModal({
                  type: 'success',
                  title: 'อัปโหลดหนังสือสำเร็จ!',
                  message: 'อัปโหลดหนังสือและเรนเดอร์ภาพหน้าปกเรียบร้อยแล้ว'
                });
              }} />
            </div>
          ) : (
            /* MANUAL FORM */
            <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="text-center space-y-1 border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">กรอกข้อมูลหนังสือด้วยตัวเอง</h3>
                <p className="text-xs text-slate-400">เหมาะสำหรับการเพิ่มลิงก์ PDF ภายนอก หรือหนังสือที่ไม่ต้องการสแกนหน้าปกอัตโนมัติ</p>
              </div>

              <form onSubmit={handleManualCreate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Cover */}
                  <div className="md:col-span-1 flex flex-col items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 self-start">ภาพหน้าปกหนังสือ</span>
                    
                    <div className="relative w-full aspect-[3/4.2] bg-slate-50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center">
                      {newCoverUrl ? (
                        <img
                          src={newCoverUrl}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-slate-400 flex flex-col items-center gap-2">
                          <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                          <span className="text-xs text-slate-400 font-medium">ยังไม่ได้เลือกรูป</span>
                        </div>
                      )}
                      <div className="absolute top-0 bottom-0 left-0 w-1 bg-black/10 shadow-[1px_0_2px_rgba(0,0,0,0.15)]" />
                    </div>

                    <input
                      ref={manualFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleManualCoverChange}
                      className="hidden"
                    />
                    
                    <button
                      type="button"
                      onClick={() => manualFileInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-all flex items-center justify-center gap-1 shadow-sm"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      อัปโหลดรูปภาพหน้าปก
                    </button>
                    <div className="text-[10px] text-slate-400 text-center leading-tight">หรือระบุ URL รูปหน้าปกตรงข้อมูลด้านขวา</div>
                  </div>

                  {/* Right Column: Metadata fields */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">ชื่อหนังสือ (Title) *</label>
                      <input
                        type="text"
                        required
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="กรอกชื่อหนังสือ..."
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">ลิงก์ไฟล์ PDF (PDF URL) *</label>
                      <input
                        type="url"
                        required
                        value={newPdfUrl}
                        onChange={(e) => setNewPdfUrl(e.target.value)}
                        placeholder="https://example.com/document.pdf"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">ลิงก์รูปภาพหน้าปก (Cover Image URL) [ไม่บังคับ]</label>
                      <input
                        type="url"
                        value={newCoverUrl.startsWith('data:') ? '' : newCoverUrl}
                        onChange={(e) => setNewCoverUrl(e.target.value)}
                        placeholder="https://example.com/cover.jpg (หรืออัปโหลดไฟล์จากปุ่มซ้ายมือ)"
                        disabled={newCoverUrl.startsWith('data:')}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-mono text-xs disabled:opacity-50"
                      />
                      {newCoverUrl.startsWith('data:') && (
                        <div className="flex items-center justify-between text-[10px] text-emerald-600 font-semibold px-1">
                          <span>✓ ใช้รูปภาพที่อัปโหลดจากอุปกรณ์ของคุณเรียบร้อยแล้ว</span>
                          <button type="button" onClick={() => setNewCoverUrl('')} className="text-rose-600 hover:underline">ล้างรูปภาพ</button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">รายละเอียดคำอธิบาย (Description)</label>
                      <textarea
                        rows={3}
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="คำแนะนำ รายละเอียดเกี่ยวกับตัวย่อหนังสือ..."
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all resize-none leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">จำนวนหน้าทั้งหมด (Pages) *</label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={newTotalPages}
                          onChange={(e) => setNewTotalPages(Number(e.target.value))}
                          placeholder="เช่น 12"
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">ขนาดไฟล์ (File Size)</label>
                        <input
                          type="text"
                          value={newFileSize}
                          onChange={(e) => setNewFileSize(e.target.value)}
                          placeholder="เช่น 2.4 MB"
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">หมวดหมู่หนังสือ (Category)</label>
                        <select
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                        >
                          <option value="นิยาย">นิยาย</option>
                          <option value="คู่มือ">คู่มือ</option>
                          <option value="การศึกษา">การศึกษา / วิชาการ</option>
                          <option value="นิตยสาร">นิตยสาร</option>
                          <option value="การ์ตูน">การ์ตูน</option>
                          <option value="ทั่วไป">ทั่วไป</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">สถานะการเผยแพร่</label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as any)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                        >
                          <option value="published">เผยแพร่สู่คลังทันที (Published)</option>
                          <option value="draft">บันทึกเป็นแบบร่าง (Draft)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminView('dashboard');
                    }}
                    className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingManual}
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    {isCreatingManual ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-300" />
                    )}
                    <span>{isCreatingManual ? 'กำลังบันทึกข้อมูล...' : 'บันทึกและเผยแพร่'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        /* Standard CMS List View */
        <div className="space-y-8 animate-fade-in">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="cms-stats-grid">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex items-center gap-4">
              <div className="p-3 bg-slate-50 rounded-2xl text-slate-700 shrink-0">
                <Book className="w-5 h-5 text-slate-800" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">หนังสือทั้งหมด</p>
                <p className="text-xl font-bold font-mono text-slate-900">{totalBooks} เล่ม</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-700 shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">เผยแพร่แล้ว</p>
                <p className="text-xl font-bold font-mono text-emerald-800">{publishedCount} เล่ม</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-2xl text-amber-700 shrink-0">
                <Settings className="w-5 h-5 text-amber-700 animate-spin-slow" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ฉบับร่าง (Draft)</p>
                <p className="text-xl font-bold font-mono text-amber-800">{draftCount} เล่ม</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-[0_4px_12px_rgba(0,0,0,0.01)] flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-700 shrink-0">
                <TrendingUp className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">จำนวนรวมหน้าคู่</p>
                <p className="text-xl font-bold font-mono text-blue-800">{totalPagesSum} หน้า</p>
              </div>
            </div>
          </div>

          {/* CMS Books List Table */}
          <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm" id="cms-table-container">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">รายการจัดการหนังสือทั้งหมด</span>
              <span className="text-xs text-slate-400 font-mono">อัปเดตเรียลไทม์ผ่าน Firestore</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                <span className="text-xs font-semibold">กำลังโหลดข้อมูลตารางแบบเรียลไทม์...</span>
              </div>
            ) : ebooks.length === 0 ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                <Layers className="w-8 h-8 text-slate-300" />
                <span className="text-sm font-semibold text-slate-800">ยังไม่มีข้อมูลหนังสือในฐานข้อมูล</span>
                <p className="text-xs text-slate-400 max-w-xs">เริ่มต้นอัปโหลดไฟล์ PDF ของคุณด้วยปุ่มสีเขียวด้านบน</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/20">
                      <th className="py-4 px-6">รูปหน้าปก / ชื่อหนังสือ</th>
                      <th className="py-4 px-3">หมวดหมู่</th>
                      <th className="py-4 px-3">ความยาว</th>
                      <th className="py-4 px-3">สถานะ</th>
                      <th className="py-4 px-6 text-right">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {ebooks.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50/40 transition-all duration-300">
                        <td className="py-3 px-6 flex items-center gap-4">
                          <div className="w-9 h-12 rounded-md bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center relative">
                            {book.coverUrl ? (
                              <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <FileText className="w-5 h-5 text-slate-400" />
                            )}
                            <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-black/10" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 line-clamp-1 leading-snug">{book.name}</p>
                            <p className="text-[10px] text-slate-400 line-clamp-1">{book.description || 'ไม่มีคำอธิบายเพิ่มเติม'}</p>
                          </div>
                        </td>

                        <td className="py-3 px-3 font-semibold text-xs text-slate-600">
                          {book.category || 'ทั่วไป'}
                        </td>

                        <td className="py-3 px-3 font-mono text-xs text-slate-600">
                          {book.totalPages} หน้า • {book.fileSize || 'N/A'}
                        </td>

                        <td className="py-3 px-3">
                          {book.publishStatus === 'draft' ? (
                            <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold tracking-tight rounded-full">
                              แบบร่าง (Draft)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-tight rounded-full">
                              เผยแพร่แล้ว (Published)
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onOpenBook(book)}
                              className="p-1.5 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 rounded-lg transition-all"
                              title="เปิดอ่าน / Preview"
                            >
                              <Eye className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => startEdit(book)}
                              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-all"
                              title="แก้ไขข้อมูล"
                            >
                              <Edit className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => deleteBook(book.id)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                              title="ลบหนังสือ"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. EDIT BOOK METADATA MODAL */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in" id="edit-metadata-modal-overlay">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-lg sm:text-xl">แก้ไขรายละเอียดหนังสือ</h3>
              </div>
              <button
                onClick={() => setEditingBook(null)}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 font-semibold flex items-center justify-center transition-all"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={saveBookEdit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Custom cover column */}
                <div className="md:col-span-1 flex flex-col items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 self-start">ภาพหน้าปกหนังสือ</span>
                  
                  <div className="relative w-full aspect-[3/4.2] bg-slate-50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center">
                    {editCover ? (
                      <img
                        src={editCover}
                        alt="Cover preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center gap-2">
                        <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                        <span className="text-xs text-slate-400 font-medium">ไม่มีรูปหน้าปก</span>
                      </div>
                    )}
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-black/10 shadow-[1px_0_2px_rgba(0,0,0,0.15)]" />
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleEditCoverChange}
                    className="hidden"
                  />
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-all flex items-center justify-center gap-1 shadow-sm"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    เปลี่ยนรูปหน้าปก
                  </button>
                </div>

                {/* Text fields column */}
                <div className="md:col-span-2 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">ชื่อหนังสือ (Title) *</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="กรอกชื่อหนังสือ..."
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">รายละเอียดหนังสือ (Description)</label>
                    <textarea
                      rows={3}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="คำแนะนำ รายละเอียดเกี่ยวกับตัวย่อหนังสือ..."
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all resize-none leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">หมวดหมู่หนังสือ (Category)</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                      >
                        <option value="นิยาย">นิยาย</option>
                        <option value="คู่มือ">คู่มือ</option>
                        <option value="การศึกษา">การศึกษา / วิชาการ</option>
                        <option value="นิตยสาร">นิตยสาร</option>
                        <option value="การ์ตูน">การ์ตูน</option>
                        <option value="ทั่วไป">ทั่วไป</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">สถานะการเผยแพร่</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as any)}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                      >
                        <option value="published">เผยแพร่สู่คลัง (Published)</option>
                        <option value="draft">บันทึกแบบร่าง (Draft)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBook(null)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  {isSavingEdit ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{isSavingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. DYNAMIC NOTIFICATION & CONFIRMATION MODAL */}
      {alertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in" id="alert-modal-overlay">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-5 animate-scale-in">
            {/* Modal Icon based on Type */}
            <div className="flex justify-center">
              {alertModal.type === 'success' && (
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <CheckCircle className="w-8 h-8" />
                </div>
              )}
              {alertModal.type === 'error' && (
                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <AlertCircle className="w-8 h-8 animate-bounce" />
                </div>
              )}
              {alertModal.type === 'confirm' && (
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Trash2 className="w-7 h-7" />
                </div>
              )}
              {alertModal.type === 'info' && (
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <BookOpen className="w-7 h-7" />
                </div>
              )}
            </div>

            {/* Content text */}
            <div className="space-y-1.5">
              <h3 className="font-bold text-slate-900 text-lg tracking-tight leading-snug">{alertModal.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed px-2">{alertModal.message}</p>
            </div>

            {/* Actions Buttons */}
            <div className="flex items-center gap-2.5 pt-2">
              {alertModal.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => {
                      if (alertModal.onCancel) alertModal.onCancel();
                      setAlertModal(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95"
                  >
                    {alertModal.cancelText || 'ยกเลิก'}
                  </button>
                  <button
                    onClick={async () => {
                      if (alertModal.onConfirm) {
                        await alertModal.onConfirm();
                      }
                    }}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/10 transition-all active:scale-95"
                  >
                    {alertModal.confirmText || 'ยืนยัน'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (alertModal.onConfirm) alertModal.onConfirm();
                    setAlertModal(null);
                  }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95"
                >
                  {alertModal.confirmText || 'ตกลง'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
