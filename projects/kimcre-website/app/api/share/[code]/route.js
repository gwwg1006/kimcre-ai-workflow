import { NextResponse } from 'next/server';
import { getSharedFile, deleteSharedFile } from '@/lib/db';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import { del } from '@vercel/blob';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

function normalizeShareCode(value) {
  return value?.trim().toUpperCase() || '';
}

function isValidShareCode(code) {
  return /^\d{6}$/.test(code) || /^[A-F0-9]{16}$/.test(code);
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const code = normalizeShareCode(resolvedParams.code);
    const clientIp = getClientIp(request);
    const limitResult = checkRateLimit(`share-read:${clientIp}`, {
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });

    if (!limitResult.allowed) {
      return rateLimitResponse(limitResult, '공유 코드 조회가 너무 많습니다. 잠시 후 다시 시도해주세요.');
    }

    if (!isValidShareCode(code)) {
      return NextResponse.json({ error: '존재하지 않거나 만료된 파일입니다.' }, { status: 404 });
    }

    const file = await getSharedFile(code);

    // If file doesn't exist
    if (!file) {
      return NextResponse.json({ error: '존재하지 않거나 만료된 파일입니다.' }, { status: 404 });
    }

    // Check if expired
    const isExpired = new Date(file.expiresAt) < new Date();
    if (isExpired) {
      // Lazily clean up
      try {
        if (file.fileUrl) {
          if (process.env.BLOB_READ_WRITE_TOKEN) {
            await del(file.fileUrl);
          }
        } else if (file.savedName) {
          const filePath = path.join(process.cwd(), 'uploads', 'shared', file.savedName);
          await unlink(filePath).catch(() => {});
        }
        await deleteSharedFile(code);
      } catch (err) {
        console.error('Lazy expiration cleanup failed:', err);
      }
      return NextResponse.json({ error: '공유 기간이 만료된 파일입니다.' }, { status: 410 });
    }

    const { searchParams } = new URL(request.url);
    const triggerDownload = searchParams.get('download') === 'true';

    if (triggerDownload) {
      let fileBuffer;

      if (file.fileUrl) {
        // Fetch from Vercel Blob
        try {
          const res = await fetch(file.fileUrl);
          if (!res.ok) {
            throw new Error(`Blob fetch failed with status ${res.status}`);
          }
          fileBuffer = await res.arrayBuffer();
        } catch (err) {
          console.error(`Failed to fetch file from Vercel Blob: ${file.fileUrl}`, err);
          return new Response('클라우드 저장소에서 파일을 로드하는 중 오류가 발생했습니다.', { status: 500 });
        }
      } else if (file.savedName) {
        // Read from local storage
        const filePath = path.join(process.cwd(), 'uploads', 'shared', file.savedName);
        try {
          fileBuffer = await readFile(filePath);
        } catch (err) {
          console.error(`Local file not found: ${filePath}`, err);
          return new Response('서버 디스크에서 파일을 찾을 수 없습니다.', { status: 404 });
        }
      } else {
        return new Response('파일 정보가 유효하지 않습니다.', { status: 400 });
      }

      // Serve file with content-disposition header for download
      const encodedName = encodeURIComponent(file.fileName);
      const headers = new Headers();
      headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
      headers.set('Content-Type', 'application/octet-stream');

      return new Response(fileBuffer, {
        status: 200,
        headers,
      });
    }

    // Return metadata only
    return NextResponse.json({
      code: file.code,
      fileName: file.fileName,
      fileSize: file.fileSize,
      createdAt: file.createdAt,
      expiresAt: file.expiresAt,
    });
  } catch (error) {
    console.error('Public download route error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
