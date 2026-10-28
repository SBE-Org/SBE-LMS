import { config } from './config.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';
import { closeExpiredAttempts } from './routes/quiz.js';

async function main() {
  await connectDB();
  console.log('[db] Connected to MongoDB');
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[api] ${config.appName} API listening on port ${config.port}`);
    console.log(`[api] Allowed frontend origins: ${config.clientUrls.join(', ') || '(none)'}`);
  });
  // Timed quizzes left open (tab closed, connection lost) are closed with the answers saved so far.
  setInterval(() => closeExpiredAttempts().catch((e) => console.error('[quiz] Closing expired attempts failed:', e.message)), 60e3).unref();
}

main().catch((err) => {
  console.error('[api] Failed to start:', err.message);
  process.exit(1);
});
