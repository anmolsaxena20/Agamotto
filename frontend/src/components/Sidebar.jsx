import React from 'react';
import {
  Activity,
  Server,
  Clock,
  Zap,
  Network,
  Share2,
  GitBranch,
  Terminal,
  Cpu,
  Building2,
  Users,
  Key,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export function Sidebar({ currentTab, onSelectTab }) {
  const navSections = [
    {
      title: 'AI & ROOT-CAUSE ANALYSIS',
      items: [
        { id: 'anomalies', label: 'AI Anomalies & Root Cause', icon: Sparkles, badge: 'AI' },
      ],
    },
    {
      title: 'TELEMETRY & OBSERVABILITY',
      items: [
        { id: 'overview', label: 'Global Overview', icon: Activity },
        { id: 'services', label: 'Microservices', icon: Server },
        { id: 'latency', label: 'Latency Percentiles', icon: Clock },
        { id: 'throughput', label: 'Throughput & RPS', icon: Zap },
        { id: 'endpoints', label: 'Route Endpoints', icon: Network },
        { id: 'graph', label: 'Dependency Graph', icon: Share2 },
        { id: 'traces', label: 'Traces & Waterfall', icon: GitBranch },
        { id: 'logs', label: 'Telemetry Logs', icon: Terminal },
        { id: 'resources', label: 'System Resources', icon: Cpu },
      ],
    },
    {
      title: 'ORGANIZATION & RBAC',
      items: [
        { id: 'organizations', label: 'Workspaces', icon: Building2 },
        { id: 'members', label: 'Members & Roles', icon: Users },
        { id: 'keys', label: 'API Ingest Keys', icon: Key },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: '240px',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: 'calc(100vh - 60px)',
        position: 'sticky',
        top: '60px',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {navSections.map((section, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                padding: '0 8px',
                marginBottom: '4px',
              }}
            >
              {section.title}
            </div>

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius)',
                    backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(224, 176, 80, 0.3)' : 'transparent'}`,
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                      e.currentTarget.style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: 'var(--ok-bg)',
                        color: 'var(--ok)',
                        border: '1px solid var(--ok-border)',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
