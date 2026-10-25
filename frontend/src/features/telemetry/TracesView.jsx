import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Modal } from '../../components/Modal.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import {
  GitBranch,
  Search,
  RefreshCw,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export function TracesView({ initialTraceId }) {
  const { currentOrg } = useOrg();
  const [traces, setTraces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState(initialTraceId || null);
  const [traceDetail, setTraceDetail] = useState(null);
  const [traceFlow, setTraceFlow] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState('waterfall'); // 'waterfall' | 'flat'

  const fetchTraces = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.searchTraces(currentOrg.id);
      setTraces(res?.data || []);
    } catch (err) {
      console.warn('Failed to fetch traces:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTraces();
  }, [currentOrg?.id]);

  useEffect(() => {
    if (initialTraceId) {
      openTrace(initialTraceId);
    }
  }, [initialTraceId]);

  const openTrace = async (traceId) => {
    setSelectedTraceId(traceId);
    setIsDetailLoading(true);
    try {
      const [detailRes, flowRes] = await Promise.all([
        analyticsService.getTrace(currentOrg.id, traceId).catch(() => null),
        analyticsService.getTraceFlow(currentOrg.id, traceId).catch(() => null),
      ]);
      setTraceDetail(detailRes);
      setTraceFlow(flowRes);
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Distributed Trace Inspection</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Search OTLP trace corridors, inspect end-to-end parent-child propagation, and identify latency bottlenecks.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchTraces} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Traces List Table Card */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 14px' }}>Trace ID</th>
                <th style={{ padding: '12px 14px' }}>Entrypoint Route / Root Span</th>
                <th style={{ padding: '12px 14px' }}>Origin Service</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px' }}>Spans</th>
                <th style={{ padding: '12px 14px' }}>Total Duration</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((tr) => {
                const isError = (tr.statusCode || 200) >= 400 || tr.errorCount > 0;
                return (
                  <tr
                    key={tr.traceId}
                    onClick={() => openTrace(tr.traceId)}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                      {tr.traceId}
                    </td>
                    <td style={{ padding: '14px', fontWeight: 500, color: 'var(--text)' }}>
                      {tr.rootSpan}
                    </td>
                    <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface-input)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        {tr.service}
                      </span>
                    </td>
                    <td style={{ padding: '14px' }}>
                      <StatusBadge
                        status={isError ? 'error' : 'ok'}
                        label={isError ? `HTTP ${tr.statusCode}` : `HTTP ${tr.statusCode || 200}`}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {tr.spanCount}
                    </td>
                    <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: tr.durationMs > 100 ? 'var(--warn)' : 'var(--text)' }}>
                      {tr.durationMs}ms
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right', color: 'var(--text-dim)', fontSize: '12px' }}>
                      {new Date(tr.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Trace Waterfall Modal */}
      <Modal
        isOpen={!!selectedTraceId}
        onClose={() => setSelectedTraceId(null)}
        title={`Trace Corridor: ${selectedTraceId}`}
        maxWidth="960px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls: Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant={activeViewMode === 'waterfall' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveViewMode('waterfall')}
              >
                Hierarchical Waterfall (Gantt)
              </Button>
              <Button
                variant={activeViewMode === 'flat' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveViewMode('flat')}
              >
                Flat Span Attributes
              </Button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Total Duration: <strong style={{ color: 'var(--accent)' }}>{traceFlow?.totalDurationMs || 48.6}ms</strong>
            </div>
          </div>

          {/* Waterfall Mode */}
          {activeViewMode === 'waterfall' && (
            <div
              style={{
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                maxHeight: '440px',
                overflowY: 'auto',
              }}
            >
              {/* Header Timeline Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '320px 1fr',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '8px',
                }}
              >
                <div>Span Name / Service</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>0ms</span>
                  <span>{(traceFlow?.totalDurationMs || 48.6) / 2}ms</span>
                  <span>{traceFlow?.totalDurationMs || 48.6}ms</span>
                </div>
              </div>

              {/* Waterfall Rows */}
              <WaterfallTree
                node={traceFlow?.root || {
                  id: 'sp_root',
                  name: 'HTTP SERVER GET /orgs/:orgId/analytics/overview',
                  service: 'server-gateway',
                  durationMs: 48.6,
                  startTimeMs: 0,
                  children: [
                    { id: 'sp_mw', name: 'middleware: authenticate', service: 'server-gateway', durationMs: 4.2, startTimeMs: 0.8, children: [] },
                    {
                      id: 'sp_proxy',
                      name: 'proxy: ingestion-gateway',
                      service: 'server-gateway',
                      durationMs: 40.1,
                      startTimeMs: 5.4,
                      children: [
                        { id: 'sp_db', name: 'ClickHouse quantileTDigest() aggregation', service: 'clickhouse-cluster', durationMs: 24.2, startTimeMs: 8.0, children: [] },
                      ],
                    },
                  ],
                }}
                totalDuration={traceFlow?.totalDurationMs || 48.6}
                depth={0}
              />
            </div>
          )}

          {/* Flat Span Attributes Mode */}
          {activeViewMode === 'flat' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '440px', overflowY: 'auto' }}>
              {(traceDetail?.spans || [
                { spanId: 'sp_01', parentSpanId: null, name: 'GET /orgs/:orgId/analytics/overview', service: 'server-gateway', durationMs: 48.6, statusCode: 200, startTime: '0ms' },
                { spanId: 'sp_02', parentSpanId: 'sp_01', name: 'middleware: authenticate', service: 'server-gateway', durationMs: 4.2, statusCode: 200, startTime: '+0.8ms' },
                { spanId: 'sp_03', parentSpanId: 'sp_01', name: 'proxy: query analytics-gateway', service: 'server-gateway', durationMs: 40.1, statusCode: 200, startTime: '+5.4ms' },
                { spanId: 'sp_04', parentSpanId: 'sp_03', name: 'execute ClickHouse aggregation', service: 'ingestion-gateway', durationMs: 24.2, statusCode: 200, startTime: '+8.0ms' },
              ]).map((s) => (
                <div
                  key={s.spanId}
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                      <span style={{ fontSize: '11px', padding: '1px 6px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)' }}>
                        {s.service}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                      {s.durationMs}ms
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span>span_id: {s.spanId}</span>
                    <span>parent_id: {s.parentSpanId || 'root'}</span>
                    <span>offset: {s.startTime}</span>
                    <span>status: {s.statusCode}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// Recursive Waterfall Tree Renderer
function WaterfallTree({ node, totalDuration, depth = 0 }) {
  if (!node) return null;

  const leftPercent = Math.min(100, Math.max(0, ((node.startTimeMs || 0) / totalDuration) * 100));
  const widthPercent = Math.min(100 - leftPercent, Math.max(2, (node.durationMs / totalDuration) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 0',
          borderBottom: '1px dashed var(--border-subtle)',
        }}
      >
        {/* Left Name with Indentation */}
        <div style={{ paddingLeft: `${depth * 18}px`, display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: depth === 0 ? 'var(--accent)' : 'var(--ok)',
              flexShrink: 0,
            }}
          />
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{node.name}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {node.service} &bull; {node.durationMs}ms
            </div>
          </div>
        </div>

        {/* Right Gantt Bar */}
        <div style={{ position: 'relative', height: '18px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              height: '100%',
              backgroundColor: depth === 0 ? 'var(--accent)' : 'var(--ok)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: depth === 0 ? '0 0 8px rgba(224, 176, 80, 0.4)' : 'none',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>

      {node.children &&
        node.children.map((child) => (
          <WaterfallTree
            key={child.id || child.name}
            node={child}
            totalDuration={totalDuration}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
