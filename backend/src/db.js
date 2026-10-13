import mongoose from 'mongoose';
import { config } from './config.js';

let bucket = null;

export async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'lessonFiles' });
  // Make sure unique indexes exist before the first request (cheap if they already do).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return mongoose.connection;
}

/** GridFS bucket that stores lesson files (PDF, video, slides…). */
export function filesBucket() {
  if (!bucket) throw new Error('Database is not connected yet.');
  return bucket;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  bucket = null;
}
