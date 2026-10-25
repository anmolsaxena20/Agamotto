import React from 'react';
import { EyeLogo } from '../../../components/EyeLogo.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import {
  Clock,
  Radio,
  Zap,
  RefreshCw,
  LogOut,
  Building,
  Filter,
  Settings,
} from 'lucide-react';

const TIME_RANGES = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
];

export function TopBar({
  services = [],
  selectedService,
  onSelectService,
  timeRange,
  onSelectTimeRange,
  isLive,
  onToggleLive,
  onOpenSimulate,
  onRefresh,
  isRefreshing,
  user,
  organization,
  onSignOut,
  onNavigateSettings,
}) {
  return (
    <header
      style={{
        height: '64px',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Brand & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <EyeLogo size={28} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--text)',
                }}
              >
                Eye of Agamotto
              </span>
              <span
                style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 6px',
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
              >
                Observability
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              OpenTelemetry Telemetry Control Plane
            </div>
          </div>
        </div>
      </div>

      {/* Global Telemetry Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Service Selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            gap: '6px',
          }}
        >
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select
            value={selectedService}
            onChange={(e) => onSelectService?.(e.target.value)}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text)',
              border: 'none',
              outline: 'none',
              fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            <option value="all" style={{ backgroundColor: 'var(--surface)' }}>
              All Services ({services.length})
            </option>
            {services.map((svc) => (
              <option key={svc} value={svc} style={{ backgroundColor: 'var(--surface)' }}>
                {svc}
              </option>
            ))}
          </select>
        </div>

        {/* Time Range Selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
          }}
        >
          <Clock size={13} style={{ color: 'var(--text-dim)', marginLeft: '6px', marginRight: '4px' }} />
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => onSelectTimeRange?.(tr.value)}
              style={{
                background: timeRange === tr.value ? 'var(--surface-hover)' : 'transparent',
                color: timeRange === tr.value ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: timeRange === tr.value ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tr.label}
            </button>
          ))}
        </div>

        {/* Live Auto-Refresh Toggle */}
        <button
          onClick={onToggleLive}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isLive ? 'rgba(63, 182, 139, 0.12)' : 'var(--surface-input)',
            border: `1px solid ${isLive ? 'var(--ok-border)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            color: isLive ? 'var(--ok)' : 'var(--text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          title={isLive ? 'Live mode: auto-refreshing every 5 seconds' : 'Click to enable live stream'}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isLive ? 'var(--ok)' : 'var(--text-dim)',
              display: 'inline-block',
              boxShadow: isLive ? '0 0 8px var(--ok)' : 'none',
              animation: isLive ? 'pulse 2s infinite' : 'none',
            }}
          />
          <Radio size={13} />
          <span>{isLive ? 'Live (5s)' : 'Paused'}</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            backgroundColor: 'var(--surface-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: isRefreshing ? 'wait' : 'pointer',
          }}
          title="Manual Refresh"
        >
          <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        {/* Simulate Chaos/Telemetry Button */}
        <button
          onClick={onOpenSimulate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            color: 'var(--accent)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Zap size={14} />
          <span>Simulate Traffic</span>
        </button>
      </div>

      {/* Identity & Sign Out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          onClick={onNavigateSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: onNavigateSettings ? 'pointer' : 'default',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background-color 0.15s',
          }}
          title="Manage Organization & Members"
          onMouseEnter={(e) => onNavigateSettings && (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--surface-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <Building size={14} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              {organization?.name || "Doctor Strange's Org"}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {user?.email || 'sorcerer.supreme@agamotto.dev'}
            </div>
          </div>
        </div>

        {onNavigateSettings && (
          <button
            onClick={onNavigateSettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              transition: 'color 0.15s',
            }}
            title="Organization & Member Settings"
          >
            <Settings size={15} />
          </button>
        )}

        <button
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s',
          }}
          title="Sign out of account"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
