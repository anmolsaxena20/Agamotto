import React, { useState } from 'react';
import { GitBranch, Server, Network, Terminal, ExternalLink, ShieldCheck, Copy, Check } from 'lucide-react';

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
 * ClickableEvidence
 * Parses AI text or telemetry summaries and renders interactive, clickable chips
 * for Trace IDs, Services, Endpoints, and SQL queries so users have full deep-dive UX.
 */
export function ClickableEvidence({ text, onSelectTrace, onSelectService, onSelectEndpoint, style = {} }) {
  if (!text || typeof text !== 'string') {
    return <span style={style}>{text || ''}</span>;
  }

  // Regular expression to match:
  // 1. Trace IDs: `trace:[a-f0-9-]+` or `[Trace abc]` or 32-char hex `[a-f0-9]{32}`
  // 2. Services: `service:xyz` or standalone known service names
  // 3. Endpoints: `(GET|POST|PUT|PATCH|DELETE) \/[a-zA-Z0-9_\-\/:]+`
  // 4. Inline code: `code`
  const tokenRegex = /(trace:[a-fA-F0-9-]+|\b[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\b|\b[a-fA-F0-9]{32}\b|service:([a-zA-Z0-9_\-]+)|(?:GET|POST|PUT|PATCH|DELETE)\s+\/[a-zA-Z0-9_\-\/:]+|`[^`]+`)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const matchedStr = match[0];

    if (matchedStr.startsWith('trace:') || matchedStr.match(/^[a-fA-F0-9]{32}$/) || matchedStr.match(/^[a-fA-F0-9\-]{36}$/)) {
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
            if (onSelectEndpoint) {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }
          }}
          onMouseLeave={(e) => {
            if (onSelectEndpoint) {
              e.currentTarget.style.borderColor = 'var(--border)';
            }
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
            color: 'var(--text)',
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

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span style={style}>{parts}</span>;
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
