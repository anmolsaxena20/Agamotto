import { verifyAccessToken } from '../services/token.service.js';
import { db } from '../prisma/db.ts';

export async function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyAccessToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await db.orm.public.User.where({ id: payload.sub }).first();

    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
