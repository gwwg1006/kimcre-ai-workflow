'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, FileDrop, PrivacyConsent } from '@/components/QuoteParts';
import { EMAIL_PATTERN, PHONE_PATTERN, formatPhoneNumber, submitQuote, validateFile } from '@/lib/quote-client';

const PRINTING_METHODS = ['SLA/DLP', 'FDM', 'SLS', '기타', '모름'];
const MATERIALS = ['PLA', 'ABS', '레진', '나일론', 'TPU', 'PETG', '기타', '모름'];

const initialFormData = {
  name: '',
  phone: '',
  email: '',
  method: '',
  material: '',
  quantity: 1,
  deadline: '',
  description: '',
};

export default function QuoteForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [file, setFile] = useState(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const set = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: name === 'phone' ? formatPhoneNumber(value) : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const selectFile = (selected) => {
    const fileError = validateFile(selected);
    setErrors((prev) => ({ ...prev, file: fileError || undefined }));
    setFile(fileError ? null : selected);
  };

  const validate = () => {
    const next = {};
    if (!formData.name.trim()) next.name = '이름을 입력해주세요.';
    if (!formData.phone.trim()) next.phone = '연락처를 입력해주세요.';
    else if (!PHONE_PATTERN.test(formData.phone.replace(/\s/g, ''))) next.phone = '올바른 전화번호 형식을 입력해주세요.';
    if (!formData.email.trim()) next.email = '이메일을 입력해주세요.';
    else if (!EMAIL_PATTERN.test(formData.email)) next.email = '올바른 이메일 형식을 입력해주세요.';
    if (!formData.description.trim()) next.description = '프로젝트 설명을 입력해주세요.';
    if (!privacyAgreed) next.privacy = '개인정보 수집 및 이용에 동의해야 견적을 요청할 수 있습니다.';
    const fileError = validateFile(file);
    if (fileError) next.file = fileError;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await submitQuote(formData, file);
      setShowSuccess(true);
    } catch (err) {
      toast.error(err.message || '오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccess(false);
    setFormData(initialFormData);
    setFile(null);
    setPrivacyAgreed(false);
    setErrors({});
  };

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="grid gap-6 sm:grid-cols-2">
        <Field id="quote-name" label="이름" required error={errors.name}>
          <Input id="quote-name" value={formData.name} onChange={(e) => set('name', e.target.value)} placeholder="홍길동" aria-invalid={!!errors.name} />
        </Field>
        <Field id="quote-phone" label="연락처" required error={errors.phone}>
          <Input id="quote-phone" type="tel" value={formData.phone} onChange={(e) => set('phone', e.target.value)} placeholder="010-1234-5678" aria-invalid={!!errors.phone} />
        </Field>
        <Field id="quote-email" label="이메일" required error={errors.email} className="sm:col-span-2">
          <Input id="quote-email" type="email" value={formData.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" aria-invalid={!!errors.email} />
        </Field>

        <Field id="quote-method" label="출력 방식">
          <Select value={formData.method} onValueChange={(v) => set('method', v)}>
            <SelectTrigger id="quote-method" className="w-full"><SelectValue placeholder="선택해주세요" /></SelectTrigger>
            <SelectContent>
              {PRINTING_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field id="quote-material" label="희망 소재">
          <Select value={formData.material} onValueChange={(v) => set('material', v)}>
            <SelectTrigger id="quote-material" className="w-full"><SelectValue placeholder="선택해주세요" /></SelectTrigger>
            <SelectContent>
              {MATERIALS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field id="quote-quantity" label="수량">
          <Input id="quote-quantity" type="number" min="1" max="10000" value={formData.quantity} onChange={(e) => set('quantity', e.target.value)} className="font-mono" />
        </Field>
        <Field id="quote-deadline" label="희망 납기일">
          <Input id="quote-deadline" type="date" value={formData.deadline} onChange={(e) => set('deadline', e.target.value)} className="font-mono" />
        </Field>

        <Field id="quote-description" label="프로젝트 설명" required error={errors.description} className="sm:col-span-2">
          <Textarea
            id="quote-description"
            rows={6}
            value={formData.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="용도, 크기, 원하는 마감, 참고할 점을 적어주세요."
            aria-invalid={!!errors.description}
          />
        </Field>

        <div className="grid gap-2 sm:col-span-2">
          <span className="text-[13px] font-medium">파일 첨부</span>
          <FileDrop file={file} onSelect={selectFile} error={errors.file} />
        </div>

        <div className="sm:col-span-2">
          <PrivacyConsent
            id="quote-privacy"
            checked={privacyAgreed}
            onChange={(v) => {
              setPrivacyAgreed(v);
              if (v) setErrors((prev) => ({ ...prev, privacy: undefined }));
            }}
            error={errors.privacy}
            purpose="3D 프린팅 맞춤 견적 산출, 파일 검토 및 상담 연락"
            items="[필수] 이름, 연락처, 이메일, 설명 / [선택] 출력 방식, 소재, 수량, 납기일, 첨부파일"
          />
        </div>

        <Button type="submit" size="lg" disabled={isSubmitting} className="sm:col-span-2 sm:justify-self-start">
          {isSubmitting ? <><Loader2 className="animate-spin" /> 처리 중</> : '견적 요청하기'}
        </Button>
      </form>

      <Dialog open={showSuccess} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="text-center sm:max-w-sm">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="size-5" />
          </div>
          <DialogTitle className="text-lg">견적 요청이 접수되었습니다.</DialogTitle>
          <DialogDescription>영업일 기준 24시간 안에 연락드리겠습니다.</DialogDescription>
          <Button onClick={handleCloseModal}>확인</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
