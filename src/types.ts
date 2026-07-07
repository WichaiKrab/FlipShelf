export interface Ebook {
  id: string;
  name: string;
  pdfUrl: string;
  coverUrl?: string;
  totalPages: number;
  uploadedAt: number; // timestamp
  status: 'processing' | 'ready' | 'error';
  publishStatus?: 'draft' | 'published';
  description?: string;
  category?: string;
  error?: string;
  fileSize?: string;
}

export interface BookPage {
  pageNumber: number;
  canvas?: HTMLCanvasElement;
  rendered: boolean;
  rendering: boolean;
}
