import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Copy,
  Terminal,
  Activity,
  Flame,
  Info,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { observabilityApi } from '../../../services/observabilityApi.js';
import { StatusBadge } from '../../../components/StatusBadge.jsx';

const SERVICE_COLORS = {
  server: '#3FB68B',
  'email-service': '#3B82F6',
  'ingestion-gateway': '#8B5CF6',
  'gateway-api': '#E0B050',
  'order-service': '#EC4899',
  'payment-service': '#EF4444',
  'inventory-service': '#10B981',
};

function getServiceColor(name) {
  return SERVICE_COLORS[name] || '#A855F7';
}

export function TraceWaterfallModal({ traceId, onClose, onNavigateToLogs }) {
  if (!traceId) return null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flowData, setFlowData] = useState([]);
  const [flatSpans, setFlatSpans] = useState([]);
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [correlatedLogs, setCorrelatedLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [criticalSpanIds, setCriticalSpanIds] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'logs' | 'attributes'

  useEffect(() => {
    let isMounted = true;
    async function loadTrace() {
      setLoading(true);
      setError(null);
      try {
        const [flowRes, spansRes] = await Promise.all([
          observabilityApi.getTraceFlow(traceId),
          observabilityApi.getTraceById(traceId),
        ]);

        if (isMounted) {
          const roots = flowRes.data || [];
          const spans = spansRes.data || [];
          setFlowData(roots);
          setFlatSpans(spans);

          // Calculate Critical Path (longest sequence of spans)
          const critSet = new Set();
          function findCritical(nodes) {
            if (!nodes || !nodes.length) return;
            // Pick child that finishes latest
            const longest = nodes.reduce((max, n) => (n.duration_ms > (max?.duration_ms || 0) ? n : max), nodes[0]);
            if (longest) {
              critSet.add(longest.span_id);
              if (longest.children && longest.children.length) {
                findCritical(longest.children);
              }
            }
          }
          findCritical(roots);
          setCriticalSpanIds(critSet);

          // Select root span by default
          if (spans.length) {
            const root = spans.find((s) => !s.parent_span_id) || spans[0];
            setSelectedSpan(root);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load trace waterfall');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTrace();
    return () => { isMounted = false; };
  }, [traceId]);

  // Load correlated logs when a span is selected
  useEffect(() => {
    if (!selectedSpan) return;
    let isMounted = true;
    async function loadSpanLogs() {
      setLogsLoading(true);
      try {
        const res = await observabilityApi.getLogs({
          traceId,
          spanId: selectedSpan.span_id,
        });
        if (isMounted) setCorrelatedLogs(res.data || []);
      } catch {
        if (isMounted) setCorrelatedLogs([]);
      } finally {
        if (isMounted) setLogsLoading(false);
      }
    }
    loadSpanLogs();
    return () => { isMounted = false; };
  }, [selectedSpan, traceId]);

  const rootSpan = flatSpans.find((s) => !s.parent_span_id) || flatSpans[0];
  const totalTraceDurationMs = rootSpan?.duration_ms || Math.max(...flatSpans.map((s) => s.duration_ms), 100);
  const traceStartTime = rootSpan ? new Date(rootSpan.start_time).getTime() : 0;

  const copyTraceId = () => {
    navigator.clipboard?.writeText(traceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Recursive waterfall row renderer
  function renderSpanRow(node, depth = 0) {
    const isSelected = selectedSpan?.span_id === node.span_id;
    const isCritical = criticalSpanIds.has(node.span_id);
    const isDimmed = showCriticalPath && !isCritical;
    const isError = node.status_code === 2;

    const spanStart = new Date(node.start_time).getTime();
    const startOffsetMs = Math.max(0, spanStart - traceStartTime);
    const leftPct = Math.min(95, (startOffsetMs / totalTraceDurationMs) * 100);
    const widthPct = Math.max(3, Math.min(100 - leftPct, (node.duration_ms / totalTraceDurationMs) * 100));

    const svcColor = getServiceColor(node.service_name);

    return (
      <React.Fragment key={node.span_id}>
        <div
          onClick={() => setSelectedSpan(node)}
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            padding: '6px 12px',
            backgroundColor: isSelected
              ? 'var(--surface-active)'
              : isCritical && showCriticalPath
              ? 'rgba(224, 176, 80, 0.08)'
              : 'transparent',
            borderBottom: '1px solid var(--border-subtle)',
            borderLeft: isSelected
              ? '3px solid var(--accent)'
              : isCritical && showCriticalPath
              ? '3px solid var(--accent)'
              : '3px solid transparent',
            cursor: 'pointer',
            opacity: isDimmed ? 0.35 : 1,
            transition: 'opacity 0.2s, background-color 0.1s',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor =
                isCritical && showCriticalPath ? 'rgba(224, 176, 80, 0.08)' : 'transparent';
            }
          }}
        >
          {/* Left Column: Depth, Service Color, Name, Kind */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingLeft: `${depth * 18}px`,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: svcColor,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: svcColor,
                flexShrink: 0,
              }}
            >
              {node.service_name}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'var(--font-mono)',
              }}
              title={node.name}
            >
              {node.name}
            </span>
          </div>

          {/* Right Column: Timeline Gantt Bar & Duration */}
          <div style={{ position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
            {/* Gantt Bar */}
            <div
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: '14px',
                borderRadius: '3px',
                backgroundColor: isError
                  ? 'var(--error)'
                  : isCritical && showCriticalPath
                  ? 'var(--accent)'
                  : node.duration_ms > 300
                  ? 'var(--warn)'
                  : svcColor,
                boxShadow: isCritical && showCriticalPath ? '0 0 8px rgba(224, 176, 80, 0.5)' : 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                minWidth: '24px',
                transition: 'all 0.15s',
              }}
            >
              {isError && <AlertTriangle size={10} style={{ color: '#fff', marginRight: '2px' }} />}
            </div>

            {/* Duration text badge */}
            <span
              style={{
                position: 'absolute',
                left: `${leftPct + widthPct + 1}%`,
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: isError ? 'var(--error)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              {node.duration_ms}ms
              {node.self_time_ms !== undefined && node.self_time_ms > 0 && (
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                  (self {node.self_time_ms}ms)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Recursive children */}
        {node.children && node.children.map((child) => renderSpanRow(child, depth + 1))}
      </React.Fragment>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '95vw',
          maxWidth: '1280px',
          height: '90vh',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal Top Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                  {rootSpan?.name || 'Distributed Trace'}
                </h3>
                <StatusBadge
                  status={rootSpan?.status_code === 2 ? 'error' : 'ok'}
                  label={rootSpan?.status_code === 2 ? 'Failed Trace' : 'Success'}
                  size="sm"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {traceId}
                </span>
                <button
                  onClick={copyTraceId}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? 'var(--ok)' : 'var(--accent)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                  }}
                >
                  <Copy size={12} />
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Trace Toolbar Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Total Duration KPI */}
            <div
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text)',
              }}
            >
              <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>Total Time:</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{totalTraceDurationMs}ms</span>
            </div>

            {/* Total Spans */}
            <div
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{flatSpans.length} Spans</span>
            </div>

            {/* Critical Path Toggle */}
            <button
              onClick={() => setShowCriticalPath(!showCriticalPath)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: showCriticalPath ? 'var(--accent-subtle)' : 'var(--surface-input)',
                border: `1px solid ${showCriticalPath ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: showCriticalPath ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Flame size={14} style={{ color: showCriticalPath ? 'var(--accent)' : 'var(--text-dim)' }} />
              <span>Critical Path</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Main Content: Split into Waterfall Timeline (Left) and Span Details (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', flex: 1, overflow: 'hidden' }}>
          {/* Left: Interactive Waterfall Tree */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
            {/* Timeline Ruler Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '320px 1fr',
                padding: '8px 12px',
                backgroundColor: 'var(--surface-subtle)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              <div>Operation & Service</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: '20px' }}>
                <span>0ms</span>
                <span>{(totalTraceDurationMs * 0.25).toFixed(0)}ms</span>
                <span>{(totalTraceDurationMs * 0.5).toFixed(0)}ms</span>
                <span>{(totalTraceDurationMs * 0.75).toFixed(0)}ms</span>
                <span>{totalTraceDurationMs}ms</span>
              </div>
            </div>

            {/* Waterfall Rows List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading trace waterfall...
                </div>
              ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error)' }}>
                  {error}
                </div>
              ) : flowData.length ? (
                flowData.map((root) => renderSpanRow(root, 0))
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No spans found for this trace.
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected Span Details & Correlated Logs Drawer */}
          <div
            style={{
              backgroundColor: 'var(--surface-subtle)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {selectedSpan ? (
              <>
                {/* Span Header */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getServiceColor(selectedSpan.service_name),
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {selectedSpan.service_name}
                    </span>
                    <StatusBadge
                      status={selectedSpan.status_code === 2 ? 'error' : 'ok'}
                      label={selectedSpan.status_name || (selectedSpan.status_code === 2 ? 'ERROR' : 'OK')}
                      size="sm"
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      fontFamily: 'var(--font-mono)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedSpan.name}
                  </div>
                </div>

                {/* Tabs */}
                <div
                  style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--border)',
                    padding: '0 16px',
                    gap: '16px',
                  }}
                >
                  <button
                    onClick={() => setActiveTab('details')}
                    style={{
                      padding: '10px 0',
                      border: 'none',
                      borderBottom: activeTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none',
                      color: activeTab === 'details' ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    style={{
                      padding: '10px 0',
                      border: 'none',
                      borderBottom: activeTab === 'logs' ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none',
                      color: activeTab === 'logs' ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Correlated Logs</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--surface-input)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {correlatedLogs.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab('attributes')}
                    style={{
                      padding: '10px 0',
                      border: 'none',
                      borderBottom: activeTab === 'attributes' ? '2px solid var(--accent)' : '2px solid transparent',
                      background: 'none',
                      color: activeTab === 'attributes' ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Attributes
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                  {activeTab === 'details' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                          Span ID
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                          {selectedSpan.span_id}
                        </div>
                      </div>

                      {selectedSpan.parent_span_id && (
                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                            Parent Span ID
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                            {selectedSpan.parent_span_id}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                            Duration
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)', marginTop: '2px' }}>
                            {selectedSpan.duration_ms}ms
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                            Kind
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                            {selectedSpan.kind_name || 'INTERNAL'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                          Start Time
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {selectedSpan.start_time}
                        </div>
                      </div>

                      {selectedSpan.status_message && selectedSpan.status_code === 2 && (
                        <div
                          style={{
                            padding: '10px',
                            backgroundColor: 'var(--error-bg)',
                            border: '1px solid var(--error-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--error)',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '2px' }}>Execution Failure</div>
                          <div>{selectedSpan.status_message}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'logs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {logsLoading ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Loading correlated logs...</div>
                      ) : correlatedLogs.length ? (
                        correlatedLogs.map((log) => (
                          <div
                            key={log.log_id}
                            style={{
                              padding: '10px',
                              backgroundColor: 'var(--surface-input)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: log.severity_text === 'ERROR' ? 'var(--error)' : 'var(--ok)',
                                }}
                              >
                                {log.severity_text}
                              </span>
                              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                                {log.time?.slice(11, 19)}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.4 }}>
                              {log.body}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          No specific logs matched span ID {selectedSpan.span_id}.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'attributes' && (
                    <pre
                      style={{
                        margin: 0,
                        padding: '12px',
                        backgroundColor: 'var(--surface-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--accent)',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {JSON.stringify(selectedSpan.attributes || {}, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Click any span in the waterfall to inspect its execution attributes and correlated logs.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
