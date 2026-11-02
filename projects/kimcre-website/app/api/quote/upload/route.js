import { handleUpload } from '@vercel/blob/client';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['stl', 'obj', 'step', 'stp', '3mf', 'zip']);

function isAllowedPathname(pathname) {
  if (!pathname.startsWith('quotes/')) return false;
  const extension = pathname.split('.').pop()?.toLowerCase();
  return extension ? ALLOWED_EXTENSIONS.has(extension) : false;
}

export async function GET() {
  return Response.json({ enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

export async function POST(request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: 'Blob storage is not configured.' },
        { status: 503 }
      );
    }

    const body = await request.json();

    if (body?.type === 'blob.generate-client-token') {
      const clientIp = getClientIp(request);
      const limitResult = checkRateLimit(`quote-upload-token:${clientIp}`, {
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      if (!limitResult.allowed) {
        return rateLimitResponse(limitResult, '파일 업로드 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.');
      }
    }

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedPathname(pathname)) {
          throw new Error('허용되지 않은 파일 형식입니다.');
        }

        return {
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });

    return Response.json(result);
  } catch (error) {
    console.error('Quote Blob upload error:', error);
    return Response.json(
      { error: error.message || '파일 업로드 인증 중 오류가 발생했습니다.' },
      { status: 400 }
    );
  }
}
