import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Terminal, Search, RefreshCw, Filter, ExternalLink } from 'lucide-react';
import { SmartSearchBar } from '../../components/SmartSearchBar.jsx';

export function LogsView({ onSelectTrace, onSelectService }) {
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
        search: search || undefined,
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
    const sev = log.severity_text || log.severity || 'INFO';
    const msg = log.body || log.message || '';
    const svc = log.service_name || log.service || '';
    const trId = log.trace_id || log.traceId || '';

    const matchSev = severityFilter === 'ALL' || sev.toUpperCase() === severityFilter;
    const matchQuery = !search ||
      msg.toLowerCase().includes(search.toLowerCase()) ||
      svc.toLowerCase().includes(search.toLowerCase()) ||
      trId.toLowerCase().includes(search.toLowerCase());
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

      {/* Natural Language AI Telemetry Search */}
      <SmartSearchBar
        domain="logs"
        placeholder="Query logs with AI... (e.g. 'find all errors in ingestion-gateway' or '500 status code')"
        onApplyFilter={(parsed) => {
          if (!parsed) {
            setSearch('');
            return;
          }
          if (parsed.clauses && parsed.clauses.length > 0) {
            const clauseVals = parsed.clauses.map((c) => c.value).join(' ');
            setSearch(clauseVals);
          } else if (parsed.query) {
            setSearch(parsed.query);
          }
        }}
      />

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
                  padding: '6px 12px',
                  borderRadius: 'var(--radius)',
                  backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--surface)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {sev}
              </button>
            );
          })}
        </div>
      </div>

      {/* Log Output Console */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {isLoading ? 'Streaming log records...' : 'No telemetry log records found matching the active criteria.'}
            </div>
          ) : (
            filtered.map((log, idx) => {
              const time = log.time || log.timestamp || 'N/A';
              const sev = (log.severity_text || log.severity || 'INFO').toUpperCase();
              const msg = log.body || log.message || '';
              const svc = log.service_name || log.service || 'app';
              const trId = log.trace_id || log.traceId;

              const sevColor = sev === 'ERROR' ? 'var(--error)' : sev === 'WARN' ? 'var(--warn)' : 'var(--ok)';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '12px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: idx % 2 === 0 ? 'var(--surface-input)' : 'transparent',
                    borderLeft: `3px solid ${sevColor}`,
                  }}
                >
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {time}
                  </span>
                  <span style={{ color: sevColor, fontWeight: 700, width: '48px', flexShrink: 0 }}>
                    {sev}
                  </span>
                  <button
                    onClick={() => onSelectService?.(svc)}
                    title={`Click to inspect microservice: ${svc}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      flexShrink: 0,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: onSelectService ? 'pointer' : 'default',
                      padding: 0,
                      textDecoration: onSelectService ? 'underline' : 'none',
                    }}
                  >
                    [{svc}]
                  </button>
                  <span style={{ color: 'var(--text)', flex: 1, wordBreak: 'break-word' }}>
                    {msg}
                  </span>
                  {trId && (
                    <button
                      onClick={() => onSelectTrace?.(trId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                      }}
                    >
                      <span>trace:{trId.substring(0, 8)}...</span>
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
