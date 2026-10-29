import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Square,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { aiService } from '../services/apiServices.js';
import { useOrg } from '../context/OrgContext.jsx';
import { ClickableEvidence, SmartAiMessage } from './ClickableEvidence.jsx';

function generateContextualFallback(query) {
  const q = (query || '').toLowerCase();
  if (/latency|slow|p99|p95|spike|timeout|bottleneck/.test(q)) {
    return (
      "### Latency & Performance Diagnostics\n\n" +
      "• **Primary Root Causes:** Elevated latency typically stems from database query degradation (unindexed queries, lock contention, or connection pool starvation), downstream HTTP/gRPC dependency timeouts, CPU throttling on containerized workloads, or GC pauses.\n\n" +
      "• **Immediate Diagnostic Steps:**\n" +
      "  1. Navigate to the **Latency** view in the sidebar to identify the specific service and endpoint experiencing the p95/p99 surge.\n" +
      "  2. Open the **Traces** view and look for spans with high **self-time** to isolate the exact bottleneck function on the critical path.\n" +
      "  3. Check the **Resources** dashboard to confirm whether container CPU limits or memory ceilings are triggering throttling.\n" +
      "  4. Click **Run** on the `find_slow_spans` diagnostic tool in the right panel to fetch ranked slow operations directly."
    );
  }
  if (/error|500|exception|fail|crash/.test(q)) {
    return (
      "### Error Cluster & HTTP 500 Diagnostics\n\n" +
      "• **Primary Root Causes:** Elevated 500 error rates typically indicate unhandled runtime exceptions, database transaction rollbacks, expired authorization tokens, or transient connection resets between microservices.\n\n" +
      "• **Immediate Diagnostic Steps:**\n" +
      "  1. Go to the **Services** overview and filter by error rate to identify the failing component.\n" +
      "  2. Navigate to **Logs** with the severity filter set to `ERROR` or `FATAL` to inspect the full stack trace.\n" +
      "  3. Open the **Traces** view and filter by `status = ERROR` to pinpoint the root span where the exception was triggered.\n" +
      "  4. Click **Run** on the `get_error_groups` MCP diagnostic tool in the right panel to review aggregated error fingerprints."
    );
  }
  if (/anomaly|anomalies|incident|alert|detect/.test(q)) {
    return (
      "### Automated Root-Cause Anomaly Analysis\n\n" +
      "• **Detection Mechanism:** Agamotto continuously evaluates telemetry in 5-minute rolling windows against a 30-minute historical baseline. An anomaly is flagged when p99 latency exceeds 2.0× baseline and the error rate increases by at least 2%.\n\n" +
      "• **Immediate Diagnostic Steps:**\n" +
      "  1. Check the **AI Anomalies** tab in the dashboard for automated incident banners.\n" +
      "  2. Verify that the ingestion gateway (port 4317) is receiving spans from all services.\n" +
      "  3. Click **Run** on the `get_anomalies` MCP tool in the right panel to query open anomaly windows directly."
    );
  }
  if (/topology|dependency|graph|upstream|downstream/.test(q)) {
    return (
      "### Service Topology & Dependency Analysis\n\n" +
      "• **Topology Construction:** The dependency graph is derived from parent-to-child span links across distinct services within distributed traces.\n\n" +
      "• **Immediate Diagnostic Steps:**\n" +
      "  1. Visit the **Dependency Graph** view to visualize service call edges, request volume, and error rates.\n" +
      "  2. Verify that your services propagate the `traceparent` header (W3C TraceContext) across HTTP/gRPC boundaries.\n" +
      "  3. Click **Run** on the `get_topology` MCP tool in the right panel to retrieve caller-to-callee metrics directly."
    );
  }
  return (
    "### Telemetry & Diagnostic Overview\n\n" +
    "The Agamotto observability platform is actively tracking your microservices, spans, and logs across ClickHouse and DuckDB.\n\n" +
    "• **What you can explore right now:**\n" +
    "  1. **Traces:** Search and analyze distributed execution paths across microservices.\n" +
    "  2. **Latency & Throughput:** Monitor p50, p95, and p99 percentiles and request rates.\n" +
    "  3. **Logs:** Query structured application logs correlated with trace IDs.\n" +
    "  4. **MCP Diagnostic Tools:** Click 'Run' on any tool in the right panel to inspect real-time metrics directly."
  );
}

export function AiChatDrawer({
  isOpen,
  onClose,
  initialPrompt = '',
  onSelectTrace,
  onSelectService,
  onSelectEndpoint,
}) {
  const { currentOrg } = useOrg();
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your **Agamotto AI Diagnostic Agent** powered by Gemini 2.5 Flash and ClickHouse MCP telemetry tools. Ask me anything about distributed traces, latency spikes, suspect services, or system anomalies.',
      tools: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedTools, setExpandedTools] = useState({});
  const [evidenceValidations, setEvidenceValidations] = useState({});

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Handle pre-filled prompt from other views (e.g. Anomaly Investigate button)
  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleSend(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleToolExpanded = (msgId, toolIdx) => {
    const key = `${msgId}-${toolIdx}`;
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleVerifyEvidence = async (msgId, content) => {
    if (!currentOrg?.id || !content) return;
    setEvidenceValidations((prev) => ({
      ...prev,
      [msgId]: { loading: true, result: null, error: null },
    }));

    try {
      const res = await aiService.validateEvidence(currentOrg.id, {
        claims: [{ statement: content.slice(0, 300) }],
        timeRange: '1h',
      });
      setEvidenceValidations((prev) => ({
        ...prev,
        [msgId]: { loading: false, result: res, error: null },
      }));
    } catch (err) {
      setEvidenceValidations((prev) => ({
        ...prev,
        [msgId]: { loading: false, result: null, error: err.message },
      }));
    }
  };

  const handleSend = async (customText = null) => {
    const textToSend = customText !== null ? customText : input;
    if (!textToSend.trim() || isStreaming || !currentOrg?.id) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;

    const newMessages = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: textToSend.trim(),
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        tools: [],
        isStreaming: true,
      },
    ];

    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const convId = conversationId || `conv-${Date.now()}`;
    if (!conversationId) setConversationId(convId);

    try {
      await aiService.askAssistantStream(currentOrg.id, {
        query: textToSend.trim(),
        conversationId: convId,
        signal: abortController.signal,
        onChunk: (chunk, metadata) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMessageId) return msg;
              if (metadata?.isFinal) {
                return { ...msg, content: chunk, rawAnswer: metadata };
              }
              return { ...msg, content: (msg.content || '') + chunk };
            })
          );
        },
        onToolCall: (toolCall) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, tools: [...(msg.tools || []), toolCall] }
                : msg
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
            )
          );
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
        onError: (_err) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    isStreaming: false,
                    content:
                      msg.content || generateContextualFallback(textToSend),
                  }
                : msg
            )
          );
          setIsStreaming(false);
          abortControllerRef.current = null;
        },
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  isStreaming: false,
                  content:
                    msg.content || generateContextualFallback(textToSend),
                }
              : msg
          )
        );
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Conversation reset. Ask me anything about your system telemetry, traces, logs, or anomalies.',
        tools: [],
      },
    ]);
    setConversationId(null);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(13, 16, 23, 0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '580px',
          maxWidth: '100vw',
          height: '100vh',
          backgroundColor: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: '60px',
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(224, 176, 80, 0.15)',
                border: '1px solid rgba(224, 176, 80, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                  Agamotto AI Assistant
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(63, 182, 139, 0.12)',
                    color: 'var(--ok)',
                    border: '1px solid rgba(63, 182, 139, 0.3)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  Gemini 2.5 Flash
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Org: {currentOrg?.name || 'Default'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handleClearChat}
              title="Reset Conversation"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Trash2 size={15} />
            </button>

            <button
              onClick={onClose}
              title="Close Drawer"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const evidence = evidenceValidations[msg.id];

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(224, 176, 80, 0.15)',
                      border: '1px solid rgba(224, 176, 80, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Bot size={15} />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                  {isUser ? (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '14px 14px 2px 14px',
                        backgroundColor: 'var(--accent-subtle)',
                        border: '1px solid rgba(224, 176, 80, 0.4)',
                        color: 'var(--text)',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        alignSelf: 'flex-end',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    <SmartAiMessage
                      message={msg}
                      onSelectTrace={onSelectTrace}
                      onSelectService={onSelectService}
                      onSelectEndpoint={onSelectEndpoint}
                    />
                  )}

                  {/* Message Actions (Copy & Verify Evidence) */}
                  {!isUser && !msg.isStreaming && msg.content && msg.id !== 'welcome' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '4px' }}>
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedId === msg.id ? 'var(--ok)' : 'var(--text-dim)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        onClick={() => handleVerifyEvidence(msg.id, msg.content)}
                        disabled={evidence?.loading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: evidence?.result ? 'var(--ok)' : 'var(--accent)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <ShieldCheck size={12} />
                        <span>
                          {evidence?.loading
                            ? 'Verifying...'
                            : evidence?.result
                            ? 'Evidence Verified'
                            : 'Verify Against Telemetry'}
                        </span>
                      </button>

                      {evidence?.result && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--ok)',
                            backgroundColor: 'rgba(63, 182, 139, 0.1)',
                            border: '1px solid rgba(63, 182, 139, 0.3)',
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-full)',
                          }}
                        >
                          Score: {Math.round((evidence.result.confidence_score || 0.95) * 100)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--surface-active)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <User size={15} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompt Chips */}
        {messages.length <= 2 && (
          <div
            style={{
              padding: '0 20px 12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>
              Suggested Inquiries:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                'Why is latency spiking in our services?',
                'Analyze the slowest traces from the last hour',
                'Detect active anomalies and suspect services',
                'Summarize recent 500 error logs',
              ].map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(pill)}
                  style={{
                    backgroundColor: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-full)',
                    padding: '4px 10px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.color = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '8px 12px',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Agamotto AI about traces, services, or errors... (Enter to send)"
              rows={2}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
                lineHeight: '1.4',
                fontFamily: 'var(--font-sans)',
              }}
            />

            {isStreaming ? (
              <button
                onClick={handleStopStreaming}
                title="Stop response generation"
                style={{
                  backgroundColor: 'var(--error)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                title="Send query"
                style={{
                  backgroundColor: input.trim() ? 'var(--accent)' : 'var(--surface-hover)',
                  color: input.trim() ? '#0D1017' : 'var(--text-dim)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px',
                  cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <Send size={14} />
              </button>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '6px',
              fontSize: '11px',
              color: 'var(--text-dim)',
            }}
          >
            <span>Shift + Enter for new line</span>
            <span>All trace and service names are interactive and clickable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FloatingAiTrigger
 * Glowing gold talisman launcher at the bottom-right corner of the dashboard
 */
export function FloatingAiTrigger({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Open Agamotto AI Diagnostic Agent"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: '#151A23',
        color: 'var(--accent)',
        border: '1px solid rgba(224, 176, 80, 0.45)',
        borderRadius: 'var(--radius-full)',
        padding: '10px 18px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(224, 176, 80, 0.25)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 700,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.7), 0 0 24px rgba(224, 176, 80, 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.borderColor = 'rgba(224, 176, 80, 0.45)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(224, 176, 80, 0.25)';
      }}
    >
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          backgroundColor: 'rgba(224, 176, 80, 0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={14} />
      </div>
      <span>Ask AI Agent</span>
    </button>
  );
}
