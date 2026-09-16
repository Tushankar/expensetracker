import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * One turn of a conversation with the assistant.
 *
 * Persisted server-side so a chat survives closing the app, which is what makes
 * it feel like an assistant rather than a search box that forgets you. It is a
 * transcript, not a memory: each question is answered from freshly computed
 * figures, never from what was said before, so an answer can never drift away
 * from the data by being built on an earlier answer.
 */
const aiMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true, enum: ['user', 'assistant'] },
    text: { type: String, required: true, maxlength: 2000 },
    /**
     * What the server looked up to answer, so the UI can show the working —
     * which category, which period, which transactions.
     */
    context: { type: Schema.Types.Mixed, default: {} },
    /** False when the deterministic fallback answered instead of the model. */
    fromModel: { type: Boolean, required: true, default: true },
    limitedData: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

aiMessageSchema.index({ userId: 1, createdAt: -1 });
// A month-old chat is not worth keeping; the data it described has moved on.
aiMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export type AiMessage = InferSchemaType<typeof aiMessageSchema>;

export const AiMessageModel = model('AiMessage', aiMessageSchema);
