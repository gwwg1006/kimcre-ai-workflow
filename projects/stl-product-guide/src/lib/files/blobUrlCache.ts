import { getBlob } from '../persistence/db';

const urlCache = new Map<string, string>();

/**
 * Retrieves a cached Object URL for a given blobId from Dexie or creates a new one.
 */
export async function getBlobUrl(blobId: string): Promise<string | null> {
  if (urlCache.has(blobId)) {
    return urlCache.get(blobId)!;
  }

  const blob = await getBlob(blobId);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(blobId, url);
  return url;
}

/**
 * Revokes and cleans up cached Object URL for a specific blobId.
 */
export function revokeBlobUrl(blobId: string): void {
  const url = urlCache.get(blobId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(blobId);
  }
}

/**
 * Clears all cached Object URLs.
 */
export function clearAllBlobUrls(): void {
  for (const url of urlCache.values()) {
    URL.revokeObjectURL(url);
  }
  urlCache.clear();
}
