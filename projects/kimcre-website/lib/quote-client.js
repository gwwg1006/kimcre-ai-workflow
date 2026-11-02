import { upload } from '@vercel/blob/client';

// Shared by QuoteForm and InstantQuote so both submit the way /api/quote expects.
export const ACCEPTED_FILES = '.stl,.obj,.step,.stp,.3mf,.zip';
const ALLOWED_EXTENSIONS = new Set(['stl', 'obj', 'step', 'stp', '3mf', 'zip']);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFile(file) {
  if (!file) return '';
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return 'STL, OBJ, STEP, STP, 3MF, ZIP 파일만 업로드할 수 있습니다.';
  }
  if (file.size > MAX_FILE_SIZE) return '파일 크기는 50MB를 초과할 수 없습니다.';
  return '';
}

export function formatPhoneNumber(value) {
  if (!value) return value;
  const clean = value.replace(/[^\d]/g, '');
  if (clean.startsWith('02')) {
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    if (clean.length <= 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
    return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6, 10)}`;
  }
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  if (clean.length <= 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 11)}`;
}

export async function submitQuote(fields, file) {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.append(key, String(value ?? '')));
  data.append('privacyAgreed', 'true');

  if (file) {
    const uploadConfig = await fetch('/api/quote/upload').then((r) => r.json());
    if (uploadConfig.enabled) {
      const blob = await upload(`quotes/${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/quote/upload',
        multipart: true,
      });
      data.append('fileName', file.name);
      data.append('fileSize', String(file.size));
      data.append('fileUrl', blob.url);
      if (blob.downloadUrl) data.append('fileDownloadUrl', blob.downloadUrl);
    } else {
      // Local development fallback when Vercel Blob is not configured.
      data.append('file', file);
    }
  }

  const res = await fetch('/api/quote', { method: 'POST', body: data });
  if (!res.ok) {
    let message = `${res.status} 서버 오류`;
    if (res.headers.get('content-type')?.includes('application/json')) {
      message = (await res.json().catch(() => ({}))).error || message;
    }
    throw new Error(message);
  }
  return res.json();
}
