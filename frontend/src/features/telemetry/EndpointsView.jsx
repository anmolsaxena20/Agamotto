import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Network, RefreshCw, Search, ChevronRight } from 'lucide-react';

export function EndpointsView({ onSelectEndpoint }) {
  const { currentOrg } = useOrg();
  const [endpoints, setEndpoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchEndpoints = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getEndpoints(currentOrg.id);
      setEndpoints(res?.data || []);
    } catch (err) {
      console.warn('Failed to fetch endpoints:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, [currentOrg?.id]);

  const filtered = endpoints.filter((e) => {
    const route = (e.endpoint || e.path || '').toLowerCase();
    const service = (e.service_name || e.service || '').toLowerCase();
    const q = search.toLowerCase();
    return route.includes(q) || service.includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Route Endpoints Performance</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Paginated route-level breakdown of latency percentiles (p50, p95, p99) and error distributions.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchEndpoints} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 14px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          maxWidth: '360px',
        }}
      >
        <Search size={16} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Filter route or service..."
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

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 14px' }}>HTTP Method & Route</th>
                <th style={{ padding: '12px 14px' }}>Owning Microservice</th>
                <th style={{ padding: '12px 14px' }}>Total Invocations</th>
                <th style={{ padding: '12px 14px' }}>p50</th>
                <th style={{ padding: '12px 14px' }}>p95</th>
                <th style={{ padding: '12px 14px' }}>p99 Tail</th>
                <th style={{ padding: '12px 14px' }}>Error Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Loading route endpoints...' : 'No endpoint telemetry recorded for this organization.'}
                  </td>
                </tr>
              ) : (
                filtered.map((ep, idx) => {
                  const rawRoute = ep.endpoint || ep.path || 'UNKNOWN';
                  const serviceName = ep.service_name || ep.service || 'unknown-service';
                  const invocations = ep.total_calls ?? ep.count ?? 0;
                  const p50 = ep.p50_ms ?? ep.p50 ?? 0;
                  const p95 = ep.p95_ms ?? ep.p95 ?? 0;
                  const p99 = ep.p99_ms ?? ep.p99 ?? 0;
                  const errorRate = Number(ep.error_rate != null ? (ep.error_rate * 100).toFixed(2) : ep.errorRate || 0);

                  // Extract method if formatted like "GET /api/v1/users"
                  const parts = rawRoute.trim().split(/\s+/);
                  let method = ep.method;
                  let displayRoute = rawRoute;
                  if (parts.length >= 2 && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(parts[0].toUpperCase())) {
                    method = parts[0].toUpperCase();
                    displayRoute = parts.slice(1).join(' ');
                  } else if (!method) {
                    method = 'HTTP';
                  }

                  const methodColor = method === 'POST' ? 'var(--ok)' : method === 'GET' ? 'var(--accent)' : 'var(--warn)';

                  return (
                    <tr
                      key={idx}
                      onClick={() => onSelectEndpoint?.(displayRoute)}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: methodColor, fontWeight: 700, marginRight: '8px' }}>
                          {method}
                        </span>
                        <span style={{ color: 'var(--text)' }}>
                          {displayRoute}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface-input)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {serviceName}
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)' }}>
                        {Number(invocations).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--ok)' }}>
                        {p50}ms
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                        {p95}ms
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--warn)', fontWeight: 600 }}>
                        {p99}ms
                      </td>
                      <td style={{ padding: '14px' }}>
                        <StatusBadge
                          status={errorRate > 0.5 ? 'warn' : 'ok'}
                          label={`${errorRate}%`}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
