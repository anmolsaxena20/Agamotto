import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { formatLatency } from '../../utils/formatters.js';
import { Clock, RefreshCw, TrendingUp } from 'lucide-react';

export function LatencyView() {
  const { currentOrg } = useOrg();
  const [distributions, setDistributions] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const [distRes, tsRes] = await Promise.all([
        analyticsService.getLatency(currentOrg.id),
        analyticsService.getLatencyTimeseries(currentOrg.id),
      ]);
      const rawDist = Array.isArray(distRes?.data) ? distRes.data : (Array.isArray(distRes) ? distRes : (distRes?.distributions || []));
      setDistributions(rawDist);

      const rawTs = Array.isArray(tsRes?.data) ? tsRes.data : (Array.isArray(tsRes) ? tsRes : (tsRes?.timeseries || []));
      setTimeseries(rawTs);
    } catch (err) {
      console.warn('Failed to fetch latency data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentOrg?.id]);

  // Compute max p99 in timeseries for visual scaling
  const maxLatency = Math.max(...timeseries.map((t) => (t.p99_ms ?? t.p99 ?? 100)), 120);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Latency Percentiles & Distribution</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            High-precision <code>quantileTDigest(p)(duration_ns)</code> tail latency calculation across microservices.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchData} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Latency Timeseries Chart Card */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 className="text-section-title" style={{ fontSize: '15px' }}>24-Hour Percentile Trends (p50, p95, p99)</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Bucketed minute by minute</div>
          </div>

          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 600 }}>
            <span style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--ok)', borderRadius: '2px' }} />
              p50 (Median)
            </span>
            <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--accent)', borderRadius: '2px' }} />
              p95 (SLA)
            </span>
            <span style={{ color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: 'var(--warn)', borderRadius: '2px' }} />
              p99 (Tail)
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        {timeseries.length === 0 ? (
          <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            {isLoading ? 'Computing latency distributions...' : 'No timeseries latency data recorded yet.'}
          </div>
        ) : (
          <div
            style={{
              height: '200px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {timeseries.slice(-20).map((pt, i) => {
              const p50Val = pt.p50_ms ?? pt.p50 ?? 0;
              const p95Val = pt.p95_ms ?? pt.p95 ?? 0;
              const p99Val = pt.p99_ms ?? pt.p99 ?? 0;
              const timeLabel = pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (pt.time || '');

              const h50 = (p50Val / maxLatency) * 160;
              const h95 = (p95Val / maxLatency) * 160;
              const h99 = (p99Val / maxLatency) * 160;

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', width: '100%', justifyContent: 'center' }}>
                    <div
                      title={`p50: ${formatLatency(p50Val)}`}
                      style={{
                        width: '6px',
                        height: `${Math.max(4, h50)}px`,
                        backgroundColor: 'var(--ok)',
                        borderRadius: '2px 2px 0 0',
                      }}
                    />
                    <div
                      title={`p95: ${formatLatency(p95Val)}`}
                      style={{
                        width: '6px',
                        height: `${Math.max(6, h95)}px`,
                        backgroundColor: 'var(--accent)',
                        borderRadius: '2px 2px 0 0',
                      }}
                    />
                    <div
                      title={`p99: ${formatLatency(p99Val)}`}
                      style={{
                        width: '6px',
                        height: `${Math.max(8, h99)}px`,
                        backgroundColor: 'var(--warn)',
                        borderRadius: '2px 2px 0 0',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '9px', color: 'var(--text-dim)', transform: 'rotate(-45deg)', marginTop: '8px' }}>
                    {timeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Per-Microservice Percentile Table */}
      <Card>
        <h2 className="text-section-title" style={{ fontSize: '15px', marginBottom: '14px' }}>
          Service Percentile Breakdown
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 14px' }}>Microservice</th>
                <th style={{ padding: '10px 14px' }}>p50 Median</th>
                <th style={{ padding: '10px 14px' }}>p90 SLA</th>
                <th style={{ padding: '10px 14px' }}>p95 SLA</th>
                <th style={{ padding: '10px 14px' }}>p99 Tail</th>
                <th style={{ padding: '10px 14px' }}>p99.9 Peak</th>
              </tr>
            </thead>
            <tbody>
              {distributions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {isLoading ? 'Loading latency breakdown...' : 'No microservice latency records available.'}
                  </td>
                </tr>
              ) : (
                distributions.map((dist, idx) => {
                  const svcName = dist.service_name || dist.service || 'unknown';
                  const p50 = dist.p50_ms ?? dist.p50 ?? 0;
                  const p90 = dist.p90_ms ?? dist.p90 ?? 0;
                  const p95 = dist.p95_ms ?? dist.p95 ?? 0;
                  const p99 = dist.p99_ms ?? dist.p99 ?? 0;
                  const p999 = dist.p999_ms ?? dist.p999 ?? 0;

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>
                        {svcName}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--ok)' }}>
                        {formatLatency(p50)}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {formatLatency(p90)}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                        {formatLatency(p95)}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--warn)', fontWeight: 600 }}>
                        {formatLatency(p99)}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--error)' }}>
                        {formatLatency(p999)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
