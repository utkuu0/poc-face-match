import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'face-scan-cache.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS scanned_photos (
          assetId TEXT PRIMARY KEY NOT NULL,
          faceCount INTEGER NOT NULL,
          embeddings TEXT NOT NULL,
          scannedAt INTEGER NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

interface ScannedPhotoRow {
  assetId: string;
  faceCount: number;
  embeddings: string;
  scannedAt: number;
}

export interface CachedScanResult {
  faceCount: number;
  embeddings: number[][];
}

/** Bir fotoğrafın daha önce taranıp taranmadığını kontrol eder (artımlı tarama için). */
export async function getCachedScan(assetId: string): Promise<CachedScanResult | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ScannedPhotoRow>(
    'SELECT * FROM scanned_photos WHERE assetId = ?',
    [assetId]
  );
  if (!row) return null;
  return { faceCount: row.faceCount, embeddings: JSON.parse(row.embeddings) as number[][] };
}

export async function setCachedScan(assetId: string, result: CachedScanResult): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO scanned_photos (assetId, faceCount, embeddings, scannedAt) VALUES (?, ?, ?, ?)',
    [assetId, result.faceCount, JSON.stringify(result.embeddings), Date.now()]
  );
}

export async function getScannedPhotoCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM scanned_photos');
  return row?.count ?? 0;
}

/** Test/debug amaçlı: tarama önbelleğini tamamen temizler. */
export async function clearScanCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM scanned_photos');
}
