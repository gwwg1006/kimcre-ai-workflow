import { NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';
import crypto from 'crypto';
import { checkRateLimit, clearRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

function passwordsMatch(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function POST(request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;
    const clientIp = getClientIp(request);
    const rateLimitKey = `admin-login:${clientIp}`;
    const limitResult = checkRateLimit(rateLimitKey, { limit: 5, windowMs: 15 * 60 * 1000 });

    if (!limitResult.allowed) {
      return rateLimitResponse(limitResult, '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.');
    }

    if (!adminPassword || adminPassword.length < 12) {
      console.error('ADMIN_PASSWORD is missing or shorter than 12 characters.');
      return NextResponse.json(
        { error: '관리자 인증이 설정되지 않았습니다.' },
        { status: 503 }
      );
    }

    if (typeof password !== 'string' || !passwordsMatch(password, adminPassword)) {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    const payload = {
      role: 'admin',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    const token = signToken(payload);
    clearRateLimit(rateLimitKey);

    const response = NextResponse.json({ success: true });
    
    // Set cookie
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
