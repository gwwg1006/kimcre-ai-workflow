'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const categories = [
  '전체',
  '건축·도시 모형',
  '산업용 기구·지그',
  '구조 부품 & 소량 양산',
  '전자기기·제어기 케이스',
  '의료·교육용 모형',
  '제품 디자인 목업',
  '인테리어·데스크 소품',
  '커스텀 브랜딩·소품',
  '출력 공정·기술 쇼케이스',
];

const isNew = (createdAt) => {
  if (!createdAt) return false;
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff >= 0 && diff <= 5 * 24 * 60 * 60 * 1000;
};

const imagesOf = (item) => (Array.isArray(item.image) ? item.image : [item.image]).filter(Boolean);

export default function PortfolioGrid({ initialPortfolios }) {
  const hasInitialPortfolios = Array.isArray(initialPortfolios);
  const [portfolioData, setPortfolioData] = useState(() => initialPortfolios || []);
  const [isLoading, setIsLoading] = useState(() => !hasInitialPortfolios);
  const [error, setError] = useState(null);

  const [activeFilter, setActiveFilter] = useState('전체');
  const [manualSelectedItem, setManualSelectedItem] = useState(null);
  const [dismissedItemId, setDismissedItemId] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const searchParams = useSearchParams();
  const itemId = searchParams ? searchParams.get('id') : null;

  useEffect(() => {
    if (hasInitialPortfolios) return;
    fetch('/api/portfolio')
      .then((res) => {
        if (!res.ok) throw new Error('포트폴리오 데이터를 불러오지 못했습니다.');
        return res.json();
      })
      .then(setPortfolioData)
      .catch((err) => {
        console.error('Failed to load portfolio items:', err);
        setError(err.message || '포트폴리오 데이터를 불러오는 데 실패했습니다.');
      })
      .finally(() => setIsLoading(false));
  }, [hasInitialPortfolios]);

  const deepLinkedItem = itemId && itemId !== dismissedItemId
    ? portfolioData.find(
        (item) => String(item.id) === String(itemId)
          || Number.parseInt(item.id, 10) === Number.parseInt(itemId, 10)
      )
    : null;
  const selectedItem = manualSelectedItem || deepLinkedItem || null;
  const selectedImages = selectedItem ? imagesOf(selectedItem) : [];

  const filteredItems = activeFilter === '전체'
    ? portfolioData
    : portfolioData.filter((item) => item.category === activeFilter);

  const openModal = (item) => {
    setManualSelectedItem(item);
    setDismissedItemId(null);
    setCurrentImageIndex(0);
  };

  const closeModal = () => {
    setManualSelectedItem(null);
    setDismissedItemId(itemId);
    setCurrentImageIndex(0);
  };

  const step = (delta) => {
    setCurrentImageIndex((prev) => (prev + delta + selectedImages.length) % selectedImages.length);
  };

  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 포트폴리오를 불러오는 중입니다.
      </p>
    );
  }

  if (error) return <p className="py-16 text-center text-sm text-destructive">{error}</p>;

  return (
    <>
      <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
        <div className="flex gap-2 pb-2 md:flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveFilter(cat)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                activeFilter === cat
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:border-foreground hover:text-foreground'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">해당 카테고리의 작업물이 없습니다.</p>
      ) : (
        <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item, index) => {
            // Every fifth card runs wide to break the grid's rhythm.
            const wide = index % 5 === 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openModal(item)}
                className={cn('group text-left', wide && 'sm:col-span-2')}
              >
                <div className={cn('relative overflow-hidden rounded-sm bg-muted', wide ? 'aspect-[16/9]' : 'aspect-[4/3]')}>
                  <span className="absolute top-3 left-3 z-10 flex size-7 items-center justify-center rounded-full bg-background font-mono text-[11px] shadow">
                    {index + 1}
                  </span>
                  {isNew(item.createdAt) && (
                    <span className="absolute top-3 right-3 z-10 rounded-full bg-signal px-2 py-0.5 font-mono text-[10px] text-signal-foreground">
                      NEW
                    </span>
                  )}
                  <Image
                    src={imagesOf(item)[0] || '/images/hero-bg.png'}
                    alt={item.title}
                    fill
                    sizes={wide ? '(max-width: 640px) 100vw, 66vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    priority={index < 3}
                  />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <h3 className="display text-2xl leading-tight md:text-3xl">{item.title}</h3>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{item.duration}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.material}</p>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && closeModal()}>
        {selectedItem && (
          <DialogContent
            className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-4xl"
            onKeyDown={(e) => {
              if (selectedImages.length < 2) return;
              if (e.key === 'ArrowRight') step(1);
              if (e.key === 'ArrowLeft') step(-1);
            }}
          >
            <div className="grid md:grid-cols-5">
              <div className="relative aspect-square bg-muted md:col-span-3 md:aspect-auto md:min-h-[520px]">
                <Image
                  src={selectedImages[currentImageIndex] || '/images/hero-bg.png'}
                  alt={`${selectedItem.title} - 이미지 ${currentImageIndex + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 540px"
                  className="object-cover"
                  priority
                />
                {selectedImages.length > 1 && (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3">
                    <Button size="icon-sm" variant="secondary" onClick={() => step(-1)} aria-label="이전 이미지">
                      <ChevronLeft />
                    </Button>
                    <span className="rounded-sm bg-background/80 px-2 py-0.5 font-mono text-[11px]">
                      {currentImageIndex + 1} / {selectedImages.length}
                    </span>
                    <Button size="icon-sm" variant="secondary" onClick={() => step(1)} aria-label="다음 이미지">
                      <ChevronRight />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-col p-6 md:col-span-2 md:p-8">
                <p className="font-mono text-[11px] text-muted-foreground">{selectedItem.category}</p>
                <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight">{selectedItem.title}</DialogTitle>
                <dl className="mt-6 divide-y border-y text-sm">
                  {[
                    ['소재', selectedItem.material],
                    ['제작 기간', selectedItem.duration],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <DialogDescription className="mt-6 text-sm leading-relaxed whitespace-pre-line text-foreground/80">
                  {selectedItem.description}
                </DialogDescription>
                <Button asChild className="mt-8 md:mt-auto">
                  <Link href="/quote" onClick={closeModal}>
                    비슷한 작업 견적 문의 <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
