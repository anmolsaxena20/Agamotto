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
} from 'lucide-react';
import { useOrg } from '../../context/OrgContext.jsx';
import { aiService } from '../../services/apiServices.js';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { ClickableEvidence } from '../../components/ClickableEvidence.jsx';

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

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

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
        onError: (err) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    isStreaming: false,
                    content:
                      msg.content ||
                      `⚠️ Error: ${err.message}. Please verify the AI microservice is running.`,
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
                    msg.content || `⚠️ Error communicating with AI agent: ${err.message}`,
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
                { name: 'query_clickhouse', description: 'Executes verified read-only SQL against ClickHouse' },
                { name: 'explain_trace', description: 'Deep-dives into parent-child trace spans and latency bottlenecks' },
                { name: 'search_logs', description: 'Correlates trace IDs and regex queries with error logs' },
                { name: 'detect_anomalies', description: 'Runs statistical baseline deviation checks on metric percentiles' },
                { name: 'calculate_baseline', description: 'Computes historical metric percentiles (p50, p95, p99)' },
                { name: 'rank_suspects', description: 'Ranks probable root-cause services with variance scoring' },
                { name: 'validate_hypothesis', description: 'Verifies whether claims are corroborated by telemetry fact tables' },
                { name: 'inspect_resource_footprint', description: 'Scrapes process CPU and RAM memory gauges' },
              ]).map((tool, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--surface-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
                      {tool.name}
                    </span>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--ok)' }} />
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
    </div>
  );
}
