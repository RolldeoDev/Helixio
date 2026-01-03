/**
 * Environment variable loader
 *
 * This file MUST be imported before any other modules that depend on environment variables.
 * It loads variables from .env files in the following priority:
 *   1. Root project .env file (../../../.env from dist, ../../.env from src)
 *   2. Server-specific .env file (server/.env)
 *   3. Process environment (already set variables take precedence)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're running from dist or src
const isCompiledCode = __dirname.includes('/dist/');

// Calculate paths to potential .env files
const serverDir = isCompiledCode
  ? resolve(__dirname, '..') // dist -> server
  : resolve(__dirname, '..'); // src -> server

const projectRoot = resolve(serverDir, '..');

// Load .env files in order of precedence (later files don't override earlier ones)
const envPaths = [
  resolve(projectRoot, '.env'),      // Root .env (primary)
  resolve(serverDir, '.env'),         // Server-specific .env
];

let loadedFrom: string | null = null;

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    // Don't override existing env vars
    const result = config({ path: envPath, override: false });
    if (result.parsed && !loadedFrom) {
      loadedFrom = envPath;
    }
  }
}

// Log which env file was loaded (only in development)
if (process.env.NODE_ENV !== 'production' && loadedFrom) {
  console.log(`[env] Loaded environment variables from: ${loadedFrom}`);
}

export { loadedFrom };
