import 'dotenv/config';

const list = (v) => String(v || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: int(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shaggar_lms',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls: list(process.env.CLIENT_URL || 'http://localhost:5173'),
  trustProxy: int(process.env.TRUST_PROXY, 0),
  appName: process.env.APP_NAME || 'Shaggar BPO Academy',
  company: process.env.APP_COMPANY || 'Shaggar BPO Enterprise',
  timezone: process.env.APP_TIMEZONE || 'Africa/Addis_Ababa',
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 200),
  loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5),
};

if (!config.jwtSecret || config.jwtSecret === 'change-me-to-a-long-random-string') {
  if (config.isProd) {
    throw new Error('JWT_SECRET must be set to a long random value in production.');
  }
  config.jwtSecret = config.jwtSecret || 'dev-only-insecure-secret';
  console.warn('[config] JWT_SECRET is not set to a real secret. Fine for local development only.');
}
