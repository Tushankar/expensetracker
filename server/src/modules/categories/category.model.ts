import { Schema, Types, model, type InferSchemaType } from 'mongoose';

export const CATEGORY_TYPES = ['expense', 'income', 'transfer'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

const categorySchema = new Schema(
  {
    /**
     * Null for the system categories every account starts with. A user's own
     * categories carry their id, and every read filters on
     * `{ $or: [{ userId: null }, { userId: me }] }` — which is also why a user
     * can never see, edit or delete someone else's.
     */
    userId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /**
     * The heading this sits under — Food, Transport, Home. The Indian default set
     * is two levels deep (Food › Swiggy) because that is how people actually
     * describe spending, and a flat list of ninety categories is unusable in a
     * picker.
     */
    group: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, required: true, enum: CATEGORY_TYPES, default: 'expense' },
    /** Name from the mobile icon registry. */
    icon: { type: String, required: true, default: 'circle', maxlength: 40 },
    /** Hue key from the mobile palette, so charts stay consistent across accents. */
    color: { type: String, required: true, default: 'other', maxlength: 24 },
    /** True for the seeded set. A default category cannot be edited or deleted. */
    isDefault: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
    /** Sort order within a group; seeded categories keep the order they are listed in. */
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

categorySchema.index({ userId: 1, type: 1, isActive: 1 });
categorySchema.index(
  { userId: 1, name: 1, group: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

export type Category = InferSchemaType<typeof categorySchema>;

export const CategoryModel = model('Category', categorySchema);
