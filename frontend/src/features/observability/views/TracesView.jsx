import React, { useState } from 'react';
import { Card } from '../../../components/Card.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import {
  Layers,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Copy,
} from 'lucide-react';

export function TracesView({
  traces = [],
  services = [],
  selectedService,
  onSelectService,
  onOpenTraceWaterfall,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ok' | 'error'
  const [durationFilter, setDurationFilter] = useState('all'); // 'all' | '100' | '300' | '500'

  // Apply local filtering on top of server data
  const filteredTraces = traces.filter((t) => {
    if (selectedService && selectedService !== 'all' && t.root_service.toLowerCase() !== selectedService.toLowerCase()) {
      return false;
    }
    if (statusFilter !== 'all' && t.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    if (durationFilter !== 'all' && t.duration_ms < Number(durationFilter)) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        t.trace_id.toLowerCase().includes(q) ||
        t.root_name.toLowerCase().includes(q) ||
        t.root_service.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const maxDuration = Math.max(...traces.map((t) => t.duration_ms), 500);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            Distributed Traces
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            End-to-end request journeys across microservices with latency analysis and error diagnostics.
          </p>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Showing {filteredTraces.length} of {traces.length} traces
        </div>
      </div>

      {/* Filter Bar */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Search Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              gap: '8px',
              flex: '1',
              minWidth: '260px',
            }}
          >
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by Trace ID, operation (e.g. POST /checkout), or service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '13px',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Status Tabs */}
            <div
              style={{
                display: 'flex',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px',
              }}
            >
              {[
                { label: 'All', value: 'all' },
                { label: 'Success', value: 'ok' },
                { label: 'Errors', value: 'error' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: statusFilter === tab.value ? 'var(--surface-hover)' : 'transparent',
                    color: statusFilter === tab.value ? 'var(--accent)' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: statusFilter === tab.value ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Min Duration Filter */}
            <select
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all" style={{ backgroundColor: 'var(--surface)' }}>Any Duration</option>
              <option value="100" style={{ backgroundColor: 'var(--surface)' }}>&gt; 100ms</option>
              <option value="300" style={{ backgroundColor: 'var(--surface)' }}>&gt; 300ms (Slow)</option>
              <option value="500" style={{ backgroundColor: 'var(--surface)' }}>&gt; 500ms (Very Slow)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Traces Table */}
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
              <th style={{ padding: '10px 16px', width: '90px' }}>Status</th>
              <th style={{ padding: '10px 16px' }}>Root Operation</th>
              <th style={{ padding: '10px 16px' }}>Root Service</th>
              <th style={{ padding: '10px 16px' }}>Trace ID</th>
              <th style={{ padding: '10px 16px', width: '220px' }}>Duration</th>
              <th style={{ padding: '10px 16px', width: '90px' }}>Spans</th>
              <th style={{ padding: '10px 16px' }}>Timestamp</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Waterfall</th>
            </tr>
          </thead>
          <tbody>
            {filteredTraces.length ? (
              filteredTraces.map((trace) => {
                const isError = trace.status === 'error';
                const durationPct = Math.min(100, Math.max(5, (trace.duration_ms / maxDuration) * 100));

                return (
                  <tr
                    key={trace.trace_id}
                    onClick={() => onOpenTraceWaterfall?.(trace.trace_id)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color 0.12s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge
                        status={isError ? 'error' : 'ok'}
                        label={isError ? 'ERROR' : 'OK'}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{trace.root_name}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--surface-input)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {trace.root_service}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {trace.trace_id.substring(0, 12)}...
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            backgroundColor: 'var(--surface-input)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${durationPct}%`,
                              height: '100%',
                              backgroundColor: isError
                                ? 'var(--error)'
                                : trace.duration_ms > 300
                                ? 'var(--warn)'
                                : 'var(--accent)',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            color: isError ? 'var(--error)' : 'var(--text)',
                            width: '55px',
                            textAlign: 'right',
                            fontWeight: 600,
                          }}
                        >
                          {trace.duration_ms}ms
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {trace.span_count}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {trace.start_time?.slice(11, 19)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTraceWaterfall?.(trace.trace_id);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          backgroundColor: 'var(--accent-subtle)',
                          border: '1px solid var(--accent)',
                          color: 'var(--accent)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <span>Waterfall</span>
                        <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No traces found matching your filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
