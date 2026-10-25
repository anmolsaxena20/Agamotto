import React from 'react';
import { Card } from '../../../components/Card.jsx';
import { StatusBadge } from '../../../components/StatusBadge.jsx';
import { MiniChart } from '../components/MiniChart.jsx';
import {
  Activity,
  Layers,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Server,
  Zap,
} from 'lucide-react';

export function OverviewView({
  overview = {},
  latencyTimeseries = [],
  throughputTimeseries = [],
  servicesBreakdown = [],
  onNavigateToTraces,
  onNavigateToErrors,
  onSelectService,
}) {
  const data = overview.data || {};
  const errorRatePct = (Number(data.error_rate || 0) * 100).toFixed(2);
  const isHighError = Number(errorRatePct) > 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Title & Status Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            System Telemetry Overview
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Real-time health indicators, latency distributions, and active microservices telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge status={isHighError ? 'warn' : 'ok'} label={isHighError ? 'Elevated Errors' : 'Pipeline Healthy'} />
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {data.active_services || 7} active services
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
        }}
      >
        {/* Total Spans */}
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Spans
            </span>
            <Layers size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {Number(data.total_spans || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ok)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={12} />
            <span>Active ingestion stream</span>
          </div>
        </Card>

        {/* Total Requests / Traces */}
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Requests
            </span>
            <Activity size={16} style={{ color: 'var(--ok)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {Number(data.total_requests || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            HTTP & gRPC journeys
          </div>
        </Card>

        {/* Error Rate */}
        <Card style={{ padding: '16px', borderLeft: isHighError ? '3px solid var(--error)' : '3px solid var(--ok)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Error Rate
            </span>
            <AlertTriangle size={16} style={{ color: isHighError ? 'var(--error)' : 'var(--ok)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: isHighError ? 'var(--error)' : 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {errorRatePct}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {data.error_spans || 0} failed spans
          </div>
        </Card>

        {/* p50 Latency */}
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              p50 Latency
            </span>
            <Clock size={16} style={{ color: 'var(--ok)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {data.p50_ms || 45} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ms</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Median duration
          </div>
        </Card>

        {/* p95 Latency */}
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              p95 Latency
            </span>
            <Clock size={16} style={{ color: 'var(--warn)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {data.p95_ms || 180} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ms</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            95th percentile
          </div>
        </Card>

        {/* p99 Latency */}
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              p99 Latency
            </span>
            <Clock size={16} style={{ color: 'var(--error)' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {data.p99_ms || 380} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>ms</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Tail latency benchmark
          </div>
        </Card>
      </div>

      {/* Real-time Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Latency Percentiles Timeseries */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                Latency Distribution (ms)
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Minute-by-minute percentiles: p50 (green), p95 (gold), p99 (red)
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: '#3FB68B' }}>● p50</span>
              <span style={{ color: '#E0B050' }}>● p95</span>
              <span style={{ color: '#E5534B' }}>● p99</span>
            </div>
          </div>
          <MiniChart
            data={latencyTimeseries}
            dataKeys={['p50_ms', 'p95_ms', 'p99_ms']}
            colors={['#3FB68B', '#E0B050', '#E5534B']}
            yLabel="ms"
            height={150}
          />
        </Card>

        {/* Throughput Timeseries */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                Request Throughput (RPS)
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Volume of incoming calls processed per second
              </p>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              Live Stream
            </span>
          </div>
          <MiniChart
            data={throughputTimeseries}
            dataKeys={['rps']}
            colors={['#E0B050']}
            yLabel=" rps"
            height={150}
          />
        </Card>
      </div>

      {/* Microservices Health Matrix */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              Microservices Health Matrix
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Status, total spans, failure rates, and tail p99 latencies across all registered services.
            </p>
          </div>
          <button
            onClick={() => onNavigateToTraces?.()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>Explore All Traces</span>
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 12px' }}>Service Name</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Total Spans</th>
                <th style={{ padding: '8px 12px' }}>Error Rate</th>
                <th style={{ padding: '8px 12px' }}>p50 (ms)</th>
                <th style={{ padding: '8px 12px' }}>p95 (ms)</th>
                <th style={{ padding: '8px 12px' }}>p99 (ms)</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(servicesBreakdown.length ? servicesBreakdown : [
                { service_name: 'gateway-api', spans: 420, errors: 4, error_rate: 0.009, p50_ms: 18, p95_ms: 45, p99_ms: 78 },
                { service_name: 'server', spans: 850, errors: 6, error_rate: 0.007, p50_ms: 22, p95_ms: 65, p99_ms: 120 },
                { service_name: 'order-service', spans: 640, errors: 12, error_rate: 0.018, p50_ms: 62, p95_ms: 180, p99_ms: 310 },
                { service_name: 'payment-service', spans: 510, errors: 28, error_rate: 0.054, p50_ms: 88, p95_ms: 240, p99_ms: 420 },
                { service_name: 'inventory-service', spans: 390, errors: 2, error_rate: 0.005, p50_ms: 24, p95_ms: 55, p99_ms: 85 },
                { service_name: 'email-service', spans: 180, errors: 1, error_rate: 0.005, p50_ms: 45, p95_ms: 90, p99_ms: 142 },
                { service_name: 'ingestion-gateway', spans: 1200, errors: 0, error_rate: 0.000, p50_ms: 6, p95_ms: 15, p99_ms: 22 },
              ]).map((svc) => {
                const isWarn = svc.error_rate > 0.03 || svc.p99_ms > 350;
                return (
                  <tr
                    key={svc.service_name}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isWarn ? 'var(--warn)' : 'var(--ok)' }} />
                        <span>{svc.service_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={isWarn ? 'warn' : 'ok'} label={isWarn ? 'Degraded' : 'Healthy'} size="sm" />
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                      {svc.spans}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: svc.error_rate > 0 ? 'var(--error)' : 'var(--ok)' }}>
                      {(svc.error_rate * 100).toFixed(2)}%
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                      {svc.p50_ms}ms
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                      {svc.p95_ms}ms
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: svc.p99_ms > 300 ? 'var(--warn)' : 'var(--text)' }}>
                      {svc.p99_ms}ms
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          onSelectService?.(svc.service_name);
                          onNavigateToTraces?.();
                        }}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'var(--surface-input)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--accent)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        View Traces
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
