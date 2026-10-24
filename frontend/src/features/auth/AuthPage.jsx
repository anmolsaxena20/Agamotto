import React, { useState } from 'react';
import { EyeLogo } from '../../components/EyeLogo.jsx';
import { LoginForm } from './LoginForm.jsx';
import { SignupForm } from './SignupForm.jsx';
import { OtpModal } from './OtpModal.jsx';
import { ForgotPasswordModal } from './ForgotPasswordModal.jsx';
import { AuthSuccessView } from './AuthSuccessView.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { authApi } from '../../services/authApi.js';
import {
  Sparkles,
  Activity,
  Layers,
  Shield,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AuthPage({ onAuthSuccess, initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup'

  React.useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  const [otpModalState, setOtpModalState] = useState(null); // { email, name, expiresAt, isDemo }
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  // Handle successful signup verification
  const handleVerifyOtp = async (otp) => {
    setOtpLoading(true);
    setOtpError(null);
    try {
      if (otpModalState?.isDemo) {
        // Simulated verification for instant developer preview
        setTimeout(() => {
          setCurrentUser({
            user: {
              id: 'usr-new-001',
              name: otpModalState.name || 'Site Reliability Engineer',
              email: otpModalState.email,
              avatarUrl: null,
              isEmailVerified: true,
            },
            organization: {
              name: `${otpModalState.name || 'Personal'}'s Org`,
              slug: 'org-default',
            },
          });
          setOtpModalState(null);
          setOtpLoading(false);
        }, 500);
        return;
      }

      const res = await authApi.verifyEmail({
        email: otpModalState.email,
        otp,
      });

      setCurrentUser({
        user: res.user,
        organization: {
          name: `${res.user.name || 'Personal'}'s Org`,
        },
      });
      setOtpModalState(null);
      onAuthSuccess?.(res.user);
      navigate('/dashboard');
    } catch (err) {
      setOtpError(err.message || 'Invalid or expired verification code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!otpModalState?.email) return;
    try {
      await authApi.signup({
        email: otpModalState.email,
        name: otpModalState.name,
      });
    } catch (err) {
      setOtpError('Failed to resend code. Please try again.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background ambient mystic glow */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(224, 176, 80, 0.08) 0%, rgba(13, 16, 23, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Top Navigation / Brand bar */}
      <header
        style={{
          height: '64px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'rgba(21, 26, 35, 0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <EyeLogo size={34} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.01em', color: 'var(--text)' }}>
                Eye of Agamotto
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 6px',
                  backgroundColor: 'var(--surface-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}
              >
                v1.0-alpha
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              OpenTelemetry Observability & Intelligence
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            &larr; Back to Home
          </button>
        </div>
      </header>

      {/* Main Content Split Layout */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          zIndex: 1,
        }}
      >
        {currentUser ? (
          <AuthSuccessView
            user={currentUser.user}
            organization={currentUser.organization}
            onLogout={() => setCurrentUser(null)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              maxWidth: '980px',
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 480px)',
              gap: '40px',
              alignItems: 'center',
            }}
          >
            {/* Left Hero / Brand Spec Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    backgroundColor: 'var(--accent-subtle)',
                    border: '1px solid rgba(224, 176, 80, 0.3)',
                    borderRadius: 'var(--radius-full)',
                    color: 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '16px',
                  }}
                >
                  <Sparkles size={13} />
                  <span>Next-Gen Observability Engine</span>
                </div>

                <h1
                  className="text-page-title"
                  style={{
                    fontSize: '32px',
                    lineHeight: '40px',
                    marginBottom: '12px',
                    color: 'var(--text)',
                  }}
                >
                  Distributed Telemetry &amp; Trace Intelligence
                </h1>

                <p className="text-body" style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.6 }}>
                  From noticing a production anomaly to pinpointing its exact root-cause in spans, logs, and service graphs within seconds.
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(63, 182, 139, 0.15)',
                      color: 'var(--ok)',
                    }}
                  >
                    <Activity size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      Zero-Overhead Ingestion Gateway
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Native OTLP/gRPC streams and Protobuf batch processing with millisecond latency.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(224, 176, 80, 0.15)',
                      color: 'var(--accent)',
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      Interactive Waterfall & Topology
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Canvas-rendered 60 FPS trace timelines with critical-path highlighting and Dagre service maps.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(229, 166, 61, 0.15)',
                      color: 'var(--warn)',
                    }}
                  >
                    <Shield size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      Secure Multi-Tenant RBAC
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      HttpOnly cookie session security, organization slug isolation, and granular group permissions.
                    </div>
                  </div>
                </div>
              </div>

              {/* Security notice per Design Doc */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '16px',
                }}
              >
                <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} />
                <span>Encrypted transit ┬╖ Zero localStorage token storage ┬╖ OWASP Compliant</span>
              </div>
            </div>

            {/* Right Interactive Form Container */}
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '32px',
                boxShadow: 'var(--shadow-card)',
                position: 'relative',
              }}
            >
              {/* Form Navigation Tabs */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: 'var(--surface-input)',
                  borderRadius: 'var(--radius)',
                  padding: '4px',
                  marginBottom: '24px',
                  border: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    backgroundColor: mode === 'login' ? 'var(--surface)' : 'transparent',
                    color: mode === 'login' ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: mode === 'login' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    backgroundColor: mode === 'signup' ? 'var(--surface)' : 'transparent',
                    color: mode === 'signup' ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: mode === 'signup' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  Create Account
                </button>
              </div>

              {mode === 'login' ? (
                <LoginForm
                  onSwitchToSignup={() => setMode('signup')}
                  onForgotPassword={() => setIsForgotPasswordOpen(true)}
                  onLoginSuccess={(data) => {
                    setCurrentUser({
                      user: data.user,
                      organization: data.organization || { name: `${data.user.name || 'Personal'}'s Org` },
                    });
                    onAuthSuccess?.(data.user);
                    navigate('/dashboard');
                  }}
                />
              ) : (
                <SignupForm
                  onSwitchToLogin={() => setMode('login')}
                  onRequireOtp={(details) => setOtpModalState(details)}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* OTP Verification Modal */}
      {otpModalState && (
        <OtpModal
          email={otpModalState.email}
          isLoading={otpLoading}
          error={otpError}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onCancel={() => {
            setOtpModalState(null);
            setOtpError(null);
          }}
        />
      )}

      {/* Forgot Password Modal */}
      {isForgotPasswordOpen && (
        <ForgotPasswordModal
          onClose={() => setIsForgotPasswordOpen(false)}
          onSuccess={() => setMode('login')}
        />
      )}

      {/* Footer */}
      <footer
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--surface)',
        }}
      >
        <div>
          Eye of Agamotto &copy; 2026 Team Vortex ┬╖ WEBSTER 2026 Problem Statement 08
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Strict Dark Theme</span>
          <span>┬╖</span>
          <span>OpenTelemetry v1.30</span>
          <span>┬╖</span>
          <span>W3C TraceContext</span>
        </div>
      </footer>
    </div>
  );
}
