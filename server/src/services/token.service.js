import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { hashSha256 } from '../utils/hash.js';
import { db } from '../prisma/db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'agamotto-dev-jwt-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'agamotto-dev-refresh-secret';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function generateRefreshToken(user) {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: user.id,
      jti: tokenId,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );
  return { token, tokenId };
}

export async function createSession(userId, refreshToken, req = null) {
  const refreshTokenHash = hashSha256(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const userAgent = req?.headers?.['user-agent'] || null;
  const ipAddress = req?.ip || req?.socket?.remoteAddress || null;

  await db.orm.public.UserSession.create({
    userId,
    refreshTokenHash,
    userAgent,
    ipAddress,
    expiresAt,
  });

  return { refreshTokenHash, expiresAt };
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}

export async function revokeSession(refreshToken) {
  const refreshTokenHash = hashSha256(refreshToken);
  await db.orm.public.UserSession.where({ refreshTokenHash }).updateAll({ isRevoked: true });
}
