import mongoose from 'mongoose';

/** An academic / organizational department. Heads and registrars are linked through User.departments. */
const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20, unique: true },
    description: { type: String, maxlength: 1000, default: '' },
    /** Programs / training categories offered, shown on the registration form. */
    programs: [{ type: String, trim: true, maxlength: 160 }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Department = mongoose.model('Department', departmentSchema);
