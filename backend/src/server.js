import { config } from './config.js';
import { connectDB } from './db.js';
import { createApp } from './app.js';

async function main() {
  await connectDB();
  console.log('[db] Connected to MongoDB');
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[api] ${config.appName} API listening on port ${config.port}`);
    console.log(`[api] Allowed frontend origins: ${config.clientUrls.join(', ') || '(none)'}`);
  });
}

main().catch((err) => {
  console.error('[api] Failed to start:', err.message);
  process.exit(1);
});
