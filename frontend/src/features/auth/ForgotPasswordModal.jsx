import React, { useState } from 'react';
import { Mail, KeyRound, ArrowLeft, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { OtpInput } from '../../components/OtpInput.jsx';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter.jsx';
import { authApi } from '../../services/authApi.js';

export function ForgotPasswordModal({ onClose, onSuccess }) {
  const [step, setStep] = useState('EMAIL'); // 'EMAIL' | 'RESET' | 'DONE'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setStep('RESET');
    } catch (err) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (otp.length !== 6) {
      setError('Please provide the 6-digit verification code');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        email,
        otp,
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      setStep('DONE');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {step === 'EMAIL' && (
          <form onSubmit={handleRequestOtp} style={{ marginTop: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <KeyRound size={22} />
              </div>
              <h3 className="text-section-title">Reset Your Password</h3>
              <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                Enter your registered email address and we'll send you a 6-digit recovery code.
              </p>
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--error-bg)',
                  border: '1px solid var(--error-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--error)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <Input
              label="Work or Personal Email"
              type="email"
              placeholder="user@example.com"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <div style={{ marginTop: '20px' }}>
              <Button type="submit" variant="primary" fullWidth size="lg" isLoading={isLoading}>
                Send Recovery Code
              </Button>
            </div>
          </form>
        )}

        {step === 'RESET' && (
          <form onSubmit={handleResetPassword} style={{ marginTop: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <h3 className="text-section-title">Enter Code & New Password</h3>
              <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                Verification code sent to <strong style={{ color: 'var(--accent)' }}>{email}</strong>
              </p>
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--error-bg)',
                  border: '1px solid var(--error-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--error)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '12px',
                }}
              >
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                6-Digit Recovery Code
              </label>
              <OtpInput
                length={6}
                value={otp}
                onChange={setOtp}
                disabled={isLoading}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <Input
                  label="New Password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  icon={Lock}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <PasswordStrengthMeter password={newPassword} />
              </div>

              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Re-enter new password"
                icon={Lock}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ marginTop: '20px' }}>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                isLoading={isLoading}
                disabled={otp.length !== 6 || !newPassword || !confirmPassword}
              >
                Set New Password
              </Button>
            </div>
          </form>
        )}

        {step === 'DONE' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--ok-bg)',
                border: '1px solid var(--ok-border)',
                color: 'var(--ok)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <CheckCircle2 size={26} />
            </div>
            <h3 className="text-section-title" style={{ marginBottom: '8px' }}>
              Password Reset Complete!
            </h3>
            <p className="text-body" style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Your password has been securely updated. You can now log into your Eye of Agamotto account.
            </p>
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => {
                onSuccess?.();
                onClose();
              }}
            >
              Proceed to Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
