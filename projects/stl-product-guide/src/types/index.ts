export type ItemStatus =
  | 'queued'
  | 'parsing'
  | 'rendering'
  | 'ready'
  | 'error';

export type ViewPreset =
  | 'iso-front-right'
  | 'iso-front-left'
  | 'iso-rear-right'
  | 'iso-rear-left'
  | 'front'
  | 'back'
  | 'right'
  | 'left'
  | 'top'
  | 'isometric'
  | 'custom';

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  zoom: number;
  preset: ViewPreset;
}

export interface SourceFileMeta {
  name: string;
  size: number;
  lastModified: number;
  type: string;
  duplicateKey: string;
}

export interface ColorOption {
  id: string;
  name: string;
  hex: number;
  cssColor: string;
}

export const COLOR_PALETTE: ColorOption[] = [
  { id: 'default', name: '기본', hex: 0xdde3eb, cssColor: '#dde3eb' },
  { id: 'white', name: '화이트', hex: 0xffffff, cssColor: '#ffffff' },
  { id: 'black', name: '블랙', hex: 0x1e293b, cssColor: '#1e293b' },
  { id: 'red', name: '레드', hex: 0xef4444, cssColor: '#ef4444' },
  { id: 'orange', name: '오렌지', hex: 0xf97316, cssColor: '#f97316' },
  { id: 'yellow', name: '옐로우', hex: 0xeab308, cssColor: '#eab308' },
  { id: 'green', name: '그린', hex: 0x22c55e, cssColor: '#22c55e' },
  { id: 'blue', name: '블루', hex: 0x2563eb, cssColor: '#2563eb' },
  { id: 'purple', name: '퍼플', hex: 0x9333ea, cssColor: '#9333ea' },
  { id: 'brown', name: '브라운', hex: 0x854d0e, cssColor: '#854d0e' },
];

export interface ProductItem {
  id: string;
  order: number;
  source: SourceFileMeta;
  displayName: string;
  quantity: number;
  status: ItemStatus;
  errorCode?: string;
  errorMessage?: string;
  blobId: string;
  thumbnailBlobId?: string;
  camera: CameraState;
  shadingMode?: 'technical' | 'clay' | 'metallic';
  colorHex?: number;
  showEdges?: boolean;
  triangleCount?: number;
  bounds?: {
    width: number;
    depth: number;
    height: number;
  };
  partIndex?: number;
  plateIndex?: number;
  splitChoice?: 'split-objects' | 'split-plates' | 'merge-all';
  createdAt: string;
  updatedAt: string;
}

export interface PrintSettings {
  paper: 'A4';
  orientation: 'portrait';
  columns: 2;
  rows: 3;
  pageMarginMm: number;
  cardGapMm: number;
  showOriginalFilename: boolean;
  showQuantity: true;
}

export interface ProjectDraft {
  schemaVersion: 1;
  id: string;
  documentTitle: string;
  customerOrOrderName: string;
  shippingDate: string;
  companyName: string;
  selectedItemId: string | null;
  globalShadingMode?: 'technical' | 'clay' | 'metallic';
  globalColorHex?: number;
  globalShowEdges?: boolean;
  items: ProductItem[];
  printSettings: PrintSettings;
  createdAt: string;
  updatedAt: string;
}

export type ErrorCode =
  | 'UNSUPPORTED_EXTENSION'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'PROJECT_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'DUPLICATE_FILE'
  | 'STL_PARSE_FAILED'
  | 'EMPTY_GEOMETRY'
  | 'RENDER_FAILED'
  | 'STORAGE_QUOTA';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_EXTENSION: 'STL, 3MF, STEP(STP) 파일만 추가할 수 있습니다.',
  EMPTY_FILE: '비어 있는 파일입니다.',
  FILE_TOO_LARGE: '파일 하나는 100MB를 넘을 수 없습니다.',
  PROJECT_TOO_LARGE: '한 작업의 전체 파일은 500MB를 넘을 수 없습니다.',
  TOO_MANY_FILES: '한 작업에는 모델을 최대 20개까지 추가할 수 있습니다.',
  DUPLICATE_FILE: '같은 파일이 이미 추가되어 있습니다.',
  STL_PARSE_FAILED: '3D 모델 파일(STL/3MF/STEP) 형식을 읽을 수 없습니다.',
  EMPTY_GEOMETRY: '모델 형상 데이터가 없습니다.',
  RENDER_FAILED: '상품 이미지를 만들지 못했습니다.',
  STORAGE_QUOTA: '브라우저 저장 공간이 부족합니다. 현재 화면에서 출력은 가능하지만 새로고침하면 작업이 사라질 수 있습니다.',
};
