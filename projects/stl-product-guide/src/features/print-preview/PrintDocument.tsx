import React, { useEffect, useState } from 'react';
import { ProjectDraft, ProductItem } from '../../types';
import {
  paginateItems,
  calculateTitleFontSize,
  getConsistentGridDimensions,
  getOptimalLayout,
} from '../../lib/print/pagination';
import { getBlobUrl } from '../../lib/files/blobUrlCache';

interface PrintDocumentProps {
  project: ProjectDraft;
  pageIndex?: number;
}

const SingleCard: React.FC<{ item: ProductItem }> = ({ item }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (item.thumbnailBlobId) {
      getBlobUrl(item.thumbnailBlobId).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl(null);
    }
    return () => {
      active = false;
    };
  }, [item.thumbnailBlobId]);

  const { fontSizeClass } = calculateTitleFontSize(item.displayName);

  return (
    <div
      className="print-card-box"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: '6px',
        padding: '6px',
      }}
    >
      {/* 3D Model Image Area */}
      <div
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
        }}
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.displayName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>이미지 생성 중</div>
        )}
      </div>

      {/* Product Name & Quantity Area */}
      <div
        style={{
          flexShrink: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          paddingTop: '3px',
        }}
      >
        <div
          className={`text-slate-950 font-black line-clamp-2 ${fontSizeClass}`}
          style={{ width: '100%', wordBreak: 'break-word', letterSpacing: '-0.03em' }}
          title={item.displayName}
        >
          {item.displayName}
        </div>
        <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 800, marginTop: '2px' }}>
          수량: {item.quantity}개
        </div>
      </div>
    </div>
  );
};

export const PrintDocument: React.FC<PrintDocumentProps> = ({ project, pageIndex }) => {
  const layout = getOptimalLayout(project.items.length);
  const pages = paginateItems(project.items, layout.pageSize);
  const totalPages = Math.max(pages.length, 1);

  // Global consistent grid dimension across all pages (2x3 fixed when 5+ items)
  const gridDim = getConsistentGridDimensions(project.items.length);
  const totalSlotsPerPage = gridDim.columns * gridDim.rows;

  const renderSinglePage = (pageItems: ProductItem[], pIdx: number) => {
    const emptySlots = Math.max(0, totalSlotsPerPage - pageItems.length);

    return (
      <div
        key={pIdx}
        className="print-page"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Top Header Area */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderBottom: '2.5px solid #0f172a',
            paddingBottom: '2mm',
            marginBottom: '3mm',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="KIMCRE."
              style={{ height: '20px', width: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#1e293b' }}>
            {project.customerOrOrderName && (
              <div style={{ fontWeight: 900, color: '#0f172a', marginBottom: '2px' }}>
                {project.customerOrOrderName}
              </div>
            )}
            <div style={{ fontWeight: 700, color: '#475569' }}>출고일: {project.shippingDate}</div>
          </div>
        </div>

        {/* Consistent Responsive Card Grid */}
        <div
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${gridDim.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${gridDim.rows}, minmax(0, 1fr))`,
            gap: '3.5mm',
            overflow: 'hidden',
          }}
        >
          {pageItems.map((item) => (
            <SingleCard key={item.id} item={item} />
          ))}
          {/* Fill empty card slots with invisible placeholders so filled cards maintain exact dimensions */}
          {Array.from({ length: emptySlots }).map((_, idx) => (
            <div key={`empty-${idx}`} style={{ visibility: 'hidden', minHeight: 0 }} />
          ))}
        </div>

        {/* Bottom Footer Area */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '2.5mm',
            height: '5mm',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 900,
              color: '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            <span>{project.documentTitle || '상품 안내서'}</span>
          </div>

          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 800,
              color: '#64748b',
            }}
          >
            <span>
              {pIdx + 1} / {totalPages}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (pageIndex !== undefined) {
    const pageItems = pages[pageIndex] || [];
    return renderSinglePage(pageItems, pageIndex);
  }

  return (
    <div id="print-root">
      {pages.length === 0
        ? renderSinglePage([], 0)
        : pages.map((pageItems, pIdx) => renderSinglePage(pageItems, pIdx))}
    </div>
  );
};
