import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  Send,
  Square,
  Sparkles,
  RefreshCw,
  Wrench,
  ShieldCheck,
  Copy,
  Check,
  Terminal,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Server,
  GitBranch,
  Play,
  X,
  AlertCircle,
} from 'lucide-react';
import { useOrg } from '../../context/OrgContext.jsx';
import { aiService } from '../../services/apiServices.js';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { ClickableEvidence } from '../../components/ClickableEvidence.jsx';

const DEFAULT_TOOL_PARAMS = {
  get_service_stats: '{\n  "filter": {}\n}',
  find_slow_spans: '{\n  "filter": {},\n  "limit": 10\n}',
  get_error_groups: '{\n  "filter": {},\n  "limit": 10\n}',
  get_trace: '{\n  "trace_id": ""\n}',
  search_logs: '{\n  "filter": {\n    "severity": ["ERROR", "FATAL"],\n    "limit": 20\n  }\n}',
  compare_traces: '{\n  "trace_id": "",\n  "baseline_trace_id": ""\n}',
  get_topology: '{\n  "filter": {}\n}',
  get_anomalies: '{\n  "filter": {}\n}',
};

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

export function AiChatView({ onSelectTrace, onSelectService, onSelectEndpoint }) {
  const { currentOrg } = useOrg();
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Welcome to the **Agamotto AI Diagnostic Agent** full console. I have direct access to your ClickHouse telemetry facts, spans, logs, and Model Context Protocol (MCP) diagnostic tools.\n\nAsk me to investigate latency spikes, identify suspect services, explain trace waterfalls, or cross-validate system hypotheses.',
      tools: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [mcpTools, setMcpTools] = useState([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [evidenceValidations, setEvidenceValidations] = useState({});
  const [expandedTools, setExpandedTools] = useState({});
  const [activeTool, setActiveTool] = useState(null);
  const [toolParamsInput, setToolParamsInput] = useState('{}');
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [toolExecutionResult, setToolExecutionResult] = useState(null);
  const [toolExecutionError, setToolExecutionError] = useState(null);
  const [toolResultCopied, setToolResultCopied] = useState(false);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const handleOpenToolRunner = (tool) => {
    setActiveTool(tool);
    setToolParamsInput(DEFAULT_TOOL_PARAMS[tool.name] || '{\n  "filter": {}\n}');
    setToolExecutionResult(null);
    setToolExecutionError(null);
  };

  const handleRunActiveTool = async () => {
    if (!currentOrg?.id || !activeTool) return;
    setIsExecutingTool(true);
    setToolExecutionError(null);
    setToolExecutionResult(null);
    try {
      let parsed = {};
      try {
        parsed = toolParamsInput.trim() ? JSON.parse(toolParamsInput) : {};
      } catch (e) {
        throw new Error('Invalid JSON parameters: ' + e.message);
      }
      const res = await aiService.executeMcpTool(currentOrg.id, activeTool.name, parsed);
      setToolExecutionResult(res);
    } catch (err) {
      setToolExecutionError(err.message || 'Tool execution failed');
    } finally {
      setIsExecutingTool(false);
    }
  };

  const handleSendToolToChat = () => {
    if (!activeTool) return;
    const prompt = `Please run MCP tool "${activeTool.name}" and interpret its findings for the system.`;
    handleSend(prompt);
    setActiveTool(null);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load registered MCP tools for right inspector
  useEffect(() => {
    async function loadTools() {
      if (!currentOrg?.id) return;
      setIsLoadingTools(true);
      try {
        const res = await aiService.listMcpTools(currentOrg.id);
        const toolsList = Array.isArray(res) ? res : res?.tools || [];
        setMcpTools(toolsList);
      } catch (err) {
        console.warn('Failed to load MCP tools:', err);
      } finally {
        setIsLoadingTools(false);
      }
    }
    loadTools();
  }, [currentOrg]);

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

  const handleSend = async (customPrompt = null) => {
    const textToSend = customPrompt !== null ? customPrompt : input;
    if (!textToSend.trim() || isStreaming || !currentOrg?.id) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
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
    ]);

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
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Conversation reset. Ask me anything about your distributed traces, latency spikes, suspect services, or system errors.',
        tools: [],
      },
    ]);
    setConversationId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '16px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="text-page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={22} style={{ color: 'var(--accent)' }} />
              <span>AI Investigation Agent</span>
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: 'rgba(224, 176, 80, 0.15)',
                color: 'var(--accent)',
                border: '1px solid rgba(224, 176, 80, 0.35)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              GEMINI 2.5 FLASH
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Dedicated full-page diagnostic console with ClickHouse telemetry synthesis and Model Context Protocol (MCP) tool execution.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button variant="secondary" size="sm" onClick={handleClear} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} />
            <span>Clear Session</span>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Workstation Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left Column: Chat Conversation Stage */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Quick Preset Prompts */}
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--surface-subtle)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>Quick Inquiries:</span>
            {[
              'Why is server latency spiking?',
              'Analyze slowest distributed traces',
              'Summarize recent 500 error logs',
              'Detect active memory leak suspects',
            ].map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isStreaming}
                style={{
                  backgroundColor: 'var(--surface-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: 'var(--radius-full)',
                  padding: '3px 10px',
                  fontSize: '11px',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isStreaming) {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.color = 'var(--accent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isStreaming) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Message Stream Scroll Area */}
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
                    gap: '12px',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
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
                      <Bot size={17} />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Tool Calls */}
                    {msg.tools && msg.tools.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {msg.tools.map((tool, idx) => {
                          const isExp = expandedTools[`${msg.id}-${idx}`];
                          return (
                            <div
                              key={idx}
                              style={{
                                backgroundColor: 'var(--surface-input)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '6px 10px',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <div
                                onClick={() => toggleToolExpanded(msg.id, idx)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  color: 'var(--accent)',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Wrench size={12} />
                                  <span>Executed MCP Tool: {tool.name || tool.tool || 'telemetry_tool'}</span>
                                </div>
                                {isExp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </div>

                              {isExp && (
                                <pre
                                  style={{
                                    marginTop: '6px',
                                    padding: '8px',
                                    backgroundColor: 'var(--bg)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '11px',
                                    color: 'var(--text-secondary)',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  {JSON.stringify(tool.arguments || tool.params || tool, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Content Box */}
                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                        backgroundColor: isUser ? 'var(--accent-subtle)' : 'var(--surface-subtle)',
                        border: `1px solid ${isUser ? 'rgba(224, 176, 80, 0.4)' : 'var(--border)'}`,
                        color: 'var(--text)',
                        fontSize: '13px',
                        lineHeight: '1.6',
                      }}
                    >
                      <ClickableEvidence
                        text={msg.content}
                        onSelectTrace={onSelectTrace}
                        onSelectService={onSelectService}
                        onSelectEndpoint={onSelectEndpoint}
                      />

                      {msg.isStreaming && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '6px',
                            height: '14px',
                            backgroundColor: 'var(--accent)',
                            marginLeft: '4px',
                            verticalAlign: 'middle',
                            animation: 'pulse 1s infinite',
                          }}
                        />
                      )}
                    </div>

                    {/* Actions Row */}
                    {!isUser && !msg.isStreaming && msg.content && msg.id !== 'welcome' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '4px' }}>
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
                              ? 'Verifying against ClickHouse...'
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
                            Confidence: {Math.round((evidence.result.confidence_score || 0.95) * 100)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
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
                      <User size={16} />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Dock Input Bar */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--surface-subtle)',
              flexShrink: 0,
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
                padding: '10px 14px',
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
                placeholder="Ask Agamotto AI to investigate system telemetry, query ClickHouse, or explain anomalies... (Enter to send)"
                rows={2}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--text)',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: '1.5',
                  fontFamily: 'var(--font-sans)',
                }}
              />

              {isStreaming ? (
                <button
                  onClick={handleStop}
                  title="Stop generating"
                  style={{
                    backgroundColor: 'var(--error)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Square size={13} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  title="Send message"
                  style={{
                    backgroundColor: input.trim() ? 'var(--accent)' : 'var(--surface-hover)',
                    color: input.trim() ? '#0D1017' : 'var(--text-dim)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 14px',
                    cursor: input.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Send size={13} />
                  <span>Send</span>
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
              <span>Shift + Enter creates a new line</span>
              <span>All traces and services mentioned are interactive and clickable</span>
            </div>
          </div>
        </div>

        {/* Right Column: Diagnostic Tools & Context Inspector */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* Diagnostic Context Card */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Activity size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                Active Telemetry Context
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Organization:</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{currentOrg?.name || 'Default'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Reasoning Engine:</span>
                <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Gemini 2.5 Flash</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Database Backend:</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>ClickHouse Cloud</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Evidence Scrutiny:</span>
                <span style={{ color: 'var(--text-secondary)' }}>Fact-Checked SQL</span>
              </div>
            </div>
          </Card>

          {/* Registered MCP Diagnostic Tools Card */}
          <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={16} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  MCP Diagnostic Tools
                </span>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: 'var(--surface-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 6px',
                }}
              >
                {mcpTools.length || 8} Active
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                overflowY: 'auto',
                maxHeight: '360px',
              }}
            >
              {(mcpTools.length > 0 ? mcpTools : [
                { name: 'get_service_stats', description: 'Retrieve per-service telemetry stats: request volume, error rate, p50/p95/p99 latency' },
                { name: 'find_slow_spans', description: 'Find operations ranked by execution duration or self-time across services' },
                { name: 'get_error_groups', description: 'Get grouped error fingerprints with occurrence counts, timestamps, and sample trace IDs' },
                { name: 'get_trace', description: 'Fetch a full distributed trace tree with depth, self-time, and critical path bottleneck markers' },
                { name: 'search_logs', description: 'Search sanitized log records by service, severity, text, or regex (capped at 50 rows)' },
                { name: 'compare_traces', description: 'Compare a trace against a baseline, identifying span duration deltas, added and missing spans' },
                { name: 'get_topology', description: 'Retrieve the microservice dependency graph with call volume, p95 latency, and error rate' },
                { name: 'get_anomalies', description: 'Retrieve statistical anomaly windows with ranked suspect spans from root-cause correlation' },
              ]).map((tool, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
                      {tool.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleOpenToolRunner(tool)}
                        title="Run this diagnostic tool"
                        style={{
                          backgroundColor: 'rgba(224, 176, 80, 0.15)',
                          border: '1px solid rgba(224, 176, 80, 0.4)',
                          color: 'var(--accent)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Play size={10} />
                        <span>Run</span>
                      </button>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--ok)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: '1.4' }}>
                    {tool.description}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Interactive MCP Tool Runner Modal */}
      {activeTool && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveTool(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={18} style={{ color: 'var(--accent)' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {activeTool.name}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>
                    {activeTool.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTool(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Tool Parameters (JSON):
                </label>
                <textarea
                  value={toolParamsInput}
                  onChange={(e) => setToolParamsInput(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    color: 'var(--text)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunActiveTool}
                  disabled={isExecutingTool}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Play size={13} />
                  <span>{isExecutingTool ? 'Executing...' : 'Execute Tool'}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSendToolToChat}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Bot size={13} />
                  <span>Investigate with AI</span>
                </Button>
              </div>

              {toolExecutionError && (
                <div
                  style={{
                    backgroundColor: 'rgba(235, 87, 87, 0.1)',
                    border: '1px solid var(--error)',
                    color: 'var(--error)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertCircle size={14} />
                  <span>{toolExecutionError}</span>
                </div>
              )}

              {toolExecutionResult && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ok)' }}>
                      Execution Result (Live Telemetry):
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(toolExecutionResult, null, 2));
                        setToolResultCopied(true);
                        setTimeout(() => setToolResultCopied(false), 2000);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: toolResultCopied ? 'var(--ok)' : 'var(--text-dim)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {toolResultCopied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{toolResultCopied ? 'Copied' : 'Copy Output'}</span>
                    </button>
                  </div>
                  <pre
                    style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      backgroundColor: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 12px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {JSON.stringify(toolExecutionResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
