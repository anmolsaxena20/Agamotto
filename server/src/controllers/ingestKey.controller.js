import crypto from 'node:crypto';
import { db } from '../prisma/db.ts';
import { hashSha256 } from '../utils/hash.js';

export async function createKey(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const { name, expiresAt } = req.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    const rawSecret = `ak_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawSecret.slice(0, 16);
    const keyHash = hashSha256(rawSecret);

    const ingestKey = await db.orm.public.IngestKey.create({
      orgId,
      name: name.trim(),
      keyHash,
      keyPrefix,
      isActive: true,
      createdById: req.user.id,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });

    return res.status(201).json({
      message: 'Ingest key created successfully',
      key: {
        id: ingestKey.id,
        orgId: ingestKey.orgId,
        name: ingestKey.name,
        keyPrefix: ingestKey.keyPrefix,
        secretKey: rawSecret,
        secret: rawSecret,
        isActive: ingestKey.isActive,
        expiresAt: ingestKey.expiresAt,
        createdAt: ingestKey.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listKeys(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const keys = await db.orm.public.IngestKey.where({ orgId }).all();

    const sanitizedKeys = keys.map((k) => ({
      id: k.id,
      orgId: k.orgId,
      name: k.name,
      keyPrefix: k.keyPrefix,
      isActive: k.isActive,
      createdById: k.createdById,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }));

    return res.status(200).json({ keys: sanitizedKeys });
  } catch (error) {
    next(error);
  }
}

export async function toggleKey(req, res, next) {
  try {
    const { orgId, keyId } = req.params;
    const { isActive } = req.body ?? {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const key = await db.orm.public.IngestKey.where({ id: keyId, orgId }).first();
    if (!key) {
      return res.status(404).json({ error: 'Ingest key not found' });
    }

    const updated = await db.orm.public.IngestKey.where({ id: keyId }).update({ isActive });

    return res.status(200).json({
      message: `Ingest key ${isActive ? 'activated' : 'deactivated'} successfully`,
      key: {
        id: updated.id,
        orgId: updated.orgId,
        name: updated.name,
        keyPrefix: updated.keyPrefix,
        isActive: updated.isActive,
        lastUsedAt: updated.lastUsedAt,
        expiresAt: updated.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeKey(req, res, next) {
  try {
    const { orgId, keyId } = req.params;

    const key = await db.orm.public.IngestKey.where({ id: keyId, orgId }).first();
    if (!key) {
      return res.status(404).json({ error: 'Ingest key not found' });
    }

    await db.orm.public.IngestKey.where({ id: keyId }).delete();

    return res.status(200).json({ message: 'Ingest key revoked successfully' });
  } catch (error) {
    next(error);
  }
}
