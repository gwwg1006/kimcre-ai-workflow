import { create } from 'zustand';
import {
  ProjectDraft,
  ProductItem,
  PrintSettings,
  CameraState,
  ErrorCode,
  ERROR_MESSAGES,
} from '../types';
import { getTodayDateString } from '../lib/validation/validators';
import { saveProjectDraft, deleteBlobsByItemId } from '../lib/persistence/db';

export function createDefaultPrintSettings(): PrintSettings {
  return {
    paper: 'A4',
    orientation: 'portrait',
    columns: 2,
    rows: 3,
    pageMarginMm: 10,
    cardGapMm: 4,
    showOriginalFilename: false,
    showQuantity: true,
  };
}

export function createDefaultProject(): ProjectDraft {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    documentTitle: '상품 안내서',
    customerOrOrderName: '',
    shippingDate: getTodayDateString(),
    companyName: '',
    selectedItemId: null,
    globalShadingMode: 'technical',
    globalColorHex: 0xdde3eb,
    globalShowEdges: true,
    items: [],
    printSettings: createDefaultPrintSettings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export interface ProjectStoreState {
  project: ProjectDraft;
  isLoading: boolean;
  storageWarning: string | null;

  // Actions
  createNewProject: () => void;
  updateProjectMeta: (
    patch: Partial<
      Pick<
        ProjectDraft,
        | 'documentTitle'
        | 'customerOrOrderName'
        | 'shippingDate'
        | 'companyName'
        | 'globalShadingMode'
        | 'globalColorHex'
        | 'globalShowEdges'
      >
    >
  ) => void;
  updatePrintSettings: (patch: Partial<PrintSettings>) => void;
  addQueuedItems: (items: ProductItem[]) => void;
  updateItem: (id: string, patch: Partial<ProductItem>) => void;
  selectItem: (id: string | null) => void;
  reorderItems: (activeId: string, overId: string) => void;
  moveItemByStep: (id: string, direction: 'up' | 'down') => void;
  removeItem: (id: string) => Promise<void>;
  markItemError: (id: string, errorCode: ErrorCode, customMsg?: string) => void;
  setThumbnail: (
    id: string,
    thumbnailBlobId: string,
    cameraState: CameraState,
    shadingMode?: 'technical' | 'clay' | 'metallic',
    showEdges?: boolean,
    colorHex?: number
  ) => void;
  batchUpdateThumbnails: (
    updates: {
      id: string;
      thumbnailBlobId: string;
      camera: CameraState;
      shadingMode?: 'technical' | 'clay' | 'metallic';
      showEdges?: boolean;
      colorHex?: number;
    }[]
  ) => void;
  restoreDraft: (draft: ProjectDraft) => void;
  resetDraft: () => void;
  setStorageWarning: (msg: string | null) => void;
  setIsLoading: (loading: boolean) => void;
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSave(getProject: () => ProjectDraft, setWarning: (msg: string | null) => void) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(async () => {
    try {
      const project = getProject();
      await saveProjectDraft(project);
      setWarning(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        setWarning(ERROR_MESSAGES.STORAGE_QUOTA);
      } else {
        console.error('Auto save failed', err);
      }
    }
  }, 800);
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: createDefaultProject(),
  isLoading: false,
  storageWarning: null,

  setIsLoading: (loading: boolean) => set({ isLoading: loading }),

  setStorageWarning: (msg: string | null) => set({ storageWarning: msg }),

  createNewProject: () => {
    const newProj = createDefaultProject();
    set({ project: newProj, storageWarning: null });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  updateProjectMeta: (patch) => {
    set((state) => {
      const updated: ProjectDraft = {
        ...state.project,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return { project: updated };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  updatePrintSettings: (patch) => {
    set((state) => {
      const updated: ProjectDraft = {
        ...state.project,
        printSettings: {
          ...state.project.printSettings,
          ...patch,
        },
        updatedAt: new Date().toISOString(),
      };
      return { project: updated };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  addQueuedItems: (newItems) => {
    set((state) => {
      const startOrder = state.project.items.length;
      const indexed = newItems.map((item, idx) => ({
        ...item,
        order: startOrder + idx,
        shadingMode: item.shadingMode || state.project.globalShadingMode || 'technical',
        colorHex: item.colorHex || state.project.globalColorHex || 0xdde3eb,
        showEdges: item.showEdges !== undefined ? item.showEdges : (state.project.globalShowEdges !== false),
      }));
      const updatedItems = [...state.project.items, ...indexed];
      const nextSelected = state.project.selectedItemId || (updatedItems.length > 0 ? updatedItems[0].id : null);

      return {
        project: {
          ...state.project,
          items: updatedItems,
          selectedItemId: nextSelected,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  updateItem: (id, patch) => {
    set((state) => {
      const updatedItems = state.project.items.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item
      );
      return {
        project: {
          ...state.project,
          items: updatedItems,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  selectItem: (id) => {
    set((state) => ({
      project: {
        ...state.project,
        selectedItemId: id,
      },
    }));
  },

  reorderItems: (activeId, overId) => {
    if (activeId === overId) return;
    set((state) => {
      const items = [...state.project.items];
      const oldIndex = items.findIndex((i) => i.id === activeId);
      const newIndex = items.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || newIndex < 0) return state;

      const [movedItem] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, movedItem);

      const reordered = items.map((item, idx) => ({
        ...item,
        order: idx,
      }));

      return {
        project: {
          ...state.project,
          items: reordered,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  moveItemByStep: (id, direction) => {
    set((state) => {
      const items = [...state.project.items];
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return state;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return state;

      const [movedItem] = items.splice(index, 1);
      items.splice(targetIndex, 0, movedItem);

      const reordered = items.map((item, idx) => ({
        ...item,
        order: idx,
      }));

      return {
        project: {
          ...state.project,
          items: reordered,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  removeItem: async (id) => {
    const { project } = get();
    const index = project.items.findIndex((item) => item.id === id);
    if (index === -1) return;

    let nextSelectedId: string | null = null;
    if (project.selectedItemId === id) {
      if (project.items.length > 1) {
        if (index < project.items.length - 1) {
          nextSelectedId = project.items[index + 1].id;
        } else {
          nextSelectedId = project.items[index - 1].id;
        }
      }
    } else {
      nextSelectedId = project.selectedItemId;
    }

    const filtered = project.items.filter((item) => item.id !== id);
    const reordered = filtered.map((item, idx) => ({
      ...item,
      order: idx,
    }));

    set({
      project: {
        ...project,
        items: reordered,
        selectedItemId: nextSelectedId,
        updatedAt: new Date().toISOString(),
      },
    });

    await deleteBlobsByItemId(id);
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  markItemError: (id, errorCode, customMsg) => {
    set((state) => {
      const msg = customMsg || ERROR_MESSAGES[errorCode] || '오류가 발생했습니다.';
      const updatedItems = state.project.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'error' as const,
              errorCode,
              errorMessage: msg,
              updatedAt: new Date().toISOString(),
            }
          : item
      );
      return {
        project: {
          ...state.project,
          items: updatedItems,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  setThumbnail: (id, thumbnailBlobId, cameraState, shadingMode, showEdges, colorHex) => {
    set((state) => {
      const updatedItems = state.project.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'ready' as const,
              thumbnailBlobId,
              camera: cameraState,
              shadingMode: shadingMode || item.shadingMode,
              showEdges: showEdges !== undefined ? showEdges : item.showEdges,
              colorHex: colorHex !== undefined ? colorHex : item.colorHex,
              updatedAt: new Date().toISOString(),
            }
          : item
      );
      return {
        project: {
          ...state.project,
          items: updatedItems,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  batchUpdateThumbnails: (updates) => {
    set((state) => {
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      const updatedItems = state.project.items.map((item) => {
        const u = updateMap.get(item.id);
        if (u) {
          return {
            ...item,
            status: 'ready' as const,
            thumbnailBlobId: u.thumbnailBlobId,
            camera: u.camera,
            shadingMode: u.shadingMode || item.shadingMode,
            showEdges: u.showEdges !== undefined ? u.showEdges : item.showEdges,
            colorHex: u.colorHex !== undefined ? u.colorHex : item.colorHex,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });

      return {
        project: {
          ...state.project,
          items: updatedItems,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    scheduleAutoSave(() => get().project, (msg) => set({ storageWarning: msg }));
  },

  restoreDraft: (draft) => {
    set({
      project: draft,
      storageWarning: null,
      isLoading: false,
    });
  },

  resetDraft: () => {
    const newProj = createDefaultProject();
    set({
      project: newProj,
      storageWarning: null,
      isLoading: false,
    });
  },
}));
