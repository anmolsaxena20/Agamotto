import React, { useState } from 'react';
import { Mail, Lock, User, Building, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { Input } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { OAuthButtons } from '../../components/OAuthButtons.jsx';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter.jsx';
import { authApi } from '../../services/authApi.js';

export function SignupForm({
  onSwitchToLogin,
  onRequireOtp,
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orgName: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const { name, email, password, confirmPassword, agreedToTerms } = formData;

    if (!name || !email || !password) {
      setError('Please fill in your name, email, and password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long (required by backend).');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!agreedToTerms) {
      setError('You must accept the terms of service to create an account.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.signup({
        email,
        password,
        name,
      });

      // Pass email and details to OTP modal
      onRequireOtp({
        email,
        name,
        expiresAt: response.expiresAt,
      });
    } catch (err) {
      if (err.isOffline) {
        // Allow developer preview even if backend is offline
        setError(
          'Backend offline on localhost:3000. Start server or click "Preview Verification" below.'
        );
      } else {
        setError(err.message || 'Registration failed. Please try another email.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoOtp = () => {
    onRequireOtp({
      email: formData.email || 'developer@agamotto.dev',
      name: formData.name || 'Demo Engineer',
      isDemo: true,
    });
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 className="text-page-title" style={{ fontSize: '22px', marginBottom: '6px' }}>
          Create your account
        </h2>
        <p className="text-body" style={{ color: 'var(--text-muted)' }}>
          Start monitoring traces, logs, and distributed service graphs in minutes.
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
            marginBottom: '16px',
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
                  onClick={handleDemoOtp}
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
                  ⚡ Preview Verification Step
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Name and Organization */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Full Name"
            name="name"
            placeholder="Stephen Strange"
            icon={User}
            value={formData.name}
            onChange={handleChange}
            required
            autoComplete="name"
          />

          <Input
            label="Organization"
            name="orgName"
            placeholder="Personal / Team"
            hint="optional"
            icon={Building}
            value={formData.orgName}
            onChange={handleChange}
          />
        </div>

        <Input
          label="Work or Personal Email"
          type="email"
          name="email"
          placeholder="developer@company.com"
          icon={Mail}
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="email"
        />

        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="At least 8 characters"
            icon={Lock}
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={formData.password} />
        </div>

        <Input
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          placeholder="Re-enter your password"
          icon={Lock}
          value={formData.confirmPassword}
          onChange={handleChange}
          required
          autoComplete="new-password"
        />

        <div style={{ marginTop: '4px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              userSelect: 'none',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              name="agreedToTerms"
              checked={formData.agreedToTerms}
              onChange={handleChange}
              style={{
                accentColor: 'var(--accent)',
                marginTop: '2px',
                cursor: 'pointer',
              }}
            />
            <span>
              I agree to the <span style={{ color: 'var(--accent)' }}>Terms of Service</span> and{' '}
              <span style={{ color: 'var(--accent)' }}>Privacy Policy</span>. Cookies are used for
              secure session management.
            </span>
          </label>
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
            Create Account & Verify
          </Button>
        </div>
      </form>

      <OAuthButtons />

      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--text-muted)',
        }}
      >
        <span>Already have an account? </span>
        <button
          type="button"
          onClick={onSwitchToLogin}
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
          Sign in
        </button>
      </div>
    </div>
  );
}
