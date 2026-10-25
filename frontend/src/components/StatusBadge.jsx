import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export function StatusBadge({ status = 'ok', label, size = 'default' }) {
  const configs = {
    ok: {
      color: '#A1A1AA', // neutral zinc text
      bg: 'rgba(255, 255, 255, 0.04)',
      border: 'rgba(255, 255, 255, 0.08)',
      dotColor: '#52525B',
      Icon: CheckCircle2,
      defaultLabel: 'Healthy',
    },
    warn: {
      color: '#D4D4D8',
      bg: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(255, 255, 255, 0.1)',
      dotColor: '#71717A',
      Icon: AlertTriangle,
      defaultLabel: 'Warning',
    },
    error: {
      color: '#F87171',
      bg: 'rgba(239, 68, 68, 0.08)',
      border: 'rgba(239, 68, 68, 0.2)',
      dotColor: '#EF4444',
      Icon: AlertCircle,
      defaultLabel: 'Failed',
    },
    info: {
      color: 'var(--text-muted)',
      bg: 'var(--surface-input)',
      border: 'var(--border)',
      dotColor: 'var(--text-dim)',
      Icon: Info,
      defaultLabel: 'Info',
    },
    accent: {
      color: 'var(--text)',
      bg: 'rgba(255, 255, 255, 0.06)',
      border: 'rgba(255, 255, 255, 0.12)',
      dotColor: 'var(--accent)',
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
