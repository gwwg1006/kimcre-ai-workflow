'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Download, File as FileIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function formatRemaining(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return '만료됨';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}

export default function ShareDetailPage({ params }) {
  const resolvedParams = use(params);
  const { code } = resolvedParams;

  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [remainingTime, setRemainingTime] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(`/api/share/${code}`);
        const data = await res.json();

        if (res.ok) {
          setFile(data);
          setRemainingTime(formatRemaining(data.expiresAt));
        } else {
          setError(data.error || '파일을 불러오는데 실패했습니다.');
        }
      } catch (err) {
        console.error('Fetch metadata error:', err);
        setError('서버 연결 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (code) {
      fetchMetadata();
    }
  }, [code]);

  // Timer to update remaining time every minute
  useEffect(() => {
    if (!file) return;

    const timer = setInterval(() => {
      setRemainingTime(formatRemaining(file.expiresAt));
    }, 60000);

    return () => clearInterval(timer);
  }, [file]);

  const formatSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <section className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 공유된 파일 정보를 확인하고 있습니다.
          </p>
        ) : error ? (
          <div>
            <p className="kicker">File share</p>
            <h1 className="display mt-3 text-5xl">다운로드할 수 없습니다</h1>
            <p className="mt-3 text-destructive">{error}</p>
            <Button variant="outline" className="mt-8" onClick={() => router.push('/share')}>
              공유 코드 다시 입력하기
            </Button>
          </div>
        ) : file ? (
          <div>
            <div className="flex size-12 items-center justify-center rounded-md border bg-card">
              <FileIcon className="size-5" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight break-all">{file.fileName}</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{formatSize(file.fileSize)}</p>

            <dl className="mt-8 divide-y border-y text-sm">
              {[
                ['공유 코드', <span key="c" className="font-mono">{file.code}</span>],
                ['업로드 일시', <span key="d" className="font-mono">{formatDate(file.createdAt)}</span>],
                ['남은 시간', <span key="r" className="text-signal">{remainingTime}</span>],
                ['보관 정책', <span key="p" className="text-muted-foreground">업로드 7일 후 영구 삭제</span>],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 grid gap-2">
              <Button asChild size="lg">
                <a href={`/api/share/${code}?download=true`}><Download /> 파일 다운로드</a>
              </Button>
              <Button variant="ghost" onClick={() => router.push('/share')}>이전 화면으로</Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
