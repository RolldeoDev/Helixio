/**
 * Login Page
 *
 * Handles user login and initial setup.
 */

import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../themes/ThemeContext';
import './LoginPage.css';

export function LoginPage() {
  const { login, setup, setupRequired, isLoading, error, clearError } = useAuth();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isSetup = setupRequired;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!username.trim() || !password.trim()) {
      setLocalError('Username and password are required');
      return;
    }

    if (isSetup) {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters');
        return;
      }
      await setup(username, password);
    } else {
      await login(username, password);
    }
  };

  const displayError = localError || error;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img
            src={isDark ? '/helixioNameWhiteText.png' : '/helixioNameBlackText.png'}
            alt="Helixio"
            className="login-logo-img"
          />
          <p className="login-subtitle">
            {isSetup ? 'Create your admin account' : 'Sign in to continue'}
          </p>
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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              disabled={isLoading}
            />
          </div>

          {isSetup && (
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
            {isLoading ? 'Please wait...' : isSetup ? 'Create Account' : 'Sign In'}
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
      </div>
    </div>
  );
}
