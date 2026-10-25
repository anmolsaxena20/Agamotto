import React from 'react';
import {
  Activity,
  Layers,
  GitBranch,
  Terminal,
  BarChart3,
  Network,
  AlertTriangle,
  Server,
  ShieldCheck,
  CheckCircle2,
  Users,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Activity, desc: 'KPIs & Service Health' },
  { id: 'traces', label: 'Traces', icon: Layers, desc: 'Distributed Traces' },
  { id: 'spans', label: 'Spans', icon: GitBranch, desc: 'Individual Spans Explorer' },
  { id: 'logs', label: 'Logs', icon: Terminal, desc: 'Correlated Log Stream' },
  { id: 'metrics', label: 'Metrics', icon: BarChart3, desc: 'CPU, Memory, Latency' },
  { id: 'topology', label: 'Topology', icon: Network, desc: 'Dependency Map' },
  { id: 'errors', label: 'Errors', icon: AlertTriangle, desc: 'Fingerprints & Groups' },
];

const PLATFORM_NAV_ITEMS = [
  { id: 'settings', label: 'Members & Access', icon: Users, desc: 'RBAC, Members & Roles' },
];

export function Sidebar({
  activeView,
  onSelectView,
  counts = {},
}) {
  return (
    <aside
      style={{
        width: '240px',
        minWidth: '240px',
        backgroundColor: 'var(--surface-subtle)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 12px',
        height: 'calc(100vh - 64px)',
        position: 'sticky',
        top: '64px',
      }}
    >
      {/* Navigation List */}
      <div>
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            padding: '0 8px 10px',
            fontWeight: 600,
          }}
        >
          Observability Views
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const count = counts[item.id];

            return (
              <button
                key={item.id}
                onClick={() => onSelectView?.(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: isActive ? 'var(--surface-active)' : 'transparent',
                  border: isActive ? '1px solid var(--border-focus)' : '1px solid transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                      {item.label}
                    </div>
                  </div>
                </div>

                {count !== undefined && count !== null && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--surface-input)',
                      color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Platform & Organization Management */}
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            padding: '20px 8px 10px',
            fontWeight: 600,
          }}
        >
          Platform & Roles
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {PLATFORM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectView?.(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: isActive ? 'var(--surface-active)' : 'transparent',
                  border: isActive ? '1px solid var(--border-focus)' : '1px solid transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <div style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500 }}>
                    {item.label}
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'var(--surface-input)',
                    color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                    fontWeight: 600,
                  }}
                >
                  RBAC
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Ingestion & Telemetry Info Card */}
      <div
        style={{
          padding: '12px',
          backgroundColor: 'var(--surface-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Server size={13} style={{ color: 'var(--ok)' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
            OTLP Ingestion Active
          </span>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            wordBreak: 'break-all',
            lineHeight: 1.4,
          }}
        >
          :4318 (HTTP) / :4317 (gRPC)
        </div>
        <div
          style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          <span>Auto-instrumented</span>
          <span style={{ color: 'var(--ok)', fontWeight: 600 }}>v3.0.0 OTel</span>
        </div>
      </div>
    </aside>
  );
}
