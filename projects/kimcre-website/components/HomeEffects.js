'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Cross-fades full-bleed photos, standing in for a showreel video.
export function PhotoCycle({ images, interval = 4000, className }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  return (
    <div className={cn('overflow-hidden', className)}>
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={i === 0}
          sizes="100vw"
          className={cn(
            'object-cover transition-[opacity,scale] duration-[1600ms] ease-out',
            i === index ? 'scale-100 opacity-100' : 'scale-105 opacity-0'
          )}
        />
      ))}
    </div>
  );
}

export function UnderlineLink({ href, children }) {
  return (
    <Link href={href} className="underline decoration-1 underline-offset-[0.12em] transition-colors hover:text-signal">
      {children}
    </Link>
  );
}
