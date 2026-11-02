import { ProductItem, ErrorCode, SourceFileMeta } from '../../types';
import {
  extractDisplayName,
  validateFileBeforeUpload,
  createDuplicateKey,
} from '../../lib/validation/validators';
import {
  parseModelFile,
  inspectModelFile,
  ModelParserResult,
} from '../../lib/model/modelParser';
import { SplitChoice, ModelInspectionResult } from '../../lib/threemf/threemfParser';
import { createPresetCameraState } from '../../lib/three/cameraFit';
import { captureEngine } from '../../lib/three/captureEngine';
import { saveBlob } from '../../lib/persistence/db';
import { useProjectStore } from '../../store/projectStore';

export interface MultiPartPrompt {
  file: File;
  meta: ModelInspectionResult;
  resolve: (choice: SplitChoice) => void;
}

interface QueueTask {
  item: ProductItem;
  file: File;
  splitChoice?: SplitChoice;
}

class UploadQueueManager {
  private queue: QueueTask[] = [];
  private activeCount = 0;
  private maxConcurrency = 2;

  public async processFiles(
    files: File[],
    onDuplicateFound?: (duplicateFiles: { file: File; key: string }[], proceed: (filesToForce: File[]) => void) => void,
    onMultiPartDetected?: (prompt: MultiPartPrompt) => void
  ): Promise<{ addedCount: number; errors: { fileName: string; message: string }[] }> {
    const store = useProjectStore.getState();
    const currentItems = store.project.items;
    let totalSize = currentItems.reduce((acc, i) => acc + i.source.size, 0);
    let totalCount = currentItems.length;

    const duplicates: { file: File; key: string }[] = [];
    const validFiles: File[] = [];
    const errors: { fileName: string; message: string }[] = [];

    const existingKeys = new Set(currentItems.map((i) => i.source.duplicateKey));

    for (const file of files) {
      const validation = validateFileBeforeUpload(file, totalSize, totalCount);
      if (!validation.valid && validation.errorCode) {
        errors.push({
          fileName: file.name,
          message: validation.errorCode,
        });
        continue;
      }

      const dupKey = createDuplicateKey({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      });

      if (existingKeys.has(dupKey)) {
        duplicates.push({ file, key: dupKey });
        continue;
      }

      existingKeys.add(dupKey);
      totalSize += file.size;
      totalCount += 1;
      validFiles.push(file);
    }

    // Process valid files (inspect for multi-part choice)
    for (const file of validFiles) {
      await this.handleSingleFileInput(file, onMultiPartDetected);
    }

    // Handle duplicates if any
    if (duplicates.length > 0 && onDuplicateFound) {
      onDuplicateFound(duplicates, async (filesToForce) => {
        for (const file of filesToForce) {
          await this.handleSingleFileInput(file, onMultiPartDetected);
        }
      });
    }

    return {
      addedCount: validFiles.length,
      errors,
    };
  }

  private async handleSingleFileInput(
    file: File,
    onMultiPartDetected?: (prompt: MultiPartPrompt) => void
  ): Promise<void> {
    const dupKey = createDuplicateKey({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });

    let splitChoice: SplitChoice = 'split-objects';
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.3mf') || lowerName.endsWith('.step') || lowerName.endsWith('.stp')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const inspection = await inspectModelFile(arrayBuffer, file.name);

        if (inspection.hasMultipleParts && onMultiPartDetected) {
          splitChoice = await new Promise<SplitChoice>((resolve) => {
            onMultiPartDetected({
              file,
              meta: inspection,
              resolve,
            });
          });
        }
      } catch {
        // Default to split-objects
      }
    }

    const task = this.createItemFromFileInput(file, dupKey, splitChoice);
    this.enqueueTasks([task]);
  }

  private createItemFromFileInput(file: File, duplicateKey: string, splitChoice: SplitChoice = 'split-objects'): QueueTask {
    const id = crypto.randomUUID();
    const blobId = crypto.randomUUID();
    const displayName = extractDisplayName(file.name);

    const lower = file.name.toLowerCase();
    let mimeType = 'model/stl';
    if (lower.endsWith('.3mf')) mimeType = 'model/3mf';
    else if (lower.endsWith('.step') || lower.endsWith('.stp')) mimeType = 'model/step';

    const sourceMeta: SourceFileMeta = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: mimeType,
      duplicateKey,
    };

    const item: ProductItem = {
      id,
      order: 0,
      source: sourceMeta,
      displayName,
      quantity: 1,
      status: 'queued',
      blobId,
      splitChoice,
      partIndex: 1,
      camera: {
        position: [100, -120, 90],
        target: [0, 0, 0],
        up: [0, 0, 1],
        zoom: 1,
        preset: 'isometric',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return { item, file, splitChoice };
  }

  private enqueueTasks(tasks: QueueTask[]): void {
    const store = useProjectStore.getState();
    store.addQueuedItems(tasks.map((t) => t.item));

    this.queue.push(...tasks);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeCount++;
      this.processSingleTask(task).finally(() => {
        this.activeCount--;
        this.drainQueue();
      });
    }
  }

  private async processSingleTask(task: QueueTask): Promise<void> {
    const { item, file, splitChoice } = task;
    const store = useProjectStore.getState();
    const projectId = store.project.id;

    if (!store.project.items.some((i) => i.id === item.id)) {
      return;
    }

    try {
      store.updateItem(item.id, { status: 'parsing' });

      let blobKind: 'stl' | '3mf' | 'step' = 'stl';
      if (item.source.type.includes('3mf')) blobKind = '3mf';
      else if (item.source.type.includes('step')) blobKind = 'step';

      // Save raw 3D file blob to Dexie
      await saveBlob(item.blobId, projectId, item.id, blobKind, file);

      const arrayBuffer = await file.arrayBuffer();
      const parsedParts: ModelParserResult[] = await parseModelFile(arrayBuffer, file.name, splitChoice || 'split-objects');

      if (parsedParts.length === 0) {
        throw new Error('EMPTY_GEOMETRY');
      }

      // 1. First Part into current item
      const firstPart = parsedParts[0];
      const cameraState = createPresetCameraState('isometric', firstPart.boundingSphereRadius, 4 / 3);

      store.updateItem(item.id, {
        status: 'rendering',
        displayName: firstPart.displayName,
        bounds: firstPart.bounds,
        triangleCount: firstPart.triangleCount,
        partIndex: 1,
        splitChoice,
      });

      const thumbnailBlob = await captureEngine.capturePNG(
        firstPart.geometry,
        cameraState,
        firstPart.boundingSphereRadius
      );
      firstPart.geometry.dispose();

      const thumbnailBlobId = crypto.randomUUID();
      await saveBlob(thumbnailBlobId, projectId, item.id, 'thumbnail', thumbnailBlob);
      store.setThumbnail(item.id, thumbnailBlobId, cameraState);

      // 2. Extra parts if split into multiple items
      if (parsedParts.length > 1) {
        const extraItems: ProductItem[] = [];

        for (let pIdx = 1; pIdx < parsedParts.length; pIdx++) {
          const extraPart = parsedParts[pIdx];
          const extraItemId = crypto.randomUUID();
          const extraCamState = createPresetCameraState('isometric', extraPart.boundingSphereRadius, 4 / 3);

          const extraItem: ProductItem = {
            id: extraItemId,
            order: store.project.items.length + pIdx,
            source: item.source,
            displayName: extraPart.displayName,
            quantity: 1,
            status: 'rendering',
            blobId: item.blobId, // Shares the same 3D blob
            partIndex: pIdx + 1,
            splitChoice,
            bounds: extraPart.bounds,
            triangleCount: extraPart.triangleCount,
            camera: extraCamState,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const extraThumbBlob = await captureEngine.capturePNG(
            extraPart.geometry,
            extraCamState,
            extraPart.boundingSphereRadius
          );
          extraPart.geometry.dispose();

          const extraThumbBlobId = crypto.randomUUID();
          await saveBlob(extraThumbBlobId, projectId, extraItemId, 'thumbnail', extraThumbBlob);
          extraItem.thumbnailBlobId = extraThumbBlobId;
          extraItem.status = 'ready';

          extraItems.push(extraItem);
        }

        if (extraItems.length > 0) {
          store.addQueuedItems(extraItems);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to process 3D model item', item.id, err);
      let errorCode: ErrorCode = 'STL_PARSE_FAILED';
      let customMsg: string | undefined;

      if (err instanceof Error) {
        if (err.message === 'EMPTY_FILE') errorCode = 'EMPTY_FILE';
        else if (err.message === 'EMPTY_GEOMETRY') errorCode = 'EMPTY_GEOMETRY';
        else if (err.message === 'RENDER_FAILED') errorCode = 'RENDER_FAILED';
        else if (err.name === 'QuotaExceededError') {
          errorCode = 'STORAGE_QUOTA';
          store.setStorageWarning('브라우저 저장 공간이 부족합니다.');
        } else {
          customMsg = err.message;
        }
      }

      store.markItemError(item.id, errorCode, customMsg);
    }
  }
}

export const uploadQueueManager = new UploadQueueManager();
