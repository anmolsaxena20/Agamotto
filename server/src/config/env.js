const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

const OPTIONAL = {
  PORT: '3000',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
  EMAIL_SERVICE_HOST: 'localhost',
  EMAIL_SERVICE_PORT: '5000',
  CLIENT_URL: 'http://localhost:5173',
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY_DAYS: '7',
};

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  for (const [key, fallback] of Object.entries(OPTIONAL)) {
    if (!process.env[key]) {
      process.env[key] = fallback;
    }
  }
}

export function env(key) {
  return process.env[key] || '';
}
