import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** Where the institutional logo can appear. Each one can be switched on/off and sized separately. */
export const LOGO_PLACEMENTS = {
  login: 'Login page',
  register: 'Student registration page',
  header: 'Main navigation header',
  dashboardAdmin: 'Administrator dashboard',
  dashboardDepartmentHead: 'Department Head dashboard',
  dashboardRegistrar: 'Registrar dashboard',
  dashboardStudent: 'Student dashboard',
  coursePages: 'Course pages',
  certificateTemplate: 'Certificate template (on screen and print)',
  certificatePdf: 'Downloadable PDF certificates',
  reports: 'Printable documents and reports',
};

/** Optional registration fields. Each is "off", "optional" or "required". */
export const REGISTRATION_FIELDS = {
  phone: 'Phone number',
  program: 'Program / course',
  trainingCategory: 'Training category',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  address: 'Address / location',
  educationLevel: 'Highest education level',
  qualifications: 'Qualifications',
  emergencyContact: 'Emergency contact',
  photo: 'Profile photograph',
  documents: 'Supporting documents',
};

export const DEFAULT_REGISTRATION_FIELDS = {
  phone: 'required',
  program: 'optional',
  trainingCategory: 'optional',
  dateOfBirth: 'optional',
  gender: 'off',
  address: 'optional',
  educationLevel: 'optional',
  qualifications: 'optional',
  emergencyContact: 'optional',
  photo: 'off',
  documents: 'optional',
};

/** Sensible defaults: the logo (or the built-in mark when none is uploaded) on sign-in pages, the header and certificates. */
export const DEFAULT_PLACEMENTS = {
  login: { enabled: true, size: 'large', align: 'center' },
  register: { enabled: true, size: 'large', align: 'center' },
  header: { enabled: true, size: 'small', align: 'left' },
  dashboardAdmin: { enabled: false, size: 'medium', align: 'left' },
  dashboardDepartmentHead: { enabled: false, size: 'medium', align: 'left' },
  dashboardRegistrar: { enabled: false, size: 'medium', align: 'left' },
  dashboardStudent: { enabled: false, size: 'medium', align: 'left' },
  coursePages: { enabled: false, size: 'small', align: 'right' },
  certificateTemplate: { enabled: true, size: 'medium', align: 'left' },
  certificatePdf: { enabled: true, size: 'medium', align: 'left' },
  reports: { enabled: true, size: 'small', align: 'left' },
};

const fileSchema = new mongoose.Schema(
  { fileId: ObjectId, name: String, contentType: String, size: Number, uploadedAt: Date },
  { _id: false }
);

const placementSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    size: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  },
  { _id: false }
);

const signatorySchema = new mongoose.Schema(
  {
    name: { type: String, maxlength: 120, default: '' },
    title: { type: String, maxlength: 120, default: '' },
    signature: { type: fileSchema, default: null },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    branding: {
      institutionName: { type: String, maxlength: 160, default: null },
      appName: { type: String, maxlength: 120, default: null },
      tagline: { type: String, maxlength: 200, default: '' },
      colors: {
        primary: { type: String, default: '#0e5e6f' },
        primaryDark: { type: String, default: '#093f4b' },
        accent: { type: String, default: '#e3a03a' },
      },
      logo: { type: fileSchema, default: null },
      certificateLogo: { type: fileSchema, default: null },
      keepAspectRatio: { type: Boolean, default: true },
      showNameWithLogo: { type: Boolean, default: true },
      placements: Object.fromEntries(Object.keys(LOGO_PLACEMENTS).map((k) => [k, { type: placementSchema, default: () => ({ ...DEFAULT_PLACEMENTS[k] }) }])),
    },
    certificate: {
      title: { type: String, maxlength: 80, default: 'Certificate of Completion' },
      useSeparateLogo: { type: Boolean, default: false },
      logoPosition: { type: String, enum: ['top', 'header', 'bottom'], default: 'header' },
      logoSize: { type: String, enum: ['small', 'medium', 'large'], default: 'medium' },
      logoAlign: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
      showDepartment: { type: Boolean, default: true },
      signatories: { type: [signatorySchema], default: () => [{ name: '', title: 'Training Manager' }] },
      seal: { type: fileSchema, default: null },
    },
    registration: {
      allowSelfRegistration: { type: Boolean, default: true },
      fields: Object.fromEntries(Object.keys(REGISTRATION_FIELDS).map((k) => [k, { type: String, enum: ['off', 'optional', 'required'], default: DEFAULT_REGISTRATION_FIELDS[k] }])),
      studentIdPrefix: { type: String, maxlength: 10, default: 'STU' },
      termsText: { type: String, maxlength: 5000, default: 'I confirm that the information I provide is accurate. I agree to the institution’s terms of use and consent to my personal data being processed for training administration, in line with the privacy notice.' },
    },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

export const Settings = mongoose.model('Settings', settingsSchema);
