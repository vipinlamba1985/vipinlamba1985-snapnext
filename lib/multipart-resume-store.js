'use client';

const DB_NAME = 'snapnext-upload-resume';
const STORE = 'multipart';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'reservationId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export function loadMultipartResume(reservationId) {
  return transact('readonly', (store) => store.get(reservationId)).catch(() => null);
}

export function saveMultipartResume(state) {
  return transact('readwrite', (store) => store.put({ ...state, updatedAt: Date.now() })).catch(() => null);
}

export function clearMultipartResume(reservationId) {
  return transact('readwrite', (store) => store.delete(reservationId)).catch(() => null);
}
