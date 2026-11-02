import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  paginateItems,
  calculateTitleFontSize,
  getOptimalLayout,
} from '../../lib/print/pagination';
import { PrintDocument } from './PrintDocument';
import { Modal } from '../../components/common/Modal';
import {
  Printer,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';

export const PrintPreview: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const layout = getOptimalLayout(project.items.length);
  const pages = paginateItems(project.items, layout.pageSize);
  const totalPages = Math.max(pages.length, 1);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  const safePageIndex = Math.min(currentPageIndex, totalPages - 1);

  const handlePrevPage = () => {
    setCurrentPageIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNextPage = () => {
    setCurrentPageIndex((prev) => Math.min(prev + 1, totalPages - 1));
  };

  const handlePrint = () => {
    const errors: string[] = [];

    if (project.items.length === 0) {
      errors.push('출력할 상품이 등록되지 않았습니다.');
    }

    const pendingItems = project.items.filter(
      (i) => i.status === 'queued' || i.status === 'parsing' || i.status === 'rendering'
    );
    if (pendingItems.length > 0) {
      errors.push(`${pendingItems.length}개 상품의 3D 이미지 처리가 진행 중입니다.`);
    }

    const errorItems = project.items.filter((i) => i.status === 'error');
    if (errorItems.length > 0) {
      errors.push(
        `${errorItems.length}개 상품에 오류가 있습니다: ${errorItems
          .map((i) => i.displayName)
          .join(', ')}`
      );
    }

    project.items.forEach((item, idx) => {
      if (!item.displayName.trim()) {
        errors.push(`#${idx + 1} 상품명이 비어 있습니다.`);
      }
      if (calculateTitleFontSize(item.displayName).isTooLong) {
        errors.push(`#${idx + 1} (${item.displayName}) 상품명이 너무 깁니다.`);
      }
      if (item.status === 'ready' && !item.thumbnailBlobId) {
        errors.push(`#${idx + 1} (${item.displayName}) 썸네일 이미지가 누락되었습니다.`);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      setIsErrorModalOpen(true);
      return;
    }

    // Trigger Print
    window.print();
  };

  const hasErrors = project.items.some((i) => i.status === 'error');
  const isPending = project.items.some(
    (i) => i.status === 'queued' || i.status === 'parsing' || i.status === 'rendering'
  );

  return (
    <div className="flex flex-col h-full bg-slate-100/80 border-l border-slate-200 select-none">
      {/* Top Preview Controls Bar */}
      <div
        id="app-preview-toolbar"
        className="flex items-center justify-between p-3 bg-white border-b border-slate-200 shrink-0"
      >
        <div className="flex items-center space-x-2">
          <FileCheck2 className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-extrabold text-slate-900">A4 인쇄 미리보기</h2>
        </div>

        {/* Pagination Navigation */}
        <div className="flex items-center space-x-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
          <button
            onClick={handlePrevPage}
            disabled={safePageIndex === 0}
            className="p-1 rounded-md hover:bg-white disabled:opacity-20 text-slate-700 transition cursor-pointer"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-black text-slate-800 px-2">
            {safePageIndex + 1} / {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={safePageIndex >= totalPages - 1}
            className="p-1 rounded-md hover:bg-white disabled:opacity-20 text-slate-700 transition cursor-pointer"
            aria-label="다음 페이지"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Preview Area: Scaled Up Prominent A4 Paper */}
      <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-200/70">
        <div className="a4-preview-page transform transition-all duration-150">
          <PrintDocument project={project} pageIndex={safePageIndex} />
        </div>
      </div>

      {/* Print Action Bottom Bar: High-Priority Solid CTA */}
      <div
        id="app-print-button-bar"
        className="p-4 bg-white border-t border-slate-200 flex flex-col space-y-2 shrink-0 shadow-lg z-10"
      >
        {(hasErrors || isPending) && (
          <div className="flex items-center text-xs text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-bold">
            <AlertTriangle className="w-4 h-4 mr-1.5 shrink-0 text-amber-600" />
            <span className="truncate">
              {isPending
                ? '파일 처리가 진행 중입니다. 완료 후 인쇄 가능합니다.'
                : '오류가 있는 상품을 수정한 후 인쇄해 주세요.'}
            </span>
          </div>
        )}

        {/* Primary Solid Action Button */}
        <button
          onClick={handlePrint}
          disabled={project.items.length === 0}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:from-slate-300 disabled:to-slate-300 text-white rounded-xl text-sm font-black shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition active:scale-98 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>PDF 저장 / 인쇄</span>
        </button>
      </div>

      {/* Print Validation Error Dialog */}
      <Modal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        title="출력 전 확인 필요"
        footer={
          <button
            onClick={() => setIsErrorModalOpen(false)}
            className="px-4 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition cursor-pointer"
          >
            확인
          </button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-700 leading-relaxed font-semibold">
            문서에 아래와 같은 문제가 발견되어 출력을 진행할 수 없습니다. 항목을 수정한 후 다시 시도해 주세요.
          </p>
          <ul className="space-y-1.5 bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-800 font-bold">
            {validationErrors.map((err, idx) => (
              <li key={idx} className="flex items-start">
                <span className="mr-1.5">•</span>
                <span>{err}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
};
