import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/layout/Header';
import { UploadZone } from '../features/upload/UploadZone';
import { PrintPreview } from '../features/print-preview/PrintPreview';
import { Modal } from '../components/common/Modal';
import { useProjectStore } from '../store/projectStore';

// Mock DB
vi.mock('../lib/persistence/db', () => ({
  saveProjectDraft: vi.fn().mockResolvedValue(undefined),
  deleteBlobsByItemId: vi.fn().mockResolvedValue(undefined),
  clearAllProjectData: vi.fn().mockResolvedValue(undefined),
  getBlob: vi.fn().mockResolvedValue(null),
}));

describe('UI Components Tests', () => {
  beforeEach(() => {
    useProjectStore.getState().resetDraft();
  });

  describe('Modal Component', () => {
    it('renders when isOpen is true', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      );

      expect(screen.getByText('테스트 모달')).toBeInTheDocument();
      expect(screen.getByText('모달 내용')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      );

      expect(screen.queryByText('테스트 모달')).not.toBeInTheDocument();
    });
  });

  describe('Header Component', () => {
    it('renders default document title and allows editing', () => {
      render(<Header />);

      const titleInput = screen.getByPlaceholderText('문서 제목 입력') as HTMLInputElement;
      expect(titleInput.value).toBe('상품 안내서');

      fireEvent.change(titleInput, { target: { value: '출고 상품 안내' } });
      expect(useProjectStore.getState().project.documentTitle).toBe('출고 상품 안내');
    });

    it('triggers reset immediately if items list is empty', () => {
      render(<Header />);
      const resetBtn = screen.getByText('새 작업');
      fireEvent.click(resetBtn);

      expect(screen.queryByText('현재 작업을 지우고 새로 시작할까요?')).not.toBeInTheDocument();
    });
  });

  describe('UploadZone Component', () => {
    it('renders large upload zone when isLarge is true', () => {
      render(<UploadZone isLarge={true} />);

      expect(screen.getByText(/끌어놓거나 선택하세요/)).toBeInTheDocument();
      expect(screen.getByText(/최대 20개/)).toBeInTheDocument();
    });
  });

  describe('PrintPreview Component', () => {
    it('shows page pagination and print button', () => {
      render(<PrintPreview />);

      expect(screen.getByText('A4 인쇄 미리보기')).toBeInTheDocument();
      expect(screen.getAllByText('1 / 1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('PDF 저장 / 인쇄')).toBeInTheDocument();
    });

    it('blocks printing and shows validation dialog if items are empty or invalid', () => {
      render(<PrintPreview />);

      const printBtn = screen.getByText('PDF 저장 / 인쇄');
      // Disabled if 0 items
      expect(printBtn.closest('button')).toBeDisabled();
    });
  });
});
