import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  BookOpen, 
  Loader2, 
  ChevronFirst, 
  ChevronLast, 
  AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { Ebook } from '../types';
import { storage } from '../lib/firebase';
import { ref as storageRef, getBlob } from 'firebase/storage';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs';

interface FlipbookReaderProps {
  ebook: Ebook;
  onClose: () => void;
  isAdminMode?: boolean;
}

export default function FlipbookReader({ ebook, onClose, isAdminMode }: FlipbookReaderProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Navigation states
  const [currentPage, setCurrentPage] = useState(1); // 1-indexed
  const [isMobile, setIsMobile] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [animating, setAnimating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Detect responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync manual page input string with current page
  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  // Load PDF document on mount
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loadPDF = async () => {
      try {
        let pdf;
        const isFirebaseStorage = ebook.pdfUrl.includes('firebasestorage.googleapis.com') || ebook.pdfUrl.startsWith('gs://');

        if (isFirebaseStorage) {
          try {
            console.log('Loading PDF from Firebase Storage via SDK getBlob...');
            const fileRef = storageRef(storage, ebook.pdfUrl);
            const blob = await getBlob(fileRef);
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
            pdf = await loadingTask.promise;
          } catch (sdkErr) {
            console.error('Firebase Storage SDK load failed, falling back to direct load/proxy:', sdkErr);
          }
        }

        if (!pdf) {
          try {
            // Attempt 1: Direct load
            const loadingTask = pdfjsLib.getDocument({ url: ebook.pdfUrl });
            pdf = await loadingTask.promise;
          } catch (directErr) {
            console.warn('Direct PDF load failed, trying CORS proxy 1 (corsproxy.io):', directErr);
            if (ebook.pdfUrl.startsWith('http')) {
              try {
                // Attempt 2: CORS proxy 1 (corsproxy.io)
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(ebook.pdfUrl)}`;
                const loadingTask = pdfjsLib.getDocument({ url: proxyUrl });
                pdf = await loadingTask.promise;
              } catch (proxy1Err) {
                console.warn('CORS proxy 1 failed, trying CORS proxy 2 (allorigins):', proxy1Err);
                try {
                  // Attempt 3: CORS proxy 2 (allorigins)
                  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ebook.pdfUrl)}`;
                  const loadingTask = pdfjsLib.getDocument({ url: proxyUrl });
                  pdf = await loadingTask.promise;
                } catch (proxy2Err) {
                  console.error('All PDF loading strategies failed:', proxy2Err);
                  throw proxy2Err;
                }
              }
            } else {
              throw directErr;
            }
          }
        }

        if (active) {
          setPdfDoc(pdf);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Error rendering PDF:', err);
        if (active) {
          setError('ไม่สามารถเปิดไฟล์เอกสารนี้ได้ เนื่องจากไฟล์ชำรุดหรือลิงก์เข้าถึงไม่ถูกต้อง');
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      active = false;
    };
  }, [ebook.pdfUrl]);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Navigation handlers
  const totalPages = pdfDoc ? pdfDoc.numPages : ebook.totalPages;

  const goToPage = (page: number) => {
    if (!pdfDoc || animating) return;
    const targetPage = Math.max(1, Math.min(page, totalPages));
    if (targetPage === currentPage) return;

    setFlipDirection(targetPage > currentPage ? 'next' : 'prev');
    setAnimating(true);
    setCurrentPage(targetPage);
    setTimeout(() => setAnimating(false), 450); // duration of flip animation
  };

  const handleNext = () => {
    if (!pdfDoc) return;
    if (isMobile) {
      if (currentPage < totalPages) goToPage(currentPage + 1);
    } else {
      // In double-page, page 1 is cover (alone). Next from 1 goes to page 2 (which displays 2 & 3)
      if (currentPage === 1) {
        goToPage(2);
      } else {
        const nextTarget = currentPage + 2;
        if (nextTarget <= totalPages) {
          goToPage(nextTarget);
        } else if (currentPage % 2 === 0 && currentPage + 1 === totalPages) {
          // If on odd page-count and we are displaying the last spread
        }
      }
    }
  };

  const handlePrev = () => {
    if (!pdfDoc) return;
    if (isMobile) {
      if (currentPage > 1) goToPage(currentPage - 1);
    } else {
      if (currentPage === 2 || currentPage === 3) {
        goToPage(1);
      } else if (currentPage > 3) {
        goToPage(currentPage - 2);
      }
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, isMobile, pdfDoc, isFullscreen]);

  // Touch Swipe navigation for Mobile/Tablet
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) { // minimum threshold
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartX.current = null;
  };

  // Double-page setup: Left page number and Right page number
  const getSpreadPages = (): { left: number | null; right: number | null } => {
    if (isMobile) {
      return { left: null, right: currentPage };
    }
    
    if (currentPage === 1) {
      // Cover page: left side is empty
      return { left: null, right: 1 };
    }

    // Standard double pages. Even is on left, Odd is on right.
    const leftPage = currentPage % 2 === 0 ? currentPage : currentPage - 1;
    const rightPage = leftPage + 1;

    return {
      left: leftPage <= totalPages ? leftPage : null,
      right: rightPage <= totalPages ? rightPage : null
    };
  };

  const { left: leftPageNum, right: rightPageNum } = getSpreadPages();

  // Page input submission
  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(pageInput);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      goToPage(val);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col bg-[#FAF8F5] select-none text-slate-800 ${
        isFullscreen ? 'p-0' : 'p-0'
      }`}
      id="flipbook-reader-modal"
    >
      {/* Top Header/Toolbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 bg-white/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-xl text-emerald-800">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 tracking-tight text-sm sm:text-base line-clamp-1">{ebook.name}</h1>
            <p className="text-xs text-slate-400 font-medium">ความยาว {totalPages} หน้า • {ebook.fileSize || 'N/A'}</p>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:scale-102 active:scale-98"
          id="close-reader-button"
        >
          กลับหน้าหลัก
        </button>
      </header>

      {/* Main Workspace Stage */}
      <main 
        className="flex-1 overflow-hidden relative flex items-center justify-center p-4 sm:p-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
            <p className="text-sm font-medium animate-pulse">กำลังดาวน์โหลดและเรนเดอร์เอกสาร PDF...</p>
          </div>
        ) : error ? (
          <div className="max-w-md text-center p-6 bg-white border border-rose-100 rounded-3xl shadow-xl flex flex-col items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-full">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-lg text-slate-900">เกิดข้อผิดพลาด</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 bg-slate-900 text-white font-medium rounded-xl text-sm hover:bg-slate-800 transition-all"
            >
              กลับสู่หน้าหลัก
            </button>
          </div>
        ) : (
          /* Book Layout Window */
          <div 
            className="relative flex items-center justify-center w-full h-full transition-transform duration-300"
            style={{ transform: `scale(${zoomScale})` }}
            id="book-canvas-stage"
          >
            {/* The Book Shell */}
            <div 
              className={`relative flex items-stretch select-none ${
                isMobile ? 'w-[85vw] max-w-[450px] aspect-[1/1.4]' : 'w-[90vw] max-w-[1000px] aspect-[1.4/1]'
              } bg-white rounded-r-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-slate-200/50`}
              style={{ perspective: 1500 }}
              id="book-physical-body"
            >
              {/* Left Side Shadow / Crease */}
              {!isMobile && (
                <div className="absolute top-0 bottom-0 left-1/2 w-8 -ml-4 z-10 pointer-events-none bg-gradient-to-r from-transparent via-black/10 to-transparent" />
              )}
              {/* Soft Page Edge Shadows */}
              <div className="absolute top-0 bottom-0 left-0 w-3 bg-gradient-to-r from-black/5 to-transparent pointer-events-none" />
              <div className="absolute top-0 bottom-0 right-0 w-3 bg-gradient-to-l from-black/5 to-transparent pointer-events-none" />

              {/* Spread Rendering */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentPage}-${isMobile}`}
                  initial={{ 
                    opacity: 0, 
                    rotateY: flipDirection === 'next' ? 25 : -25,
                    scale: 0.98
                  }}
                  animate={{ 
                    opacity: 1, 
                    rotateY: 0,
                    scale: 1
                  }}
                  exit={{ 
                    opacity: 0, 
                    rotateY: flipDirection === 'next' ? -25 : 25,
                    scale: 0.98
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="flex w-full h-full"
                >
                  {/* LEFT PAGE (Only on Desktop) */}
                  {!isMobile && (
                    <div className="flex-1 bg-[#fdfdfd] border-r border-slate-100 rounded-l-2xl relative overflow-hidden shadow-[inset_-20px_0_30px_rgba(0,0,0,0.02)] flex flex-col justify-between p-2">
                      {leftPageNum ? (
                        <div className="w-full h-full flex flex-col justify-between">
                          {/* Inner page container */}
                          <div className="flex-1 flex items-center justify-center overflow-hidden">
                            <PageCanvas 
                              pdfDoc={pdfDoc} 
                              pageNumber={leftPageNum} 
                            />
                          </div>
                          {/* Page Number footer */}
                          <div className="text-center text-[10px] text-slate-400 font-mono py-1 select-none">
                            {leftPageNum}
                          </div>
                        </div>
                      ) : (
                        /* Empty side for front cover */
                        <div className="w-full h-full bg-[#FAF8F5]/40 flex items-center justify-center text-slate-300">
                          <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center font-serif text-lg">
                            •
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* RIGHT PAGE (Visible on desktop & mobile) */}
                  <div className="flex-1 bg-[#fdfdfd] rounded-r-2xl relative overflow-hidden shadow-[inset_20px_0_30px_rgba(0,0,0,0.02)] flex flex-col justify-between p-2">
                    {rightPageNum ? (
                      <div className="w-full h-full flex flex-col justify-between">
                        {/* Inner page container */}
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                          <PageCanvas 
                            pdfDoc={pdfDoc} 
                            pageNumber={rightPageNum} 
                          />
                        </div>
                        {/* Page Number footer */}
                        <div className="text-center text-[10px] text-slate-400 font-mono py-1 select-none">
                          {rightPageNum}
                        </div>
                      </div>
                    ) : (
                      /* Empty side (for last spread on even pages count) */
                      <div className="w-full h-full bg-[#FAF8F5]/40 flex items-center justify-center text-slate-300">
                        <div className="w-12 h-12 rounded-full border border-slate-200 flex items-center justify-center font-serif text-lg">
                          •
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Quick Hover Navigation Flags (Desktop only) */}
            {!isMobile && (
              <>
                <button
                  onClick={handlePrev}
                  disabled={currentPage <= 1}
                  className="absolute -left-20 top-1/2 -translate-y-1/2 p-4 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-full shadow-lg border border-slate-200/60 transition-all hover:scale-110 active:scale-95 group"
                  id="prev-page-button-stage"
                >
                  <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentPage >= totalPages || (currentPage % 2 === 0 && currentPage + 1 >= totalPages)}
                  className="absolute -right-20 top-1/2 -translate-y-1/2 p-4 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-full shadow-lg border border-slate-200/60 transition-all hover:scale-110 active:scale-95 group"
                  id="next-page-button-stage"
                >
                  <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* Reader Control Toolbar */}
      <footer className="shrink-0 p-4 border-t border-slate-200/60 bg-white flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5" id="reader-navigation-footer-buttons">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage <= 1}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-slate-600 transition-all"
            title="หน้าแรกสุด"
          >
            <ChevronFirst className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1}
            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-slate-700 font-medium text-xs sm:text-sm transition-all flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>ย้อนกลับ</span>
          </button>

          {/* Page Counter */}
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2 px-3 mx-1 py-1 bg-slate-50 border border-slate-200/80 rounded-xl">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-10 text-center bg-transparent focus:outline-none font-mono text-sm font-semibold text-slate-800"
            />
            <span className="text-xs text-slate-400 font-medium">/</span>
            <span className="text-sm text-slate-500 font-semibold font-mono pr-1">{totalPages}</span>
          </form>

          <button
            onClick={handleNext}
            disabled={pdfDoc ? (isMobile ? currentPage >= totalPages : (currentPage >= totalPages || (currentPage % 2 === 0 && currentPage + 1 >= totalPages))) : true}
            className="px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:pointer-events-none rounded-xl font-medium text-xs sm:text-sm transition-all flex items-center gap-1"
          >
            <span>ถัดไป</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-slate-600 transition-all"
            title="หน้าสุดท้าย"
          >
            <ChevronLast className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* View / Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom In/Out */}
          <div className="flex items-center bg-slate-50 border border-slate-200/50 rounded-xl p-1 gap-1">
            <button
              onClick={() => setZoomScale(prev => Math.max(0.6, prev - 0.15))}
              className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-700 transition-all"
              title="ซูมออก"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-600 font-mono w-14 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale(prev => Math.min(1.75, prev + 0.15))}
              className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-700 transition-all"
              title="ซูมเข้า"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoomScale !== 1.0 && (
              <button
                onClick={() => setZoomScale(1.0)}
                className="p-1.5 hover:bg-white rounded-lg text-rose-500 transition-all border-l border-slate-200/60"
                title="รีเซ็ตการซูม"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 text-slate-600 rounded-xl transition-all"
            title={isFullscreen ? "ออกจากเต็มจอ" : "แสดงผลเต็มจอ"}
          >
            {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
          </button>
        </div>
      </footer>
    </div>
  );
}

/* Individual Page Canvas Component with optimization */
interface PageCanvasProps {
  pdfDoc: any;
  pageNumber: number;
}

function PageCanvas({ pdfDoc, pageNumber }: PageCanvasProps) {
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    
    const renderPage = async () => {
      if (!pdfDoc || !canvasRef.current) return;

      // Cancel ongoing render if any
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
      }

      setRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        
        // Calculate dynamic scale matching physical pixel density
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (canvas && context && active) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          };

          const renderTask = page.render(renderContext);
          renderTaskRef.current = renderTask;

          await renderTask.promise;
          
          if (active) {
            setRendering(false);
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNumber} rendering error:`, err);
        }
        if (active) {
          setRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNumber]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden p-1 select-none">
      {rendering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        className="max-w-full max-h-full object-contain rounded shadow-sm border border-slate-100"
      />
    </div>
  );
}
