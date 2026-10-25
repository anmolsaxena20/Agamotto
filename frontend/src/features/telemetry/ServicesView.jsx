import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Modal } from '../../components/Modal.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { formatLatency, formatPercent } from '../../utils/formatters.js';
import {
  Server,
  Activity,
  AlertTriangle,
  Clock,
  Layers,
  Terminal,
  Network,
  GitBranch,
  RefreshCw,
  Search,
} from 'lucide-react';

export function ServicesView({ initialService, onSelectTrace }) {
  const { currentOrg } = useOrg();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected service for deep scoping modal
  const [activeService, setActiveService] = useState(initialService || null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'endpoints' | 'traces' | 'logs' | 'errors'
  const [serviceEndpoints, setServiceEndpoints] = useState([]);
  const [serviceTraces, setServiceTraces] = useState([]);
  const [serviceLogs, setServiceLogs] = useState([]);
  const [serviceErrors, setServiceErrors] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchServices = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getServices(currentOrg.id);
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : (res?.services || []));
      setServices(list);
    } catch (err) {
      console.warn('Failed to fetch services:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [currentOrg?.id]);

  useEffect(() => {
    if (initialService) {
      openServiceDeepDive(initialService);
    }
  }, [initialService]);

  // Deep dive into service
  const openServiceDeepDive = async (serviceName) => {
    setActiveService(serviceName);
    setActiveTab('overview');
    setModalLoading(true);
    try {
      const [endpointsRes, tracesRes, logsRes, errorsRes] = await Promise.all([
        analyticsService.getServiceEndpoints(currentOrg.id, serviceName).catch(() => ({ data: [] })),
        analyticsService.getServiceTraces(currentOrg.id, serviceName).catch(() => ({ data: [] })),
        analyticsService.getServiceLogs(currentOrg.id, serviceName).catch(() => ({ data: [] })),
        analyticsService.getServiceErrors(currentOrg.id, serviceName).catch(() => ({ data: [] })),
      ]);
      setServiceEndpoints(Array.isArray(endpointsRes?.data) ? endpointsRes.data : []);
      setServiceTraces(Array.isArray(tracesRes?.data) ? tracesRes.data : []);
      setServiceLogs(Array.isArray(logsRes?.data) ? logsRes.data : []);
      setServiceErrors(Array.isArray(errorsRes?.data) ? errorsRes.data : []);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredServices = services.filter((s) => {
    const name = (s.service_name || s.name || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Microservices Fleet & Health</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Click any microservice to deep-scope into endpoint breakdown, trace waterfall, and container logs.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchServices} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Search Input */}
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
          placeholder="Filter microservices by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Services Grid */}
      {filteredServices.length === 0 ? (
        <Card style={{ padding: '36px', textAlign: 'center' }}>
          <Server size={32} style={{ color: 'var(--text-dim)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            No Microservices Found
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
            {isLoading ? 'Loading active microservices...' : 'No telemetry data has been ingested for this workspace yet.'}
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredServices.map((svc, idx) => {
            const svcName = svc.service_name || svc.name || `service-${idx}`;
            const spans = svc.spans ?? svc.total_spans ?? svc.requests ?? 0;
            const errRateFormatted = formatPercent(svc.error_rate != null ? svc.error_rate : svc.errorRate || 0);
            const p99 = svc.p99_ms ?? svc.p99 ?? 0;
            const isNominal = parseFloat(errRateFormatted) <= 1;

            return (
              <Card
                key={svcName}
                hoverable
                onClick={() => openServiceDeepDive(svcName)}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius)',
                        backgroundColor: 'var(--surface-input)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Server size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{svcName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {svc.instances || 1} instance{(svc.instances || 1) > 1 ? 's' : ''} active
                      </div>
                    </div>
                  </div>

                  <StatusBadge
                    status={isNominal ? 'ok' : 'warn'}
                    label={isNominal ? 'Nominal' : 'Degraded'}
                  />
                </div>

                {/* Metrics */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'var(--surface-input)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Volume</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {Number(spans).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Errors</div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: parseFloat(errRateFormatted) > 1 ? 'var(--warn)' : 'var(--ok)',
                      }}
                    >
                      {errRateFormatted}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>p99 Tail</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      {formatLatency(p99)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                  Deep Scope: Endpoints &bull; Traces &bull; Logs &bull; Errors &rarr;
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Service Deep Scope Modal */}
      <Modal
        isOpen={!!activeService}
        onClose={() => setActiveService(null)}
        title={`Microservice Inspection: ${activeService}`}
        maxWidth="840px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sub-navigation tabs inside modal */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'endpoints', label: 'Endpoints', icon: Network },
              { id: 'traces', label: 'Traces', icon: GitBranch },
              { id: 'logs', label: 'Logs', icon: Terminal },
              { id: 'errors', label: 'Errors', icon: AlertTriangle },
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius)',
                    backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                    color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: isSelected ? 600 : 500,
                  }}
                >
                  <TabIcon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Modal Tab Content */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'var(--surface-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status & Readiness</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ok)', marginTop: '4px' }}>Healthy (200 OK)</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--surface-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Instrumentation Mode</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent)', marginTop: '4px' }}>OpenTelemetry SDK</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--surface-input)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Columnar Table Partition</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', marginTop: '4px' }}>trace_spans</div>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Microservice <strong>{activeService}</strong> has emitted telemetry spans actively over the current window.
                All span batches are processed with buffered memory queues to protect ClickHouse ingestion performance.
              </div>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px' }}>HTTP Endpoint</th>
                    <th style={{ padding: '8px 10px' }}>Total Invocations</th>
                    <th style={{ padding: '8px 10px' }}>p50</th>
                    <th style={{ padding: '8px 10px' }}>p99</th>
                    <th style={{ padding: '8px 10px' }}>Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceEndpoints.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No endpoint data recorded for {activeService}
                      </td>
                    </tr>
                  ) : (
                    serviceEndpoints.map((ep, i) => {
                      const path = ep.endpoint || ep.path || ep.name || 'UNKNOWN';
                      const count = ep.total_calls ?? ep.count ?? 0;
                      const p50 = ep.p50_ms ?? ep.p50 ?? 0;
                      const p99 = ep.p99_ms ?? ep.p99 ?? 0;
                      const errRate = formatPercent(ep.error_rate != null ? ep.error_rate : ep.errorRate || 0);

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{path}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)' }}>{Number(count).toLocaleString()}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)' }}>{formatLatency(p50)}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{formatLatency(p99)}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: parseFloat(errRate) > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                            {errRate}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'traces' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Click any trace to open the hierarchical waterfall Gantt chart:
              </div>
              {serviceTraces.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No traces recorded for {activeService}
                </div>
              ) : (
                serviceTraces.map((tr, i) => {
                  const traceId = tr.trace_id || tr.traceId;
                  const rootSpan = tr.name || tr.root_name || tr.rootSpan || 'Trace span';
                  const durationMs = tr.duration_ms ?? tr.durationMs ?? 0;
                  const spanCount = tr.span_count ?? tr.spanCount ?? 1;

                  return (
                    <div
                      key={traceId || i}
                      onClick={() => {
                        setActiveService(null);
                        onSelectTrace?.(traceId);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: 'var(--surface-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text)' }}>
                          {rootSpan}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {traceId}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                          {formatLatency(durationMs)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {spanCount} spans
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div
              style={{
                backgroundColor: 'var(--surface-input)',
                padding: '12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {serviceLogs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                  No logs available for {activeService}
                </div>
              ) : (
                serviceLogs.map((log, i) => {
                  const time = log.time || log.timestamp || 'N/A';
                  const sev = log.severity_text || log.severity || 'INFO';
                  const msg = log.body || log.message || '';

                  return (
                    <div key={i} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--text-dim)' }}>[{time}]</span>
                      <span style={{ color: sev === 'WARN' ? 'var(--warn)' : sev === 'ERROR' ? 'var(--error)' : 'var(--ok)' }}>
                        [{sev}]
                      </span>
                      <span style={{ color: 'var(--text)' }}>{msg}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'errors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {serviceErrors.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No error spans detected for {activeService}. Operating normally.
                </div>
              ) : (
                serviceErrors.map((err, i) => {
                  const errType = err.endpoint || err.errorType || 'Service Error';
                  const count = err.errors ?? err.count ?? 1;
                  const p99 = err.p99_ms ?? err.p99 ?? 0;

                  return (
                    <div
                      key={i}
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--error-bg)',
                        border: '1px solid var(--error-border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--error)', fontSize: '13px' }}>
                        {errType} ({count} occurrences)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '4px' }}>
                        p99 tail duration: {formatLatency(p99)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
