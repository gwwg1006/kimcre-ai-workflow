import { NextResponse } from 'next/server';
import { getMhbUser, createMhbUser, updateMhbUserPassword } from '@/lib/db';
import { signToken } from '@/lib/auth';
import crypto from 'crypto';
import { promisify } from 'util';
import { checkRateLimit, clearRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (storedHash?.startsWith('scrypt$')) {
    const [, cost, blockSize, parallelization, salt, expectedHex] = storedHash.split('$');
    if (!cost || !blockSize || !parallelization || !salt || !expectedHex) return false;

    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  const legacyBuffer = Buffer.from(legacyHash);
  const storedBuffer = Buffer.from(storedHash || '');
  return legacyBuffer.length === storedBuffer.length
    && crypto.timingSafeEqual(legacyBuffer, storedBuffer);
}

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { error: '닉네임과 비밀번호를 모두 입력해주세요.' },
        { status: 400 }
      );
    }
    
    const trimmedUser = username.trim();
    if (trimmedUser.length < 2 || trimmedUser.length > 15) {
      return NextResponse.json(
        { error: '닉네임은 2자 이상 15자 이하로 설정해 주세요.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: '비밀번호는 8자 이상 128자 이하로 설정해 주세요.' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const rateLimitKey = `mhb-auth:${clientIp}:${trimmedUser.toLowerCase()}`;
    const limitResult = checkRateLimit(rateLimitKey, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!limitResult.allowed) {
      return rateLimitResponse(limitResult, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
    }

    let user = await getMhbUser(trimmedUser);
    let isNewUser = false;
    
    if (!user) {
      // Automatic Registration
      const hashedPassword = await hashPassword(password);
      user = await createMhbUser(trimmedUser, hashedPassword);
      isNewUser = true;
    } else {
      // Verify Password
      if (!(await verifyPassword(password, user.password))) {
        return NextResponse.json(
          { error: '비밀번호가 일치하지 않습니다. 다른 닉네임을 사용하시거나 정확한 비밀번호를 입력해주세요.' },
          { status: 401 }
        );
      }

      // Transparently upgrade legacy SHA-256 hashes after a successful login.
      if (!user.password.startsWith('scrypt$')) {
        const upgradedHash = await hashPassword(password);
        await updateMhbUserPassword(user.id, upgradedHash);
      }
    }

    clearRateLimit(rateLimitKey);
    
    // Sign token (valid for 30 days)
    const token = signToken({
      userId: user.id,
      username: user.username,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    
    const response = NextResponse.json({
      success: true,
      isNewUser,
      user: {
        id: user.id,
        username: user.username,
        level: user.level,
        exp: user.exp,
        score: user.score,
        satiety: user.satiety,
        hydration: user.hydration,
        stress: user.stress,
        feedCount: user.feedCount,
        waterCount: user.waterCount,
        playCount: user.playCount,
        loveCount: user.loveCount,
        lastActionTime: user.lastActionTime
      }
    });
    
    response.cookies.set('mhb_game_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
    
    return response;
  } catch (error) {
    console.error('MHB Game Auth API error:', error);
    return NextResponse.json(
      { error: '인증 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
