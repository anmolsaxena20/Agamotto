import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function comparePassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

export function hashSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node src/utils/hash.js <password>');
    process.exit(1);
  }
  hashPassword(input).then((hashed) => {
    console.log(hashed);
  });
}
