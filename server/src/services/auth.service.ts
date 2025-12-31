/**
 * Authentication Service
 *
 * Handles user authentication, session management, and password hashing.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { getAvatarPath, getAvatarsDir } from './app-paths.service.js';
import {
  getDefaultPermissionsJson,
  parsePermissions,
  mergePermissions,
  UserPermissions,
} from '../types/permissions.js';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  profilePrivate: boolean;
  hideReadingStats: boolean;
  setupComplete: boolean;
  permissions: string; // JSON string of permissions
  createdAt: Date;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  role?: 'admin' | 'user' | 'guest';
}

export interface LoginResult {
  success: boolean;
  user?: UserInfo;
  token?: string;
  expiresAt?: Date;
  error?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}

// =============================================================================
// Password Hashing
// =============================================================================

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const ITERATIONS = 100000;
const DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// =============================================================================
// User Management
// =============================================================================

export async function createUser(input: CreateUserInput): Promise<UserInfo> {
  const { username, password, email, displayName, role = 'user' } = input;

  // Validate username
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error('Username can only contain letters, numbers, underscores, and hyphens');
  }

  // Validate password
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Check if username exists
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: username.toLowerCase() },
        email ? { email: email.toLowerCase() } : {},
      ],
    },
  });

  if (existing) {
    if (existing.username.toLowerCase() === username.toLowerCase()) {
      throw new Error('Username already exists');
    }
    if (email && existing.email?.toLowerCase() === email.toLowerCase()) {
      throw new Error('Email already exists');
    }
  }

  const passwordHash = hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      displayName: displayName || username,
      passwordHash,
      role,
      permissions: getDefaultPermissionsJson(),
    },
  });

  return mapUserToInfo(user);
}

export async function getUserById(userId: string): Promise<UserInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  return user ? mapUserToInfo(user) : null;
}

export async function getUserByUsername(username: string): Promise<UserInfo | null> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  return user ? mapUserToInfo(user) : null;
}

export async function listUsers(): Promise<UserInfo[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return users.map(mapUserToInfo);
}

export async function updateUser(
  userId: string,
  updates: Partial<{
    displayName: string;
    email: string;
    avatarUrl: string;
    profilePrivate: boolean;
    hideReadingStats: boolean;
  }>
): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
  });

  return mapUserToInfo(user);
}

export async function updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error('Current password is incorrect');
  }

  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const passwordHash = hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

/**
 * Mark setup wizard as complete for a user
 */
export async function completeUserSetup(userId: string): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { setupComplete: true },
  });

  return mapUserToInfo(user);
}

export async function deleteUser(userId: string): Promise<void> {
  await prisma.user.delete({
    where: { id: userId },
  });
}

export async function setUserRole(userId: string, role: 'admin' | 'user' | 'guest'): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  return mapUserToInfo(user);
}

export async function setUserActive(userId: string, isActive: boolean): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });

  return mapUserToInfo(user);
}

// =============================================================================
// Authentication
// =============================================================================

export async function login(
  username: string,
  password: string,
  userAgent?: string,
  ipAddress?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (!user) {
    return { success: false, error: 'Invalid username or password' };
  }

  if (!user.isActive) {
    return { success: false, error: 'Account is disabled' };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { success: false, error: 'Invalid username or password' };
  }

  // Create session
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.userSession.create({
    data: {
      userId: user.id,
      token,
      userAgent,
      ipAddress,
      expiresAt,
    },
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    success: true,
    user: mapUserToInfo(user),
    token,
    expiresAt,
  };
}

export async function validateToken(token: string): Promise<UserInfo | null> {
  const session = await prisma.userSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } });
    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  // Update last active
  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  });

  return mapUserToInfo(session.user);
}

export async function logout(token: string): Promise<void> {
  await prisma.userSession.deleteMany({
    where: { token },
  });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await prisma.userSession.deleteMany({
    where: { userId },
  });
}

export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await prisma.userSession.findMany({
    where: { userId },
    orderBy: { lastActiveAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    lastActiveAt: s.lastActiveAt,
  }));
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await prisma.userSession.deleteMany({
    where: { id: sessionId, userId },
  });
}

// =============================================================================
// Initial Setup
// =============================================================================

export async function hasAnyUsers(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}

export async function createInitialAdmin(username: string, password: string): Promise<UserInfo> {
  const hasUsers = await hasAnyUsers();
  if (hasUsers) {
    throw new Error('Initial admin already created');
  }

  return createUser({
    username,
    password,
    role: 'admin',
  });
}

// =============================================================================
// Helpers
// =============================================================================

function mapUserToInfo(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  profilePrivate: boolean;
  hideReadingStats: boolean;
  setupComplete: boolean;
  permissions: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
}): UserInfo {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role as 'admin' | 'user' | 'guest',
    isActive: user.isActive,
    profilePrivate: user.profilePrivate,
    hideReadingStats: user.hideReadingStats,
    setupComplete: user.setupComplete,
    permissions: user.permissions,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lastActiveAt: user.lastActiveAt,
  };
}

// =============================================================================
// Cleanup expired sessions (run periodically)
// =============================================================================

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.userSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}

// =============================================================================
// App Settings
// =============================================================================

export interface AppSettings {
  allowOpenRegistration: boolean;
}

export async function getAppSettings(): Promise<AppSettings> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'default' },
  });

  return {
    allowOpenRegistration: settings?.allowOpenRegistration ?? false,
  };
}

export async function updateAppSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  const settings = await prisma.appSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      allowOpenRegistration: updates.allowOpenRegistration ?? false,
    },
    update: {
      allowOpenRegistration: updates.allowOpenRegistration,
    },
  });

  return {
    allowOpenRegistration: settings.allowOpenRegistration,
  };
}

// =============================================================================
// User Library Access
// =============================================================================

export interface LibraryAccessInfo {
  libraryId: string;
  libraryName: string;
  hasAccess: boolean;
  permission: string;
}

export async function getUserLibraryAccess(userId: string): Promise<LibraryAccessInfo[]> {
  // Get all libraries
  const libraries = await prisma.library.findMany({
    orderBy: { name: 'asc' },
  });

  // Get user's access records
  const accessRecords = await prisma.userLibraryAccess.findMany({
    where: { userId },
  });

  const accessMap = new Map(accessRecords.map(a => [a.libraryId, a.permission]));

  return libraries.map(lib => ({
    libraryId: lib.id,
    libraryName: lib.name,
    hasAccess: accessMap.has(lib.id),
    permission: accessMap.get(lib.id) ?? 'none',
  }));
}

export async function setUserLibraryAccess(
  userId: string,
  libraryId: string,
  hasAccess: boolean,
  permission: string = 'read'
): Promise<void> {
  if (hasAccess) {
    // Grant access
    await prisma.userLibraryAccess.upsert({
      where: {
        userId_libraryId: { userId, libraryId },
      },
      create: {
        userId,
        libraryId,
        permission,
      },
      update: {
        permission,
      },
    });
  } else {
    // Revoke access
    await prisma.userLibraryAccess.deleteMany({
      where: { userId, libraryId },
    });
  }
}

// =============================================================================
// User Freeze/Unfreeze
// =============================================================================

export async function freezeUser(userId: string): Promise<UserInfo> {
  // Disable user
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  // Revoke all sessions
  await prisma.userSession.deleteMany({
    where: { userId },
  });

  return mapUserToInfo(user);
}

export async function unfreezeUser(userId: string): Promise<UserInfo> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  return mapUserToInfo(user);
}

// =============================================================================
// Self Registration
// =============================================================================

export async function registerUser(input: {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}): Promise<UserInfo> {
  // Check if registration is allowed
  const settings = await getAppSettings();
  if (!settings.allowOpenRegistration) {
    throw new Error('Registration is currently disabled');
  }

  return createUser({
    username: input.username,
    password: input.password,
    email: input.email,
    displayName: input.displayName,
    role: 'user', // New users are always regular users
  });
}

// =============================================================================
// Avatar Management
// =============================================================================

export async function uploadAvatar(userId: string, imageBuffer: Buffer): Promise<string> {
  const avatarPath = getAvatarPath(userId);

  // Write the image file
  writeFileSync(avatarPath, imageBuffer);

  // Generate URL path (relative)
  const avatarUrl = `/api/auth/avatars/${userId}`;

  // Update user record
  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });

  return avatarUrl;
}

export async function removeAvatar(userId: string): Promise<void> {
  const avatarPath = getAvatarPath(userId);

  // Delete file if exists
  if (existsSync(avatarPath)) {
    unlinkSync(avatarPath);
  }

  // Clear avatarUrl in database
  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });
}

export function getAvatarFilePath(userId: string): string | null {
  const avatarPath = getAvatarPath(userId);
  return existsSync(avatarPath) ? avatarPath : null;
}

// =============================================================================
// Permission Management
// =============================================================================

/**
 * Update user permissions
 * @param userId - User ID to update
 * @param permissions - Partial permissions to merge with existing
 * @returns Updated user info
 */
export async function updateUserPermissions(
  userId: string,
  permissions: Partial<Record<string, boolean>>
): Promise<UserInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Parse existing permissions and merge with updates
  const existingPerms = parsePermissions(user.permissions);
  const mergedPerms = mergePermissions(existingPerms, permissions);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { permissions: JSON.stringify(mergedPerms) },
  });

  return mapUserToInfo(updatedUser);
}

/**
 * Admin reset user password (no current password required)
 * @param userId - User ID to reset
 * @param newPassword - New password to set
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const passwordHash = hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Revoke all existing sessions (force re-login with new password)
  await prisma.userSession.deleteMany({
    where: { userId },
  });
}

/**
 * Update user's lastActiveAt timestamp (called by auth middleware)
 * Uses a throttle of 60 seconds to avoid excessive database writes.
 */
export async function updateLastActiveAt(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() },
  });
}

// =============================================================================
// Account Self-Deletion
// =============================================================================

export async function deleteOwnAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Verify password
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error('Incorrect password');
  }

  // Prevent last admin from deleting themselves
  if (user.role === 'admin') {
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });

    if (adminCount <= 1) {
      throw new Error('Cannot delete the last admin account');
    }
  }

  // Delete avatar file if exists
  const avatarPath = getAvatarPath(userId);
  if (existsSync(avatarPath)) {
    unlinkSync(avatarPath);
  }

  // Delete user (cascades to sessions, progress, collections, etc.)
  await prisma.user.delete({
    where: { id: userId },
  });
}
