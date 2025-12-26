/**
 * Auth Context
 *
 * Handles user authentication state and session management.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'admin' | 'user' | 'guest';
  profilePrivate?: boolean;
  hideReadingStats?: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  createdAt: string;
  lastUsed: string;
  userAgent?: string;
  ipAddress?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  registrationAllowed: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setup: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, email?: string, displayName?: string) => Promise<boolean>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  getSessions: () => Promise<Session[]>;
  revokeSession: (sessionId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '/api/auth';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Include cookies
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// =============================================================================
// Provider
// =============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [registrationAllowed, setRegistrationAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user;

  // ---------------------------------------------------------------------------
  // Check Authentication Status
  // ---------------------------------------------------------------------------

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First check if setup is required
      const setupStatus = await apiRequest<{ setupRequired: boolean }>(
        '/setup-required'
      );

      if (setupStatus.setupRequired) {
        setSetupRequired(true);
        setRegistrationAllowed(false);
        setUser(null);
        return;
      }

      setSetupRequired(false);

      // Check if registration is allowed
      try {
        const { allowed } = await apiRequest<{ allowed: boolean }>('/registration-allowed');
        setRegistrationAllowed(allowed);
      } catch {
        setRegistrationAllowed(false);
      }

      // Try to get current user
      try {
        const { user: currentUser } = await apiRequest<{ user: User }>('/me');
        setUser(currentUser);
      } catch {
        // Not authenticated, that's okay
        setUser(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check auth status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ---------------------------------------------------------------------------
  // Auth Actions
  // ---------------------------------------------------------------------------

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { user: loggedInUser } = await apiRequest<{ user: User; token: string }>(
        '/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }
      );

      setUser(loggedInUser);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiRequest('/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiRequest('/logout-all', { method: 'POST' });
      setUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setup = useCallback(async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { user: newUser } = await apiRequest<{ user: User; token: string }>(
        '/setup',
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }
      );

      setUser(newUser);
      setSetupRequired(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (
    username: string,
    password: string,
    email?: string,
    displayName?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { user: newUser } = await apiRequest<{ user: User; token: string }>(
        '/register',
        {
          method: 'POST',
          body: JSON.stringify({ username, password, email, displayName }),
        }
      );

      setUser(newUser);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data: Partial<User>) => {
    setError(null);

    try {
      const { user: updatedUser } = await apiRequest<{ user: User }>(
        '/me',
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );

      setUser(updatedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      throw err;
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setError(null);

    try {
      await apiRequest('/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
      throw err;
    }
  }, []);

  const getSessions = useCallback(async (): Promise<Session[]> => {
    const { sessions } = await apiRequest<{ sessions: Session[] }>('/sessions');
    return sessions;
  }, []);

  const revokeSession = useCallback(async (sessionId: string) => {
    await apiRequest(`/sessions/${sessionId}`, { method: 'DELETE' });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: currentUser } = await apiRequest<{ user: User }>('/me');
      setUser(currentUser);
    } catch {
      setUser(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    setupRequired,
    registrationAllowed,
    error,
    login,
    logout,
    logoutAll,
    setup,
    register,
    updateProfile,
    changePassword,
    getSessions,
    revokeSession,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
