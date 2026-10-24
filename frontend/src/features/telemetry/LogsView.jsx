import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Terminal, Search, RefreshCw, Filter, ExternalLink } from 'lucide-react';

export function LogsView({ onSelectTrace }) {
  const { currentOrg } = useOrg();
  const [logs, setLogs] = useState([]);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getLogs(currentOrg.id, {
        severity: severityFilter === 'ALL' ? undefined : severityFilter,
        query: search || undefined,
      });
      setLogs(res?.data || []);
    } catch (err) {
      console.warn('Failed to load logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentOrg?.id, severityFilter]);

  const filtered = logs.filter((log) => {
    const matchSev = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchQuery = !search ||
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.service.toLowerCase().includes(search.toLowerCase()) ||
      (log.traceId && log.traceId.toLowerCase().includes(search.toLowerCase()));
    return matchSev && matchQuery;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Telemetry & Error Logs</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            High-throughput log records with ReDoS-safe regex matching and direct correlation to trace IDs.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchLogs} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 14px',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            flex: 1,
            minWidth: '280px',
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search log messages, services, or trace IDs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '13px',
              width: '100%',
            }}
          />
        </div>

        {/* Severity Chips */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {['ALL', 'INFO', 'WARN', 'ERROR'].map((sev) => {
            const isSelected = severityFilter === sev;
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--surface)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: '12px',
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

      {/* Terminal Log Console */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--surface-subtle)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          <Terminal size={15} style={{ color: 'var(--accent)' }} />
          <span>ClickHouse Partition: <code>agamotto_telemetry.telemetry_logs</code></span>
        </div>

        <div
          style={{
            backgroundColor: 'var(--surface-input)',
            padding: '16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '520px',
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '32px' }}>
              No log records match the selected filter.
            </div>
          ) : (
            filtered.map((log) => {
              const sevColor = log.severity === 'ERROR' ? 'var(--error)' : log.severity === 'WARN' ? 'var(--warn)' : 'var(--ok)';
              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: `3px solid ${sevColor}`,
                    backgroundColor: 'rgba(21, 26, 35, 0.6)',
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontSize: '11px' }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>

                  <span
                    style={{
                      color: sevColor,
                      fontWeight: 700,
                      flexShrink: 0,
                      width: '54px',
                    }}
                  >
                    [{log.severity}]
                  </span>

                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-sm)',
                      flexShrink: 0,
                      fontSize: '11px',
                    }}
                  >
                    {log.service}
                  </span>

                  <span style={{ color: 'var(--text)', flex: 1, wordBreak: 'break-word', lineHeight: '1.5' }}>
                    {log.message}
                  </span>

                  {log.traceId && (
                    <button
                      onClick={() => onSelectTrace?.(log.traceId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        flexShrink: 0,
                      }}
                      title="Inspect this trace waterfall"
                    >
                      <span>{log.traceId.slice(0, 10)}...</span>
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
