/**
 * Login Page
 *
 * Handles user login, registration, and initial setup.
 */

import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../themes/ThemeContext';
import './LoginPage.css';

type PageMode = 'login' | 'register' | 'setup';

export function LoginPage() {
  const { login, setup, register, setupRequired, registrationAllowed, isLoading, error, clearError } = useAuth();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const [mode, setMode] = useState<PageMode>(setupRequired ? 'setup' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isSetup = setupRequired || mode === 'setup';
  const isRegister = mode === 'register';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!username.trim() || !password.trim()) {
      setLocalError('Username and password are required');
      return;
    }

    if (isSetup || isRegister) {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters');
        return;
      }
      if (username.length < 3) {
        setLocalError('Username must be at least 3 characters');
        return;
      }

      if (isSetup) {
        await setup(username, password);
      } else {
        await register(username, password, email || undefined, displayName || undefined);
      }
    } else {
      await login(username, password);
    }
  };

  const switchMode = (newMode: PageMode) => {
    setMode(newMode);
    setLocalError(null);
    clearError();
    setPassword('');
    setConfirmPassword('');
  };

  const displayError = localError || error;

  const getSubtitle = () => {
    if (isSetup) return 'Create your admin account';
    if (isRegister) return 'Create a new account';
    return 'Sign in to continue';
  };

  const getButtonText = () => {
    if (isLoading) return 'Please wait...';
    if (isSetup) return 'Create Admin Account';
    if (isRegister) return 'Create Account';
    return 'Sign In';
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img
            src={isDark ? '/helixioNameWhiteText.png' : '/helixioNameBlackText.png'}
            alt="Helixio"
            className="login-logo-img"
          />
          <p className="login-subtitle">{getSubtitle()}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {displayError && (
            <div className="login-error">
              {displayError}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {isRegister && (
            <>
              <div className="form-group">
                <label htmlFor="email">Email (optional)</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="displayName">Display Name (optional)</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  autoComplete="name"
                  disabled={isLoading}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isSetup || isRegister ? 'new-password' : 'current-password'}
              disabled={isLoading}
            />
          </div>

          {(isSetup || isRegister) && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                disabled={isLoading}
              />
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {getButtonText()}
          </button>
        </form>

        {isSetup && (
          <div className="login-info">
            <p>
              This is your first time setting up Helixio.
              Create an admin account to get started.
            </p>
          </div>
        )}

        {isRegister && (
          <div className="login-info">
            <p>
              New accounts have no library access by default.
              An admin will need to grant you access.
            </p>
          </div>
        )}

        {!isSetup && (
          <div className="login-toggle">
            {mode === 'login' && registrationAllowed && (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => switchMode('register')}
                  disabled={isLoading}
                >
                  Create one
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => switchMode('login')}
                  disabled={isLoading}
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
