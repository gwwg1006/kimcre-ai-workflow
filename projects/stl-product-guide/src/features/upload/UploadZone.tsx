import React, { useRef, useState } from 'react';
import { uploadQueueManager, MultiPartPrompt } from './uploadQueue';
import { Modal } from '../../components/common/Modal';
import { ERROR_MESSAGES, ErrorCode } from '../../types';
import {
  UploadCloud,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  CheckCircle2,
  FileUp,
  Layers,
  Component,
  Package,
} from 'lucide-react';

interface UploadZoneProps {
  isLarge?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ isLarge = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    duplicates: { file: File; key: string }[];
    proceed: (files: File[]) => void;
  } | null>(null);
  const [multiPartModal, setMultiPartModal] = useState<MultiPartPrompt | null>(null);
  const [errorAlerts, setErrorAlerts] = useState<{ fileName: string; message: string }[]>([]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const result = await uploadQueueManager.processFiles(
      files,
      (duplicates, proceed) => {
        setDuplicateModal({ duplicates, proceed });
      },
      (prompt) => {
        setMultiPartModal(prompt);
      }
    );

    if (result.errors.length > 0) {
      setErrorAlerts(result.errors);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleTriggerInput = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTriggerInput();
    }
  };

  if (isLarge) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={handleTriggerInput}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-12 md:p-16 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300 select-none text-center max-w-xl w-full mx-auto ${
            isDragOver
              ? 'border-indigo-500 bg-indigo-50/70 scale-[1.02] shadow-xl shadow-indigo-100'
              : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/70 shadow-sm hover:shadow-md'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".stl,.3mf,.step,.stp"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />

          {/* Icon Badge */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
            <UploadCloud className="w-10 h-10" />
          </div>

          <h3 className="text-lg md:text-xl font-extrabold text-slate-900 mb-2">
            STL, 3MF, STEP(STP) 파일을 끌어놓거나 선택하세요
          </h3>
          <p className="text-xs md:text-sm text-slate-500 max-w-md leading-relaxed mb-6">
            최대 20개 · 파일당 100MB 지원 · CAD 다중 부품/플레이트 자동 분할<br />
            <span className="text-slate-400 text-xs">업로드된 3D 파일은 외부로 전송되지 않고 브라우저 안에서만 처리됩니다.</span>
          </p>

          <button
            type="button"
            className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs md:text-sm font-bold shadow-md shadow-indigo-200 transition active:scale-95 cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            <span>파일 선택하기</span>
          </button>

          {/* Feature highlights */}
          <div className="flex items-center justify-center space-x-4 mt-8 pt-6 border-t border-slate-100 text-[11px] text-slate-400">
            <span className="flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1" />
              STL / 3MF / STEP 완벽 지원
            </span>
            <span className="flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1" />
              A4 6분할 자동 배치
            </span>
            <span className="flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mr-1" />
              100% 로컬 보안 처리
            </span>
          </div>
        </div>

        {/* Multi-Part / Multi-Object Split Choice Modal */}
        <Modal
          isOpen={!!multiPartModal}
          onClose={() => {
            if (multiPartModal) {
              multiPartModal.resolve('split-objects');
              setMultiPartModal(null);
            }
          }}
          title="다중 오브젝트 등록 방식 선택"
          footer={null}
        >
          {multiPartModal && (
            <div className="space-y-4">
              <div className="flex items-start space-x-3 bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100">
                <Component className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-extrabold text-slate-900 text-sm">{multiPartModal.file.name}</p>
                  <p className="text-slate-600 mt-1">
                    총 <span className="font-bold text-indigo-700">{multiPartModal.meta.objectCount}개</span>의 개별 부품(오브젝트)이 포함되어 있습니다. 어떻게 등록할까요?
                  </p>
                </div>
              </div>

              {/* Detected Parts Badge List */}
              {multiPartModal.meta.objectNames.length > 0 && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-500 block mb-1.5">감지된 부품 목록:</span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {multiPartModal.meta.objectNames.map((name, i) => (
                      <span key={i} className="text-[10.5px] font-bold px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-md shadow-2xs truncate max-w-[140px]">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  onClick={() => {
                    multiPartModal.resolve('split-objects');
                    setMultiPartModal(null);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/40 hover:bg-indigo-100/60 text-left transition cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Component className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-indigo-950">
                        🧩 개별 부품으로 각각 분리하여 등록 ({multiPartModal.meta.objectCount}개 카드 생성)
                      </p>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        각 부품별 사진, 이름, 수량을 독립적으로 관리합니다. (권장)
                      </p>
                    </div>
                  </div>
                </button>

                {multiPartModal.meta.plateCount > 1 && (
                  <button
                    onClick={() => {
                      multiPartModal.resolve('split-plates');
                      setMultiPartModal(null);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50 text-left transition cursor-pointer group shadow-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">
                          🖨️ 플레이트(Plate)별로 분리하여 등록 ({multiPartModal.meta.plateCount}개 카드 생성)
                        </p>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          슬라이서 베드(Plate 1, Plate 2...) 기준으로 묶어서 등록합니다.
                        </p>
                      </div>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    multiPartModal.resolve('merge-all');
                    setMultiPartModal(null);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50 text-left transition cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        📦 하나의 완성품 세트로 합쳐서 등록 (1개 카드 생성)
                      </p>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        모든 부품을 결합된 1개의 세트 상품으로 등록합니다.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Duplicate Confirmation Modal */}
        <Modal
          isOpen={!!duplicateModal}
          onClose={() => setDuplicateModal(null)}
          title="중복 파일 안내"
          footer={
            <>
              <button
                onClick={() => setDuplicateModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (duplicateModal) {
                    duplicateModal.proceed(duplicateModal.duplicates.map((d) => d.file));
                    setDuplicateModal(null);
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition shadow-xs cursor-pointer"
              >
                그래도 추가하기
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="flex items-center text-amber-600 mb-2">
              <AlertTriangle className="w-5 h-5 mr-2 shrink-0" />
              <span className="font-bold text-sm">이미 추가된 파일이 포함되어 있습니다.</span>
            </div>
            <ul className="text-xs text-slate-600 list-disc list-inside bg-slate-50 p-3 rounded-lg space-y-1">
              {duplicateModal?.duplicates.map((d, i) => (
                <li key={i} className="truncate font-medium">{d.file.name}</li>
              ))}
            </ul>
          </div>
        </Modal>

        {/* Validation Errors Modal */}
        <Modal
          isOpen={errorAlerts.length > 0}
          onClose={() => setErrorAlerts([])}
          title="파일 추가 오류"
          footer={
            <button
              onClick={() => setErrorAlerts([])}
              className="px-4 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-lg cursor-pointer"
            >
              확인
            </button>
          }
        >
          <ul className="space-y-2 text-xs">
            {errorAlerts.map((err, idx) => (
              <li key={idx} className="flex items-start text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                <AlertCircle className="w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">{err.fileName}</p>
                  <p className="text-slate-600 mt-0.5">
                    {ERROR_MESSAGES[err.message as ErrorCode] || err.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      </>
    );
  }

  // Expanded Prominent Drag & Drop Zone for Sidebar
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleTriggerInput}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center p-3.5 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 text-center select-none ${
          isDragOver
            ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md scale-[1.02]'
            : 'border-slate-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/40 text-slate-700 shadow-2xs'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".stl,.3mf,.step,.stp"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 mb-1.5 border border-indigo-100">
          <FileUp className="w-4 h-4 stroke-[2.5]" />
        </div>

        <span className="text-xs font-black text-slate-900 leading-tight">
          STL / 3MF / STEP 추가하기
        </span>
        <span className="text-[11px] text-slate-500 font-semibold mt-0.5">
          파일을 여기로 끌어놓거나 클릭하세요
        </span>
      </div>

      {/* Multi-Part / Multi-Object Split Choice Modal */}
      <Modal
        isOpen={!!multiPartModal}
        onClose={() => {
          if (multiPartModal) {
            multiPartModal.resolve('split-objects');
            setMultiPartModal(null);
          }
        }}
        title="다중 오브젝트 등록 방식 선택"
        footer={null}
      >
        {multiPartModal && (
          <div className="space-y-4">
            <div className="flex items-start space-x-3 bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100">
              <Component className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-slate-900 text-sm">{multiPartModal.file.name}</p>
                <p className="text-slate-600 mt-1">
                  총 <span className="font-bold text-indigo-700">{multiPartModal.meta.objectCount}개</span>의 개별 부품(오브젝트)이 포함되어 있습니다. 어떻게 등록할까요?
                </p>
              </div>
            </div>

            {/* Detected Parts Badge List */}
            {multiPartModal.meta.objectNames.length > 0 && (
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">감지된 부품 목록:</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {multiPartModal.meta.objectNames.map((name, i) => (
                    <span key={i} className="text-[10.5px] font-bold px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-md shadow-2xs truncate max-w-[140px]">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                onClick={() => {
                  multiPartModal.resolve('split-objects');
                  setMultiPartModal(null);
                }}
                className="flex items-center justify-between p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/40 hover:bg-indigo-100/60 text-left transition cursor-pointer group shadow-xs"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Component className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-indigo-950">
                      🧩 개별 부품으로 각각 분리하여 등록 ({multiPartModal.meta.objectCount}개 카드 생성)
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      각 부품별 사진, 이름, 수량을 독립적으로 관리합니다. (권장)
                    </p>
                  </div>
                </div>
              </button>

              {multiPartModal.meta.plateCount > 1 && (
                <button
                  onClick={() => {
                    multiPartModal.resolve('split-plates');
                    setMultiPartModal(null);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50 text-left transition cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        🖨️ 플레이트(Plate)별로 분리하여 등록 ({multiPartModal.meta.plateCount}개 카드 생성)
                      </p>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        슬라이서 베드(Plate 1, Plate 2...) 기준으로 묶어서 등록합니다.
                      </p>
                    </div>
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  multiPartModal.resolve('merge-all');
                  setMultiPartModal(null);
                }}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50 text-left transition cursor-pointer group shadow-xs"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900">
                      📦 하나의 완성품 세트로 합쳐서 등록 (1개 카드 생성)
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      모든 부품을 결합된 1개의 세트 상품으로 등록합니다.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Duplicate Confirmation Modal */}
      <Modal
        isOpen={!!duplicateModal}
        onClose={() => setDuplicateModal(null)}
        title="중복 파일 안내"
        footer={
          <>
            <button
              onClick={() => setDuplicateModal(null)}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={() => {
                if (duplicateModal) {
                  duplicateModal.proceed(duplicateModal.duplicates.map((d) => d.file));
                  setDuplicateModal(null);
                }
              }}
              className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition shadow-xs cursor-pointer"
            >
              그래도 추가하기
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center text-amber-600 mb-2">
            <AlertTriangle className="w-5 h-5 mr-2 shrink-0" />
            <span className="font-bold text-sm">이미 추가된 파일이 포함되어 있습니다.</span>
          </div>
          <ul className="text-xs text-slate-600 list-disc list-inside bg-slate-50 p-3 rounded-lg space-y-1">
            {duplicateModal?.duplicates.map((d, i) => (
              <li key={i} className="truncate font-medium">{d.file.name}</li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Validation Errors Modal */}
      <Modal
        isOpen={errorAlerts.length > 0}
        onClose={() => setErrorAlerts([])}
        title="파일 추가 오류"
        footer={
          <button
            onClick={() => setErrorAlerts([])}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-lg cursor-pointer"
          >
            확인
          </button>
        }
      >
        <ul className="space-y-2 text-xs">
          {errorAlerts.map((err, idx) => (
            <li key={idx} className="flex items-start text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              <AlertCircle className="w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">{err.fileName}</p>
                <p className="text-slate-600 mt-0.5">
                  {ERROR_MESSAGES[err.message as ErrorCode] || err.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
};
