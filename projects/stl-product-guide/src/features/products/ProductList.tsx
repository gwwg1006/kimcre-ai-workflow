import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useProjectStore } from '../../store/projectStore';
import { ProductItemCard } from './ProductItemCard';
import { UploadZone } from '../upload/UploadZone';
import { Layers, AlertCircle, Loader2 } from 'lucide-react';

export const ProductList: React.FC = () => {
  const items = useProjectStore((state) => state.project.items);
  const selectedItemId = useProjectStore((state) => state.project.selectedItemId);
  const selectItem = useProjectStore((state) => state.selectItem);
  const reorderItems = useProjectStore((state) => state.reorderItems);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderItems(String(active.id), String(over.id));
    }
  };

  const queuedCount = items.filter((i) => i.status === 'queued' || i.status === 'parsing' || i.status === 'rendering').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="flex flex-col h-full bg-slate-50/70 border-r border-slate-200 select-none">
      {/* Top Header & Expanded Drag-Drop Upload Area */}
      <div className="p-3.5 bg-white border-b border-slate-200 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-extrabold text-slate-900">상품 목록</h2>
          </div>
          <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
            {items.length} / 20
          </span>
        </div>

        {/* Expanded Drag & Drop Zone */}
        {items.length < 20 && (
          <div className="pt-0.5">
            <UploadZone />
          </div>
        )}

        {/* Processing / Error Summary Bar */}
        {(queuedCount > 0 || errorCount > 0) && (
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
            {queuedCount > 0 && (
              <span className="text-indigo-600 font-bold flex items-center">
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                {queuedCount}개 처리 중...
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-rose-600 font-bold flex items-center">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                {errorCount}개 오류
              </span>
            )}
          </div>
        )}
      </div>

      {/* Item List Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 p-4">
            <p className="text-xs font-semibold">등록된 상품이 없습니다.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item, index) => (
                <ProductItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  isSelected={item.id === selectedItemId}
                  onSelect={() => selectItem(item.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};
