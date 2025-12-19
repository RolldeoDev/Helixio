/**
 * Library Validation Schemas
 *
 * Zod schemas for library-related API endpoints.
 */

import { z } from 'zod';

// =============================================================================
// Library CRUD Schemas
// =============================================================================

export const CreateLibrarySchema = z.object({
  name: z.string().min(1, 'Library name is required').max(255, 'Library name too long'),
  rootPath: z.string().min(1, 'Root path is required'),
  type: z.enum(['western', 'manga']).default('western'),
});

export const UpdateLibrarySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['western', 'manga']).optional(),
}).refine((data) => data.name !== undefined || data.type !== undefined, {
  message: 'At least one field (name or type) must be provided',
});

// =============================================================================
// Library Files Schemas
// =============================================================================

export const ListFilesQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? Math.max(1, parseInt(val, 10) || 1) : 1)),
  limit: z.string().optional().transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10) || 50)) : 50)),
  status: z.enum(['pending', 'indexed', 'orphaned', 'quarantined']).optional(),
  folder: z.string().optional(),
  sort: z.enum(['filename', 'size', 'modifiedAt', 'status', 'createdAt']).default('filename'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// =============================================================================
// Folder Operations Schemas
// =============================================================================

export const RenameFolderSchema = z.object({
  folderPath: z.string().min(1, 'Folder path is required'),
  newName: z.string()
    .min(1, 'New folder name is required')
    .refine((name) => !name.includes('/') && !name.includes('\\'), {
      message: 'Folder name cannot contain path separators',
    }),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CreateLibraryInput = z.infer<typeof CreateLibrarySchema>;
export type UpdateLibraryInput = z.infer<typeof UpdateLibrarySchema>;
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;
export type RenameFolderInput = z.infer<typeof RenameFolderSchema>;
