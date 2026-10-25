import React, { useState, useEffect } from 'react';
import { Mail, ArrowLeft, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { OtpInput } from '../../components/OtpInput.jsx';

export function OtpModal({
  email,
  onVerify,
  onResend,
  onCancel,
  isLoading = false,
  error = null,
}) {
  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;
    setIsResending(true);
    try {
      await onResend();
      setTimeLeft(300);
      setCanResend(false);
    } catch {
      // error handled by parent
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (otp.length === 6) {
      onVerify(otp);
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
        aria-labelledby="otp-title"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-4)',
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
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
          title="Back"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div style={{ textAlign: 'center', marginTop: '20px', marginBottom: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid rgba(224, 176, 80, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              marginBottom: '12px',
            }}
          >
            <ShieldCheck size={26} />
          </div>

          <h3 id="otp-title" className="text-section-title" style={{ marginBottom: '6px' }}>
            Verify Your Email
          </h3>
          <p className="text-small" style={{ color: 'var(--text-secondary)' }}>
            We've dispatched a 6-digit verification code to
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
            }}
          >
            <Mail size={13} />
            <span>{email}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <OtpInput
            length={6}
            value={otp}
            onChange={setOtp}
            disabled={isLoading}
            error={Boolean(error)}
          />

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'center',
                fontSize: '12px',
                color: 'var(--error)',
                marginBottom: '12px',
              }}
            >
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              margin: '8px 0 20px 0',
              fontSize: '12px',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              Expires in:{' '}
              <span
                style={{
                  color: timeLeft < 60 ? 'var(--error)' : 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}
              >
                {formatTime(timeLeft)}
              </span>
            </span>

            <button
              type="button"
              disabled={!canResend || isResending}
              onClick={handleResend}
              style={{
                background: 'none',
                border: 'none',
                color: canResend ? 'var(--accent)' : 'var(--text-dim)',
                cursor: canResend ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <RefreshCw size={12} className={isResending ? 'animate-spin' : ''} />
              <span>{isResending ? 'Sending...' : 'Resend Code'}</span>
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            size="lg"
            isLoading={isLoading}
            disabled={otp.length !== 6 || isLoading}
          >
            Confirm & Complete Setup
          </Button>
        </form>
      </div>
    </div>
  );
}
