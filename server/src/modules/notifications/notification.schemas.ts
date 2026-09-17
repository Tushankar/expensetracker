import { z } from 'zod';
import { NOTIFICATION_TYPES } from './notification.model';
import { PLATFORMS } from './deviceToken.model';

export const quietHoursSchema = z.object({
  enabled: z.boolean().default(true),
  start: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm (24-hour format)')
    .default('22:00'),
  end: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm (24-hour format)')
    .default('08:00'),
});

export const notificationPreferencesSchema = z.object({
  budgetAlerts: z.boolean().default(true),
  recurringAlerts: z.boolean().default(true),
  peopleAlerts: z.boolean().default(true),
  spendingAlerts: z.boolean().default(true),
  monthlySummaryAlerts: z.boolean().default(true),
  previewMode: z.enum(['detailed', 'basic', 'private']).default('private'),
  quietHours: quietHoursSchema.default(() => ({ enabled: true, start: '22:00', end: '08:00' })),
});

export const updateNotificationPreferencesSchema = z.object({
  budgetAlerts: z.boolean().optional(),
  recurringAlerts: z.boolean().optional(),
  peopleAlerts: z.boolean().optional(),
  spendingAlerts: z.boolean().optional(),
  monthlySummaryAlerts: z.boolean().optional(),
  previewMode: z.enum(['detailed', 'basic', 'private']).optional(),
  quietHours: quietHoursSchema.partial().optional(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;

export const registerDeviceSchema = z.object({
  token: z.string().trim().min(5).max(256),
  platform: z.enum(PLATFORMS).default('unknown'),
  deviceId: z.string().trim().max(120).optional().nullable(),
});

export const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(5).max(256),
});

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});
