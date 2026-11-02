'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SHARE_CODE_LENGTH = 16;
const LEGACY_SHARE_CODE_LENGTH = 6;

function hasValidCodeLength(code) {
  return code.length === SHARE_CODE_LENGTH || code.length === LEGACY_SHARE_CODE_LENGTH;
}

export default function ShareLandingPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleCodeChange = (event) => {
    const nextCode = event.target.value
      .toUpperCase()
      .replace(/[^A-F0-9]/g, '')
      .slice(0, SHARE_CODE_LENGTH);
    setCode(nextCode);
    setError('');
  };

  const handleSubmitCode = async (event) => {
    event.preventDefault();
    if (!hasValidCodeLength(code)) {
      setError('16자리 보안 코드 또는 기존 6자리 코드를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/share/${code}`);
      const data = await res.json();

      if (res.ok) {
        router.push(`/share/${code}`);
      } else {
        setError(data.error || '유효하지 않거나 만료된 코드입니다.');
        setCode('');
      }
    } catch (requestError) {
      console.error('Validation error:', requestError);
      setError('서버 연결 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md">
        <p className="kicker">File share</p>
        <h1 className="display mt-3 text-6xl">공유 코드 입력</h1>
        <p className="mt-3 text-muted-foreground">전달받은 16자리 보안 코드를 입력하면 다른 기기에서 파일을 내려받을 수 있습니다.</p>

        <form className="mt-8 grid gap-3" onSubmit={handleSubmitCode}>
          <Label htmlFor="share-code">공유 코드</Label>
          <Input
            id="share-code"
            className="h-12 text-center font-mono text-lg tracking-[0.2em]"
            type="text"
            value={code}
            onChange={handleCodeChange}
            maxLength={SHARE_CODE_LENGTH}
            autoComplete="off"
            spellCheck="false"
            placeholder="A1B2C3D4E5F60708"
            disabled={isLoading}
            aria-invalid={!!error}
            autoFocus
          />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={isLoading || !hasValidCodeLength(code)}>
            {isLoading ? <><Loader2 className="animate-spin" /> 확인 중</> : '파일 확인하기'}
          </Button>
        </form>
      </div>
    </section>
  );
}
