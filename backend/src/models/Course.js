import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, default: '' },
    category: { type: String, trim: true, maxlength: 80, default: null },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    selfEnrol: { type: Boolean, default: false },
    certificateEnabled: { type: Boolean, default: true },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
export const Course = mongoose.model('Course', courseSchema);

const moduleSchema = new mongoose.Schema({
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  position: { type: Number, default: 0 },
});
export const Module = mongoose.model('Module', moduleSchema);

const lessonSchema = new mongoose.Schema({
  module: { type: ObjectId, ref: 'Module', required: true, index: true },
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  type: { type: String, enum: ['text', 'video', 'file'], default: 'text' },
  body: { type: String, default: '' },
  videoUrl: { type: String, maxlength: 500, default: null },
  // Uploaded file, stored in GridFS
  file: {
    id: { type: ObjectId, default: null },
    name: { type: String, default: null },
    contentType: { type: String, default: null },
    size: { type: Number, default: null },
  },
  durationMin: { type: Number, default: null },
  position: { type: Number, default: 0 },
});
export const Lesson = mongoose.model('Lesson', lessonSchema);
