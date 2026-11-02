'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, PrivacyConsent } from '@/components/QuoteParts';
import { EMAIL_PATTERN } from '@/lib/quote-client';

const INQUIRY_TYPES = ['일반 문의', '기술 상담', '파트너십', '기타'];

const initialFormData = { name: '', email: '', type: '', message: '' };

export default function ContactForm() {
  const [formData, setFormData] = useState(initialFormData);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!formData.name.trim()) next.name = '이름을 입력해주세요.';
    if (!formData.email.trim()) next.email = '이메일을 입력해주세요.';
    else if (!EMAIL_PATTERN.test(formData.email)) next.email = '올바른 이메일 형식을 입력해주세요.';
    if (!formData.message.trim()) next.message = '메시지를 입력해주세요.';
    if (!privacyAgreed) next.privacy = '개인정보 수집 및 이용에 동의해야 문의를 접수할 수 있습니다.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '문의 사항 제출에 실패했습니다.');
      }
      setSubmitted(true);
      setFormData(initialFormData);
      setPrivacyAgreed(false);
    } catch (err) {
      toast.error(err.message || '오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-5" />
        </div>
        <p className="mt-4 font-semibold">문의가 접수되었습니다.</p>
        <p className="mt-1 text-sm text-muted-foreground">빠른 시일 안에 답변드리겠습니다.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
      <Field id="contact-name" label="이름" required error={errors.name}>
        <Input id="contact-name" value={formData.name} onChange={(e) => set('name', e.target.value)} placeholder="홍길동" aria-invalid={!!errors.name} />
      </Field>
      <Field id="contact-email" label="이메일" required error={errors.email}>
        <Input id="contact-email" type="email" value={formData.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" aria-invalid={!!errors.email} />
      </Field>
      <Field id="contact-type" label="문의 유형" className="sm:col-span-2">
        <Select value={formData.type} onValueChange={(v) => set('type', v)}>
          <SelectTrigger id="contact-type" className="w-full"><SelectValue placeholder="선택해주세요" /></SelectTrigger>
          <SelectContent>
            {INQUIRY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field id="contact-message" label="메시지" required error={errors.message} className="sm:col-span-2">
        <Textarea id="contact-message" rows={6} value={formData.message} onChange={(e) => set('message', e.target.value)} placeholder="궁금한 점을 자유롭게 적어주세요." aria-invalid={!!errors.message} />
      </Field>
      <div className="sm:col-span-2">
        <PrivacyConsent
          id="contact-privacy"
          checked={privacyAgreed}
          onChange={(v) => {
            setPrivacyAgreed(v);
            if (v) setErrors((prev) => ({ ...prev, privacy: undefined }));
          }}
          error={errors.privacy}
          purpose="문의 접수, 본인 확인 및 상담 답변 전달"
          items="[필수] 이름, 이메일, 메시지 / [선택] 문의 유형"
          retention="상담 완료 및 분쟁 처리 목적으로 3년 보관 후 파기"
          refusal="동의하지 않을 수 있으나, 이 경우 문의 접수가 제한됩니다."
        />
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting} className="sm:col-span-2 sm:justify-self-start">
        {isSubmitting ? <><Loader2 className="animate-spin" /> 전송 중</> : '문의 보내기'}
      </Button>
    </form>
  );
}
