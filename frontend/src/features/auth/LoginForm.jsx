import React, { useState } from 'react';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { Input } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { OAuthButtons } from '../../components/OAuthButtons.jsx';
import { authApi } from '../../services/authApi.js';

export function LoginForm({
  onSwitchToSignup,
  onForgotPassword,
  onLoginSuccess,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await authApi.login({ email, password });
      onLoginSuccess?.(data);
    } catch (err) {
      if (err.isOffline) {
        // Fallback demo simulation if server is offline so user can preview immediately!
        setError(
          'Backend offline on localhost:3000. Start the server (npm run dev inside Agamotto/server) or click "Demo Sign In" below.'
        );
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = () => {
    onLoginSuccess?.({
      message: 'Demo Login Successful',
      user: {
        id: 'usr-agamotto-demo',
        name: 'Doctor Strange (Demo)',
        email: email || 'sorcerer.supreme@agamotto.dev',
        avatarUrl: null,
        isEmailVerified: true,
      },
      organization: {
        id: 'org-kamar-taj',
        name: "Doctor Strange's Org",
        slug: 'kamar-taj',
      },
    });
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 className="text-page-title" style={{ fontSize: '22px', marginBottom: '6px' }}>
          Welcome back
        </h2>
        <p className="text-body" style={{ color: 'var(--text-muted)' }}>
          Sign in to access your telemetry streams, traces, and system topology.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--error-bg)',
            border: '1px solid var(--error-border)',
            borderRadius: 'var(--radius)',
            color: 'var(--error)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '18px',
            lineHeight: 1.4,
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <span>{error}</span>
            {error.includes('offline') && (
              <div style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleDemoSignIn}
                  style={{
                    background: 'var(--accent)',
                    color: '#0D1017',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Preview with Demo Account
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Input
          label="Email Address"
          type="email"
          name="email"
          placeholder="developer@company.com"
          icon={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          autoFocus
        />

        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="Enter your password"
            icon={Lock}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '10px',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                  borderRadius: '3px',
                }}
              />
              <span>Remember this session</span>
            </label>

            <button
              type="button"
              onClick={onForgotPassword}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              Forgot password?
            </button>
          </div>
        </div>

        <div style={{ marginTop: '8px' }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            icon={ArrowRight}
          >
            Sign In to Agamotto
          </Button>
        </div>
      </form>

      <OAuthButtons />

      <div
        style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--text-muted)',
        }}
      >
        <span>Don't have an organization account yet? </span>
        <button
          type="button"
          onClick={onSwitchToSignup}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'none',
          }}
        >
          Create an account
        </button>
      </div>
    </div>
  );
}
