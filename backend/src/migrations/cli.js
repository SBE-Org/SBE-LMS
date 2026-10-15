/**
 * npm run migrate            apply pending migrations
 * npm run migrate:status     show which migrations are applied
 * npm run migrate:down       roll back the most recent migration
 *
 * Back up first (mongodump) before rolling back in production.
 */
import { connectDB, disconnectDB } from '../db.js';
import '../models/index.js';
import { runMigrations, rollbackLast, migrationStatus } from './index.js';

const cmd = process.argv[2] || 'up';

async function main() {
  await connectDB(undefined, { migrate: false });
  if (cmd === 'down') {
    const r = await rollbackLast();
    console.log(r ? `Rolled back ${r.id}` : 'Nothing to roll back.');
  } else if (cmd === 'status') {
    for (const m of await migrationStatus()) console.log(`${m.appliedAt ? '✓' : '·'} ${m.id} — ${m.description}${m.appliedAt ? ` (applied ${m.appliedAt.toISOString()})` : ''}`);
  } else {
    const r = await runMigrations({ log: true });
    console.log(r.length ? `Applied ${r.length} migration(s).` : 'Database is up to date.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
