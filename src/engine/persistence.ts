import type { WorldSaveData } from './types';
import type { ModelAsset, ModelPlacement } from './modelSystem';
import type { WorldState } from './core/session';

export type EngineData = WorldState & {
  assets: ModelAsset[];
  placements: ModelPlacement[];
};
export type SaveRecord = { id: string; data: WorldSaveData };
export type SaveSummary = {
  id: string;
  name: string;
  savedAt: number;
  seed: number;
  worldGen: WorldSaveData['worldGen'];
};
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('strincube-next', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('metadata')) {
        const meta = db.createObjectStore('metadata', { keyPath: 'id' });
        const cursor = request.transaction!.objectStore('worlds').openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            const { id, data } = c.value as SaveRecord;
            meta.put(summary(id, data));
            c.continue();
          }
        };
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  name = 'worlds',
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode),
      request = run(tx.objectStore(name));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('存档写入被中止'));
    tx.onerror = () => reject(tx.error);
  });
}
function summary(id: string, data: WorldSaveData): SaveSummary {
  return { id, name: data.name, savedAt: data.savedAt, seed: data.seed, worldGen: data.worldGen };
}
async function write(id: string, data?: WorldSaveData, insertOnly = false) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['worlds', 'metadata'], 'readwrite');
    if (data) {
      const operation = insertOnly ? 'add' : 'put';
      tx.objectStore('worlds')[operation]({ id, data });
      tx.objectStore('metadata')[operation](summary(id, data));
    } else {
      tx.objectStore('worlds').delete(id);
      tx.objectStore('metadata').delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('存档写入被中止'));
    tx.onerror = () => reject(tx.error);
  });
}
export const worldSaves = {
  list: () => transaction<SaveSummary[]>('readonly', (store) => store.getAll(), 'metadata'),
  get: (id: string) => transaction<SaveRecord | undefined>('readonly', (store) => store.get(id)),
  put: (id: string, data: WorldSaveData) => write(id, data),
  insert: (id: string, data: WorldSaveData) => write(id, data, true),
  delete: (id: string) => write(id),
};
