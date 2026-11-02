'use client';

import { useEffect, useRef } from 'react';

// Scroll-linked transform: `fn(progress)` returns a CSS transform, progress runs 0→1
// while the element travels from the bottom of the viewport to the top.
function useScrollTransform(fn) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.parentElement.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, 1 - (rect.top + rect.height / 2) / (window.innerHeight + rect.height / 2)));
      el.style.transform = fn(progress);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [fn]);
  return ref;
}

const tilt = (p) => `rotate(${Math.max(0, 0.75 - p) * -6}deg)`;

export function Tilt({ children, className }) {
  const ref = useScrollTransform(tilt);
  return <div ref={ref} className={className} style={{ transformOrigin: 'left top' }}>{children}</div>;
}
