import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractDisplayName,
  validateQuantity,
  validateDisplayName,
  validateFileBeforeUpload,
  createDuplicateKey,
} from '../lib/validation/validators';
import { paginateItems, calculateTitleFontSize } from '../lib/print/pagination';
import { useProjectStore } from '../store/projectStore';
import { ProductItem } from '../types';

// Mock persistence db
vi.mock('../lib/persistence/db', () => ({
  saveProjectDraft: vi.fn().mockResolvedValue(undefined),
  deleteBlobsByItemId: vi.fn().mockResolvedValue(undefined),
  getLatestProjectDraft: vi.fn().mockResolvedValue(null),
}));

describe('Domain & Validation Utilities', () => {
  describe('extractDisplayName', () => {
    it('removes .stl extension (case-insensitive)', () => {
      expect(extractDisplayName('my_awesome_product.stl')).toBe('my awesome product');
      expect(extractDisplayName('UPPERCASE_PRODUCT.STL')).toBe('UPPERCASE PRODUCT');
    });

    it('replaces underscores with spaces and collapses whitespace', () => {
      expect(extractDisplayName('part___01__final.stl')).toBe('part 01 final');
    });

    it('trims leading and trailing whitespace', () => {
      expect(extractDisplayName('  bracket_mount  .stl')).toBe('bracket mount');
    });

    it('returns "이름 없는 상품" if name is empty after stripping', () => {
      expect(extractDisplayName('.stl')).toBe('이름 없는 상품');
      expect(extractDisplayName('____.stl')).toBe('이름 없는 상품');
    });

    it('decodes URL encoded filenames', () => {
      expect(extractDisplayName('%ED%98%B8%EB%9E%91%EC%9D%B4.stl')).toBe('호랑이');
      expect(extractDisplayName('%EC%84%9D%EA%B3%A0+%EC%9B%90%ED%98%95+4.stl')).toBe('석고 원형 4');
    });

    it('truncates to 80 characters', () => {
      const longName = 'a'.repeat(100) + '.stl';
      expect(extractDisplayName(longName).length).toBe(80);
    });
  });

  describe('validateQuantity', () => {
    it('allows integer between 1 and 999', () => {
      expect(validateQuantity(1)).toEqual({ valid: true, value: 1 });
      expect(validateQuantity(50)).toEqual({ valid: true, value: 50 });
      expect(validateQuantity(999)).toEqual({ valid: true, value: 999 });
    });

    it('clamps values below 1 or above 999', () => {
      expect(validateQuantity(0)).toEqual({ valid: false, value: 1 });
      expect(validateQuantity(-5)).toEqual({ valid: false, value: 1 });
      expect(validateQuantity(1500)).toEqual({ valid: false, value: 999 });
    });

    it('handles float and string inputs', () => {
      expect(validateQuantity('10')).toEqual({ valid: true, value: 10 });
      expect(validateQuantity('invalid')).toEqual({ valid: false, value: 1 });
      expect(validateQuantity(4.9)).toEqual({ valid: true, value: 4 });
    });
  });

  describe('validateDisplayName', () => {
    it('validates empty and oversized names', () => {
      expect(validateDisplayName('').valid).toBe(false);
      expect(validateDisplayName('   ').valid).toBe(false);
      expect(validateDisplayName('Valid Name').valid).toBe(true);
      expect(validateDisplayName('a'.repeat(81)).valid).toBe(false);
    });
  });

  describe('validateFileBeforeUpload', () => {
    it('checks file extension', () => {
      const nonStl = new File(['data'], 'test.obj', { type: 'model/obj' });
      expect(validateFileBeforeUpload(nonStl, 0, 0).errorCode).toBe('UNSUPPORTED_EXTENSION');
    });

    it('checks empty file', () => {
      const empty = new File([], 'empty.stl', { type: 'model/stl' });
      expect(validateFileBeforeUpload(empty, 0, 0).errorCode).toBe('EMPTY_FILE');
    });

    it('checks file count limit (max 20)', () => {
      const file = new File(['dummy'], 'sample.stl', { type: 'model/stl' });
      expect(validateFileBeforeUpload(file, 0, 20).errorCode).toBe('TOO_MANY_FILES');
    });
  });

  describe('createDuplicateKey', () => {
    it('creates consistent duplicate key based on name, size, lastModified', () => {
      const f1 = { name: 'Part1.stl', size: 1024, lastModified: 1700000000 };
      const f2 = { name: 'part1.STL', size: 1024, lastModified: 1700000000 };
      expect(createDuplicateKey(f1)).toBe(createDuplicateKey(f2));
    });
  });
});

describe('Pagination & Print Helpers', () => {
  describe('paginateItems', () => {
    it('handles empty items', () => {
      expect(paginateItems([])).toEqual([]);
    });

    it('paginates 1 item into 1 page', () => {
      const pages = paginateItems(['item1'], 6);
      expect(pages.length).toBe(1);
      expect(pages[0]).toEqual(['item1']);
    });

    it('paginates 6 items into 1 page', () => {
      const items = Array.from({ length: 6 }, (_, i) => `item${i + 1}`);
      const pages = paginateItems(items, 6);
      expect(pages.length).toBe(1);
      expect(pages[0].length).toBe(6);
    });

    it('paginates 7 items into 2 pages (6 + 1)', () => {
      const items = Array.from({ length: 7 }, (_, i) => `item${i + 1}`);
      const pages = paginateItems(items, 6);
      expect(pages.length).toBe(2);
      expect(pages[0].length).toBe(6);
      expect(pages[1].length).toBe(1);
    });

    it('paginates 20 items into 4 pages (6 + 6 + 6 + 2)', () => {
      const items = Array.from({ length: 20 }, (_, i) => `item${i + 1}`);
      const pages = paginateItems(items, 6);
      expect(pages.length).toBe(4);
      expect(pages[0].length).toBe(6);
      expect(pages[1].length).toBe(6);
      expect(pages[2].length).toBe(6);
      expect(pages[3].length).toBe(2);
    });
  });

  describe('calculateTitleFontSize', () => {
    it('scales font size according to length', () => {
      expect(calculateTitleFontSize('Short Name').fontSizePt).toBe(18);
      expect(calculateTitleFontSize('Medium Length Product Name').fontSizePt).toBe(14);
      expect(calculateTitleFontSize('A product name with around 50 chars for twelve pt').fontSizePt).toBe(12);
      expect(calculateTitleFontSize('a'.repeat(75)).fontSizePt).toBe(10);
      expect(calculateTitleFontSize('a'.repeat(85)).isTooLong).toBe(true);
    });
  });
});

describe('Project Store Actions', () => {
  beforeEach(() => {
    useProjectStore.getState().resetDraft();
  });

  const createDummyItem = (id: string, name: string): ProductItem => ({
    id,
    order: 0,
    source: {
      name: `${name}.stl`,
      size: 100,
      lastModified: Date.now(),
      type: 'model/stl',
      duplicateKey: `${name}_100_1`,
    },
    displayName: name,
    quantity: 1,
    status: 'ready',
    blobId: `blob-${id}`,
    thumbnailBlobId: `thumb-${id}`,
    camera: {
      position: [10, -10, 10],
      target: [0, 0, 0],
      up: [0, 0, 1],
      zoom: 1,
      preset: 'isometric',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('adds items and maintains order', () => {
    const item1 = createDummyItem('1', 'Item 1');
    const item2 = createDummyItem('2', 'Item 2');

    useProjectStore.getState().addQueuedItems([item1, item2]);
    const { items, selectedItemId } = useProjectStore.getState().project;

    expect(items.length).toBe(2);
    expect(items[0].order).toBe(0);
    expect(items[1].order).toBe(1);
    expect(selectedItemId).toBe('1');
  });

  it('updates item fields', () => {
    const item = createDummyItem('1', 'Item 1');
    useProjectStore.getState().addQueuedItems([item]);

    useProjectStore.getState().updateItem('1', { displayName: 'Updated Name', quantity: 5 });
    const updated = useProjectStore.getState().project.items[0];

    expect(updated.displayName).toBe('Updated Name');
    expect(updated.quantity).toBe(5);
  });

  it('reorders items and updates order indices', () => {
    const item1 = createDummyItem('1', 'Item 1');
    const item2 = createDummyItem('2', 'Item 2');
    const item3 = createDummyItem('3', 'Item 3');
    useProjectStore.getState().addQueuedItems([item1, item2, item3]);

    useProjectStore.getState().reorderItems('1', '3');
    const items = useProjectStore.getState().project.items;

    expect(items.map((i) => i.id)).toEqual(['2', '3', '1']);
    expect(items[0].order).toBe(0);
    expect(items[1].order).toBe(1);
    expect(items[2].order).toBe(2);
  });

  it('moves item up or down via moveItemByStep', () => {
    const item1 = createDummyItem('1', 'Item 1');
    const item2 = createDummyItem('2', 'Item 2');
    useProjectStore.getState().addQueuedItems([item1, item2]);

    useProjectStore.getState().moveItemByStep('1', 'down');
    expect(useProjectStore.getState().project.items.map((i) => i.id)).toEqual(['2', '1']);

    useProjectStore.getState().moveItemByStep('1', 'up');
    expect(useProjectStore.getState().project.items.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('removes item and selects next item or previous or null', async () => {
    const item1 = createDummyItem('1', 'Item 1');
    const item2 = createDummyItem('2', 'Item 2');
    const item3 = createDummyItem('3', 'Item 3');
    useProjectStore.getState().addQueuedItems([item1, item2, item3]);
    useProjectStore.getState().selectItem('2');

    // Removing '2' should select '3' (the next item)
    await useProjectStore.getState().removeItem('2');
    let state = useProjectStore.getState().project;
    expect(state.items.map((i) => i.id)).toEqual(['1', '3']);
    expect(state.selectedItemId).toBe('3');

    // Removing '3' (last item) should select '1' (the previous item)
    await useProjectStore.getState().removeItem('3');
    state = useProjectStore.getState().project;
    expect(state.items.map((i) => i.id)).toEqual(['1']);
    expect(state.selectedItemId).toBe('1');

    // Removing '1' should set selectedItemId to null
    await useProjectStore.getState().removeItem('1');
    state = useProjectStore.getState().project;
    expect(state.items.length).toBe(0);
    expect(state.selectedItemId).toBeNull();
  });
});
