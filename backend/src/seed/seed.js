/**
 * Command-line installer.
 *
 *   npm run seed -- --admin-email=admin@shaggar.com --admin-password=Secret123 [--admin-name="System Admin"] [--demo]
 *
 * Creates the first administrator if there are no users yet and, with --demo,
 * loads sample teams, people, courses and progress.
 * Uses MONGODB_URI from .env (or the environment).
 */
import { connectDB, disconnectDB } from '../db.js';
import { User } from '../models/index.js';
import { createAdmin, seedDemo } from './demoData.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

async function main() {
  await connectDB();
  console.log('Connected to MongoDB. Indexes are ready.');
  if (await User.exists({})) {
    console.log('Users already exist, so no administrator or demo data was added.');
    return;
  }
  const email = String(args['admin-email'] || '').toLowerCase();
  const password = String(args['admin-password'] || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    console.error('Give --admin-email and an --admin-password of at least 8 characters to create the first administrator.');
    process.exitCode = 1;
    return;
  }
  const admin = await createAdmin(String(args['admin-name'] || 'Administrator'), email, password);
  console.log(`Administrator created: ${email}`);
  if (args.demo) {
    await seedDemo(admin._id);
    console.log('Demo data loaded. Demo accounts use the password Welcome@123 (e.g. trainer@shaggar.test, hana.tesfaye@shaggar.test, abebe.kebede@shaggar.test).');
  }
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
