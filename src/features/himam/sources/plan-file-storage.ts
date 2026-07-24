// Package 1A file storage boundary. The plan file is a first-class artifact,
// not a piece of metadata — it must survive reloads without ever leaving the
// device. There is no server upload path in this package, so we persist the
// raw Blob in IndexedDB and keep only an `idb://` path in the review case
// store. No public URL, no OCR, no AI, no text extraction happens here.

export const PLAN_FILE_STORE = "himam-plan-files";

export interface PlanFileStorage {
  put(sourceId: string, blob: Blob): Promise<void>;
  get(sourceId: string): Promise<Blob | null>;
  has(sourceId: string): Promise<boolean>;
  delete(sourceId: string): Promise<void>;
}

export function planStoragePath(sourceId: string): string {
  return `idb://${PLAN_FILE_STORE}/${sourceId}`;
}

export class InMemoryPlanFileStorage implements PlanFileStorage {
  private map = new Map<string, Blob>();
  async put(id: string, blob: Blob) {
    this.map.set(id, blob);
  }
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async has(id: string) {
    return this.map.has(id);
  }
  async delete(id: string) {
    this.map.delete(id);
  }
}

const DB_NAME = "himam-pkg1a";
const DB_VERSION = 1;
const STORE = "plan_files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbPlanFileStorage implements PlanFileStorage {
  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const out = fn(store);
      const value = out instanceof Promise ? await out : await idbReq(out);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return value;
    } finally {
      db.close();
    }
  }
  async put(id: string, blob: Blob) {
    await this.withStore("readwrite", (s) => s.put(blob, id));
  }
  async get(id: string) {
    const val = await this.withStore("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
    return (val ?? null) as Blob | null;
  }
  async has(id: string) {
    const val = await this.withStore(
      "readonly",
      (s) => s.getKey(id) as IDBRequest<IDBValidKey | undefined>,
    );
    return val !== undefined && val !== null;
  }
  async delete(id: string) {
    await this.withStore("readwrite", (s) => s.delete(id));
  }
}

let defaultStorage: PlanFileStorage | null = null;
export function getDefaultPlanFileStorage(): PlanFileStorage {
  if (defaultStorage) return defaultStorage;
  if (typeof indexedDB !== "undefined") {
    defaultStorage = new IndexedDbPlanFileStorage();
  } else {
    defaultStorage = new InMemoryPlanFileStorage();
  }
  return defaultStorage;
}
