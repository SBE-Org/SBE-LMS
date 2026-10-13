import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    campaign: { type: String, trim: true, maxlength: 120, default: null },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true }
);

export const Team = mongoose.model('Team', teamSchema);
