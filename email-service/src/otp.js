import crypto from 'node:crypto';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

export function generateOtp() {
  const otp = crypto.randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH).toString();
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
  return { otp, hash, expiresAt };
}
