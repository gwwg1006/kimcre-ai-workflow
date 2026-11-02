import React, { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { Modal } from '../common/Modal';
import {
  RotateCcw,
  ShieldCheck,
  Calendar,
  User,
  FileText,
} from 'lucide-react';

export const Header: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const updateProjectMeta = useProjectStore((state) => state.updateProjectMeta);
  const resetDraft = useProjectStore((state) => state.resetDraft);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleResetClick = () => {
    if (project.items.length === 0) {
      resetDraft();
      return;
    }
    setIsResetModalOpen(true);
  };

  const handleConfirmReset = () => {
    resetDraft();
    setIsResetModalOpen(false);
  };

  return (
    <header className="w-full h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 select-none z-30 shrink-0">
      {/* Left: Brand Identity with KIMCRE. Logo */}
      <div className="flex items-center space-x-4 min-w-0">
        {/* KIMCRE. Brand Logo */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <img
            src="/logo.png"
            alt="KIMCRE."
            className="h-6 w-auto object-contain"
          />
          <div className="h-4 w-[1px] bg-slate-200 shrink-0" />
          <span className="text-[11px] text-slate-500 font-bold tracking-tight">
            STL 안내서 생성기
          </span>
        </div>

        <div className="h-5 w-[1px] bg-slate-200 shrink-0" />

        {/* Primary Document Title Input */}
        <div className="flex items-center space-x-1.5 min-w-0">
          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={project.documentTitle}
            onChange={(e) => updateProjectMeta({ documentTitle: e.target.value })}
            placeholder="문서 제목 입력"
            className="text-sm font-bold text-slate-900 bg-transparent hover:bg-slate-100/80 focus:bg-white px-2 py-1 rounded-md transition outline-none focus:ring-1 focus:ring-indigo-500 max-w-[180px] truncate"
            title="문서 제목"
          />
        </div>
      </div>

      {/* Middle: Clean Integrated Metadata Fields (Soft Tone) */}
      <div className="hidden lg:flex items-center space-x-2 bg-slate-100/60 p-1 rounded-lg">
        {/* Customer / Order Name */}
        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md hover:bg-white transition focus-within:bg-white focus-within:shadow-xs">
          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            type="text"
            value={project.customerOrOrderName}
            onChange={(e) => updateProjectMeta({ customerOrOrderName: e.target.value })}
            placeholder="고객명 또는 주문번호"
            className="text-xs font-semibold text-slate-800 bg-transparent placeholder-slate-400 w-36 outline-none"
          />
        </div>

        <div className="h-3.5 w-[1px] bg-slate-200" />

        {/* Shipping Date */}
        <div className="flex items-center space-x-1 px-2 py-0.5 rounded-md hover:bg-white transition focus-within:bg-white focus-within:shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            type="date"
            value={project.shippingDate}
            onChange={(e) => updateProjectMeta({ shippingDate: e.target.value })}
            className="text-xs font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Right: Security Badge & Reset Action */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Privacy Badge */}
        <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-100/80 px-2.5 py-1 rounded-md font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>로컬 100% 비공개</span>
        </div>

        {/* Reset Action */}
        <button
          onClick={handleResetClick}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
          title="새 프로젝트로 초기화"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-600" />
          <span>새 작업</span>
        </button>
      </div>

      {/* Confirm Reset Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="작업 초기화"
        footer={
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setIsResetModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleConfirmReset}
              className="px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition cursor-pointer shadow-xs"
            >
              초기화하기
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          현재 작업을 지우고 새로 시작할까요? 등록된 모든 상품과 촬영 데이터가 초기화됩니다.
        </p>
      </Modal>
    </header>
  );
};
