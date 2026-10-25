import React, { useState } from 'react';
import { Card } from '../../../components/Card.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import {
  Network,
  ArrowRight,
  Server,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Layers,
} from 'lucide-react';

export function TopologyView({
  topology = {},
  onSelectService,
  onNavigateToTraces,
}) {
  const edges = topology.data?.edges || [
    { source: 'gateway-api', target: 'server', calls: 3450, error_count: 14, p50_ms: 18.2, p99_ms: 78.4 },
    { source: 'server', target: 'email-service', calls: 890, error_count: 2, p50_ms: 45.1, p99_ms: 142.0 },
    { source: 'server', target: 'ingestion-gateway', calls: 5200, error_count: 0, p50_ms: 6.4, p99_ms: 22.8 },
    { source: 'gateway-api', target: 'order-service', calls: 2150, error_count: 28, p50_ms: 62.0, p99_ms: 310.5 },
    { source: 'order-service', target: 'payment-service', calls: 1840, error_count: 42, p50_ms: 88.3, p99_ms: 420.1 },
    { source: 'order-service', target: 'inventory-service', calls: 2010, error_count: 5, p50_ms: 24.6, p99_ms: 85.0 },
  ];

  const services = topology.data?.services || [
    { name: 'gateway-api', status: 'ok', p99_ms: 78.4 },
    { name: 'server', status: 'ok', p99_ms: 120.0 },
    { name: 'order-service', status: 'ok', p99_ms: 310.5 },
    { name: 'payment-service', status: 'warn', p99_ms: 420.1 },
    { name: 'inventory-service', status: 'ok', p99_ms: 85.0 },
    { name: 'email-service', status: 'ok', p99_ms: 142.0 },
    { name: 'ingestion-gateway', status: 'ok', p99_ms: 22.8 },
  ];

  const [selectedEdge, setSelectedEdge] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            Service Dependency Graph
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Distributed topology inferred from parent-child OpenTelemetry span relationships.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <StatusBadge status="ok" label="7 Node Graph" size="sm" />
          <StatusBadge status="accent" label="Inferred from Spans" size="sm" />
        </div>
      </div>

      {/* Visual Service Nodes Layout */}
      <Card style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          {services.map((svc) => {
            const isWarn = svc.status === 'warn';
            return (
              <div
                key={svc.name}
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--surface-input)',
                  border: `1px solid ${isWarn ? 'var(--warn-border)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: isWarn ? '0 0 12px rgba(229, 166, 61, 0.1)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={16} style={{ color: isWarn ? 'var(--warn)' : 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {svc.name}
                    </span>
                  </div>
                  <StatusBadge status={svc.status} label={svc.status.toUpperCase()} size="sm" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  <span>Tail Latency:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: isWarn ? 'var(--warn)' : 'var(--text)' }}>
                    {svc.p99_ms}ms
                  </span>
                </div>

                <button
                  onClick={() => {
                    onSelectService?.(svc.name);
                    onNavigateToTraces?.();
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--accent)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Filter Service Traces</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Directed Dependency Edge Table */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
            Inferred Dependency Edges (Caller → Callee)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Caller (Source)</th>
                <th style={{ padding: '8px 12px', width: '30px' }}></th>
                <th style={{ padding: '8px 12px' }}>Callee (Target)</th>
                <th style={{ padding: '8px 12px' }}>Total Calls</th>
                <th style={{ padding: '8px 12px' }}>Error Count</th>
                <th style={{ padding: '8px 12px' }}>p50 (ms)</th>
                <th style={{ padding: '8px 12px' }}>p99 (ms)</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((edge, idx) => (
                <tr
                  key={idx}
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                    {edge.source}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--accent)' }}>
                    <ArrowRight size={14} />
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                    {edge.target}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                    {Number(edge.calls).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: edge.error_count > 0 ? 'var(--error)' : 'var(--ok)' }}>
                    {edge.error_count}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                    {edge.p50_ms}ms
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: edge.p99_ms > 300 ? 'var(--warn)' : 'var(--text)' }}>
                    {edge.p99_ms}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
