import React, { useState, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProductItem } from '../../types';
import { useProjectStore } from '../../store/projectStore';
import { getBlobUrl } from '../../lib/files/blobUrlCache';
import {
  GripVertical,
  Trash2,
  Loader2,
  AlertCircle,
  Plus,
  Minus,
  Check,
  Pencil,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';

interface ProductItemCardProps {
  item: ProductItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

export const ProductItemCard: React.FC<ProductItemCardProps> = ({
  item,
  index,
  isSelected,
  onSelect,
}) => {
  const updateItem = useProjectStore((state) => state.updateItem);
  const removeItem = useProjectStore((state) => state.removeItem);

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingText, setEditingText] = useState(item.displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Strictly lock movement to vertical (Y) axis only (X = 0)
  const verticalTransform = transform ? { ...transform, x: 0 } : null;

  const style = {
    transform: CSS.Transform.toString(verticalTransform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  useEffect(() => {
    let isMounted = true;
    if (item.thumbnailBlobId) {
      getBlobUrl(item.thumbnailBlobId).then((url) => {
        if (isMounted) setThumbnailUrl(url);
      });
    } else {
      setThumbnailUrl(null);
    }
    return () => {
      isMounted = false;
    };
  }, [item.thumbnailBlobId]);

  // Keep editing text in sync if external name changes
  useEffect(() => {
    setEditingText(item.displayName);
  }, [item.displayName]);

  // Auto focus input when editing starts
  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = editingText.trim();
    if (trimmed && trimmed !== item.displayName) {
      updateItem(item.id, { displayName: trimmed });
    } else {
      setEditingText(item.displayName);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditingText(item.displayName);
      setIsEditingName(false);
    }
  };

  const handleQuantityChange = (delta: number) => {
    const next = Math.max(1, Math.min(999, item.quantity + delta));
    updateItem(item.id, { quantity: next });
  };

  const handleDirectQuantity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      updateItem(item.id, { quantity: Math.max(1, Math.min(999, val)) });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    await removeItem(item.id);
    setIsDeleteModalOpen(false);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        className={`group relative flex items-center p-2.5 rounded-xl transition-all duration-150 cursor-pointer h-[92px] ${
          isSelected
            ? 'bg-indigo-50/50 border-2 border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
            : 'bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-xs'
        } ${isDragging ? 'opacity-60 scale-98 shadow-md' : ''}`}
      >
        {/* Selected Checkmark Badge */}
        {isSelected && (
          <div className="absolute top-2 right-2 bg-indigo-600 text-white rounded-full p-0.5 shadow-xs z-10">
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        )}

        {/* Left: Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="p-1 -ml-1 mr-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing rounded hover:bg-slate-100 transition shrink-0"
          title="위아래로 드래그하여 순서 변경"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Left: Expanded Full-Height 3D Rendered Thumbnail */}
        <div className="relative w-20 h-full rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs mr-3">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={item.displayName}
              className="w-full h-full object-contain bg-white"
            />
          ) : item.status === 'error' ? (
            <AlertCircle className="w-6 h-6 text-rose-500" />
          ) : (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          )}

          <div className="absolute bottom-0 left-0 bg-slate-900/80 text-white font-extrabold text-[9px] px-1.5 py-0.2 rounded-tr">
            #{index + 1}
          </div>
        </div>

        {/* Right: Main Content Area */}
        <div className="flex-1 min-w-0 h-full flex flex-col justify-between py-0.5">
          {/* Top Row: Name & Source Filename */}
          <div className="min-w-0 pr-4">
            {isEditingName ? (
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleKeyDown}
                  placeholder="상품명 입력"
                  className="w-full text-xs font-black text-slate-900 bg-white px-1.5 py-0.5 rounded outline-none border border-indigo-500 ring-1 ring-indigo-500"
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-between group/title py-0.5 px-0.5 rounded hover:bg-slate-100/70 transition"
                onDoubleClick={handleStartEdit}
                title="더블클릭하거나 연필 아이콘을 눌러 상품명을 수정하세요"
              >
                <span className="text-xs font-black text-slate-900 truncate leading-tight">
                  {item.displayName}
                </span>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="opacity-0 group-hover/title:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer ml-1 shrink-0"
                  title="상품명 수정"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Source Model Filename */}
            <div className="px-0.5">
              <span className="text-[11px] font-semibold text-slate-500 truncate block leading-tight" title={item.source.name}>
                {item.source.name}
              </span>
            </div>

            {/* Error Message if any */}
            {item.status === 'error' && (
              <div className="text-[10px] text-rose-600 font-bold mt-0.5 px-0.5 truncate">
                {item.errorMessage || '오류 발생'}
              </div>
            )}
          </div>

          {/* Bottom Row: Delete Action on Left, Quantity Stepper pushed to Far Right */}
          <div className="flex items-center justify-between mt-1">
            {/* Delete Button */}
            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={handleDelete}
                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="상품 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quantity Stepper (Pushed to the far right) */}
            <div className="flex items-center space-x-1 ml-auto" onClick={(e) => e.stopPropagation()}>
              <span className="text-[11px] font-bold text-slate-600 mr-0.5">수량:</span>
              <div className="flex items-center bg-slate-100 border border-slate-200/80 rounded-md overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={item.quantity <= 1}
                  className="w-5 h-5 flex items-center justify-center text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition cursor-pointer"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={item.quantity}
                  onChange={handleDirectQuantity}
                  className="w-7 text-center text-xs font-black text-slate-900 bg-transparent outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  disabled={item.quantity >= 999}
                  className="w-5 h-5 flex items-center justify-center text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="상품 삭제 확인"
        footer={
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={confirmDelete}
              className="px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition cursor-pointer shadow-xs"
            >
              삭제
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 font-medium">
          <strong>[{item.displayName}]</strong> 상품을 목록에서 삭제하시겠습니까?
        </p>
      </Modal>
    </>
  );
};
