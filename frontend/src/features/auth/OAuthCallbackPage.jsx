import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { setAccessToken, broadcastLogin } from '../../services/apiClient.js';
import { authService } from '../../services/apiServices.js';
import { EyeLogo } from '../../components/EyeLogo.jsx';

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const err = searchParams.get('error');

    if (err) {
      setError(err);
      const timer = setTimeout(() => {
        navigate(`/login?error=${encodeURIComponent(err)}`, { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (token) {
      // 1. Store token in localStorage
      setAccessToken(token);

      // 2. Fetch authenticated user profile
      authService
        .getMe()
        .then((data) => {
          if (data?.user) {
            setUser(data.user);
            broadcastLogin(data.user);
          }
          navigate('/dashboard/overview', { replace: true });
        })
        .catch(() => {
          // Fallback to dashboard even if profile load experiences transient latency
          navigate('/dashboard/overview', { replace: true });
        });
    } else {
      setError('No authentication token received from OAuth provider');
      const timer = setTimeout(() => {
        navigate('/login?error=MissingToken', { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate, setUser]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: 'var(--text)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <EyeLogo size={48} />

        {error ? (
          <div
            style={{
              padding: '12px 18px',
              backgroundColor: 'var(--error-bg)',
              border: '1px solid var(--error-border)',
              borderRadius: 'var(--radius)',
              color: 'var(--error)',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            Authentication failed: {error}
            <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
              Redirecting back to login...
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '3px solid var(--accent-subtle)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                Authenticating session...
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                Verifying OAuth credentials and connecting your telemetry workspace.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
