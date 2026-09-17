import { Schema, model, type InferSchemaType } from 'mongoose';

const personSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    avatar: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

// Unique person name per user (case-insensitive collation for reliable search/dedup)
personSchema.index(
  { userId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export type Person = InferSchemaType<typeof personSchema>;

export const PersonModel = model('Person', personSchema);
