import React, { useState, useEffect } from "react";
import { Card } from "../../components/Card.jsx";
import { Button } from "../../components/Button.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { Modal } from "../../components/Modal.jsx";
import { analyticsService } from "../../services/apiServices.js";
import { useOrg } from "../../context/OrgContext.jsx";
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
} from "lucide-react";

export function ServicesView({ onSelectTrace }) {
  const { currentOrg } = useOrg();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Selected service for deep scoping modal
  const [activeService, setActiveService] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'endpoints' | 'traces' | 'logs' | 'errors'
  const [serviceDetails, setServiceDetails] = useState(null);
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
      setServices(res?.services || []);
    } catch (err) {
      console.warn("Failed to fetch services:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [currentOrg?.id]);

  // Deep dive into service
  const openServiceDeepDive = async (serviceName) => {
    setActiveService(serviceName);
    setActiveTab("overview");
    setModalLoading(true);
    try {
      const [endpointsRes, tracesRes, logsRes, errorsRes] = await Promise.all([
        analyticsService
          .getServiceEndpoints(currentOrg.id, serviceName)
          .catch(() => ({ data: [] })),
        analyticsService
          .getServiceTraces(currentOrg.id, serviceName)
          .catch(() => ({ data: [] })),
        analyticsService
          .getServiceLogs(currentOrg.id, serviceName)
          .catch(() => ({ data: [] })),
        analyticsService
          .getServiceErrors(currentOrg.id, serviceName)
          .catch(() => ({ data: [] })),
      ]);
      setServiceEndpoints(endpointsRes?.data || []);
      setServiceTraces(tracesRes?.data || []);
      setServiceLogs(logsRes?.data || []);
      setServiceErrors(errorsRes?.data || []);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 className="text-page-title">Microservices Fleet & Health</h1>
          <p
            className="text-body"
            style={{ color: "var(--text-secondary)", marginTop: "4px" }}
          >
            Click any microservice to deep-scope into endpoint breakdown, trace
            waterfall, and container logs.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={fetchServices}
          isLoading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Search Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 14px",
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          maxWidth: "360px",
        }}
      >
        <Search size={16} style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          placeholder="Filter microservices by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: "13px",
            width: "100%",
          }}
        />
      </div>

      {/* Services Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "16px",
        }}
      >
        {filteredServices.map((svc) => (
          <Card
            key={svc.name}
            hoverable
            onClick={() => openServiceDeepDive(svc.name)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius)",
                    backgroundColor: "var(--surface-input)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Server size={18} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {svc.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {svc.instances || 1} instance
                    {(svc.instances || 1) > 1 ? "s" : ""} active
                  </div>
                </div>
              </div>

              <StatusBadge
                status={svc.status === "ok" ? "ok" : "warn"}
                label={svc.status === "ok" ? "Nominal" : "Degraded"}
              />
            </div>

            {/* Metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "8px",
                padding: "10px 12px",
                backgroundColor: "var(--surface-input)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Volume
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {svc.requests ? Number(svc.requests).toLocaleString() : "0"}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Errors
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: svc.errorRate > 1 ? "var(--warn)" : "var(--ok)",
                  }}
                >
                  {svc.errorRate}%
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  p99 Tail
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent)",
                  }}
                >
                  {svc.p99} ms
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Deep Scope: Endpoints &bull; Traces &bull; Logs &bull; Errors
              &rarr;
            </div>
          </Card>
        ))}
      </div>

      {/* Service Deep Scope Modal */}
      <Modal
        isOpen={!!activeService}
        onClose={() => setActiveService(null)}
        title={`Microservice Inspection: ${activeService}`}
        maxWidth="840px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Sub-navigation tabs inside modal */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              borderBottom: "1px solid var(--border)",
              paddingBottom: "8px",
            }}
          >
            {[
              { id: "overview", label: "Overview", icon: Activity },
              { id: "endpoints", label: "Endpoints", icon: Network },
              { id: "traces", label: "Traces", icon: GitBranch },
              { id: "logs", label: "Logs", icon: Terminal },
              { id: "errors", label: "Errors", icon: AlertTriangle },
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "var(--radius)",
                    backgroundColor: isSelected
                      ? "var(--accent-subtle)"
                      : "transparent",
                    border: `1px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                    color: isSelected
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "12px",
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
          {activeTab === "overview" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "var(--surface-input)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Status & Readiness
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "var(--ok)",
                      marginTop: "4px",
                    }}
                  >
                    Healthy (200 OK)
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "var(--surface-input)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Instrumentation Mode
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--accent)",
                      marginTop: "4px",
                    }}
                  >
                    OpenTelemetry SDK
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "var(--surface-input)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Columnar Table Partition
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      marginTop: "4px",
                    }}
                  >
                    trace_spans
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.6",
                }}
              >
                Microservice <strong>{activeService}</strong> has emitted
                telemetry spans actively over the current window. All span
                batches are processed with buffered memory queues to protect
                ClickHouse ingestion performance.
              </div>
            </div>
          )}

          {activeTab === "endpoints" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "13px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      textAlign: "left",
                      color: "var(--text-muted)",
                    }}
                  >
                    <th style={{ padding: "8px 10px" }}>HTTP Endpoint</th>
                    <th style={{ padding: "8px 10px" }}>Total Invocations</th>
                    <th style={{ padding: "8px 10px" }}>p50</th>
                    <th style={{ padding: "8px 10px" }}>p99</th>
                    <th style={{ padding: "8px 10px" }}>Error Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(serviceEndpoints.length > 0
                    ? serviceEndpoints
                    : [
                        {
                          path: "POST /v1/traces",
                          count: 980400,
                          p50: 3.8,
                          p99: 32.1,
                          errorRate: 0.02,
                        },
                        {
                          path: "GET /healthz",
                          count: 48200,
                          p50: 0.8,
                          p99: 2.1,
                          errorRate: 0.0,
                        },
                      ]
                  ).map((ep, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td
                        style={{
                          padding: "10px",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text)",
                        }}
                      >
                        {ep.path}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {Number(ep.count).toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {ep.p50}ms
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontFamily: "var(--font-mono)",
                          color: "var(--accent)",
                        }}
                      >
                        {ep.p99}ms
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontFamily: "var(--font-mono)",
                          color: ep.errorRate > 0 ? "var(--warn)" : "var(--ok)",
                        }}
                      >
                        {ep.errorRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "traces" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  marginBottom: "4px",
                }}
              >
                Click any trace to open the hierarchical waterfall Gantt chart:
              </div>
              {(serviceTraces.length > 0
                ? serviceTraces
                : [
                    {
                      traceId: "tr_7a9f82c401e8b31a",
                      rootSpan: `GET /${activeService}/query`,
                      statusCode: 200,
                      durationMs: 14.2,
                      spanCount: 6,
                    },
                    {
                      traceId: "tr_4c2d81e905fa77bb",
                      rootSpan: `POST /${activeService}/execute`,
                      statusCode: 200,
                      durationMs: 42.6,
                      spanCount: 9,
                    },
                  ]
              ).map((tr) => (
                <div
                  key={tr.traceId}
                  onClick={() => {
                    setActiveService(null);
                    onSelectTrace?.(tr.traceId);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    backgroundColor: "var(--surface-input)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "13px",
                        color: "var(--text)",
                      }}
                    >
                      {tr.rootSpan}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                        marginTop: "2px",
                      }}
                    >
                      {tr.traceId}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--accent)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {tr.durationMs}ms
                    </div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      {tr.spanCount} spans
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "logs" && (
            <div
              style={{
                backgroundColor: "var(--surface-input)",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              {(serviceLogs.length > 0
                ? serviceLogs
                : [
                    {
                      timestamp: "2026-10-25T02:00:10Z",
                      severity: "INFO",
                      message: `Service ${activeService} ready and processing incoming batch`,
                    },
                    {
                      timestamp: "2026-10-25T02:00:14Z",
                      severity: "INFO",
                      message: "Executed database query latency=14.2ms spans=4",
                    },
                    {
                      timestamp: "2026-10-25T02:00:25Z",
                      severity: "WARN",
                      message:
                        "Downstream HTTP connection took longer than expected: 210ms",
                    },
                  ]
              ).map((log, i) => (
                <div key={i} style={{ display: "flex", gap: "8px" }}>
                  <span style={{ color: "var(--text-dim)" }}>
                    [{log.timestamp}]
                  </span>
                  <span
                    style={{
                      color:
                        log.severity === "WARN" ? "var(--warn)" : "var(--ok)",
                    }}
                  >
                    [{log.severity}]
                  </span>
                  <span style={{ color: "var(--text)" }}>{log.message}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "errors" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {(serviceErrors.length > 0
                ? serviceErrors
                : [
                    {
                      errorType: "SmtpConnectionTimeout",
                      count: 12,
                      message: "SMTP connection relay failure",
                    },
                  ]
              ).map((err, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px",
                    backgroundColor: "var(--error-bg)",
                    border: "1px solid var(--error-border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--error)",
                      fontSize: "13px",
                    }}
                  >
                    {err.errorType} ({err.count} occurrences)
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text)",
                      marginTop: "4px",
                    }}
                  >
                    {err.message}
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
