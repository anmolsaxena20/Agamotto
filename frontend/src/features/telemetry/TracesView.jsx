import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Modal } from '../../components/Modal.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { formatLatency } from '../../utils/formatters.js';
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
  Sparkles,
} from 'lucide-react';
import { SmartSearchBar } from '../../components/SmartSearchBar.jsx';

export function TracesView({ initialTraceId, onOpenAiChat }) {
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

      {/* Natural Language AI Telemetry Search */}
      <SmartSearchBar
        domain="traces"
        onApplyFilter={(parsed) => {
          if (!parsed) {
            fetchTraces();
            return;
          }
          // Filter traces client-side if clauses present
          const clauses = parsed.clauses || [];
          if (clauses.length > 0) {
            setTraces((prev) =>
              prev.filter((t) => {
                for (const c of clauses) {
                  const field = (c.field || c.column || '').toLowerCase();
                  const val = String(c.value).toLowerCase();
                  if (field.includes('service') && !String(t.root_service || t.service || '').toLowerCase().includes(val)) {
                    return false;
                  }
                  if (field.includes('duration') && Number(t.duration_ms || t.durationMs || 0) < Number(val)) {
                    return false;
                  }
                }
                return true;
              })
            );
          }
        }}
      />

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
              {traces.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Searching traces...' : 'No distributed traces found for this workspace.'}
                  </td>
                </tr>
              ) : (
                traces.map((tr, idx) => {
                  const traceId = tr.trace_id || tr.traceId || `trace-${idx}`;
                  const rootSpan = tr.root_name || tr.rootSpan || 'Root';
                  const serviceName = tr.root_service || tr.service || 'unknown';
                  const isError = (tr.error_spans != null ? tr.error_spans > 0 : ((tr.statusCode || 200) >= 400 || tr.errorCount > 0));
                  const duration = tr.duration_ms != null ? Number(tr.duration_ms).toFixed(1) : (tr.durationMs || 0);
                  const spanCount = tr.span_count ?? tr.spanCount ?? 1;
                  const time = tr.trace_start_time || tr.start_time || tr.timestamp;

                  return (
                    <tr
                      key={traceId}
                      onClick={() => openTrace(traceId)}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                        {traceId}
                      </td>
                      <td style={{ padding: '14px', fontWeight: 500, color: 'var(--text)' }}>
                        {rootSpan}
                      </td>
                      <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface-input)', border: '1px solid var(--border)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {serviceName}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <StatusBadge
                          status={isError ? 'error' : 'ok'}
                          label={isError ? 'Error' : '200 OK'}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {spanCount}
                      </td>
                      <td style={{ padding: '14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: Number(duration) > 100 ? 'var(--warn)' : 'var(--text)' }}>
                        {formatLatency(duration)}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right', color: 'var(--text-dim)', fontSize: '12px' }}>
                        {time ? new Date(time).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
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

              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onOpenAiChat?.(
                    `Analyze distributed trace ${selectedTraceId}. Root service is ${
                      traceFlow?.rootService || 'unknown'
                    }, total duration is ${
                      traceFlow?.totalDurationMs || 'unknown'
                    }ms. Trace waterfall spans: ${
                      JSON.stringify(traceFlow?.spans?.slice(0, 5) || [])
                    }. Identify the exact bottleneck span and why it stalled.`
                  )
                }
                style={{ display: 'flex', alignItems: 'center', gap: '5px', borderColor: 'rgba(224, 176, 80, 0.4)' }}
              >
                <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                <span>Analyze with AI</span>
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
              {traceFlow?.root ? (
                <WaterfallTree
                  node={traceFlow.root}
                  totalDuration={traceFlow?.totalDurationMs || 1}
                  depth={0}
                />
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No hierarchical span tree recorded for trace {selectedTraceId}.
                </div>
              )}
            </div>
          )}

          {/* Flat Span Attributes Mode */}
          {activeViewMode === 'flat' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '440px', overflowY: 'auto' }}>
              {(traceDetail?.spans || []).length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No span attributes found for this trace.
                </div>
              ) : (
                (traceDetail?.spans || []).map((s) => (
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
                ))
              )}
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
