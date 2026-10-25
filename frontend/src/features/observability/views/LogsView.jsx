import React, { useState } from 'react';
import { Card } from '../../../components/Card.jsx';
import {
  Terminal,
  Search,
  Filter,
  Layers,
  Code,
  X,
  Copy,
  ArrowRight,
} from 'lucide-react';

const SEVERITIES = ['ALL', 'INFO', 'WARN', 'ERROR', 'FATAL', 'DEBUG'];

export function LogsView({
  logs = [],
  services = [],
  selectedService,
  onSelectService,
  onOpenTraceWaterfall,
}) {
  const [search, setSearch] = useState('');
  const [regex, setRegex] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState(null);

  const filteredLogs = logs.filter((l) => {
    if (selectedService && selectedService !== 'all' && l.service_name.toLowerCase() !== selectedService.toLowerCase()) {
      return false;
    }
    if (selectedSeverity !== 'ALL' && l.severity_text.toUpperCase() !== selectedSeverity) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const inBody = l.body.toLowerCase().includes(q);
      const inSvc = l.service_name.toLowerCase().includes(q);
      const inTrace = l.trace_id?.toLowerCase().includes(q);
      if (!inBody && !inSvc && !inTrace) return false;
    }
    if (regex) {
      try {
        const reg = new RegExp(regex, 'i');
        if (!reg.test(l.body)) return false;
      } catch {
        // invalid regex, ignore
      }
    }
    return true;
  });

  const getSeverityStyle = (sev) => {
    switch (sev?.toUpperCase()) {
      case 'ERROR':
      case 'FATAL':
        return { color: 'var(--error)', bg: 'var(--error-bg)', border: 'var(--error-border)' };
      case 'WARN':
        return { color: 'var(--warn)', bg: 'var(--warn-bg)', border: 'var(--warn-border)' };
      case 'INFO':
        return { color: 'var(--ok)', bg: 'var(--ok-bg)', border: 'var(--ok-border)' };
      default:
        return { color: 'var(--text-muted)', bg: 'var(--surface-input)', border: 'var(--border)' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            Telemetry Logs Stream
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Correlated OpenTelemetry logs with direct distributed trace and span association.
          </p>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Showing {filteredLogs.length} of {logs.length} log records
        </div>
      </div>

      {/* Filter Bar */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
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
                minWidth: '240px',
              }}
            >
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search log message text or trace ID..."
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

            {/* Regex Pattern Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                gap: '8px',
                width: '240px',
              }}
            >
              <Code size={14} style={{ color: 'var(--accent)' }} />
              <input
                type="text"
                placeholder="Regex filter (e.g. timeout|failed)..."
                value={regex}
                onChange={(e) => setRegex(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  width: '100%',
                }}
              />
            </div>

            {/* Service selector */}
            <select
              value={selectedService}
              onChange={(e) => onSelectService?.(e.target.value)}
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
          </div>

          {/* Severity Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Severity:
            </span>
            {SEVERITIES.map((sev) => {
              const isActive = selectedSeverity === sev;
              const style = getSeverityStyle(sev === 'ALL' ? 'INFO' : sev);
              return (
                <button
                  key={sev}
                  onClick={() => setSelectedSeverity(sev)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: isActive ? (sev === 'ALL' ? 'var(--accent-subtle)' : style.bg) : 'transparent',
                    border: `1px solid ${isActive ? (sev === 'ALL' ? 'var(--accent)' : style.border) : 'var(--border)'}`,
                    color: isActive ? (sev === 'ALL' ? 'var(--accent)' : style.color) : 'var(--text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {sev}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Log Stream Terminal Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-dim)',
                fontSize: '11px',
                textTransform: 'uppercase',
                textAlign: 'left',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <th style={{ padding: '8px 14px', width: '90px' }}>Severity</th>
              <th style={{ padding: '8px 14px', width: '120px' }}>Timestamp</th>
              <th style={{ padding: '8px 14px', width: '150px' }}>Service</th>
              <th style={{ padding: '8px 14px' }}>Log Body</th>
              <th style={{ padding: '8px 14px', width: '130px' }}>Trace ID</th>
              <th style={{ padding: '8px 14px', width: '100px' }}>Span ID</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length ? (
              filteredLogs.map((log, idx) => {
                const sevStyle = getSeverityStyle(log.severity_text);
                return (
                  <tr
                    key={log.log_id || idx}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '8px 14px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: sevStyle.bg,
                          color: sevStyle.color,
                          border: `1px solid ${sevStyle.border}`,
                        }}
                      >
                        {log.severity_text}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-dim)' }}>
                      {log.time?.slice(11, 23)}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>
                      {log.service_name}
                    </td>
                    <td
                      style={{
                        padding: '8px 14px',
                        color: log.severity_text === 'ERROR' ? 'var(--error)' : 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '400px',
                      }}
                      title={log.body}
                    >
                      {log.body}
                    </td>
                    <td style={{ padding: '8px 14px' }}>
                      {log.trace_id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTraceWaterfall?.(log.trace_id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                          title="Open Trace Waterfall"
                        >
                          <span>{log.trace_id.substring(0, 8)}...</span>
                          <ArrowRight size={10} />
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>
                      {log.span_id ? log.span_id.substring(0, 8) : '-'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No logs found matching your query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={16} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Log Record Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>Message Body</div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '4px', lineHeight: 1.5 }}>
                  {selectedLog.body}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>Service</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: '2px' }}>
                    {selectedLog.service_name}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>Severity</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>
                    {selectedLog.severity_text} (Level {selectedLog.severity_number})
                  </div>
                </div>
              </div>

              {selectedLog.trace_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-input)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>CORRELATED TRACE ID</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>
                      {selectedLog.trace_id}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onOpenTraceWaterfall?.(selectedLog.trace_id);
                      setSelectedLog(null);
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'var(--accent-subtle)',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Open Waterfall
                  </button>
                </div>
              )}

              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Attributes JSON
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    overflowX: 'auto',
                  }}
                >
                  {JSON.stringify(selectedLog.attributes || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
