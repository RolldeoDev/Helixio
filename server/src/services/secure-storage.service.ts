/**
 * Secure Storage Service
 *
 * Provides secure storage for sensitive data like API keys using the OS keychain.
 * Falls back to config file storage if keychain is unavailable.
 */

import keytar from 'keytar';
import { configLogger } from './logger.service.js';

// =============================================================================
// Constants
// =============================================================================

const SERVICE_NAME = 'helixio';

// API key identifiers
export const API_KEY_COMICVINE = 'comicvine-api-key';
export const API_KEY_METRON = 'metron-api-key';
export const API_KEY_ANTHROPIC = 'anthropic-api-key';

// =============================================================================
// Keychain Operations
// =============================================================================

/**
 * Check if keychain is available
 */
let keychainAvailable: boolean | null = null;

async function isKeychainAvailable(): Promise<boolean> {
  if (keychainAvailable !== null) {
    return keychainAvailable;
  }

  try {
    // Try a simple operation to test keychain access
    await keytar.findCredentials(SERVICE_NAME);
    keychainAvailable = true;
    configLogger.debug('OS keychain is available for secure storage');
  } catch (error) {
    keychainAvailable = false;
    configLogger.warn({ error }, 'OS keychain not available, falling back to config file storage');
  }

  return keychainAvailable;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Store an API key securely
 */
export async function setSecureApiKey(keyId: string, value: string): Promise<boolean> {
  if (await isKeychainAvailable()) {
    try {
      await keytar.setPassword(SERVICE_NAME, keyId, value);
      configLogger.info({ keyId }, 'API key stored securely in OS keychain');
      return true;
    } catch (error) {
      configLogger.error({ error, keyId }, 'Failed to store API key in keychain');
      return false;
    }
  }
  return false;
}

/**
 * Retrieve an API key from secure storage
 */
export async function getSecureApiKey(keyId: string): Promise<string | null> {
  if (await isKeychainAvailable()) {
    try {
      const value = await keytar.getPassword(SERVICE_NAME, keyId);
      if (value) {
        configLogger.debug({ keyId }, 'API key retrieved from OS keychain');
      }
      return value;
    } catch (error) {
      configLogger.error({ error, keyId }, 'Failed to retrieve API key from keychain');
      return null;
    }
  }
  return null;
}

/**
 * Delete an API key from secure storage
 */
export async function deleteSecureApiKey(keyId: string): Promise<boolean> {
  if (await isKeychainAvailable()) {
    try {
      const deleted = await keytar.deletePassword(SERVICE_NAME, keyId);
      if (deleted) {
        configLogger.info({ keyId }, 'API key deleted from OS keychain');
      }
      return deleted;
    } catch (error) {
      configLogger.error({ error, keyId }, 'Failed to delete API key from keychain');
      return false;
    }
  }
  return false;
}

/**
 * List all stored API key identifiers
 */
export async function listSecureApiKeys(): Promise<string[]> {
  if (await isKeychainAvailable()) {
    try {
      const credentials = await keytar.findCredentials(SERVICE_NAME);
      return credentials.map((c) => c.account);
    } catch (error) {
      configLogger.error({ error }, 'Failed to list API keys from keychain');
      return [];
    }
  }
  return [];
}

/**
 * Check if an API key exists in secure storage
 */
export async function hasSecureApiKey(keyId: string): Promise<boolean> {
  const value = await getSecureApiKey(keyId);
  return value !== null;
}

/**
 * Migrate an API key from plaintext config to secure storage
 * Returns true if migration successful, false otherwise
 */
export async function migrateApiKeyToSecure(keyId: string, value: string): Promise<boolean> {
  if (!value) {
    return false;
  }

  const stored = await setSecureApiKey(keyId, value);
  if (stored) {
    configLogger.info({ keyId }, 'Successfully migrated API key to secure storage');
    return true;
  }

  configLogger.warn({ keyId }, 'Could not migrate API key to secure storage');
  return false;
}

// =============================================================================
// Export
// =============================================================================

export const SecureStorage = {
  setApiKey: setSecureApiKey,
  getApiKey: getSecureApiKey,
  deleteApiKey: deleteSecureApiKey,
  listApiKeys: listSecureApiKeys,
  hasApiKey: hasSecureApiKey,
  migrateApiKey: migrateApiKeyToSecure,
  isAvailable: isKeychainAvailable,
};

export default SecureStorage;
