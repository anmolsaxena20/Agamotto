import React, { useRef, useEffect } from 'react';

export function OtpInput({ length = 6, value = '', onChange, disabled = false, error = false }) {
  const inputRefs = useRef([]);

  // Ensure digits array is of correct length
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    // Focus first input initially
    if (inputRefs.current[0] && !disabled) {
      inputRefs.current[0].focus();
    }
  }, [disabled]);

  const handleChange = (e, index) => {
    const val = e.target.value;
    // Allow only digits
    const cleaned = val.replace(/\D/g, '');

    if (!cleaned) {
      // Deletion
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    if (cleaned.length > 1) {
      // Pasted multiple digits
      const pasted = cleaned.slice(0, length);
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    // Single digit input
    const newDigits = [...digits];
    newDigits[index] = cleaned[0];
    const combined = newDigits.join('');
    onChange(combined);

    // Auto-advance to next slot
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Empty input backspace -> focus previous
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '16px 0',
      }}
      onPaste={handlePaste}
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          disabled={disabled}
          style={{
            width: '46px',
            height: '52px',
            textAlign: 'center',
            fontSize: '22px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text)',
            backgroundColor: 'var(--surface-input)',
            border: `1px solid ${
              error
                ? 'var(--error)'
                : digits[index]
                ? 'var(--accent)'
                : 'var(--border)'
            }`,
            borderRadius: 'var(--radius)',
            outline: 'none',
            boxShadow: digits[index]
              ? '0 0 0 1px var(--accent)'
              : 'none',
            transition: 'all 0.15s ease',
          }}
          onFocus={(e) => {
            e.target.select();
            e.target.style.borderColor = 'var(--border-focus)';
            e.target.style.boxShadow = 'var(--shadow-input-focus)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error
              ? 'var(--error)'
              : digits[index]
              ? 'var(--accent)'
              : 'var(--border)';
            e.target.style.boxShadow = digits[index]
              ? '0 0 0 1px var(--accent)'
              : 'none';
          }}
        />
      ))}
    </div>
  );
}
