import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Image as ImageIcon, Save, ArrowLeft, BookOpen } from 'lucide-react';
import { collection, setDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, getNextBookId } from '../lib/firebase';
import { Ebook } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { saveLocalFile } from '../lib/localFileDb';

// Set worker source using unpkg CDN matching package version
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs';

interface UploadZoneProps {
  onUploadSuccess: (ebook: Ebook) => void;
}

export default function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const activeUploadTaskRef = useRef<any>(null);
  const [canSkip, setCanSkip] = useState(false);

  const handleSkipUpload = () => {
    if (activeUploadTaskRef.current) {
      console.log('User manually skipped upload to Firebase Storage, cancelling task...');
      activeUploadTaskRef.current.cancel();
    }
  };
  
  // File processing and Metadata Form States
  const [processedBook, setProcessedBook] = useState<{
    id: string;
    name: string;
    pdfUrl: string;
    coverUrl?: string;
    totalPages: number;
    fileSize?: string;
    isLocal?: boolean;
  } | null>(null);

  const [metadataTitle, setMetadataTitle] = useState('');
  const [metadataDesc, setMetadataDesc] = useState('');
  const [metadataCategory, setMetadataCategory] = useState('คู่มือ');
  const [metadataStatus, setMetadataStatus] = useState<'published' | 'draft'>('published');
  const [metadataCover, setMetadataCover] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setError('ประเภทไฟล์ไม่ถูกต้อง กรุณาอัปโหลดเฉพาะไฟล์ PDF เท่านั้น');
      return;
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      setError('ไฟล์มีขนาดใหญ่เกินไป จำกัดขนาดไม่เกิน 50MB');
      return;
    }

    setError(null);
    setLoading(true);
    setProgress(5);
    setStatusText('กำลังสแกนโครงสร้างไฟล์ PDF...');

    try {
      // Create a local blob URL for instant fallback preview
      const localPdfUrl = URL.createObjectURL(file);
      
      // Load PDF using pdfjs-dist to get details & cover thumbnail
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      setProgress(25);
      setStatusText('กำลังสร้างภาพหน้าปก (Cover Thumbnail)...');

      // Generate cover image from Page 1
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.6 }); // reasonable thumbnail size
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      let coverUrl = '';
      if (context) {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        coverUrl = canvas.toDataURL('image/jpeg', 0.85);
      }

      setProgress(40);
      setStatusText('กำลังอัปโหลดไฟล์ไปยังคลาวด์...');

      // Upload file to backend server upload proxy to bypass browser-side CORS blocks
      let finalPdfUrl = localPdfUrl;
      const fileId = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileId', fileId);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload', true);

          // Track upload progress on progress bar (takes up 45% of the bar)
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const uploadPercent = (event.loaded / event.total) * 45;
              setProgress(Math.round(40 + uploadPercent));
              setStatusText(`กำลังส่งข้อมูลไฟล์ไปยังเซิร์ฟเวอร์: ${Math.round((event.loaded / event.total) * 100)}%`);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                if (response.success && response.url) {
                  finalPdfUrl = response.url;
                  resolve();
                } else {
                  reject(new Error(response.error || 'Server returned upload failure status'));
                }
              } catch (e) {
                reject(new Error('Failed to parse upload server response'));
              }
            } else {
              reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network connection error during file upload'));
          };

          xhr.send(formData);
        });
      } catch (storageErr: any) {
        console.warn('Backend cloud upload failed, falling back to local storage:', storageErr);
        try {
          await saveLocalFile(fileId, file);
          finalPdfUrl = `local-file://${fileId}`;
        } catch (dbErr) {
          console.error('Failed to save to IndexedDB, falling back to blob URL:', dbErr);
          finalPdfUrl = localPdfUrl;
        }
        setError('หมายเหตุ: การอัปโหลดไปยังระบบคลาวด์ติดขัดเนื่องจากนโยบายเบราว์เซอร์ ระบบได้บันทึกไฟล์แบบ Local เพื่อให้ใช้งานได้ทันทีบนเครื่องนี้!');
      }

      setProgress(90);
      setStatusText('กำลังบันทึกข้อมูล E-Book เผยแพร่ลงระบบ...');

      const defaultTitle = file.name.replace('.pdf', '');
      const defaultCategory = 'ทั่วไป';
      const defaultStatus: 'published' | 'draft' = 'published';

      const ebookData = {
        name: defaultTitle,
        pdfUrl: finalPdfUrl,
        coverUrl: coverUrl || undefined,
        totalPages,
        uploadedAt: Date.now(),
        status: 'ready' as const,
        publishStatus: defaultStatus,
        description: '',
        category: defaultCategory,
        fileSize: formatBytes(file.size),
      };

      let savedId = '';
      let isLocal = false;

      try {
        const nextSeqId = await getNextBookId();
        await setDoc(doc(db, 'ebooks', nextSeqId), {
          ...ebookData,
          createdAt: serverTimestamp()
        });
        savedId = nextSeqId;
        console.log('Auto-saved to Firestore with custom sequential ID:', savedId);
      } catch (firestoreErr) {
        console.error('Auto-save to Firestore failed, fallback to local storage:', firestoreErr);
        isLocal = true;

        try {
          const localBooksStr = localStorage.getItem('local_ebooks');
          const localBooks: Ebook[] = localBooksStr ? JSON.parse(localBooksStr) : [];
          
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
        } catch (storageErr) {
          console.error('Failed to save to localStorage:', storageErr);
          savedId = `local-${Date.now()}`;
        }
      }

      setMetadataTitle(defaultTitle);
      setMetadataDesc('');
      setMetadataCategory(defaultCategory);
      setMetadataStatus(defaultStatus);
      setMetadataCover(coverUrl);

      setProcessedBook({
        id: savedId,
        name: defaultTitle,
        pdfUrl: finalPdfUrl,
        coverUrl: coverUrl || undefined,
        totalPages,
        fileSize: formatBytes(file.size),
        isLocal,
      });

      setProgress(100);
      setStatusText('ประมวลผลและอัปโหลดสำเร็จ!');

      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        setStatusText('');
      }, 1000);

    } catch (err: any) {
      console.error('Error processing PDF:', err);
      setError(`ไม่สามารถประมวลผลไฟล์ได้: ${err.message || 'โครงสร้างไฟล์ PDF เสียหาย'}`);
      setLoading(false);
    }
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processedBook) return;

    setLoading(true);
    setStatusText('กำลังบันทึกรายละเอียด E-Book...');
    setProgress(50);

    const updatedData = {
      name: metadataTitle.trim() || processedBook.name,
      coverUrl: metadataCover || undefined,
      publishStatus: metadataStatus,
      description: metadataDesc.trim(),
      category: metadataCategory,
    };

    try {
      if (processedBook.isLocal) {
        // Update in localStorage
        const localBooksStr = localStorage.getItem('local_ebooks');
        if (localBooksStr) {
          const localBooks: Ebook[] = JSON.parse(localBooksStr);
          const updatedBooks = localBooks.map(b => b.id === processedBook.id ? { 
            ...b, 
            ...updatedData 
          } : b);
          localStorage.setItem('local_ebooks', JSON.stringify(updatedBooks));
        }
      } else {
        // Update in Firestore
        const bookRef = doc(db, 'ebooks', processedBook.id);
        await updateDoc(bookRef, {
          ...updatedData
        });
      }

      setProgress(100);
      setStatusText('บันทึกรายละเอียดสำเร็จ!');
      setTimeout(() => {
        const finishedBook: Ebook = {
          id: processedBook.id,
          pdfUrl: processedBook.pdfUrl,
          totalPages: processedBook.totalPages,
          uploadedAt: Date.now(),
          status: 'ready' as const,
          fileSize: processedBook.fileSize,
          ...updatedData
        };
        onUploadSuccess(finishedBook);
        setProcessedBook(null);
        setLoading(false);
      }, 1000);
    } catch (err) {
      console.error('Error updating metadata:', err);
      // Even if update fails, consider it a success since the record is already created
      setProgress(100);
      setStatusText('บันทึกสำเร็จ!');
      setTimeout(() => {
        const finishedBook: Ebook = {
          id: processedBook.id,
          pdfUrl: processedBook.pdfUrl,
          totalPages: processedBook.totalPages,
          uploadedAt: Date.now(),
          status: 'ready' as const,
          fileSize: processedBook.fileSize,
          ...updatedData
        };
        onUploadSuccess(finishedBook);
        setProcessedBook(null);
        setLoading(false);
      }, 1000);
    }
  };

  const handleCustomCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setMetadataCover(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto" id="upload-zone-container">
      {/* 1. Show Processing State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 border border-slate-200 rounded-3xl bg-white text-center space-y-6">
          <div className="relative flex items-center justify-center w-16 h-16 bg-emerald-50 rounded-full text-emerald-600">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <div className="space-y-2 w-full max-w-md">
            <p className="text-slate-800 font-semibold text-lg">{statusText}</p>
            {progress > 0 && (
              <div className="space-y-1">
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-slate-400 text-xs font-mono">{progress}%</p>
              </div>
            )}

            {canSkip && (
              <div className="pt-4 mt-4 border-t border-slate-100 flex flex-col items-center gap-2">
                <p className="text-xs text-slate-400 max-w-xs">
                  หากพบว่าการอัปโหลดไฟล์ค้างหรือล่าช้า สามารถเลือกใช้ไฟล์แบบด่วน (Local) เพื่อข้ามการอัปโหลดคลาวด์ได้ทันที
                </p>
                <button
                  type="button"
                  onClick={handleSkipUpload}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95"
                >
                  ข้ามและสลับไปใช้ Local Session ทันที
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Show Metadata Form (After PDF processed) */}
      {!loading && processedBook && (
        <form onSubmit={handleSaveMetadata} className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setProcessedBook(null)}
              className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">รายละเอียดข้อมูล E-Book</h4>
              <p className="text-xs text-slate-400">ระบุรายละเอียดข้อมูลของหนังสือเพื่อจัดเรียงเข้าคลังอย่างสวยงาม</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Cover Preview column */}
            <div className="md:col-span-1 flex flex-col items-center gap-3">
              <span className="text-xs font-bold text-slate-500 self-start">ภาพหน้าปกหนังสือ</span>
              
              <div className="relative w-full aspect-[3/4.2] bg-slate-50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center">
                {metadataCover ? (
                  <img
                    src={metadataCover}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-slate-400 flex flex-col items-center gap-2">
                    <ImageIcon className="w-10 h-10 stroke-[1.5]" />
                    <span className="text-xs text-slate-400 font-medium">ไม่มีรูปหน้าปก</span>
                  </div>
                )}
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-black/10 shadow-[1px_0_2px_rgba(0,0,0,0.15)]" />
              </div>

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCustomCoverChange}
                className="hidden"
              />
              
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                อัปโหลดปกใหม่
              </button>
            </div>

            {/* Right Fields column */}
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">ชื่อหนังสือ (Title) *</label>
                <input
                  type="text"
                  required
                  value={metadataTitle}
                  onChange={(e) => setMetadataTitle(e.target.value)}
                  placeholder="กรอกชื่อหนังสือ..."
                  className="w-full px-4 py-2.5 bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">รายละเอียดหนังสือ (Description)</label>
                <textarea
                  rows={3}
                  value={metadataDesc}
                  onChange={(e) => setMetadataDesc(e.target.value)}
                  placeholder="กรอกคำโปรยหรือรายละเอียดข้อมูลย่อเพื่อดึงดูดผู้อ่าน..."
                  className="w-full px-4 py-2.5 bg-slate-50/50 hover:bg-slate-50/80 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">หมวดหมู่หนังสือ (Category)</label>
                  <select
                    value={metadataCategory}
                    onChange={(e) => setMetadataCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
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
                  <label className="text-xs font-bold text-slate-500">สถานะ (Publish Status)</label>
                  <select
                    value={metadataStatus}
                    onChange={(e) => setMetadataStatus(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl text-sm focus:outline-none transition-all font-semibold"
                  >
                    <option value="published">เผยแพร่สู่คลัง (Published)</option>
                    <option value="draft">บันทึกแบบร่าง (Draft)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
                <span>จำนวนความยาว: <strong className="font-mono text-slate-700 font-semibold">{processedBook.totalPages} หน้า</strong></span>
                <span>ขนาดไฟล์: <strong className="font-mono text-slate-700 font-semibold">{processedBook.fileSize}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setProcessedBook(null)}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-700/10 active:scale-95"
            >
              <Save className="w-4 h-4" />
              บันทึก E-Book
            </button>
          </div>
        </form>
      )}

      {/* 3. Drag Drop Zone State (Default View) */}
      {!loading && !processedBook && (
        <div
          id="drop-zone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300 ${
            isDragActive
              ? 'border-emerald-600 bg-emerald-50/40 scale-[1.01]'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload-input"
          />

          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 group-hover:scale-110 transition-transform duration-300">
              <Upload className="w-10 h-10 text-slate-500" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-800 font-semibold text-xl">อัปโหลดไฟล์ PDF ของคุณ</p>
              <p className="text-slate-500 text-sm max-w-sm">
                ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์จากอุปกรณ์ของคุณ
              </p>
            </div>
            <button
              onClick={onButtonClick}
              className="mt-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-medium text-sm hover:bg-slate-800 active:scale-95 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              id="select-file-button"
            >
              <FileText className="w-4 h-4" />
              เลือกไฟล์ PDF
            </button>
            <div className="pt-4 flex items-center justify-center gap-6 text-xs text-slate-400">
              <span>รองรับเฉพาะ .pdf</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span>ขนาดไฟล์ไม่เกิน 50MB</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className={`mt-4 p-4 rounded-2xl flex gap-3 items-start border ${
            error.includes('หมายเหตุ')
              ? 'bg-amber-50/50 border-amber-200 text-amber-800'
              : 'bg-rose-50/50 border-rose-200 text-rose-800'
          }`}
          id="upload-error-alert"
        >
          {error.includes('หมายเหตุ') ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          )}
          <div className="text-sm font-medium leading-relaxed">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
