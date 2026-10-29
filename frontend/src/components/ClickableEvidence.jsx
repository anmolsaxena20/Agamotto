import React, { useState } from 'react';
import {
  GitBranch,
  Server,
  Network,
  Terminal,
  ExternalLink,
  ShieldCheck,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Wrench,
  Activity,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  Database,
  Clock,
  Sparkles,
} from 'lucide-react';

const KNOWN_SERVICES = [
  'server',
  'email-service',
  'ingestion-gateway',
  'ai_service',
  'ai-service',
  'database',
  'redis',
  'clickhouse',
];

/**
 * Parses inline text with tokens:
 * - trace IDs: `trace:xxx` or UUIDs or 32-char hex
 * - services: `service:xxx` or known service names
 * - endpoints: `(GET|POST|PUT|PATCH|DELETE) /path`
 * - code: `code`
 * - bold: `**text**`
 */
function renderInlineTokens(lineText, { onSelectTrace, onSelectService, onSelectEndpoint }) {
  if (!lineText) return null;

  // Regex to match markdown bold first, or tokens
  const tokenRegex = /(\*\*[^*]+\*\*|trace:[a-fA-F0-9-]+|\b[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\b|\b[a-fA-F0-9]{32}\b|service:([a-zA-Z0-9_\-]+)|(?:GET|POST|PUT|PATCH|DELETE)\s+\/[a-zA-Z0-9_\-\/:]+|`[^`]+`)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(lineText.substring(lastIndex, match.index));
    }

    const matchedStr = match[0];

    if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      const boldText = matchedStr.slice(2, -2);
      parts.push(
        <strong key={`bold-${match.index}`} style={{ color: 'var(--text)', fontWeight: 650 }}>
          {renderInlineTokens(boldText, { onSelectTrace, onSelectService, onSelectEndpoint })}
        </strong>
      );
    } else if (
      matchedStr.startsWith('trace:') ||
      matchedStr.match(/^[a-fA-F0-9]{32}$/) ||
      matchedStr.match(/^[a-fA-F0-9\-]{36}$/)
    ) {
      const traceId = matchedStr.replace(/^trace:/, '');
      parts.push(
        <button
          key={`trace-${match.index}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectTrace?.(traceId);
          }}
          title={`Click to inspect Trace ${traceId} in Waterfall view`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(224, 176, 80, 0.14)',
            color: 'var(--accent)',
            border: '1px solid rgba(224, 176, 80, 0.4)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: onSelectTrace ? 'pointer' : 'default',
            margin: '0 2px',
            verticalAlign: 'baseline',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (onSelectTrace) {
              e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.28)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (onSelectTrace) {
              e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.14)';
              e.currentTarget.style.transform = 'none';
            }
          }}
        >
          <GitBranch size={11} style={{ flexShrink: 0 }} />
          <span>trace:{traceId.slice(0, 8)}...</span>
        </button>
      );
    } else if (matchedStr.startsWith('service:') || KNOWN_SERVICES.includes(matchedStr.toLowerCase())) {
      const serviceName = matchedStr.replace(/^service:/, '');
      parts.push(
        <button
          key={`svc-${match.index}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectService?.(serviceName);
          }}
          title={`Click to inspect microservice: ${serviceName}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'rgba(63, 182, 139, 0.14)',
            color: 'var(--ok)',
            border: '1px solid rgba(63, 182, 139, 0.4)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: onSelectService ? 'pointer' : 'default',
            margin: '0 2px',
            verticalAlign: 'baseline',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (onSelectService) {
              e.currentTarget.style.backgroundColor = 'rgba(63, 182, 139, 0.28)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (onSelectService) {
              e.currentTarget.style.backgroundColor = 'rgba(63, 182, 139, 0.14)';
              e.currentTarget.style.transform = 'none';
            }
          }}
        >
          <Server size={11} style={{ flexShrink: 0 }} />
          <span>{serviceName}</span>
        </button>
      );
    } else if (matchedStr.match(/^(GET|POST|PUT|PATCH|DELETE)\s+\//)) {
      parts.push(
        <button
          key={`ep-${match.index}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectEndpoint?.(matchedStr);
          }}
          title={`Click to inspect endpoint: ${matchedStr}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--surface-active)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            cursor: onSelectEndpoint ? 'pointer' : 'default',
            margin: '0 2px',
            verticalAlign: 'baseline',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (onSelectEndpoint) e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            if (onSelectEndpoint) e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <Network size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span>{matchedStr}</span>
        </button>
      );
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      const code = matchedStr.slice(1, -1);
      parts.push(
        <code
          key={`code-${match.index}`}
          style={{
            backgroundColor: 'var(--surface-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '1px 5px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--accent)',
            margin: '0 2px',
          }}
        >
          {code}
        </code>
      );
    } else {
      parts.push(matchedStr);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < lineText.length) {
    parts.push(lineText.substring(lastIndex));
  }

  return parts;
}

/**
 * ClickableEvidence
 * Parses markdown blocks and inline telemetry tokens
 */
export function ClickableEvidence({ text, onSelectTrace, onSelectService, onSelectEndpoint, style = {} }) {
  if (!text || typeof text !== 'string') {
    return <span style={style}>{text || ''}</span>;
  }

  const lines = text.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${elements.length}`}
          style={{
            margin: '6px 0 10px 0',
            paddingLeft: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {listItems.map((item, idx) => (
            <li key={idx} style={{ color: 'var(--text)', fontSize: '13px', lineHeight: '1.5' }}>
              {renderInlineTokens(item, { onSelectTrace, onSelectService, onSelectEndpoint })}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    // Markdown Headers (###, ##, #)
    if (trimmed.startsWith('### ')) {
      flushList();
      const headerText = trimmed.replace(/^###\s+/, '');
      elements.push(
        <div
          key={`h3-${lineIdx}`}
          style={{
            margin: '12px 0 6px 0',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <span>{renderInlineTokens(headerText, { onSelectTrace, onSelectService, onSelectEndpoint })}</span>
        </div>
      );
      return;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      flushList();
      const headerText = trimmed.replace(/^#{1,2}\s+/, '');
      elements.push(
        <div
          key={`h2-${lineIdx}`}
          style={{
            margin: '14px 0 8px 0',
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--text)',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '4px',
          }}
        >
          {renderInlineTokens(headerText, { onSelectTrace, onSelectService, onSelectEndpoint })}
        </div>
      );
      return;
    }

    // Bullet points (•, *, -)
    if (trimmed.startsWith('• ') || trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      inList = true;
      listItems.push(trimmed.slice(2));
      return;
    }

    // Numbered lists (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      flushList();
      elements.push(
        <div
          key={`num-${lineIdx}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            margin: '4px 0',
            fontSize: '13px',
            lineHeight: '1.5',
          }}
        >
          <span
            style={{
              backgroundColor: 'rgba(224, 176, 80, 0.15)',
              color: 'var(--accent)',
              border: '1px solid rgba(224, 176, 80, 0.3)',
              borderRadius: '50%',
              width: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 700,
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            {numMatch[1]}
          </span>
          <div style={{ flex: 1 }}>
            {renderInlineTokens(numMatch[2], { onSelectTrace, onSelectService, onSelectEndpoint })}
          </div>
        </div>
      );
      return;
    }

    // Standard paragraph line
    flushList();
    elements.push(
      <p
        key={`p-${lineIdx}`}
        style={{
          margin: '4px 0 8px 0',
          color: 'var(--text)',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
      >
        {renderInlineTokens(trimmed, { onSelectTrace, onSelectService, onSelectEndpoint })}
      </p>
    );
  });

  flushList();

  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{elements}</div>;
}

/**
 * SmartAiMessage
 * State-of-the-art UI/UX presentation of AI diagnostic answers
 */
export function SmartAiMessage({
  message,
  onSelectTrace,
  onSelectService,
  onSelectEndpoint,
}) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const raw = message?.rawAnswer || {};
  const hasStructured = Boolean(
    raw && (raw.evidence?.length > 0 || raw.hypotheses?.length > 0 || raw.next_steps?.length > 0)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* 1. MCP Tool Execution Accordion */}
      {message.tools && message.tools.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--surface-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            marginBottom: '4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div
            onClick={() => setToolsExpanded(!toolsExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              cursor: 'pointer',
              backgroundColor: 'rgba(224, 176, 80, 0.06)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              userSelect: 'none',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.06)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={12} style={{ color: 'var(--accent)' }} />
              <span>
                Telemetry Investigation: {message.tools.length} diagnostic {message.tools.length === 1 ? 'tool' : 'tools'} executed
              </span>
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: 'rgba(63, 182, 139, 0.15)',
                  color: 'var(--ok)',
                  border: '1px solid rgba(63, 182, 139, 0.3)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                ClickHouse
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)' }}>
              <span>{toolsExpanded ? 'Hide tools' : 'Show details'}</span>
              {toolsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
          </div>

          {toolsExpanded && (
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border)' }}>
              {message.tools.map((tool, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--accent)', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Wrench size={10} />
                      <span style={{ fontWeight: 600 }}>{tool.name || tool.tool || 'telemetry_tool'}</span>
                    </div>
                    {tool.step && <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Step {tool.step}</span>}
                  </div>
                  {tool.arguments && Object.keys(tool.arguments).length > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      args: {JSON.stringify(tool.arguments)}
                    </div>
                  )}
                  {tool.result && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '10px', marginTop: '2px' }}>
                      result: {tool.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Primary Response Card */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: '16px 16px 16px 2px',
          backgroundColor: 'var(--surface-subtle)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: '13px',
          lineHeight: '1.6',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Executive Summary */}
        <div>
          <ClickableEvidence
            text={raw.summary || message.content}
            onSelectTrace={onSelectTrace}
            onSelectService={onSelectService}
            onSelectEndpoint={onSelectEndpoint}
          />
        </div>

        {/* 3. Verified Telemetry Evidence Cards */}
        {hasStructured && raw.evidence && raw.evidence.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} style={{ color: 'var(--ok)' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Verified Telemetry Evidence ({raw.evidence.length})
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>ClickHouse Cloud Store</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {raw.evidence.map((ev, idx) => {
                const duration = ev.duration_ms ? Number(ev.duration_ms) : null;
                const isSlow = duration && duration > 1000;
                const isCritical = duration && duration > 5000;

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--bg)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(63, 182, 139, 0.15)',
                          color: 'var(--ok)',
                          border: '1px solid rgba(63, 182, 139, 0.35)',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-sm)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {ev.service_name || 'service'}
                      </span>

                      <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>
                        {ev.span_name || ev.label || 'operation'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {duration !== null && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            backgroundColor: isCritical
                              ? 'rgba(229, 83, 75, 0.15)'
                              : isSlow
                              ? 'rgba(224, 176, 80, 0.15)'
                              : 'rgba(63, 182, 139, 0.15)',
                            color: isCritical ? 'var(--error)' : isSlow ? 'var(--accent)' : 'var(--ok)',
                            border: `1px solid ${
                              isCritical
                                ? 'rgba(229, 83, 75, 0.4)'
                                : isSlow
                                ? 'rgba(224, 176, 80, 0.4)'
                                : 'rgba(63, 182, 139, 0.4)'
                            }`,
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          {duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration.toFixed(1)}ms`}
                        </span>
                      )}

                      {ev.trace_id && (
                        <button
                          onClick={() => onSelectTrace?.(ev.trace_id)}
                          title="Open in Trace Waterfall Inspection"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'rgba(224, 176, 80, 0.12)',
                            color: 'var(--accent)',
                            border: '1px solid rgba(224, 176, 80, 0.35)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.25)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(224, 176, 80, 0.12)';
                            e.currentTarget.style.transform = 'none';
                          }}
                        >
                          <GitBranch size={11} />
                          <span>Waterfall</span>
                          <ArrowRight size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Probable Hypotheses Cards */}
        {hasStructured && raw.hypotheses && raw.hypotheses.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Probable Root Causes & Hypotheses
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {raw.hypotheses.map((h, idx) => {
                const conf = (h.confidence || 'medium').toLowerCase();
                const isHigh = conf === 'high';
                const isMed = conf === 'medium';

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      backgroundColor: 'var(--bg)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        backgroundColor: isHigh
                          ? 'rgba(63, 182, 139, 0.15)'
                          : isMed
                          ? 'rgba(224, 176, 80, 0.15)'
                          : 'rgba(150, 150, 150, 0.15)',
                        color: isHigh ? 'var(--ok)' : isMed ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${
                          isHigh
                            ? 'rgba(63, 182, 139, 0.4)'
                            : isMed
                            ? 'rgba(224, 176, 80, 0.4)'
                            : 'rgba(150, 150, 150, 0.3)'
                        }`,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)',
                        textTransform: 'uppercase',
                        marginTop: '2px',
                        flexShrink: 0,
                      }}
                    >
                      {conf}
                    </span>

                    <span style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.4' }}>
                      {h.text || h.hypothesis || JSON.stringify(h)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Recommended Actions */}
        {hasStructured && raw.next_steps && raw.next_steps.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Recommended Engineering Actions
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {raw.next_steps.map((step, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '13px',
                    color: 'var(--text)',
                    lineHeight: '1.4',
                  }}
                >
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(224, 176, 80, 0.15)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(224, 176, 80, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Streaming Cursor */}
        {message.isStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontSize: '11px', marginTop: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                animation: 'pulse 1s infinite',
              }}
            />
            <span>AI agent is synthesizing real ClickHouse telemetry...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ClickableBadge
 * Standalone interactive chip with hover micro-animations
 */
const BADGE_COLOR_MAP = {
  accent: {
    bg: 'rgba(224, 176, 80, 0.12)',
    border: 'rgba(224, 176, 80, 0.35)',
    text: 'var(--accent)',
    hoverBg: 'rgba(224, 176, 80, 0.24)',
  },
  ok: {
    bg: 'rgba(63, 182, 139, 0.12)',
    border: 'rgba(63, 182, 139, 0.35)',
    text: 'var(--ok)',
    hoverBg: 'rgba(63, 182, 139, 0.24)',
  },
  error: {
    bg: 'rgba(229, 83, 75, 0.12)',
    border: 'rgba(229, 83, 75, 0.35)',
    text: 'var(--error)',
    hoverBg: 'rgba(229, 83, 75, 0.24)',
  },
  neutral: {
    bg: 'var(--surface-hover)',
    border: 'var(--border)',
    text: 'var(--text)',
    hoverBg: 'var(--surface-active)',
  },
};

export function ClickableBadge({
  type = 'trace',
  value,
  label,
  onClick,
  icon: CustomIcon,
  colorScheme = 'accent',
  copyable = false,
}) {
  const [copied, setCopied] = useState(false);
  const Icon = CustomIcon || (type === 'trace' ? GitBranch : type === 'service' ? Server : Network);
  const colors = BADGE_COLOR_MAP[colorScheme] || BADGE_COLOR_MAP.accent;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        margin: '0 2px',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(value);
        }}
        title={`Click to inspect ${type}: ${value}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          borderRadius: copyable || type === 'trace' ? 'var(--radius-sm) 0 0 var(--radius-sm)' : 'var(--radius-sm)',
          padding: '2px 7px',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: type === 'trace' ? 'var(--font-mono)' : 'var(--font-sans)',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          lineHeight: '16px',
        }}
        onMouseEnter={(e) => {
          if (onClick) {
            e.currentTarget.style.backgroundColor = colors.hoverBg;
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (onClick) {
            e.currentTarget.style.backgroundColor = colors.bg;
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }
        }}
      >
        <Icon size={12} style={{ flexShrink: 0 }} />
        <span>{label || value}</span>
        {onClick && <ExternalLink size={9} style={{ opacity: 0.6 }} />}
      </button>

      {(copyable || type === 'trace') && (
        <button
          onClick={handleCopy}
          title={copied ? 'Copied to clipboard!' : `Copy ${value}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 5px',
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderLeft: 'none',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            color: copied ? 'var(--ok)' : colors.text,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            lineHeight: '16px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.bg;
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} style={{ opacity: 0.7 }} />}
        </button>
      )}
    </span>
  );
}
