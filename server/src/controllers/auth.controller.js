import crypto from 'node:crypto';
import { db } from '../prisma/db.ts';
import { hashPassword, comparePassword, hashSha256 } from '../utils/hash.js';
import {
  generateAccessToken,
  generateRefreshToken,
  createSession,
  verifyRefreshToken,
  revokeSession,
} from '../services/token.service.js';
import { sendOtpEmail } from '../services/email.client.js';
import {
  savePendingOtp,
  getPendingOtp,
  deletePendingOtp,
} from '../services/otp.store.js';
import { provisionDefaultGroups } from '../services/rbac.service.js';

const CLIENT_URL = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  };

  res.cookie('access_token', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refresh_token', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  };
  res.clearCookie('access_token', cookieOptions);
  res.clearCookie('refresh_token', cookieOptions);
}

export async function signup(req, res, next) {
  try {
    const { email, password, name } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (existing && existing.isEmailVerified) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const { otpHash, expiresAt } = await sendOtpEmail(normalizedEmail, 'signup', name || '');
    const hashedPassword = await hashPassword(password);

    savePendingOtp(normalizedEmail, 'SIGNUP', {
      email: normalizedEmail,
      hashedPassword,
      name: name || normalizedEmail.split('@')[0],
      otpHash,
      expiresAt,
    });

    return res.status(200).json({
      message: 'Verification code sent to your email',
      email: normalizedEmail,
      expiresAt,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body ?? {};

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const pending = getPendingOtp(normalizedEmail, 'SIGNUP');

    if (!pending) {
      return res.status(400).json({ error: 'No pending verification found or OTP expired' });
    }

    const inputHash = hashSha256(String(otp).trim());
    if (inputHash !== pending.otpHash) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    deletePendingOtp(normalizedEmail, 'SIGNUP');

    let user = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (user) {
      user = await db.orm.public.User.where({ id: user.id }).update({
        hashedPassword: pending.hashedPassword,
        name: pending.name,
        isEmailVerified: true,
        status: 'ACTIVE',
      });
    } else {
      user = await db.orm.public.User.create({
        email: normalizedEmail,
        hashedPassword: pending.hashedPassword,
        name: pending.name,
        isEmailVerified: true,
        status: 'ACTIVE',
      });

      const slug = `${normalizedEmail.split('@')[0]}-${crypto.randomBytes(3).toString('hex')}`.toLowerCase();
      const org = await db.orm.public.Organization.create({
        name: `${user.name || 'Personal'}'s Org`,
        slug,
        createdById: user.id,
      });

      const member = await db.orm.public.OrganizationMember.create({
        orgId: org.id,
        userId: user.id,
        status: 'ACTIVE',
      });

      await provisionDefaultGroups(org.id, member.id);
    }

    const accessToken = generateAccessToken(user);
    const { token: refreshToken } = generateRefreshToken(user);
    await createSession(user.id, refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(201).json({
      message: 'Account verified successfully',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (!user || !user.hashedPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is suspended or deactivated' });
    }

    const isMatch = await comparePassword(password, user.hashedPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const { token: refreshToken } = generateRefreshToken(user);
    await createSession(user.id, refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const rawToken = req.body?.refreshToken || req.cookies?.refresh_token;

    if (!rawToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    const payload = verifyRefreshToken(rawToken);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashSha256(rawToken);

    const session = await db.orm.public.UserSession.where({ refreshTokenHash: tokenHash }).first();

    if (!session || session.isRevoked || new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session is revoked or expired' });
    }

    const user = await db.orm.public.User.where({ id: payload.sub }).first();

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    await db.orm.public.UserSession.where({ id: session.id }).update({ isRevoked: true });

    const newAccessToken = generateAccessToken(user);
    const { token: newRefreshToken } = generateRefreshToken(user);
    await createSession(user.id, newRefreshToken, req);

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body ?? {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (!user) {
      return res.status(200).json({ message: 'If an account exists, a reset code was sent' });
    }

    const { otpHash, expiresAt } = await sendOtpEmail(normalizedEmail, 'forgot-password', user.name || '');

    savePendingOtp(normalizedEmail, 'FORGOT_PASSWORD', {
      email: normalizedEmail,
      otpHash,
      expiresAt,
    });

    return res.status(200).json({
      message: 'If an account exists, a reset code was sent',
      expiresAt,
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword, confirmNewPassword } = req.body ?? {};

    if (!email || !otp || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ error: 'Email, OTP, new password, and confirm new password are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ error: 'New password and confirm new password do not match' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const pending = getPendingOtp(normalizedEmail, 'FORGOT_PASSWORD');

    if (!pending) {
      return res.status(400).json({ error: 'No pending reset request found or OTP expired' });
    }

    const inputHash = hashSha256(String(otp).trim());
    if (inputHash !== pending.otpHash) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    deletePendingOtp(normalizedEmail, 'FORGOT_PASSWORD');

    const user = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPassword = await hashPassword(newPassword);

    await db.orm.public.User.where({ id: user.id }).update({ hashedPassword });

    await db.orm.public.UserSession.where({ userId: user.id }).updateAll({ isRevoked: true });

    return res.status(200).json({ message: 'Password has been reset successfully. Please log in.' });
  } catch (error) {
    next(error);
  }
}

export async function oauthCallback(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect(`${CLIENT_URL}/login?error=OAuthFailed`);
    }

    const accessToken = generateAccessToken(user);
    const { token: refreshToken } = generateRefreshToken(user);
    await createSession(user.id, refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    if (req.accepts('html')) {
      return res.redirect(`${CLIENT_URL}/auth/callback?token=${accessToken}`);
    }

    return res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const rawToken = req.body?.refreshToken || req.cookies?.refresh_token;

    if (rawToken) {
      await revokeSession(rawToken);
    }

    clearAuthCookies(res);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const user = req.user;
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
