import { z } from 'zod';

export const createGameSchema = z.object({
  body: z.object({
    title: z.string().min(2, 'Title must be at least 2 characters').max(100),
    description: z.string().optional(),
    category: z.string().optional(),
    thumbnailUrl: z.string().url('Invalid thumbnail URL').optional().or(z.literal('')),
    gameUrl: z.string().url('Invalid game URL').optional().or(z.literal('')),
    isFeatured: z.boolean().optional(),
  }),
});

export const updateGameSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(100).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    thumbnailUrl: z.string().url().optional().or(z.literal('')),
    gameUrl: z.string().url().optional().or(z.literal('')),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});
