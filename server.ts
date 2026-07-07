import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize server-side Firebase App to bypass browser CORS on uploads
  let serverFirebaseApp: any;
  let firebaseStorage: any;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const firebaseConfig = {
        projectId: config.projectId,
        appId: config.appId,
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId
      };
      serverFirebaseApp = initializeApp(firebaseConfig, 'ServerFirebaseApp');
      firebaseStorage = getStorage(serverFirebaseApp);
      console.log('[Server] Firebase Storage initialized successfully on the backend');
    } else {
      console.warn('[Server] firebase-applet-config.json not found, server-side storage will use local fallback');
    }
  } catch (err) {
    console.error('[Server] Failed to initialize server-side Firebase Storage:', err);
  }

  const uploadsDir = path.join('/tmp', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Multer configuration for disk-based uploads to save server memory
  const upload = multer({
    dest: uploadsDir,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB limit
    }
  });

  // Custom logging middleware
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });

  // Enable simple CORS configuration for API endpoints
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  // Server-side Upload API (Bypasses browser CORS policy for Firebase Storage uploads)
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const fileId = req.body.fileId || `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filename = `${fileId}.pdf`;

      // 1. Attempt Server-Side upload to Firebase Storage (Node.js does not enforce CORS)
      if (firebaseStorage) {
        try {
          console.log(`[Server] Uploading ${req.file.originalname} to Firebase Storage as ebooks/${filename}...`);
          const fileRef = ref(firebaseStorage, `ebooks/${filename}`);
          
          const fileBuffer = fs.readFileSync(req.file.path);
          // Convert Buffer to Uint8Array which is standard and universally supported by Firebase Web SDK uploadBytes
          const fileUint8 = new Uint8Array(fileBuffer);
          const uploadResult = await uploadBytes(fileRef, fileUint8, {
            contentType: 'application/pdf',
          });
          
          const downloadUrl = await getDownloadURL(uploadResult.ref);
          console.log(`[Server] Firebase upload complete: ${downloadUrl}`);
          
          // Clean up the temporary file
          try {
            fs.unlinkSync(req.file.path);
          } catch (cleanupErr) {
            console.warn('[Server] Failed to clean up temporary file:', cleanupErr);
          }
          
          res.json({
            success: true,
            url: downloadUrl,
            fileId,
            storageType: 'firebase'
          });
          return;
        } catch (firebaseErr: any) {
          console.error('[Server] Server-side Firebase upload failed:', firebaseErr);
          throw new Error(`ไม่สามารถอัปโหลดไฟล์ขึ้น Firebase Storage ได้: ${firebaseErr.message || firebaseErr}`);
        }
      } else {
        throw new Error('ไม่พบการตั้งค่าคอนฟิกูเรชัน Firebase บนเซิร์ฟเวอร์ กรุณาตรวจสอบไฟล์ firebase-applet-config.json');
      }
    } catch (err: any) {
      console.error('[Server] Upload handler error:', err);
      // Clean up the multer temp file if it exists and wasn't renamed or deleted
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Serve locally saved upload fallback files
  app.get('/api/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).send('Invalid filename');
      return;
    }
    const filePath = path.join('/tmp', 'uploads', filename);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.sendFile(filePath);
    } else {
      res.status(404).send('File not found');
    }
  });

  // API Proxy Endpoint to retrieve PDFs without browser CORS restrictions
  app.get('/api/pdf-proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      res.status(400).send('Missing "url" query parameter');
      return;
    }

    try {
      console.log(`[Proxy] Fetching remote document: ${targetUrl}`);
      const response = await fetch(targetUrl);
      
      if (!response.ok) {
        throw new Error(`Remote host returned status code ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'application/pdf';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for up to 1 year on the client

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(500).send('No response body available from the remote host.');
        return;
      }

      // Read chunk-by-chunk and stream immediately to the client
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: any) {
      console.error(`[Proxy] Error proxying resource:`, err);
      res.status(500).send(`Error proxying document content: ${err.message}`);
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Integrate Vite dev server or static distribution build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA Fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
