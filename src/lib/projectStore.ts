import type { ColorAnalysis, ProcessedResult, Recommendations } from "./imageProcessing";
import type { StudioSettings } from "@/contexts/StudioContext";

/** IndexedDB preserves File, ImageData, Maps and typed arrays by structured cloning. */
export interface StoredProject {
  id: string;
  name: string;
  timestamp: number;
  imageFile: File;
  sourceType?: "vector" | "raster";
  settings: StudioSettings;
  analysis?: ColorAnalysis;
  recommendations?: Recommendations;
  result: ProcessedResult;
}
export type SavedProjectSummary = Pick<StoredProject, "id" | "name" | "timestamp">;

const DATABASE_NAME = "paint-by-numbers-studio";
const STORE_NAME = "projects";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(version?: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = version == null
      ? indexedDB.open(DATABASE_NAME)
      : indexedDB.open(DATABASE_NAME, version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Older or partially initialized databases must be upgraded, not erased.
        const nextVersion = db.version + 1;
        db.close();
        void openDatabase(nextVersion).then(resolve, reject);
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Impossible d’ouvrir le stockage local."));
    request.onblocked = () => reject(new Error("Fermez les autres onglets du studio puis réessayez."));
  });
}
function getDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch(error => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function perform<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await getDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error ?? new Error("Erreur du stockage local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Enregistrement interrompu."));
  });
}

export async function saveStoredProject(project: StoredProject): Promise<void> {
  await perform("readwrite", store => store.put(project));
}

export async function loadStoredProject(id: string): Promise<StoredProject | null> {
  return (await perform<StoredProject | undefined>("readonly", store => store.get(id))) ?? null;
}

export async function listStoredProjects(): Promise<SavedProjectSummary[]> {
  const projects = await perform<StoredProject[]>("readonly", store => store.getAll());
  return projects.map(({ id, name, timestamp }) => ({ id, name, timestamp }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteStoredProject(id: string): Promise<void> {
  await perform("readwrite", store => store.delete(id));
}
