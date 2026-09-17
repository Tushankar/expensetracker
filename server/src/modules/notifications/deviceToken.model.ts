import { Schema, model, type InferSchemaType } from 'mongoose';

export const PLATFORMS = ['ios', 'android', 'web', 'unknown'] as const;
export type Platform = (typeof PLATFORMS)[number];

const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, trim: true },
    platform: { type: String, required: true, enum: PLATFORMS, default: 'unknown' },
    deviceId: { type: String, default: null, trim: true },
    enabled: { type: Boolean, required: true, default: true },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

deviceTokenSchema.index({ userId: 1, enabled: 1 });
deviceTokenSchema.index({ userId: 1, token: 1 });

export type DeviceToken = InferSchemaType<typeof deviceTokenSchema>;
export const DeviceTokenModel = model('DeviceToken', deviceTokenSchema);
