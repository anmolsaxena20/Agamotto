import React from 'react';

export function Card({
  children,
  className = '',
  style = {},
  onClick,
  hoverable = false,
  title,
  subtitle,
  action,
  headerBorder = true,
  bodyPadding = 'var(--space-4)',
  ...props
}) {
  const isInteractive = hoverable || Boolean(onClick);
  const cardClasses = [
    'pro-card',
    isInteractive ? 'pro-card-interactive' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      onClick={onClick}
      className={cardClasses}
      style={{
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
      {...props}
    >
      {(title || action) && (
        <div
          className="pro-card-header"
          style={{
            borderBottom: headerBorder ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{action}</div>}
        </div>
      )}
      <div
        style={{
          padding: (title || action) ? (bodyPadding || '16px') : (bodyPadding || 'var(--space-4)'),
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
