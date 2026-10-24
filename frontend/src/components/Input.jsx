import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export function Input({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon: Icon,
  required = false,
  autoComplete,
  disabled = false,
  isMono = false,
  className = '',
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isPasswordType = type === 'password';
  const effectiveType = isPasswordType ? (showPassword ? 'text' : 'password') : type;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }} className={className}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label
            htmlFor={name}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: error ? 'var(--error)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {label} {required && <span style={{ color: 'var(--accent)' }}>*</span>}
          </label>
          {hint && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {hint}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--surface-input)',
          border: `1px solid ${error ? 'var(--error)' : isFocused ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          boxShadow: isFocused ? 'var(--shadow-input-focus)' : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          overflow: 'hidden',
        }}
      >
        {Icon && (
          <div
            style={{
              paddingLeft: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFocused ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s ease',
              pointerEvents: 'none',
            }}
          >
            <Icon size={16} />
          </div>
        )}

        <input
          id={name}
          name={name}
          type={effectiveType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '10px 12px',
            color: 'var(--text)',
            fontSize: '14px',
            fontFamily: isMono ? 'var(--font-mono)' : 'var(--font-sans)',
            width: '100%',
          }}
          {...props}
        />

        {isPasswordType && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 12px',
              cursor: 'pointer',
              color: showPassword ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--error)',
            marginTop: '2px',
          }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
