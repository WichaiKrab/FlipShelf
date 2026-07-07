import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export interface ServerEbook {
  id: string;
  name: string;
  pdfUrl: string;
  coverUrl?: string;
  totalPages: number;
  uploadedAt: number;
  status: 'ready' | 'processing' | 'failed';
  publishStatus: 'published' | 'draft';
  description?: string;
  category: string;
  fileSize?: string;
}

// 1. Detect if PostgreSQL (Vercel Database) connection is available
const postgresUrl = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;

let pgPool: pg.Pool | null = null;
let firestoreDb: any = null;
const localDbPath = path.join('/tmp', 'ebooks_db.json');

// Initialize database
export async function initDatabase(serverFirebaseApp?: any) {
  if (postgresUrl) {
    console.log('[Database] Connecting to Vercel/PostgreSQL Database...');
    try {
      // Create a pg client/pool. We use ssl: true for Vercel/Neon DBs.
      pgPool = new pg.Pool({
        connectionString: postgresUrl,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Create table if not exists
      const client = await pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS ebooks (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          pdf_url TEXT NOT NULL,
          cover_url TEXT,
          total_pages INTEGER,
          uploaded_at BIGINT,
          status VARCHAR(50),
          publish_status VARCHAR(50),
          description TEXT,
          category VARCHAR(100),
          file_size VARCHAR(50)
        );
      `);
      client.release();
      console.log('[Database] PostgreSQL Table "ebooks" is ready');
      return 'postgres';
    } catch (pgErr) {
      console.error('[Database] Failed to connect or initialize PostgreSQL:', pgErr);
      pgPool = null;
    }
  }

  // 2. Fallback to server-side Firebase Firestore
  if (serverFirebaseApp) {
    try {
      firestoreDb = getFirestore(serverFirebaseApp, "ai-studio-ebookpdfflipbook-8b20b24a-baf8-4c50-a092-b4baf98af166");
      console.log('[Database] Fallback Firebase Firestore initialized successfully');
      return 'firestore';
    } catch (fsErr) {
      console.error('[Database] Failed to initialize fallback Firestore:', fsErr);
    }
  }

  // 3. Ultra Fallback to Local JSON file
  console.log('[Database] Fallback Local JSON file storage initialized at:', localDbPath);
  if (!fs.existsSync(localDbPath)) {
    fs.writeFileSync(localDbPath, JSON.stringify([]), 'utf8');
  }
  return 'local_json';
}

// Get all ebooks
export async function getAllEbooks(): Promise<ServerEbook[]> {
  // Try PostgreSQL
  if (pgPool) {
    try {
      const result = await pgPool.query('SELECT * FROM ebooks ORDER BY uploaded_at DESC');
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        pdfUrl: row.pdf_url,
        coverUrl: row.cover_url || undefined,
        totalPages: row.total_pages,
        uploadedAt: Number(row.uploaded_at),
        status: row.status as any,
        publishStatus: row.publish_status as any,
        description: row.description || undefined,
        category: row.category,
        fileSize: row.file_size || undefined
      }));
    } catch (err) {
      console.error('[Database] PostgreSQL getAllEbooks failed, trying other stores:', err);
    }
  }

  // Try Firestore
  if (firestoreDb) {
    try {
      const querySnapshot = await getDocs(collection(firestoreDb, 'ebooks'));
      const books: ServerEbook[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        books.push({
          id: doc.id,
          name: data.name,
          pdfUrl: data.pdfUrl,
          coverUrl: data.coverUrl,
          totalPages: data.totalPages,
          uploadedAt: data.uploadedAt || Date.now(),
          status: data.status || 'ready',
          publishStatus: data.publishStatus || 'published',
          description: data.description,
          category: data.category || 'ทั่วไป',
          fileSize: data.fileSize,
        });
      });
      // Sort desc
      return books.sort((a, b) => b.uploadedAt - a.uploadedAt);
    } catch (err) {
      console.error('[Database] Firestore getAllEbooks failed:', err);
    }
  }

  // Fallback to local JSON
  try {
    if (fs.existsSync(localDbPath)) {
      const data = fs.readFileSync(localDbPath, 'utf8');
      const books: ServerEbook[] = JSON.parse(data);
      return books.sort((a, b) => b.uploadedAt - a.uploadedAt);
    }
  } catch (err) {
    console.error('[Database] Local JSON getAllEbooks failed:', err);
  }

  return [];
}

// Get single ebook by ID
export async function getEbookById(id: string): Promise<ServerEbook | null> {
  if (pgPool) {
    try {
      const result = await pgPool.query('SELECT * FROM ebooks WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: row.id,
          name: row.name,
          pdfUrl: row.pdf_url,
          coverUrl: row.cover_url || undefined,
          totalPages: row.total_pages,
          uploadedAt: Number(row.uploaded_at),
          status: row.status as any,
          publishStatus: row.publish_status as any,
          description: row.description || undefined,
          category: row.category,
          fileSize: row.file_size || undefined
        };
      }
    } catch (err) {
      console.error('[Database] PostgreSQL getEbookById failed:', err);
    }
  }

  const all = await getAllEbooks();
  return all.find(b => b.id === id) || null;
}

// Get next sequential sequential book ID starting from 00001
export async function getNextServerBookId(): Promise<string> {
  const books = await getAllEbooks();
  let maxNum = 0;
  books.forEach((book) => {
    const id = book.id;
    if (/^\d{5}$/.test(id)) {
      const num = parseInt(id, 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  });
  const nextNum = maxNum + 1;
  return String(nextNum).padStart(5, '0');
}

// Save or Create a new Ebook
export async function saveEbook(ebook: ServerEbook): Promise<void> {
  // Try PostgreSQL
  if (pgPool) {
    try {
      await pgPool.query(`
        INSERT INTO ebooks (id, name, pdf_url, cover_url, total_pages, uploaded_at, status, publish_status, description, category, file_size)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          pdf_url = EXCLUDED.pdf_url,
          cover_url = EXCLUDED.cover_url,
          total_pages = EXCLUDED.total_pages,
          uploaded_at = EXCLUDED.uploaded_at,
          status = EXCLUDED.status,
          publish_status = EXCLUDED.publish_status,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          file_size = EXCLUDED.file_size
      `, [
        ebook.id,
        ebook.name,
        ebook.pdfUrl,
        ebook.coverUrl || null,
        ebook.totalPages,
        ebook.uploadedAt,
        ebook.status,
        ebook.publishStatus,
        ebook.description || null,
        ebook.category,
        ebook.fileSize || null
      ]);
      console.log(`[Database] Ebook ${ebook.id} saved to PostgreSQL successfully`);
      return;
    } catch (err) {
      console.error('[Database] PostgreSQL saveEbook failed, falling back:', err);
    }
  }

  // Try Firestore
  if (firestoreDb) {
    try {
      await setDoc(doc(firestoreDb, 'ebooks', ebook.id), {
        name: ebook.name,
        pdfUrl: ebook.pdfUrl,
        coverUrl: ebook.coverUrl || '',
        totalPages: ebook.totalPages,
        uploadedAt: ebook.uploadedAt,
        status: ebook.status,
        publishStatus: ebook.publishStatus,
        description: ebook.description || '',
        category: ebook.category,
        fileSize: ebook.fileSize || '',
        createdAt: new Date()
      });
      console.log(`[Database] Ebook ${ebook.id} saved to Firestore successfully`);
      return;
    } catch (err) {
      console.error('[Database] Firestore saveEbook failed:', err);
    }
  }

  // Fallback to local JSON
  try {
    let books: ServerEbook[] = [];
    if (fs.existsSync(localDbPath)) {
      books = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    }
    const index = books.findIndex(b => b.id === ebook.id);
    if (index >= 0) {
      books[index] = ebook;
    } else {
      books.push(ebook);
    }
    fs.writeFileSync(localDbPath, JSON.stringify(books, null, 2), 'utf8');
    console.log(`[Database] Ebook ${ebook.id} saved to Local JSON successfully`);
  } catch (err) {
    console.error('[Database] Local JSON saveEbook failed:', err);
    throw err;
  }
}

// Update Ebook fields
export async function updateEbook(id: string, updatedData: Partial<ServerEbook>): Promise<void> {
  // Try PostgreSQL
  if (pgPool) {
    try {
      const fields = Object.keys(updatedData);
      if (fields.length > 0) {
        // Map fields to SQL format (camelCase to snake_case)
        const fieldMappings: Record<string, string> = {
          pdfUrl: 'pdf_url',
          coverUrl: 'cover_url',
          totalPages: 'total_pages',
          uploadedAt: 'uploaded_at',
          publishStatus: 'publish_status',
          fileSize: 'file_size'
        };

        const setStatements: string[] = [];
        const values: any[] = [];
        let idx = 1;

        fields.forEach(f => {
          const sqlField = fieldMappings[f] || f;
          setStatements.push(`${sqlField} = $${idx}`);
          values.push((updatedData as any)[f]);
          idx++;
        });

        values.push(id);
        const queryStr = `UPDATE ebooks SET ${setStatements.join(', ')} WHERE id = $${idx}`;
        await pgPool.query(queryStr, values);
        console.log(`[Database] Ebook ${id} updated in PostgreSQL successfully`);
        return;
      }
    } catch (err) {
      console.error('[Database] PostgreSQL updateEbook failed, falling back:', err);
    }
  }

  // Try Firestore
  if (firestoreDb) {
    try {
      const bookRef = doc(firestoreDb, 'ebooks', id);
      const fsData: any = {};
      Object.keys(updatedData).forEach(k => {
        fsData[k] = (updatedData as any)[k];
      });
      await updateDoc(bookRef, fsData);
      console.log(`[Database] Ebook ${id} updated in Firestore successfully`);
      return;
    } catch (err) {
      console.error('[Database] Firestore updateEbook failed:', err);
    }
  }

  // Fallback to local JSON
  try {
    if (fs.existsSync(localDbPath)) {
      const books: ServerEbook[] = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      const index = books.findIndex(b => b.id === id);
      if (index >= 0) {
        books[index] = { ...books[index], ...updatedData };
        fs.writeFileSync(localDbPath, JSON.stringify(books, null, 2), 'utf8');
        console.log(`[Database] Ebook ${id} updated in Local JSON successfully`);
      }
    }
  } catch (err) {
    console.error('[Database] Local JSON updateEbook failed:', err);
    throw err;
  }
}

// Delete Ebook
export async function deleteEbook(id: string): Promise<void> {
  // Try PostgreSQL
  if (pgPool) {
    try {
      await pgPool.query('DELETE FROM ebooks WHERE id = $1', [id]);
      console.log(`[Database] Ebook ${id} deleted from PostgreSQL successfully`);
      return;
    } catch (err) {
      console.error('[Database] PostgreSQL deleteEbook failed, falling back:', err);
    }
  }

  // Try Firestore
  if (firestoreDb) {
    try {
      const bookRef = doc(firestoreDb, 'ebooks', id);
      await deleteDoc(bookRef);
      console.log(`[Database] Ebook ${id} deleted from Firestore successfully`);
      return;
    } catch (err) {
      console.error('[Database] Firestore deleteEbook failed:', err);
    }
  }

  // Fallback to local JSON
  try {
    if (fs.existsSync(localDbPath)) {
      const books: ServerEbook[] = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      const filtered = books.filter(b => b.id !== id);
      fs.writeFileSync(localDbPath, JSON.stringify(filtered, null, 2), 'utf8');
      console.log(`[Database] Ebook ${id} deleted from Local JSON successfully`);
    }
  } catch (err) {
    console.error('[Database] Local JSON deleteEbook failed:', err);
    throw err;
  }
}
