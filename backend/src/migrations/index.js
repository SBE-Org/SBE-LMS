/**
 * Data migrations.
 *
 * MongoDB has no schema migrations as such: new fields simply start empty. These
 * steps fill sensible values into EXISTING records so they keep working with the
 * new rules. Every step is additive and idempotent, is recorded in the
 * "migrations" collection, and has a matching rollback.
 *
 *   Run automatically on API start-up (connectDB), or by hand:
 *     npm run migrate            apply pending migrations
 *     npm run migrate:status     list applied migrations
 *     npm run migrate:down       roll back the most recent migration
 */
import mongoose from 'mongoose';
import { User, Certificate, Course, Settings } from '../models/index.js';

const MIGRATIONS = [
  {
    id: '2026-10-roles-registration-branding',
    description: 'Account status, legacy registration approval for existing students, certificate status, default settings',
    async up() {
      // 1. Account status mirrors the existing "active" flag.
      const a = await User.updateMany({ accountStatus: { $exists: false }, active: true }, { $set: { accountStatus: 'active' } });
      const b = await User.updateMany({ accountStatus: { $exists: false }, active: false }, { $set: { accountStatus: 'deactivated' } });

      // 2. Existing students were already allowed to learn: record them as approved (legacy), with a history entry.
      const legacy = await User.find({ role: 'agent', $or: [{ 'registration.status': null }, { 'registration.status': { $exists: false } }] }, '_id createdAt').lean();
      for (const u of legacy) {
        await User.updateOne(
          { _id: u._id },
          {
            $set: {
              'registration.status': 'approved',
              'registration.source': 'legacy',
              'registration.submittedAt': u.createdAt || new Date(),
              'registration.reviewedAt': new Date(),
              'registration.reason': null,
            },
            $push: { 'registration.history': { status: 'approved', action: 'migrated', reason: 'Existing account carried over as approved when the approval workflow was introduced.', at: new Date() } },
          }
        );
      }

      // 3. Certificates created before statuses existed are issued.
      const c = await Certificate.updateMany({ status: { $exists: false } }, { $set: { status: 'issued' } });

      // 4. Courses: explicit defaults (no behaviour change).
      await Course.updateMany({ department: { $exists: false } }, { $set: { department: null } });
      await Course.updateMany({ certificateRequiresApproval: { $exists: false } }, { $set: { certificateRequiresApproval: false } });

      // 5. Settings document with defaults.
      await Settings.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true });

      return { accountStatus: a.modifiedCount + b.modifiedCount, legacyStudents: legacy.length, certificates: c.modifiedCount };
    },
    async down() {
      // Undo only what "up" filled in; records created through the new workflow are left alone.
      await User.updateMany(
        { 'registration.source': 'legacy' },
        { $set: { 'registration.status': null, 'registration.source': null, 'registration.submittedAt': null, 'registration.reviewedAt': null, 'registration.history': [] } }
      );
      await User.updateMany({}, { $unset: { accountStatus: '' } });
      // The previous version only knows admin/trainer/team_lead/agent. Map new roles back without granting more access.
      await User.updateMany({ role: 'department_head' }, { $set: { role: 'team_lead' } });
      await User.updateMany({ role: 'registrar' }, { $set: { role: 'agent', active: false } });
      // Pending certificates did not exist before: they stay hidden (removed); revoked ones are removed too.
      await Certificate.deleteMany({ status: { $in: ['pending', 'revoked'] } });
      await Certificate.updateMany({}, { $unset: { status: '' } });
      return { rolledBack: true };
    },
  },
];

const coll = () => mongoose.connection.db.collection('migrations');

export async function runMigrations({ log = false } = {}) {
  const done = new Set((await coll().find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  const results = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    const result = await m.up();
    await coll().insertOne({ _id: m.id, description: m.description, appliedAt: new Date(), result });
    results.push({ id: m.id, result });
    if (log || process.env.NODE_ENV !== 'test') console.log(`[migrate] applied ${m.id}`, JSON.stringify(result));
  }
  return results;
}

export async function rollbackLast() {
  const last = (await coll().find({}).sort({ appliedAt: -1 }).limit(1).toArray())[0];
  if (!last) return null;
  const m = MIGRATIONS.find((x) => x.id === last._id);
  if (!m) throw new Error(`Unknown migration ${last._id}`);
  const result = await m.down();
  await coll().deleteOne({ _id: m.id });
  return { id: m.id, result };
}

export async function migrationStatus() {
  const applied = await coll().find({}).toArray();
  const byId = new Map(applied.map((d) => [d._id, d]));
  return MIGRATIONS.map((m) => ({ id: m.id, description: m.description, appliedAt: byId.get(m.id)?.appliedAt || null }));
}
