import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export function StatusBadge({ status = 'ok', label, size = 'default' }) {
  const configs = {
    ok: {
      color: 'var(--ok)',
      bg: 'var(--ok-bg)',
      border: 'var(--ok-border)',
      Icon: CheckCircle2,
      defaultLabel: 'Healthy',
    },
    warn: {
      color: 'var(--warn)',
      bg: 'var(--warn-bg)',
      border: 'var(--warn-border)',
      Icon: AlertTriangle,
      defaultLabel: 'Warning',
    },
    error: {
      color: 'var(--error)',
      bg: 'var(--error-bg)',
      border: 'var(--error-border)',
      Icon: AlertCircle,
      defaultLabel: 'Failed',
    },
    info: {
      color: 'var(--text-muted)',
      bg: 'var(--surface-subtle)',
      border: 'var(--border)',
      Icon: Info,
      defaultLabel: 'Info',
    },
    accent: {
      color: 'var(--accent)',
      bg: 'var(--accent-subtle)',
      border: 'rgba(224, 176, 80, 0.35)',
      Icon: CheckCircle2,
      defaultLabel: 'Active',
    },
  };

  const current = configs[status] || configs.info;
  const IconComponent = current.Icon;
  const isSm = size === 'sm';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '2px 8px' : '4px 10px',
        borderRadius: 'var(--radius)',
        backgroundColor: current.bg,
        border: `1px solid ${current.border}`,
        color: current.color,
        fontSize: isSm ? '11px' : '12px',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.02em',
      }}
    >
      <IconComponent size={isSm ? 12 : 14} style={{ flexShrink: 0 }} />
      <span>{label || current.defaultLabel}</span>
    </div>
  );
}
