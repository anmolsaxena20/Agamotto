import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'default',   // 'default' | 'sm' | 'lg'
  isLoading = false,
  disabled = false,
  icon: Icon,
  className = '',
  type = 'button',
  onClick,
  style = {},
  ...props
}) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: 'var(--radius)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    transition: 'all 0.18s ease-in-out',
    border: '1px solid transparent',
    outline: 'none',
    width: props.fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
  };

  const sizeStyles = {
    sm: {
      height: '32px',
      padding: '0 12px',
      fontSize: '12px',
    },
    default: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
    },
    lg: {
      height: '46px',
      padding: '0 20px',
      fontSize: '15px',
    },
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--accent)',
      color: '#0D1017',
      borderColor: 'var(--accent)',
      boxShadow: '0 2px 8px rgba(224, 176, 80, 0.25)',
    },
    secondary: {
      backgroundColor: 'transparent',
      color: 'var(--text)',
      borderColor: 'var(--border)',
    },
    danger: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      color: 'var(--error)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      borderColor: 'transparent',
    },
  };

  const activeStyle = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...style,
  };

  const handleMouseEnter = (e) => {
    if (disabled || isLoading) return;
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
      e.currentTarget.style.borderColor = 'var(--accent-hover)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
      e.currentTarget.style.borderColor = 'var(--text-muted)';
      e.currentTarget.style.color = '#ffffff';
    } else if (variant === 'danger') {
      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.22)';
      e.currentTarget.style.borderColor = 'var(--error)';
      e.currentTarget.style.color = '#ff6b6b';
      e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.35)';
    } else if (variant === 'ghost') {
      e.currentTarget.style.color = 'var(--text)';
      e.currentTarget.style.backgroundColor = 'var(--surface-subtle)';
    }
  };

  const handleMouseLeave = (e) => {
    if (disabled || isLoading) return;
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = 'var(--accent)';
      e.currentTarget.style.borderColor = 'var(--accent)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.backgroundColor = 'transparent';
      e.currentTarget.style.borderColor = 'var(--border)';
      e.currentTarget.style.color = 'var(--text)';
    } else if (variant === 'danger') {
      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      e.currentTarget.style.color = 'var(--error)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.15)';
    } else if (variant === 'ghost') {
      e.currentTarget.style.color = 'var(--text-muted)';
      e.currentTarget.style.backgroundColor = 'transparent';
    }
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      style={activeStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
