import Dexie, { type EntityTable } from 'dexie';
import { ProjectDraft } from '../../types';

export interface StoredProject {
  id: string;
  schemaVersion: 1;
  serializedProject: string;
  updatedAt: string;
}

export interface StoredBlob {
  id: string;
  projectId: string;
  itemId: string;
  kind: 'stl' | '3mf' | 'step' | 'thumbnail';
  blob: Blob;
  createdAt: string;
}

const db = new Dexie('STLProductGuideDB') as Dexie & {
  projects: EntityTable<StoredProject, 'id'>;
  blobs: EntityTable<StoredBlob, 'id'>;
};

// Schema definition
db.version(1).stores({
  projects: 'id, schemaVersion, updatedAt',
  blobs: 'id, projectId, itemId, kind, createdAt',
});

export { db };

// Helper DB operations
export async function saveProjectDraft(draft: ProjectDraft): Promise<void> {
  try {
    await db.projects.put({
      id: draft.id,
      schemaVersion: 1,
      serializedProject: JSON.stringify(draft),
      updatedAt: draft.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      const quotaErr = new Error('STORAGE_QUOTA');
      quotaErr.name = 'QuotaExceededError';
      throw quotaErr;
    }
    throw error;
  }
}

export async function getLatestProjectDraft(): Promise<ProjectDraft | null> {
  try {
    const latest = await db.projects.orderBy('updatedAt').reverse().first();
    if (!latest) return null;
    return JSON.parse(latest.serializedProject) as ProjectDraft;
  } catch {
    return null;
  }
}

export async function saveBlob(
  id: string,
  projectId: string,
  itemId: string,
  kind: 'stl' | '3mf' | 'step' | 'thumbnail',
  blob: Blob
): Promise<void> {
  try {
    await db.blobs.put({
      id,
      projectId,
      itemId,
      kind,
      blob,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      const quotaErr = new Error('STORAGE_QUOTA');
      quotaErr.name = 'QuotaExceededError';
      throw quotaErr;
    }
    throw error;
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  try {
    const record = await db.blobs.get(id);
    return record ? record.blob : null;
  } catch {
    return null;
  }
}

export async function deleteBlob(id: string): Promise<void> {
  try {
    await db.blobs.delete(id);
  } catch (e) {
    console.error('Failed to delete blob', id, e);
  }
}

export async function deleteBlobsByItemId(itemId: string): Promise<void> {
  try {
    const records = await db.blobs.where('itemId').equals(itemId).toArray();
    const ids = records.map((r) => r.id);
    await db.blobs.bulkDelete(ids);
  } catch (e) {
    console.error('Failed to delete blobs for item', itemId, e);
  }
}

export async function clearAllProjectData(): Promise<void> {
  try {
    await db.projects.clear();
    await db.blobs.clear();
  } catch (e) {
    console.error('Failed to clear database', e);
  }
}
