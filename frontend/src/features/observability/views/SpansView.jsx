import React, { useState } from 'react';
import { Card } from '../../../components/Card.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import {
  GitBranch,
  Search,
  Clock,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';

export function SpansView({
  spans = [],
  services = [],
  onOpenTraceWaterfall,
}) {
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all'); // 'all' | 'SERVER' | 'CLIENT' | 'INTERNAL'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ok' | 'error'

  const filteredSpans = spans.filter((s) => {
    if (serviceFilter !== 'all' && s.service_name.toLowerCase() !== serviceFilter.toLowerCase()) {
      return false;
    }
    if (kindFilter !== 'all' && s.kind_name?.toLowerCase() !== kindFilter.toLowerCase()) {
      return false;
    }
    if (statusFilter !== 'all') {
      const isErr = s.status_code === 2;
      if (statusFilter === 'error' && !isErr) return false;
      if (statusFilter === 'ok' && isErr) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        s.span_id.toLowerCase().includes(q) ||
        s.trace_id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.service_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            Spans Explorer
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Inspect atomic OpenTelemetry span operations across microservices, databases, and message brokers.
          </p>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Showing {filteredSpans.length} of {spans.length} spans
        </div>
      </div>

      {/* Filter Bar */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Search */}
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
              minWidth: '240px',
            }}
          >
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search span ID, trace ID, or operation name..."
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

          {/* Service Dropdown */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all" style={{ backgroundColor: 'var(--surface)' }}>All Services</option>
            {services.map((svc) => (
              <option key={svc} value={svc} style={{ backgroundColor: 'var(--surface)' }}>{svc}</option>
            ))}
          </select>

          {/* Kind Dropdown */}
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all" style={{ backgroundColor: 'var(--surface)' }}>All Kinds</option>
            <option value="server" style={{ backgroundColor: 'var(--surface)' }}>SERVER</option>
            <option value="client" style={{ backgroundColor: 'var(--surface)' }}>CLIENT</option>
            <option value="internal" style={{ backgroundColor: 'var(--surface)' }}>INTERNAL</option>
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all" style={{ backgroundColor: 'var(--surface)' }}>All Status</option>
            <option value="ok" style={{ backgroundColor: 'var(--surface)' }}>OK Only</option>
            <option value="error" style={{ backgroundColor: 'var(--surface)' }}>ERROR Only</option>
          </select>
        </div>
      </Card>

      {/* Spans Table */}
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
              <th style={{ padding: '10px 16px', width: '85px' }}>Status</th>
              <th style={{ padding: '10px 16px' }}>Span ID</th>
              <th style={{ padding: '10px 16px' }}>Service</th>
              <th style={{ padding: '10px 16px' }}>Operation Name</th>
              <th style={{ padding: '10px 16px', width: '90px' }}>Kind</th>
              <th style={{ padding: '10px 16px', width: '100px' }}>Duration</th>
              <th style={{ padding: '10px 16px' }}>Parent Trace</th>
              <th style={{ padding: '10px 16px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredSpans.length ? (
              filteredSpans.map((span) => {
                const isError = span.status_code === 2;
                return (
                  <tr
                    key={span.span_id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={isError ? 'error' : 'ok'} label={isError ? 'ERROR' : 'OK'} size="sm" />
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent)' }}>
                      {span.span_id}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                      {span.service_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {span.name}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--surface-input)',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {span.kind_name || 'INTERNAL'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                        color: isError ? 'var(--error)' : span.duration_ms > 300 ? 'var(--warn)' : 'var(--text)',
                      }}
                    >
                      {span.duration_ms}ms
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)' }}>
                      {span.trace_id.substring(0, 10)}...
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => onOpenTraceWaterfall?.(span.trace_id)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'var(--surface-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--accent)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>Waterfall</span>
                        <ArrowRight size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No spans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
