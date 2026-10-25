import React from 'react';
import { Card } from '../../../components/Card.jsx';
import { MiniChart } from '../components/MiniChart.jsx';
import {
  BarChart3,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

export function MetricsView({
  metricsData = {},
  latencyTimeseries = [],
  throughputTimeseries = [],
  services = [],
}) {
  const resources = metricsData.data?.resources || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="text-page-title" style={{ marginBottom: '4px' }}>
            System & Runtime Metrics
          </h2>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            Scraped OpenTelemetry runtime observable gauges, memory allocations, CPU utilization, and application throughput.
          </p>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Scrape interval: 60s PeriodicExportingMetricReader
        </div>
      </div>

      {/* Resource Snapshot Cards: CPU & Memory */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* CPU Utilization */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Cpu size={16} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              CPU Utilization (% per Microservice)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {resources.map((res) => {
              const cpuPct = res.cpu_utilization_pct || 8.5;
              const isHigh = cpuPct > 20;
              return (
                <div key={res.service_name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{res.service_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: isHigh ? 'var(--warn)' : 'var(--accent)' }}>
                      {cpuPct}%
                    </span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--surface-input)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, cpuPct * 3)}%`,
                        height: '100%',
                        backgroundColor: isHigh ? 'var(--warn)' : 'var(--accent)',
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Process Memory Consumption */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <HardDrive size={16} style={{ color: 'var(--ok)' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              Memory Consumption (Heap Used vs RSS)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {resources.map((res) => {
              const heapUsed = res.memory_heap_used_mb || 32;
              const heapTotal = res.memory_heap_total_mb || 48;
              const pct = Math.min(100, Math.round((heapUsed / (heapTotal || 1)) * 100));
              return (
                <div key={res.service_name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{res.service_name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {heapUsed}MB / {heapTotal}MB ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--surface-input)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: pct > 80 ? 'var(--warn)' : 'var(--ok)',
                        borderRadius: '3px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Latency & Throughput Timeseries Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Card>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              Execution Latency Percentiles
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Historical p50, p95, and p99 trends across services
            </p>
          </div>
          <MiniChart
            data={latencyTimeseries}
            dataKeys={['p50_ms', 'p95_ms', 'p99_ms']}
            colors={['#3FB68B', '#E0B050', '#E5534B']}
            yLabel="ms"
            height={160}
          />
        </Card>

        <Card>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              Incoming Request Volume (RPS)
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Throughput measured in requests per second
            </p>
          </div>
          <MiniChart
            data={throughputTimeseries}
            dataKeys={['rps']}
            colors={['#E0B050']}
            yLabel=" rps"
            height={160}
          />
        </Card>
      </div>
    </div>
  );
}
