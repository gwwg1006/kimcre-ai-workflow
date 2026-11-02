import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getLatestProjectDraft } from '../lib/persistence/db';
import { Header } from '../components/layout/Header';
import { ProductList } from '../features/products/ProductList';
import { ModelViewer } from '../features/viewer/ModelViewer';
import { PrintPreview } from '../features/print-preview/PrintPreview';
import { PrintDocument } from '../features/print-preview/PrintDocument';
import { UploadZone } from '../features/upload/UploadZone';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const restoreDraft = useProjectStore((state) => state.restoreDraft);

  const [isInitializing, setIsInitializing] = useState(true);

  // Restore latest project on mount
  useEffect(() => {
    (async () => {
      try {
        const latest = await getLatestProjectDraft();
        if (latest && latest.items && Array.isArray(latest.items)) {
          restoreDraft(latest);
        }
      } catch (err) {
        console.error('Failed to restore project draft', err);
      } finally {
        setIsInitializing(false);
      }
    })();
  }, [restoreDraft]);

  if (isInitializing) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="w-16 h-16 rounded-2xl bg-white shadow-lg shadow-indigo-100 flex items-center justify-center mb-4 border border-slate-200">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
        <p className="text-sm font-black text-slate-900">작업을 불러오는 중...</p>
        <p className="text-xs text-slate-500 mt-1 font-medium">로컬 데이터베이스에서 프로젝트를 복원하고 있습니다.</p>
      </div>
    );
  }

  const hasItems = project.items.length > 0;

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-100 overflow-hidden select-none">
      {/* Top Navigation Header */}
      <Header />

      {/* Main 3-Column Studio Workspace with Distinct Panel Elevation */}
      <main className="flex flex-1 w-full h-[calc(100vh-56px)] overflow-hidden">
        {/* Left Column: Product List & Order (Soft Slate-50) */}
        <aside id="app-sidebar" className="w-[310px] min-w-[280px] max-w-[340px] h-full flex flex-col shrink-0 bg-slate-50/70 border-r border-slate-200">
          <ProductList />
        </aside>

        {/* Center Column: 3D Model Viewport (Pure White Studio #ffffff) */}
        <section id="app-viewer" className="flex-1 h-full flex flex-col min-w-0 bg-white relative">
          {hasItems ? (
            <ModelViewer />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/50">
              <UploadZone isLarge={true} />
            </div>
          )}
        </section>

        {/* Right Column: Live A4 Print Preview (Contrasted Backdrop for Paper) */}
        <aside id="app-preview" className="w-[450px] min-w-[400px] max-w-[490px] h-full flex flex-col shrink-0 bg-slate-100 border-l border-slate-200">
          <PrintPreview />
        </aside>
      </main>

      {/* Hidden Offscreen Print Target DOM (Visible only on @media print) */}
      <PrintDocument project={project} />
    </div>
  );
};
