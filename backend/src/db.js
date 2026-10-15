import mongoose from 'mongoose';
import { config } from './config.js';

let bucket = null;
const buckets = new Map();

export async function connectDB(uri = config.mongoUri, { migrate = true } = {}) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'lessonFiles' });
  // Make sure unique indexes exist before the first request (cheap if they already do).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  if (migrate) {
    // Safe, idempotent data migrations (see src/migrations). Imported lazily to avoid a cycle.
    const { runMigrations } = await import('./migrations/index.js');
    await runMigrations();
  }
  return mongoose.connection;
}

/** GridFS bucket that stores lesson files (PDF, video, slides…). */
export function filesBucket() {
  if (!bucket) throw new Error('Database is not connected yet.');
  return bucket;
}

/**
 * Other GridFS buckets: "brandingFiles" (logos, signatures, seal — public) and
 * "registrationFiles" (student documents and photos — access controlled).
 */
export function getBucket(name) {
  if (!mongoose.connection.db) throw new Error('Database is not connected yet.');
  if (!buckets.has(name)) buckets.set(name, new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: name }));
  return buckets.get(name);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  bucket = null;
  buckets.clear();
}
