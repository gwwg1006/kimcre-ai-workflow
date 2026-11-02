'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, FileCheck2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ACCEPTED_FILES } from '@/lib/quote-client';
import { cn } from '@/lib/utils';

export function Field({ id, label, required, error, className, children }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
        {required && <span className="text-signal">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FileDrop({ file, onSelect, error, compact = false }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-card px-6 text-center transition-colors hover:border-foreground',
          compact ? 'py-10' : 'py-12',
          dragOver && 'border-foreground bg-muted',
          file && 'border-solid border-foreground'
        )}
      >
        {file ? <FileCheck2 className="size-5" /> : <Upload className="size-5 text-muted-foreground" />}
        <span className="text-sm font-medium">
          {file ? file.name : '파일을 끌어다 놓거나 클릭해서 선택'}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'STL · OBJ · STEP · 3MF · ZIP — 최대 50MB'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILES}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onSelect(selected);
          e.target.value = '';
        }}
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PrivacyConsent({
  id,
  checked,
  onChange,
  error,
  purpose,
  items,
  retention = '견적 안내 및 분쟁 처리 목적으로 3년 보관 후 파기',
  refusal = '동의하지 않을 수 있으나, 이 경우 견적 요청이 제한됩니다.',
}) {
  return (
    <div className="rounded-md border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-foreground">개인정보 수집 및 이용 동의</span>
        <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
          전문 보기
        </Link>
      </div>
      <dl className="grid gap-1">
        <div className="flex gap-2"><dt className="w-14 shrink-0">목적</dt><dd>{purpose}</dd></div>
        <div className="flex gap-2"><dt className="w-14 shrink-0">항목</dt><dd>{items}</dd></div>
        <div className="flex gap-2"><dt className="w-14 shrink-0">보유기간</dt><dd>{retention}</dd></div>
        <div className="flex gap-2"><dt className="w-14 shrink-0">거부 권리</dt><dd>{refusal}</dd></div>
      </dl>
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-invalid={!!error} />
        <Label htmlFor={id} className="text-[13px] font-normal text-foreground">
          개인정보 수집 및 이용에 동의합니다. <span className="text-signal">*</span>
        </Label>
      </div>
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
