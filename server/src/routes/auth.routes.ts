/**
 * Authentication Routes
 *
 * Handles user authentication, registration, and session management.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import * as authService from '../services/auth.service.js';
import { requireAuth, requireAdmin, rateLimitByIP } from '../middleware/auth.middleware.js';
import { getAvatarsDir } from '../services/app-paths.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// Configure multer for avatar uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (_req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// =============================================================================
// Setup Check
// =============================================================================

/**
 * Check if initial setup is required
 * GET /api/auth/setup-required
 */
router.get('/setup-required', async (_req: Request, res: Response) => {
  try {
    const hasUsers = await authService.hasAnyUsers();
    res.json({ setupRequired: !hasUsers });
  } catch (error) {
    logError('auth', error, { action: 'setup-check' });
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

/**
 * Create initial admin account
 * POST /api/auth/setup
 */
router.post('/setup', rateLimitByIP, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const user = await authService.createInitialAdmin(username, password);
    const loginResult = await authService.login(
      username,
      password,
      req.headers['user-agent'],
      req.ip
    );

    if (!loginResult.success) {
      res.status(500).json({ error: 'Account created but login failed' });
      return;
    }

    // Set cookie
    res.cookie('helixio_token', loginResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      user,
      token: loginResult.token,
      expiresAt: loginResult.expiresAt,
    });
  } catch (error) {
    logError('auth', error, { action: 'setup' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Setup failed',
    });
  }
});

// =============================================================================
// Authentication
// =============================================================================

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', rateLimitByIP, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const result = await authService.login(
      username,
      password,
      req.headers['user-agent'],
      req.ip
    );

    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    // Set cookie
    res.cookie('helixio_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      user: result.user,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logError('auth', error, { action: 'login' });
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.token) {
      await authService.logout(req.token);
    }

    res.clearCookie('helixio_token');
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'logout' });
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Logout all sessions
 * POST /api/auth/logout-all
 */
router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await authService.logoutAllSessions(req.user!.id);
    res.clearCookie('helixio_token');
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'logout-all' });
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/**
 * Update current user profile
 * PATCH /api/auth/me
 */
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { displayName, email, avatarUrl, profilePrivate, hideReadingStats } = req.body;

    const user = await authService.updateUser(req.user!.id, {
      displayName,
      email,
      avatarUrl,
      profilePrivate,
      hideReadingStats,
    });

    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'update-profile' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Update failed',
    });
  }
});

/**
 * Change password
 * POST /api/auth/change-password
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password required' });
      return;
    }

    await authService.updatePassword(req.user!.id, currentPassword, newPassword);
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'change-password' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Password change failed',
    });
  }
});

// =============================================================================
// Sessions
// =============================================================================

/**
 * Get current user's sessions
 * GET /api/auth/sessions
 */
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await authService.getUserSessions(req.user!.id);
    res.json({
      sessions,
      currentToken: req.token,
    });
  } catch (error) {
    logError('auth', error, { action: 'get-sessions' });
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * Revoke a session
 * DELETE /api/auth/sessions/:sessionId
 */
router.delete('/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }
    await authService.revokeSession(sessionId, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'revoke-session' });
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// =============================================================================
// Admin: User Management
// =============================================================================

/**
 * List all users (admin only)
 * GET /api/auth/users
 */
router.get('/users', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await authService.listUsers();
    res.json({ users });
  } catch (error) {
    logError('auth', error, { action: 'list-users' });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * Create a new user (admin only)
 * POST /api/auth/users
 */
router.post('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, email, displayName, role } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const user = await authService.createUser({
      username,
      password,
      email,
      displayName,
      role,
    });

    res.status(201).json({ user });
  } catch (error) {
    logError('auth', error, { action: 'create-user' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create user',
    });
  }
});

/**
 * Get user by ID (admin only)
 * GET /api/auth/users/:userId
 */
router.get('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }
    const user = await authService.getUserById(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'get-user' });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * Update user role (admin only)
 * PATCH /api/auth/users/:userId/role
 */
router.patch('/users/:userId/role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const { role } = req.body;

    if (!['admin', 'user', 'guest'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const user = await authService.setUserRole(userId, role);
    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'update-role' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update role',
    });
  }
});

/**
 * Enable/disable user (admin only)
 * PATCH /api/auth/users/:userId/active
 */
router.patch('/users/:userId/active', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be a boolean' });
      return;
    }

    const user = await authService.setUserActive(userId, isActive);
    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'update-active' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update user',
    });
  }
});

/**
 * Delete user (admin only)
 * DELETE /api/auth/users/:userId
 */
router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    // Prevent self-deletion
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    await authService.deleteUser(userId);
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'delete-user' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete user',
    });
  }
});

/**
 * Update user role (admin only) - PUT alias
 * PUT /api/auth/users/:userId/role
 */
router.put('/users/:userId/role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const user = await authService.setUserRole(userId, role);
    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'update-role' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to update role',
    });
  }
});

/**
 * Get user library access (admin only)
 * GET /api/auth/users/:userId/library-access
 */
router.get('/users/:userId/library-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const libraries = await authService.getUserLibraryAccess(userId);
    res.json({ libraries });
  } catch (error) {
    logError('auth', error, { action: 'get-library-access' });
    res.status(500).json({ error: 'Failed to get library access' });
  }
});

/**
 * Set user library access (admin only)
 * PUT /api/auth/users/:userId/library-access/:libraryId
 */
router.put('/users/:userId/library-access/:libraryId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, libraryId } = req.params;
    if (!userId || !libraryId) {
      res.status(400).json({ error: 'User ID and Library ID required' });
      return;
    }

    const { hasAccess, permission } = req.body;

    if (typeof hasAccess !== 'boolean') {
      res.status(400).json({ error: 'hasAccess must be a boolean' });
      return;
    }

    await authService.setUserLibraryAccess(userId, libraryId, hasAccess, permission);
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'set-library-access' });
    res.status(500).json({ error: 'Failed to set library access' });
  }
});

/**
 * Freeze user account (admin only)
 * POST /api/auth/users/:userId/freeze
 */
router.post('/users/:userId/freeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    // Prevent self-freeze
    if (userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot freeze your own account' });
      return;
    }

    const user = await authService.freezeUser(userId);
    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'freeze-user' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to freeze user',
    });
  }
});

/**
 * Unfreeze user account (admin only)
 * POST /api/auth/users/:userId/unfreeze
 */
router.post('/users/:userId/unfreeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const user = await authService.unfreezeUser(userId);
    res.json({ user });
  } catch (error) {
    logError('auth', error, { action: 'unfreeze-user' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to unfreeze user',
    });
  }
});

// =============================================================================
// App Settings
// =============================================================================

/**
 * Get app settings (admin only)
 * GET /api/auth/settings
 */
router.get('/settings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await authService.getAppSettings();
    res.json(settings);
  } catch (error) {
    logError('auth', error, { action: 'get-settings' });
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * Update app settings (admin only)
 * PUT /api/auth/settings
 */
router.put('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { allowOpenRegistration } = req.body;
    const settings = await authService.updateAppSettings({ allowOpenRegistration });
    res.json(settings);
  } catch (error) {
    logError('auth', error, { action: 'update-settings' });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// =============================================================================
// Registration (Public)
// =============================================================================

/**
 * Check if registration is allowed (public)
 * GET /api/auth/registration-allowed
 */
router.get('/registration-allowed', async (_req: Request, res: Response) => {
  try {
    const settings = await authService.getAppSettings();
    res.json({ allowed: settings.allowOpenRegistration });
  } catch (error) {
    logError('auth', error, { action: 'check-registration' });
    res.json({ allowed: false });
  }
});

/**
 * Self-register (public, if enabled)
 * POST /api/auth/register
 */
router.post('/register', rateLimitByIP, async (req: Request, res: Response) => {
  try {
    const { username, password, email, displayName } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const user = await authService.registerUser({
      username,
      password,
      email,
      displayName,
    });

    // Auto-login after registration
    const loginResult = await authService.login(
      username,
      password,
      req.headers['user-agent'],
      req.ip
    );

    if (!loginResult.success) {
      res.status(500).json({ error: 'Account created but login failed' });
      return;
    }

    // Set cookie
    res.cookie('helixio_token', loginResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(201).json({
      user,
      token: loginResult.token,
      expiresAt: loginResult.expiresAt,
    });
  } catch (error) {
    logError('auth', error, { action: 'register' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Registration failed',
    });
  }
});

// =============================================================================
// Avatar Management
// =============================================================================

/**
 * Upload avatar
 * POST /api/auth/me/avatar
 */
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    // Process and resize image with sharp
    const processedImage = await sharp(req.file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const avatarUrl = await authService.uploadAvatar(req.user!.id, processedImage);

    res.json({ avatarUrl });
  } catch (error) {
    logError('auth', error, { action: 'upload-avatar' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to upload avatar',
    });
  }
});

/**
 * Remove avatar
 * DELETE /api/auth/me/avatar
 */
router.delete('/me/avatar', requireAuth, async (req: Request, res: Response) => {
  try {
    await authService.removeAvatar(req.user!.id);
    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'remove-avatar' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to remove avatar',
    });
  }
});

/**
 * Get avatar image (public)
 * GET /api/auth/avatars/:userId
 */
router.get('/avatars/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    const avatarPath = authService.getAvatarFilePath(userId);

    if (!avatarPath) {
      res.status(404).json({ error: 'Avatar not found' });
      return;
    }

    res.sendFile(avatarPath);
  } catch (error) {
    logError('auth', error, { action: 'get-avatar' });
    res.status(500).json({ error: 'Failed to get avatar' });
  }
});

// =============================================================================
// Account Self-Deletion
// =============================================================================

/**
 * Delete own account
 * DELETE /api/auth/me
 */
router.delete('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password required to delete account' });
      return;
    }

    await authService.deleteOwnAccount(req.user!.id, password);

    // Clear session cookie
    res.clearCookie('helixio_token');

    res.json({ success: true });
  } catch (error) {
    logError('auth', error, { action: 'delete-account' });
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete account',
    });
  }
});

export default router;
