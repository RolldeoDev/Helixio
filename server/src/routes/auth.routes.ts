/**
 * Authentication Routes
 *
 * Handles user authentication, registration, and session management.
 */

import { Router, Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

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
    console.error('Setup check error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

/**
 * Create initial admin account
 * POST /api/auth/setup
 */
router.post('/setup', async (req: Request, res: Response) => {
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
    console.error('Setup error:', error);
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
router.post('/login', async (req: Request, res: Response) => {
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
    console.error('Login error:', error);
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
    console.error('Logout error:', error);
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
    console.error('Logout all error:', error);
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
    console.error('Update profile error:', error);
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
    console.error('Change password error:', error);
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
    console.error('Get sessions error:', error);
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
    console.error('Revoke session error:', error);
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
    console.error('List users error:', error);
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
    console.error('Create user error:', error);
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
    console.error('Get user error:', error);
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
    console.error('Update role error:', error);
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
    console.error('Update active error:', error);
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
    console.error('Delete user error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to delete user',
    });
  }
});

export default router;
