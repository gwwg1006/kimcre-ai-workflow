export interface PageLayoutInfo {
  columns: number;
  rows: number;
  pageSize: number;
}

/**
 * Fixed 6-slot (2 columns x 3 rows) layout across all item counts (1~6, 7+).
 * Guarantees 100% consistent card dimensions, image ratios, and typography.
 */
export function getOptimalLayout(_totalCount?: number): PageLayoutInfo {
  return { columns: 2, rows: 3, pageSize: 6 };
}

/**
 * Grid dimensions: Always strictly 2 columns x 3 rows.
 */
export function getConsistentGridDimensions(_totalCount?: number): { columns: number; rows: number } {
  return { columns: 2, rows: 3 };
}

// Deprecated alias for backwards compatibility
export const getPageGridDimensions = getConsistentGridDimensions;

export function paginateItems<T>(items: T[], customPageSize?: number): T[][] {
  if (!items || items.length === 0) {
    return [];
  }
  const pageSize = customPageSize || 6;
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

/**
 * Calculates responsive font size based on text length to prevent overflow in print card.
 * Font size steps: 18pt -> 16pt -> 14pt -> 12pt -> 10pt (min)
 */
export function calculateTitleFontSize(text: string): {
  fontSizePt: number;
  fontSizeClass: string;
  isTooLong: boolean;
} {
  const len = text.trim().length;

  if (len <= 15) {
    return { fontSizePt: 18, fontSizeClass: 'text-18pt', isTooLong: false };
  } else if (len <= 25) {
    return { fontSizePt: 16, fontSizeClass: 'text-16pt', isTooLong: false };
  } else if (len <= 40) {
    return { fontSizePt: 14, fontSizeClass: 'text-14pt', isTooLong: false };
  } else if (len <= 60) {
    return { fontSizePt: 12, fontSizeClass: 'text-12pt', isTooLong: false };
  } else if (len <= 80) {
    return { fontSizePt: 10, fontSizeClass: 'text-10pt', isTooLong: false };
  } else {
    return { fontSizePt: 10, fontSizeClass: 'text-10pt', isTooLong: true };
  }
}
