const DB_NAME = 'audiobook-converter';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Tiny IndexedDB key-value store for data that must survive a reload and may
 * be binary (e.g. the cover). All calls are best effort: storage can be
 * unavailable (private browsing) and the app works without it.
 */
export const keyValue = {
  get: async <T>(key: string): Promise<T | undefined> => {
    try {
      return await run<T>('readonly', (store) => store.get(key) as IDBRequest<T>);
    } catch {
      return undefined;
    }
  },
  set: async (key: string, value: unknown): Promise<void> => {
    try {
      await run('readwrite', (store) => store.put(value, key));
    } catch {
      // Best effort.
    }
  },
  delete: async (key: string): Promise<void> => {
    try {
      await run('readwrite', (store) => store.delete(key));
    } catch {
      // Best effort.
    }
  },
};
