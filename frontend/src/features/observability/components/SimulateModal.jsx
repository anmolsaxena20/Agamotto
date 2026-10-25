import React, { useState } from 'react';
import { Zap, AlertTriangle, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/Button.jsx';
import { observabilityApi } from '../../../services/observabilityApi.js';

export function SimulateModal({ isOpen, onClose, onDispatched, services = [] }) {
  if (!isOpen) return null;

  const [type, setType] = useState('traffic'); // 'traffic' | 'error' | 'slow'
  const [targetService, setTargetService] = useState('order-service');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSimulate = async () => {
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await observabilityApi.simulateTelemetry({
        type,
        service: targetService,
      });
      setResult({
        success: true,
        message: res.message || 'Telemetry simulated successfully',
        traceId: res.trace_id,
      });
      onDispatched?.(res.trace_id);
    } catch (err) {
      setResult({
        success: false,
        message: err.message || 'Failed to dispatch simulated telemetry',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Simulate Telemetry Stream
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Dispatch live OpenTelemetry synthetic transactions into the platform to observe real-time trace propagation, latency charts, and log correlation.
          </p>

          {/* Event Type Selection */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
              Simulation Profile
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setType('traffic')}
                style={{
                  padding: '12px',
                  backgroundColor: type === 'traffic' ? 'var(--accent-subtle)' : 'var(--surface-input)',
                  border: `1px solid ${type === 'traffic' ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: type === 'traffic' ? 'var(--accent)' : 'var(--text)' }}>
                  Normal Traffic
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  Fast HTTP 200 distributed trace with DB query
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('error')}
                style={{
                  padding: '12px',
                  backgroundColor: type === 'error' ? 'var(--error-bg)' : 'var(--surface-input)',
                  border: `1px solid ${type === 'error' ? 'var(--error)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: type === 'error' ? 'var(--error)' : 'var(--text)' }}>
                  Error Fault Spike
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  HTTP 500 downstream timeout with stack trace
                </div>
              </button>
            </div>
          </div>

          {/* Target Service */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: '6px' }}>
              Originating Service
            </label>
            <select
              value={targetService}
              onChange={(e) => setTargetService(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surface-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              {(services.length ? services : ['order-service', 'payment-service', 'server', 'gateway-api']).map((svc) => (
                <option key={svc} value={svc} style={{ backgroundColor: 'var(--surface)' }}>
                  {svc}
                </option>
              ))}
            </select>
          </div>

          {/* Result Alert */}
          {result && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: result.success ? 'var(--ok-bg)' : 'var(--error-bg)',
                border: `1px solid ${result.success ? 'var(--ok-border)' : 'var(--error-border)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12px',
                color: result.success ? 'var(--ok)' : 'var(--error)',
              }}
            >
              {result.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <div>
                <div>{result.message}</div>
                {result.traceId && (
                  <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>
                    Trace ID: {result.traceId}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'var(--surface-subtle)',
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSimulate}
            disabled={isSubmitting}
            icon={isSubmitting ? RefreshCw : Zap}
          >
            {isSubmitting ? 'Dispatching...' : 'Dispatch Telemetry'}
          </Button>
        </div>
      </div>
    </div>
  );
}
