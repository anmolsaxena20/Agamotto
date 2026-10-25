import React from 'react';

export function Card({
  children,
  className = '',
  style = {},
  onClick,
  hoverable = false,
  ...props
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hoverable && setIsHovered(true)}
      onMouseLeave={() => hoverable && setIsHovered(false)}
      style={{
        backgroundColor: 'var(--surface)',
        border: `1px solid ${isHovered ? 'var(--border-focus)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: 'var(--space-4)',
        boxShadow: 'none',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
        cursor: onClick ? 'pointer' : 'default',
        transform: isHovered ? 'translateY(-1px)' : 'none',
        ...style,
      }}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}
