import React from 'react';
import { Check, X } from 'lucide-react';

export function PasswordStrengthMeter({ password = '' }) {
  if (!password) return null;

  const hasMinLength = password.length >= 8;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);

  const score = [hasMinLength, hasLetters, hasNumberOrSymbol, hasMixedCase].filter(Boolean).length;

  let strengthLabel = 'Too weak';
  let color = 'var(--error)';
  let percentage = 25;

  if (score === 2) {
    strengthLabel = 'Fair';
    color = 'var(--warn)';
    percentage = 50;
  } else if (score === 3) {
    strengthLabel = 'Good';
    color = 'var(--accent)';
    percentage = 75;
  } else if (score === 4) {
    strengthLabel = 'Strong';
    color = 'var(--ok)';
    percentage = 100;
  }

  const requirements = [
    { label: 'At least 8 characters (required)', met: hasMinLength },
    { label: 'Numbers or symbols', met: hasNumberOrSymbol },
    { label: 'Mixed case (upper & lowercase)', met: hasMixedCase },
  ];

  return (
    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Progress Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            flex: 1,
            height: '4px',
            backgroundColor: 'var(--surface-input)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: '100%',
              backgroundColor: color,
              transition: 'all 0.25s ease',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color,
            fontFamily: 'var(--font-sans)',
            minWidth: '55px',
            textAlign: 'right',
          }}
        >
          {strengthLabel}
        </span>
      </div>

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {requirements.map((req, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: req.met ? 'var(--ok)' : 'var(--text-muted)',
              transition: 'color 0.15s ease',
            }}
          >
            {req.met ? (
              <Check size={12} strokeWidth={2.5} style={{ color: 'var(--ok)' }} />
            ) : (
              <X size={12} strokeWidth={2.5} style={{ color: 'var(--text-dim)' }} />
            )}
            <span>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
