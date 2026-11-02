import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock crypto.randomUUID if not available in jsdom
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = (() =>
    '11111111-2222-3333-4444-555555555555') as () => `${string}-${string}-${string}-${string}-${string}`;
}

// Mock URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = vi.fn();
}
