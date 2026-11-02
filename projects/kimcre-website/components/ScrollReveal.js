'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export default function ScrollReveal({ children, className, delay = 0, threshold = 0.15 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={cn('reveal', className)} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
