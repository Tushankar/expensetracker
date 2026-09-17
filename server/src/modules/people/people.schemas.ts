import { z } from 'zod';

export const createPersonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Invalid email address').toLowerCase().max(120).optional().or(z.literal('')),
  avatar: z.string().trim().optional(),
  note: z.string().trim().max(500).optional(),
});

export const updatePersonSchema = createPersonSchema.partial();

export const personIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid person id'),
});

export const listPeopleQuerySchema = z.object({
  search: z.string().trim().optional(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
