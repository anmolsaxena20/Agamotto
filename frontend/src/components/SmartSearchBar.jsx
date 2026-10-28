import React, { useState } from 'react';
import { Sparkles, Search, X, Check, ArrowRight, Loader2, Filter } from 'lucide-react';
import { aiService } from '../services/apiServices.js';
import { useOrg } from '../context/OrgContext.jsx';

export function SmartSearchBar({
  domain = 'traces',
  onApplyFilter,
  placeholder = "Search telemetry with AI in natural language... (e.g. 'find traces slower than 500ms in server')",
  quickSuggestions = [
    'traces slower than 500ms',
    'status >= 500 server errors',
    'database query latency spikes',
    'errors in email-service',
  ],
}) {
  const { currentOrg } = useOrg();
  const [query, setQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFilter, setParsedFilter] = useState(null);
  const [parseError, setParseError] = useState(null);

  const handleParse = async (textToParse = query) => {
    const trimmed = textToParse.trim();
    if (!trimmed || !currentOrg?.id) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const res = await aiService.parseFilter(currentOrg.id, {
        query: trimmed,
        domain,
      });

      if (res?.filter || res?.sql_where || res?.clauses) {
        setParsedFilter(res);
        onApplyFilter?.(res);
      } else {
        setParsedFilter(res);
      }
    } catch (err) {
      console.warn('AI filter parsing failed:', err);
      setParseError(err.message || 'Could not parse natural language into telemetry filter');
    } finally {
      setIsParsing(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setParsedFilter(null);
    setParseError(null);
    onApplyFilter?.(null);
  };

  const renderFilterChips = () => {
    if (!parsedFilter) return null;

    const clauses = parsedFilter.clauses || [];
    const sqlWhere = parsedFilter.sql_where || parsedFilter.sql || '';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: 'var(--surface-subtle)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontSize: '12px', fontWeight: 600 }}>
          <Sparkles size={13} />
          <span>Parsed Filter:</span>
        </div>

        {clauses.length > 0 ? (
          clauses.map((clause, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: 'rgba(224, 176, 80, 0.12)',
                border: '1px solid rgba(224, 176, 80, 0.3)',
                color: 'var(--accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>{clause.field || clause.column} {clause.op || '='} <strong>{String(clause.value)}</strong></span>
            </div>
          ))
        ) : sqlWhere ? (
          <code
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text)',
            }}
          >
            WHERE {sqlWhere}
          </code>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filter parsed successfully</span>
        )}

        <button
          onClick={handleClear}
          title="Clear AI Filter"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <X size={12} />
          <span>Reset</span>
        </button>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-card)',
          transition: 'border-color 0.15s ease',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ padding: '0 14px', display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
          <Sparkles size={17} />
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleParse();
            }
          }}
          placeholder={placeholder}
          disabled={isParsing}
          style={{
            flex: 1,
            height: '42px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: '13px',
            outline: 'none',
            paddingRight: '12px',
          }}
        />

        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        )}

        <button
          onClick={() => handleParse()}
          disabled={isParsing || !query.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--accent)',
            color: '#0D1017',
            border: 'none',
            borderRadius: '0 var(--radius) var(--radius) 0',
            height: '42px',
            padding: '0 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: isParsing || !query.trim() ? 'not-allowed' : 'pointer',
            opacity: isParsing || !query.trim() ? 0.6 : 1,
            transition: 'background-color 0.15s',
          }}
        >
          {isParsing ? (
            <>
              <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              <span>Parsing...</span>
            </>
          ) : (
            <>
              <span>Ask AI</span>
              <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>

      {/* Quick query pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Quick Prompts:</span>
        {quickSuggestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => {
              setQuery(item);
              handleParse(item);
            }}
            style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-full)',
              padding: '2px 9px',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {parseError && (
        <div style={{ color: 'var(--error)', fontSize: '11px', marginTop: '6px', paddingLeft: '4px' }}>
          {parseError}
        </div>
      )}

      {renderFilterChips()}
    </div>
  );
}
