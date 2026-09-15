import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_COST, r: 8, p: 1 });
  return `scrypt$${SCRYPT_COST}$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, cost, blockSize, parallelization, saltText, hashText] = String(encoded).split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, {
    N: Number(cost), r: Number(blockSize), p: Number(parallelization)
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signature(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSession(account, secret, lifetimeMs = 7 * 24 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({
    accountId: account.accountId,
    nickname: account.username,
    expiresAt: Date.now() + lifetimeMs
  })).toString('base64url');
  return `${payload}.${signature(secret, payload)}`;
}

export function verifySession(token, secret) {
  const [payload, supplied] = String(token || '').split('.');
  if (!payload || !supplied) return null;
  const expected = signature(secret, payload);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.expiresAt > Date.now() && session.accountId && session.nickname ? session : null;
  } catch { return null; }
}
