import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Roles. The learner role keeps its original key ("agent") so every existing
 * account, enrolment and report keeps working; it is shown as "Student".
 */
export const ROLES = {
  admin: 'System Administrator',
  department_head: 'Department Head',
  registrar: 'Registrar',
  trainer: 'Trainer',
  team_lead: 'Team Lead',
  agent: 'Student',
};

export const STUDENT_ROLE = 'agent';

/** Account status (sign-in), kept separate from registration approval. */
export const ACCOUNT_STATUSES = ['active', 'suspended', 'deactivated'];

/** Registration approval status (students only). */
export const REGISTRATION_STATUSES = ['pending', 'correction_requested', 'approved', 'rejected'];

const fileRefSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: true },
    name: { type: String, default: null },
    contentType: { type: String, default: null },
    size: { type: Number, default: null },
    label: { type: String, maxlength: 120, default: null },
    uploadedBy: { type: ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    action: { type: String, default: null }, // submitted, resubmitted, approved, rejected, correction_requested, edited
    by: { type: ObjectId, ref: 'User', default: null },
    byName: { type: String, default: null },
    byRole: { type: String, default: null },
    reason: { type: String, maxlength: 2000, default: null },
    override: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 190 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.keys(ROLES), default: 'agent' },
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    /** Student / staff ID. Students get one generated on approval if none was assigned. */
    employeeId: { type: String, trim: true, maxlength: 50, default: null },
    /** Kept for compatibility with every existing query: true only when accountStatus is "active". */
    active: { type: Boolean, default: true },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: 'active' },
    mustChangePassword: { type: Boolean, default: false },
    // Bumped when the password changes, so older sign-in tokens stop working.
    tokenVersion: { type: Number, default: 0, select: false },
    lastLoginAt: { type: Date, default: null },

    /** The student's (or staff member's home) department. */
    department: { type: ObjectId, ref: 'Department', default: null, index: true },
    /** Departments a Department Head or Registrar is authorized for. Empty for a registrar = every department. */
    departments: [{ type: ObjectId, ref: 'Department' }],
    /** Extra permissions an administrator can grant explicitly. */
    permissions: {
      approveRegistrations: { type: Boolean, default: false },
      authorizeCertificates: { type: Boolean, default: false },
    },

    phone: { type: String, trim: true, maxlength: 30, default: null },
    profile: {
      dateOfBirth: { type: String, default: null }, // YYYY-MM-DD
      gender: { type: String, maxlength: 30, default: null },
      address: { type: String, maxlength: 300, default: null },
      educationLevel: { type: String, maxlength: 120, default: null },
      qualifications: { type: String, maxlength: 1000, default: null },
      program: { type: String, maxlength: 160, default: null },
      trainingCategory: { type: String, maxlength: 120, default: null },
      emergencyContactName: { type: String, maxlength: 120, default: null },
      emergencyContactPhone: { type: String, maxlength: 30, default: null },
      photo: { type: fileRefSchema, default: null },
    },

    /** Student registration application. null status = not a student application (staff). */
    registration: {
      status: { type: String, enum: [...REGISTRATION_STATUSES, null], default: null, index: true },
      source: { type: String, enum: ['self', 'registrar', 'admin', 'import', 'legacy', 'talent_pool', null], default: null },
      submittedAt: { type: Date, default: null },
      createdBy: { type: ObjectId, ref: 'User', default: null },
      reviewedBy: { type: ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
      reason: { type: String, maxlength: 2000, default: null },
      termsAcceptedAt: { type: Date, default: null },
      documents: [fileRefSchema],
      history: [historySchema],
    },
  },
  { timestamps: true }
);

userSchema.index({ 'registration.status': 1, department: 1 });

export const User = mongoose.model('User', userSchema);
