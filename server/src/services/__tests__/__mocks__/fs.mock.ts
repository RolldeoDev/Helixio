/**
 * Filesystem Mock Utilities
 *
 * Provides virtual filesystem mocking for isolated unit testing.
 * Simulates file operations without touching the real filesystem.
 */

import { vi } from 'vitest';

/**
 * Virtual file entry.
 */
export interface VirtualFile {
  content: Buffer | string;
  size: number;
  modifiedAt: Date;
  isDirectory: boolean;
}

/**
 * Virtual filesystem state.
 */
export interface VirtualFS {
  files: Map<string, VirtualFile>;
}

/**
 * Create a virtual filesystem for testing.
 */
export function createVirtualFS(): VirtualFS {
  return {
    files: new Map(),
  };
}

/**
 * Add a file to the virtual filesystem.
 */
export function addVirtualFile(
  vfs: VirtualFS,
  path: string,
  content: Buffer | string,
  modifiedAt = new Date()
): void {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  vfs.files.set(path, {
    content: buffer,
    size: buffer.length,
    modifiedAt,
    isDirectory: false,
  });
}

/**
 * Add a directory to the virtual filesystem.
 */
export function addVirtualDirectory(
  vfs: VirtualFS,
  path: string,
  modifiedAt = new Date()
): void {
  vfs.files.set(path, {
    content: '',
    size: 0,
    modifiedAt,
    isDirectory: true,
  });
}

/**
 * Add multiple comic files to the virtual filesystem.
 */
export function addVirtualComicFiles(
  vfs: VirtualFS,
  rootPath: string,
  files: Array<{
    relativePath: string;
    size?: number;
    modifiedAt?: Date;
  }>
): void {
  addVirtualDirectory(vfs, rootPath);

  for (const file of files) {
    const fullPath = `${rootPath}/${file.relativePath}`;
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));

    // Add parent directories
    const pathParts = parentDir.split('/').filter(Boolean);
    let currentPath = '';
    for (const part of pathParts) {
      currentPath += `/${part}`;
      if (!vfs.files.has(currentPath)) {
        addVirtualDirectory(vfs, currentPath);
      }
    }

    // Add the file
    const content = Buffer.alloc(file.size ?? 50000000);
    vfs.files.set(fullPath, {
      content,
      size: content.length,
      modifiedAt: file.modifiedAt ?? new Date(),
      isDirectory: false,
    });
  }
}

/**
 * Create mock fs/promises module based on virtual filesystem.
 */
export function createMockFsPromises(vfs: VirtualFS) {
  return {
    readdir: vi.fn().mockImplementation(async (path: string, options?: { withFileTypes?: boolean }) => {
      const entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }> = [];
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

      for (const [filePath, file] of vfs.files) {
        if (filePath.startsWith(normalizedPath + '/')) {
          const relativePath = filePath.slice(normalizedPath.length + 1);
          const name = relativePath.split('/')[0]!;

          // Skip if we've already added this directory/file
          if (entries.some((e) => e.name === name)) continue;

          // Check if this is a direct child
          const isDirectChild = !relativePath.includes('/') ||
            (file.isDirectory && relativePath.split('/').length === 1);

          if (relativePath.split('/').length === 1 || isDirectChild) {
            if (options?.withFileTypes) {
              const isDir = relativePath.includes('/') || file.isDirectory;
              entries.push({
                name,
                isFile: () => !isDir,
                isDirectory: () => isDir,
              });
            } else {
              entries.push({ name, isFile: () => true, isDirectory: () => false });
            }
          } else {
            // It's a subdirectory
            if (options?.withFileTypes) {
              if (!entries.some((e) => e.name === name)) {
                entries.push({
                  name,
                  isFile: () => false,
                  isDirectory: () => true,
                });
              }
            }
          }
        }
      }

      if (options?.withFileTypes) {
        return entries;
      }
      return entries.map((e) => e.name);
    }),

    stat: vi.fn().mockImplementation(async (path: string) => {
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
      const file = vfs.files.get(normalizedPath);

      if (!file) {
        // Check if it's a directory by looking for children
        const hasChildren = Array.from(vfs.files.keys()).some(
          (p) => p.startsWith(normalizedPath + '/')
        );
        if (hasChildren) {
          return {
            size: 0,
            mtime: new Date(),
            isFile: () => false,
            isDirectory: () => true,
          };
        }
        const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }

      return {
        size: file.size,
        mtime: file.modifiedAt,
        isFile: () => !file.isDirectory,
        isDirectory: () => file.isDirectory,
      };
    }),

    readFile: vi.fn().mockImplementation(async (path: string, encoding?: string) => {
      const file = vfs.files.get(path);
      if (!file || file.isDirectory) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      if (encoding === 'utf-8' || encoding === 'utf8') {
        return file.content.toString();
      }
      return file.content;
    }),

    writeFile: vi.fn().mockImplementation(async (path: string, content: Buffer | string) => {
      addVirtualFile(vfs, path, content);
    }),

    mkdir: vi.fn().mockImplementation(async (path: string, _options?: { recursive?: boolean }) => {
      addVirtualDirectory(vfs, path);
    }),

    rm: vi.fn().mockImplementation(async (path: string, _options?: { recursive?: boolean; force?: boolean }) => {
      // Remove the path and all children
      for (const filePath of vfs.files.keys()) {
        if (filePath === path || filePath.startsWith(path + '/')) {
          vfs.files.delete(filePath);
        }
      }
    }),

    unlink: vi.fn().mockImplementation(async (path: string) => {
      if (!vfs.files.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      vfs.files.delete(path);
    }),

    rename: vi.fn().mockImplementation(async (oldPath: string, newPath: string) => {
      const file = vfs.files.get(oldPath);
      if (!file) {
        const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      vfs.files.delete(oldPath);
      vfs.files.set(newPath, file);
    }),

    copyFile: vi.fn().mockImplementation(async (src: string, dest: string) => {
      const file = vfs.files.get(src);
      if (!file) {
        const error = new Error(`ENOENT: no such file or directory, copyfile '${src}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      vfs.files.set(dest, { ...file });
    }),

    access: vi.fn().mockImplementation(async (path: string) => {
      if (!vfs.files.has(path)) {
        const hasChildren = Array.from(vfs.files.keys()).some(
          (p) => p.startsWith(path + '/')
        );
        if (!hasChildren) {
          const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
      }
    }),

    open: vi.fn().mockImplementation(async (path: string, _flags: string) => {
      const file = vfs.files.get(path);
      if (!file) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      return {
        read: vi.fn().mockImplementation(
          async (buffer: Buffer, offset: number, length: number, position: number) => {
            const content = typeof file.content === 'string'
              ? Buffer.from(file.content)
              : file.content;
            const bytesToRead = Math.min(length, content.length - position);
            content.copy(buffer, offset, position, position + bytesToRead);
            return { bytesRead: bytesToRead };
          }
        ),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
}

/**
 * Create mock path module.
 */
export function createMockPath() {
  return {
    join: (...parts: string[]) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
    relative: (from: string, to: string) => {
      if (to.startsWith(from)) {
        return to.slice(from.length).replace(/^\//, '');
      }
      return to;
    },
    basename: (path: string) => {
      const parts = path.split('/');
      return parts[parts.length - 1];
    },
    dirname: (path: string) => {
      const parts = path.split('/');
      parts.pop();
      return parts.join('/') || '/';
    },
    extname: (path: string) => {
      const basename = path.split('/').pop() || '';
      const dotIndex = basename.lastIndexOf('.');
      return dotIndex > 0 ? basename.slice(dotIndex) : '';
    },
  };
}

/**
 * Helper to create a typical comic library structure.
 */
export function createMockComicLibrary(vfs: VirtualFS, rootPath = '/comics') {
  addVirtualComicFiles(vfs, rootPath, [
    { relativePath: 'Batman/Batman 001.cbz' },
    { relativePath: 'Batman/Batman 002.cbz' },
    { relativePath: 'Batman/Batman 003.cbz' },
    { relativePath: 'Superman/Superman 001.cbr' },
    { relativePath: 'Superman/Superman 002.cbr' },
    { relativePath: 'Spider-Man/Amazing Spider-Man 001.cbz' },
  ]);
}
