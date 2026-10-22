import { db } from '../prisma/db.ts';
import { hashSha256 } from '../utils/hash.js';

export async function validateIngestKey(req, res, next) {
  try {
    const internalToken = process.env.INGESTION_KEY_VALIDATION_TOKEN || process.env.INTERNAL_SERVICE_TOKEN;
    const authHeader = req.headers.authorization;

    if (!internalToken || authHeader !== `Bearer ${internalToken}`) {
      return res.status(401).json({ error: 'Unauthorized internal service request' });
    }

    const { apiKey } = req.body ?? {};
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'apiKey is required' });
    }

    const keyHash = hashSha256(apiKey.trim());
    const key = await db.orm.public.IngestKey.where({ keyHash, isActive: true }).first();

    if (!key) {
      return res.status(401).json({ error: 'Invalid or inactive ingestion key' });
    }

    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ error: 'Ingestion key has expired' });
    }

    await db.orm.public.IngestKey.where({ id: key.id }).update({
      lastUsedAt: new Date().toISOString(),
    });

    return res.status(200).json({ organizationId: key.orgId });
  } catch (error) {
    next(error);
  }
}
