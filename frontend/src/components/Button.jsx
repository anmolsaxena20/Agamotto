import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'default',    // 'default' | 'sm' | 'lg' | 'xs'
  isLoading = false,
  disabled = false,
  icon: Icon,
  className = '',
  type = 'button',
  onClick,
  style = {},
  fullWidth = false,
  ...props
}) {
  const sizeClassMap = {
    xs: 'pro-btn-xs',
    sm: 'pro-btn-sm',
    default: 'pro-btn-md',
    lg: 'pro-btn-lg',
  };

  const variantClassMap = {
    primary: 'pro-btn-primary',
    secondary: 'pro-btn-secondary',
    ghost: 'pro-btn-ghost',
    danger: 'pro-btn-danger',
  };

  const btnClasses = [
    'pro-btn',
    sizeClassMap[size] || 'pro-btn-md',
    variantClassMap[variant] || 'pro-btn-primary',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={btnClasses}
      style={{
        width: fullWidth ? '100%' : 'auto',
        ...style,
      }}
      onClick={onClick}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === 'xs' || size === 'sm' ? 13 : 15} style={{ animation: 'spin 0.8s linear infinite' }} />
      ) : Icon ? (
        <Icon size={size === 'xs' || size === 'sm' ? 13 : 15} />
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
