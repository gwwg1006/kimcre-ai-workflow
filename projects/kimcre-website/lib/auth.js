import crypto from 'crypto';

let developmentSecret;

function getSecret() {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }

  developmentSecret ||= crypto.randomBytes(32).toString('base64url');
  return developmentSecret;
}

export function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('base64url');

  // Time-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSignature, 'base64url');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch (e) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null; // Token has expired
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token) {
  const payload = verifyToken(token);
  return payload?.role === 'admin' ? payload : null;
}
