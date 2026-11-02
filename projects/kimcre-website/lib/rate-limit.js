const rateLimitStore = globalThis.__kimcreRateLimitStore ?? new Map();

if (!globalThis.__kimcreRateLimitStore) {
  globalThis.__kimcreRateLimitStore = rateLimitStore;
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    rateLimitStore.set(key, next);
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

export function rateLimitResponse(result, message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.') {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
