'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FileDrop, PrivacyConsent } from '@/components/QuoteParts';
import { EMAIL_PATTERN, PHONE_PATTERN, formatPhoneNumber, submitQuote, validateFile } from '@/lib/quote-client';
import { cn } from '@/lib/utils';

const PRINT_METHODS = [
  { id: 'SLA', name: '고정밀 레진 (SLA)', desc: '피규어, 외관 시제품', spec: '±0.05mm' },
  { id: 'FDM', name: '일반 시제품 (FDM)', desc: '기구 검증, 대형 부품', spec: '최대 500mm' },
  { id: 'SLS', name: '고강도 나일론 (SLS)', desc: '기능성 엔지니어링 파트', spec: '서포트 불필요' },
];

const STEPS = ['파일', '출력 방식', '연락처'];

export default function InstantQuote() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [method, setMethod] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [quantity, setQuantity] = useState(1);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | done

  const reset = () => {
    setStep(0);
    setFile(null);
    setFileError('');
    setMethod('');
    setForm({ name: '', phone: '', email: '' });
    setQuantity(1);
    setPrivacyAgreed(false);
    setErrors({});
    setStatus('idle');
  };

  const selectFile = (selected) => {
    const error = validateFile(selected);
    setFileError(error);
    if (error) return;
    setFile(selected);
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = '이름을 입력해주세요.';
    if (!PHONE_PATTERN.test(form.phone.replace(/\s/g, ''))) next.phone = '연락처를 확인해주세요.';
    if (!EMAIL_PATTERN.test(form.email)) next.email = '이메일을 확인해주세요.';
    if (!privacyAgreed) next.privacy = '개인정보 수집 및 이용에 동의해주세요.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setStatus('sending');
    try {
      await submitQuote(
        {
          ...form,
          method,
          material: '소재 미지정',
          quantity,
          deadline: '무관',
          description: `[홈 간편 견적]\n출력 방식: ${method}\n수량: ${quantity}개`,
        },
        file
      );
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setErrors({ submit: err.message || '접수 중 오류가 발생했습니다.' });
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-sm font-semibold">간편 견적</p>
          <p className="text-xs text-muted-foreground">파일만 올리면 24시간 안에 견적을 보내드립니다.</p>
        </div>
        {step > 0 && status !== 'done' && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> 처음부터
          </Button>
        )}
      </div>

      <ol className="grid grid-cols-3 border-b font-mono text-[11px]">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              'flex items-center gap-2 border-r px-5 py-2.5 last:border-r-0',
              i <= step || status === 'done' ? 'text-foreground' : 'text-muted-foreground/60'
            )}
          >
            <span className={cn('size-1.5 rounded-full', i < step || status === 'done' ? 'bg-foreground' : i === step ? 'bg-signal' : 'bg-border')} />
            {String(i + 1).padStart(2, '0')} {label}
          </li>
        ))}
      </ol>

      <div className="p-5">
        {status === 'done' ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="size-5" />
            </div>
            <p className="mt-4 font-semibold">접수되었습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {form.email}로 24시간 안에 견적을 보내드립니다.
            </p>
            <Button variant="outline" size="sm" className="mt-6" onClick={reset}>
              다른 파일 견적 받기
            </Button>
          </div>
        ) : step === 0 ? (
          <FileDrop file={file} onSelect={selectFile} error={fileError} compact />
        ) : step === 1 ? (
          <div className="grid gap-2">
            {PRINT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethod(m.name);
                  setStep(2);
                }}
                className="group flex items-center justify-between rounded-md border bg-background px-4 py-3 text-left transition-colors hover:border-foreground"
              >
                <span>
                  <span className="block text-sm font-medium">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">{m.desc}</span>
                </span>
                <span className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                  {m.spec}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </span>
              </button>
            ))}
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">FILE · {file?.name}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <p className="font-mono text-[11px] text-muted-foreground">
              {method} · {file?.name}
            </p>
            <Field id="iq-name" label="이름" required error={errors.name}>
              <Input id="iq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="iq-phone" label="연락처" required error={errors.phone}>
                <Input
                  id="iq-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhoneNumber(e.target.value) })}
                  placeholder="010-1234-5678"
                />
              </Field>
              <Field id="iq-qty" label="수량">
                <div className="flex h-9 items-center rounded-md border border-input bg-background">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="수량 줄이기">
                    <Minus />
                  </Button>
                  <input
                    id="iq-qty"
                    type="number"
                    min="1"
                    max="10000"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(10000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="w-full bg-transparent text-center font-mono text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQuantity((q) => Math.min(10000, q + 1))} aria-label="수량 늘리기">
                    <Plus />
                  </Button>
                </div>
              </Field>
            </div>
            <Field id="iq-email" label="이메일" required error={errors.email}>
              <Input id="iq-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
            </Field>
            <PrivacyConsent
              id="iq-privacy"
              checked={privacyAgreed}
              onChange={setPrivacyAgreed}
              error={errors.privacy}
              purpose="3D 프린팅 견적 산출 및 안내"
              items="[필수] 이름, 연락처, 이메일, 3D 파일 / [선택] 수량, 출력 방식"
            />
            {errors.submit && <p className="text-sm text-destructive">{errors.submit}</p>}
            <Button type="submit" size="lg" disabled={status === 'sending'}>
              {status === 'sending' ? <><Loader2 className="animate-spin" /> 전송 중</> : <>견적 요청 보내기 <ArrowRight /></>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
