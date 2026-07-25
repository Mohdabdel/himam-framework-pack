// File storage boundary for both plan Blobs and Package 1B text artifacts.
// Everything stays on the device (IndexedDB) — no public URL, no upload, no
// OCR. The text-artifact store is a separate object store keyed by artifact
// id so a plan blob and its extracted text live side by side without name
// collisions.

export const PLAN_FILE_STORE = "himam-plan-files";
export const TEXT_ARTIFACT_STORE = "himam-text-artifacts";

// Kept as the public name for backward compatibility with Package 1A. Package
// 1B extends it with text-artifact APIs.
export interface PlanFileStorage {
  put(sourceId: string, blob: Blob): Promise<void>;
  get(sourceId: string): Promise<Blob | null>;
  has(sourceId: string): Promise<boolean>;
  delete(sourceId: string): Promise<void>;
  putText(artifactId: string, text: string): Promise<void>;
  getText(artifactId: string): Promise<string | null>;
  hasText(artifactId: string): Promise<boolean>;
  deleteText(artifactId: string): Promise<void>;
}

// Alias to make the wider role explicit in 1B code.
export type SourceArtifactStorage = PlanFileStorage;

export function planStoragePath(sourceId: string): string {
  return `idb://${PLAN_FILE_STORE}/${sourceId}`;
}

export function textArtifactPath(artifactId: string): string {
  return `idb://${TEXT_ARTIFACT_STORE}/${artifactId}`;
}

export class InMemoryPlanFileStorage implements PlanFileStorage {
  private map = new Map<string, Blob>();
  private textMap = new Map<string, string>();
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
  async putText(id: string, text: string) {
    this.textMap.set(id, text);
  }
  async getText(id: string) {
    return this.textMap.get(id) ?? null;
  }
  async hasText(id: string) {
    return this.textMap.has(id);
  }
  async deleteText(id: string) {
    this.textMap.delete(id);
  }
}

const DB_NAME = "himam-pkg1a";
const DB_VERSION = 2;
const STORE = "plan_files";
const TEXT_STORE = "text_artifacts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      if (!db.objectStoreNames.contains(TEXT_STORE)) {
        db.createObjectStore(TEXT_STORE);
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
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    const db = await openDb();
    try {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
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
    await this.withStore(STORE, "readwrite", (s) => s.put(blob, id));
  }
  async get(id: string) {
    const val = await this.withStore(
      STORE,
      "readonly",
      (s) => s.get(id) as IDBRequest<Blob | undefined>,
    );
    return (val ?? null) as Blob | null;
  }
  async has(id: string) {
    const val = await this.withStore(
      STORE,
      "readonly",
      (s) => s.getKey(id) as IDBRequest<IDBValidKey | undefined>,
    );
    return val !== undefined && val !== null;
  }
  async delete(id: string) {
    await this.withStore(STORE, "readwrite", (s) => s.delete(id));
  }
  async putText(id: string, text: string) {
    await this.withStore(TEXT_STORE, "readwrite", (s) => s.put(text, id));
  }
  async getText(id: string) {
    const val = await this.withStore(
      TEXT_STORE,
      "readonly",
      (s) => s.get(id) as IDBRequest<string | undefined>,
    );
    return val ?? null;
  }
  async hasText(id: string) {
    const val = await this.withStore(
      TEXT_STORE,
      "readonly",
      (s) => s.getKey(id) as IDBRequest<IDBValidKey | undefined>,
    );
    return val !== undefined && val !== null;
  }
  async deleteText(id: string) {
    await this.withStore(TEXT_STORE, "readwrite", (s) => s.delete(id));
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
