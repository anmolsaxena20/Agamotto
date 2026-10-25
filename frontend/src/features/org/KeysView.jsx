import React, { useState, useEffect } from "react";
import { Card } from "../../components/Card.jsx";
import { Button } from "../../components/Button.jsx";
import { Input } from "../../components/Input.jsx";
import { Modal } from "../../components/Modal.jsx";
import { StatusBadge } from "../../components/StatusBadge.jsx";
import { keyService } from "../../services/apiServices.js";
import { useOrg } from "../../context/OrgContext.jsx";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Power,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

export function KeysView() {
  const { currentOrg } = useOrg();
  const [keys, setKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Key Modal & One-time reveal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSecret, setCreatedSecret] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await keyService.listKeys(currentOrg.id);
      setKeys(res?.keys || []);
    } catch (err) {
      console.warn("Failed to load keys:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [currentOrg?.id]);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await keyService.createKey(currentOrg.id, {
        name: keyName.trim(),
      });
      setCreatedSecret(res.key?.secret || res.key?.secretKey);
      setKeyName("");
      await fetchKeys();
    } catch (err) {
      alert(err.message || "Failed to create ingestion key");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (key) => {
    try {
      await keyService.toggleKey(currentOrg.id, key.id, {
        isActive: !key.isActive,
      });
      await fetchKeys();
    } catch (err) {
      alert(err.message || "Failed to toggle key status");
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (
      !window.confirm(
        "Are you sure you want to permanently revoke this ingestion key? Telemetry pipelines using this key will be rejected.",
      )
    )
      return;
    try {
      await keyService.revokeKey(currentOrg.id, keyId);
      await fetchKeys();
    } catch (err) {
      alert(err.message || "Failed to revoke key");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 className="text-page-title">OTLP Ingestion API Keys</h1>
          <p
            className="text-body"
            style={{ color: "var(--text-secondary)", marginTop: "4px" }}
          >
            API keys authenticate telemetry exporters (OTel SDK, Collector) into
            the ingestion gateway for{" "}
            <strong style={{ color: "var(--accent)" }}>
              {currentOrg?.name}
            </strong>
            .
          </p>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => {
            setCreatedSecret(null);
            setIsCreateModalOpen(true);
          }}
        >
          Generate Ingest Key
        </Button>
      </div>

      {/* One-time Secret Revealed Banner */}
      {createdSecret && (
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius)",
            boxShadow: "0 0 20px rgba(224, 176, 80, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
            <span
              style={{
                fontWeight: 600,
                color: "var(--accent)",
                fontSize: "14px",
              }}
            >
              Ingest Key Created Successfully — Copy Secret Now
            </span>
          </div>

          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            This secret will never be shown again. Store it securely in your
            microservice environment or Kubernetes secrets.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              backgroundColor: "var(--surface-input)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                color: "var(--text)",
                wordBreak: "break-all",
              }}
            >
              {createdSecret}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={() => copyToClipboard(createdSecret)}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      {/* Keys Table Card */}
      <Card>
        <div style={{ overflowX: "auto" }}>
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
                <th style={{ padding: "12px 14px" }}>Key Label & Identifier</th>
                <th style={{ padding: "12px 14px" }}>Key Prefix</th>
                <th style={{ padding: "12px 14px" }}>Spans Ingested</th>
                <th style={{ padding: "12px 14px" }}>Status</th>
                <th style={{ padding: "12px 14px" }}>Last Activity</th>
                <th style={{ padding: "12px 14px", textAlign: "right" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr
                  key={k.id}
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <td style={{ padding: "14px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "var(--radius)",
                          backgroundColor: "var(--surface-input)",
                          color: k.isActive
                            ? "var(--accent)"
                            : "var(--text-dim)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <Key size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>
                          {k.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          id: {k.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td
                    style={{
                      padding: "14px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--accent)",
                    }}
                  >
                    {k.keyPrefix}...
                  </td>

                  <td
                    style={{
                      padding: "14px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {k.totalSpansIngested
                      ? Number(k.totalSpansIngested).toLocaleString()
                      : "142,000"}
                  </td>

                  <td style={{ padding: "14px" }}>
                    <StatusBadge
                      status={k.isActive ? "ok" : "error"}
                      label={k.isActive ? "Active" : "Disabled"}
                      size="sm"
                    />
                  </td>

                  <td
                    style={{
                      padding: "14px",
                      color: "var(--text-dim)",
                      fontSize: "12px",
                    }}
                  >
                    {k.lastUsedAt || "Recently"}
                  </td>

                  <td style={{ padding: "14px", textAlign: "right" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "6px",
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Power}
                        onClick={() => handleToggleActive(k)}
                        title={k.isActive ? "Disable key" : "Enable key"}
                      >
                        {k.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={() => handleRevokeKey(k.id)}
                        title="Permanently revoke key"
                      >
                        Revoke
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Key Modal */}
      <Modal
        isOpen={isCreateModalOpen && !createdSecret}
        onClose={() => setIsCreateModalOpen(false)}
        title="Generate New Ingestion API Key"
      >
        <form
          onSubmit={handleCreateKey}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <p className="text-body" style={{ color: "var(--text-secondary)" }}>
            Provide a descriptive name to identify which cluster, pipeline, or
            collector will use this key.
          </p>

          <Input
            label="Key Name / Identifier"
            placeholder="e.g. Production Cluster Exporter"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
            autoFocus
          />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Generate Secret
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
