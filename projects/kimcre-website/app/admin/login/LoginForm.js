'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      // Refresh page status and navigate to dashboard
      router.push('/admin/dashboard');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm">
        <p className="kicker">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">김명규크리에이티브</h1>
        <p className="mt-1 text-sm text-muted-foreground">관리자 로그인</p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-3">
          <Label htmlFor="admin-password">비밀번호</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isSubmitting}
            aria-invalid={!!error}
            autoFocus
            required
          />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="animate-spin" /> 로그인 중</> : '로그인'}
          </Button>
        </form>
      </div>
    </div>
  );
}
