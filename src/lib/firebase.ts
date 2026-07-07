import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: "rational-theater-9tpfc",
  appId: "1:793631775824:web:03403b416a3155d4e3c555",
  apiKey: "AIzaSyCCFrLjS3cxF4IMnKDvOIs1F61rscC-iQQ",
  authDomain: "rational-theater-9tpfc.firebaseapp.com",
  storageBucket: "rational-theater-9tpfc.firebasestorage.app",
  messagingSenderId: "793631775824"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID
const db = getFirestore(app, "ai-studio-ebookpdfflipbook-8b20b24a-baf8-4c50-a092-b4baf98af166");

// Initialize Storage
const storage = getStorage(app);

// Helper to get next sequential 5-digit book ID starting from 00001
async function getNextBookId(): Promise<string> {
  try {
    const querySnapshot = await getDocs(collection(db, 'ebooks'));
    let maxNum = 0;
    querySnapshot.forEach((doc) => {
      const id = doc.id;
      if (/^\d{5}$/.test(id)) {
        const num = parseInt(id, 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    });
    const nextNum = maxNum + 1;
    return String(nextNum).padStart(5, '0');
  } catch (err) {
    console.error('Error getting next book ID, using fallback 00001:', err);
    return '00001';
  }
}

export { app, db, storage, getNextBookId };
