import React, { useState } from 'react';
import { Lock } from 'lucide-react';

/**
 * LockedAction wrapper for actions that the user lacks permission to execute.
 * Renders the child component in a disabled state with a lock icon and tooltip
 * per the Eye of Agamotto UX design specification.
 */
export function LockedAction({
  isAllowed,
  reason = 'Requires administrative privileges',
  children,
  style = {},
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (isAllowed) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        ...style,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        style={{
          opacity: 0.5,
          pointerEvents: 'none',
          filter: 'grayscale(0.6)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {children}
      </div>

      <div
        style={{
          marginLeft: '6px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warn)',
          cursor: 'help',
        }}
        title={reason}
      >
        <Lock size={13} />
      </div>

      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-6px)',
            backgroundColor: 'var(--surface-active)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-card)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            zIndex: 100,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Lock size={11} style={{ color: 'var(--warn)' }} />
          <span>{reason}</span>
        </div>
      )}
    </div>
  );
}
