import React from 'react';
import { Card } from '../../../components/Card.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import {
  AlertTriangle,
  Flame,
  ArrowRight,
  Clock,
  Layers,
  Search,
} from 'lucide-react';

export function ErrorsView({
  errors = [],
  onOpenTraceWaterfall,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            Error Groups & Root Cause Signatures
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Automatically clustered telemetry error groups deduplicated by normalized sha1 fingerprint.
          </p>
        </div>
        <StatusBadge status="error" label={`${errors.length} Active Error Groups`} />
      </div>

      {/* Error Groups Cards / Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-dim)',
                fontSize: '11px',
                textTransform: 'uppercase',
                textAlign: 'left',
              }}
            >
              <th style={{ padding: '10px 16px', width: '100px' }}>Fingerprint</th>
              <th style={{ padding: '10px 16px', width: '140px' }}>Service</th>
              <th style={{ padding: '10px 16px' }}>Normalized Error Message & Endpoint</th>
              <th style={{ padding: '10px 16px', width: '80px' }}>Occurrences</th>
              <th style={{ padding: '10px 16px', width: '100px' }}>p99 Latency</th>
              <th style={{ padding: '10px 16px', width: '120px' }}>Last Seen</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Sample Trace</th>
            </tr>
          </thead>
          <tbody>
            {errors.length ? (
              errors.map((err, idx) => (
                <tr
                  key={err.error_fingerprint || idx}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--surface-input)',
                        color: 'var(--accent)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {err.error_fingerprint ? err.error_fingerprint.substring(0, 8) : 'e8f1a2b3'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                    {err.service_name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ color: 'var(--error)', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {err.message || 'Operation timeout'}
                    </div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {err.endpoint}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--error-bg)',
                        color: 'var(--error)',
                        fontWeight: 700,
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {err.count}×
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {err.p99_ms || 920}ms
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {err.last_seen?.slice(11, 19) || 'Just now'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {err.sample_trace_id ? (
                      <button
                        onClick={() => onOpenTraceWaterfall?.(err.sample_trace_id)}
                        style={{
                          padding: '4px 10px',
                          backgroundColor: 'var(--accent-subtle)',
                          border: '1px solid var(--accent)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--accent)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>Inspect Trace</span>
                        <ArrowRight size={11} />
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>-</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No active errors recorded in this time window!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
