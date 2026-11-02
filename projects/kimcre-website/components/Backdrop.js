import Image from 'next/image';
import { cn } from '@/lib/utils';

// Full-bleed photo behind a section, dimmed so type and cards on top stay legible.
export default function Backdrop({ src, dim = 'bg-ink/55', priority = false, className, children, ...props }) {
  return (
    <section className={cn('relative isolate overflow-hidden', className)} {...props}>
      <Image src={src} alt="" fill priority={priority} sizes="100vw" className="-z-20 object-cover" />
      <div className={cn('absolute inset-0 -z-10', dim)} />
      {children}
    </section>
  );
}
