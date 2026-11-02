import { ErrorCode } from '../../types';

export const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_TOTAL_PROJECT_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_FILE_COUNT = 20;

export function extractDisplayName(filename: string): string {
  // 0. Decode URL encoded strings if any (e.g. %EB%AC%B8)
  let name = filename;
  try {
    name = decodeURIComponent(filename);
  } catch {
    name = filename;
  }

  // 1. Remove trailing .stl, .3mf, .step, .stp (case-insensitive)
  name = name.replace(/\.(stl|3mf|step|stp)$/i, '');
  // 2. Replace '_' and '+' with space
  name = name.replace(/[_+]/g, ' ');
  // 3. Collapse multiple spaces into one
  name = name.replace(/\s+/g, ' ');
  // 4. Trim
  name = name.trim();
  // 5. Length limit (max 80 chars)
  if (name.length > 80) {
    name = name.slice(0, 80).trim();
  }
  // 6. Default if empty
  if (!name) {
    return '이름 없는 상품';
  }
  return name;
}

export function validateQuantity(qty: unknown): { valid: boolean; value: number } {
  const num = typeof qty === 'number' ? qty : parseInt(String(qty), 10);
  if (isNaN(num)) {
    return { valid: false, value: 1 };
  }
  const integerVal = Math.floor(num);
  if (integerVal < 1) {
    return { valid: false, value: 1 };
  }
  if (integerVal > 999) {
    return { valid: false, value: 999 };
  }
  return { valid: true, value: integerVal };
}

export function validateDisplayName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: '상품명을 입력해주세요.' };
  }
  if (trimmed.length > 80) {
    return { valid: false, error: '상품명은 최대 80자까지 입력 가능합니다.' };
  }
  return { valid: true };
}

export function createDuplicateKey(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name.toLowerCase()}_${file.size}_${file.lastModified}`;
}

export function validateFileBeforeUpload(
  file: File,
  currentTotalSize: number,
  currentFileCount: number
): { valid: boolean; errorCode?: ErrorCode } {
  const lowerName = file.name.toLowerCase();
  const isSupported =
    lowerName.endsWith('.stl') ||
    lowerName.endsWith('.3mf') ||
    lowerName.endsWith('.step') ||
    lowerName.endsWith('.stp');

  if (!isSupported) {
    return { valid: false, errorCode: 'UNSUPPORTED_EXTENSION' };
  }
  if (file.size === 0) {
    return { valid: false, errorCode: 'EMPTY_FILE' };
  }
  if (file.size > MAX_SINGLE_FILE_SIZE) {
    return { valid: false, errorCode: 'FILE_TOO_LARGE' };
  }
  if (currentFileCount >= MAX_FILE_COUNT) {
    return { valid: false, errorCode: 'TOO_MANY_FILES' };
  }
  if (currentTotalSize + file.size > MAX_TOTAL_PROJECT_SIZE) {
    return { valid: false, errorCode: 'PROJECT_TOO_LARGE' };
  }
  return { valid: true };
}

export function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
