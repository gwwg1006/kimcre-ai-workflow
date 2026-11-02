import { NextResponse } from 'next/server';
import { saveQuote } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { sendQuoteNotification, sendQuoteConfirmationToUser } from '@/lib/email';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['stl', 'obj', 'step', 'stp', '3mf', 'zip']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

function textValue(formData, key) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function hasAllowedExtension(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return Boolean(extension && ALLOWED_EXTENSIONS.has(extension));
}

function isTrustedQuoteBlobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.blob.vercel-storage.com')
      && url.pathname.startsWith('/quotes/');
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const limitResult = checkRateLimit(`quote-submit:${clientIp}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limitResult.allowed) {
      return rateLimitResponse(limitResult, '견적 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.');
    }

    const formData = await request.formData();
    const name = textValue(formData, 'name');
    const phone = textValue(formData, 'phone');
    const email = textValue(formData, 'email');
    const method = textValue(formData, 'method');
    const material = textValue(formData, 'material');
    const deadline = textValue(formData, 'deadline');
    const description = textValue(formData, 'description');
    const quantity = Number.parseInt(textValue(formData, 'quantity') || '1', 10);
    const privacyAgreed = textValue(formData, 'privacyAgreed') === 'true';

    if (!name || !phone || !email || !description || !privacyAgreed) {
      return NextResponse.json(
        { error: '필수 입력 항목과 개인정보 동의를 확인해주세요.' },
        { status: 400 }
      );
    }

    if (name.length > 80 || description.length > 5000 || method.length > 40 || material.length > 40) {
      return NextResponse.json({ error: '입력 내용이 허용된 길이를 초과했습니다.' }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
    }
    if (!PHONE_PATTERN.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json({ error: '올바른 연락처를 입력해주세요.' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      return NextResponse.json({ error: '수량은 1개 이상 10,000개 이하로 입력해주세요.' }, { status: 400 });
    }

    const uploadedFile = formData.get('file');
    const fileName = textValue(formData, 'fileName');
    const fileUrl = textValue(formData, 'fileUrl');
    const fileDownloadUrl = textValue(formData, 'fileDownloadUrl');
    const fileSize = Number.parseInt(textValue(formData, 'fileSize') || '0', 10);
    let fileInfo = null;

    if (fileUrl || fileName || fileSize) {
      if (
        !fileName
        || !hasAllowedExtension(fileName)
        || !Number.isInteger(fileSize)
        || fileSize <= 0
        || fileSize > MAX_FILE_SIZE
        || !isTrustedQuoteBlobUrl(fileUrl)
        || (fileDownloadUrl && !isTrustedQuoteBlobUrl(fileDownloadUrl))
      ) {
        return NextResponse.json({ error: '업로드된 파일 정보가 유효하지 않습니다.' }, { status: 400 });
      }

      fileInfo = {
        name: fileName,
        url: fileUrl,
        downloadUrl: fileDownloadUrl || fileUrl,
        size: fileSize,
      };
    } else if (uploadedFile instanceof File && uploadedFile.size > 0) {
      if (!hasAllowedExtension(uploadedFile.name) || uploadedFile.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: '파일 형식 또는 크기가 허용 범위를 벗어났습니다.' }, { status: 400 });
      }
      if (process.env.VERCEL) {
        return NextResponse.json({ error: '파일은 안전한 직접 업로드를 먼저 완료해야 합니다.' }, { status: 400 });
      }

      const buffer = Buffer.from(await uploadedFile.arrayBuffer());
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await mkdir(uploadsDir, { recursive: true });
      const cleanFileName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeFileName = `${Date.now()}_${cleanFileName}`;
      await writeFile(path.join(uploadsDir, safeFileName), buffer);
      fileInfo = { name: uploadedFile.name, savedName: safeFileName, size: uploadedFile.size };
    }

    const saved = await saveQuote({
      name,
      phone,
      email,
      method,
      material,
      quantity,
      deadline,
      description,
      file: fileInfo,
    });

    try {
      await sendQuoteNotification(saved);
      await sendQuoteConfirmationToUser(saved);
    } catch (emailError) {
      console.error('이메일 알림 발송 실패:', emailError);
    }

    return NextResponse.json({ success: true, id: saved.id });
  } catch (error) {
    console.error('Quote submission error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
