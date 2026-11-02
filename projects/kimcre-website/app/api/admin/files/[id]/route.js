import { NextResponse } from 'next/server';
import { getQuotes } from '@/lib/db';
import { verifyAdminToken } from '@/lib/auth';
import { readFile } from 'fs/promises';
import path from 'path';

function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

export async function GET(request, { params }) {
  if (!checkAuth(request)) {
    return new Response('인증되지 않은 요청입니다.', { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const quotes = await getQuotes();
    const quote = quotes.find((q) => q.id === id);

    if (!quote || !quote.file) {
      return new Response('파일을 찾을 수 없습니다.', { status: 404 });
    }

    const { name: originalName } = quote.file;
    if (quote.file.url) {
      // Redirect after authorization so large files do not pass through the
      // Vercel Function response-size limit.
      return NextResponse.redirect(quote.file.downloadUrl || quote.file.url);
    } else if (quote.file.savedName) {
      // Local storage fallback
      const filePath = path.join(process.cwd(), 'uploads', quote.file.savedName);
      try {
        const fileBuffer = await readFile(filePath);
        const encodedName = encodeURIComponent(originalName);
        const headers = new Headers();
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
        headers.set('Content-Type', 'application/octet-stream');
        return new Response(fileBuffer, { status: 200, headers });
      } catch (err) {
        console.error(`File not found on local disk: ${filePath}`, err);
        return new Response('서버 디스크에서 파일을 찾을 수 없습니다.', { status: 404 });
      }
    } else {
      return new Response('파일 정보가 유효하지 않습니다.', { status: 400 });
    }

  } catch (error) {
    console.error('File download error:', error);
    return new Response('파일 다운로드 중 서버 오류가 발생했습니다.', { status: 500 });
  }
}
