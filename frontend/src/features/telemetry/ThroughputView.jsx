import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Zap, Activity, RefreshCw } from 'lucide-react';

export function ThroughputView() {
  const { currentOrg } = useOrg();
  const [dataPoints, setDataPoints] = useState([]);
  const [currentRps, setCurrentRps] = useState(0);
  const [peakRps, setPeakRps] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchThroughput = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const res = await analyticsService.getThroughput(currentOrg.id);
      const raw = Array.isArray(res?.data) ? res.data : [];

      // Group & aggregate by minute timestamp across services if multiple
      const timeMap = new Map();
      raw.forEach((pt) => {
        const rawTime = pt.timestamp || pt.time || '';
        const timeKey = typeof rawTime === 'string' && rawTime.includes(' ')
          ? rawTime.split('.')[0]
          : rawTime;
        const rps = Number(pt.rps || (pt.request_count ? pt.request_count / 60 : 0));
        const count = Number(pt.request_count || 0);

        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, {
            time: timeKey,
            timestamp: timeKey,
            rps: 0,
            request_count: 0,
          });
        }
        const entry = timeMap.get(timeKey);
        entry.rps += rps;
        entry.request_count += count;
      });

      const normalized = Array.from(timeMap.values());
      setDataPoints(normalized);

      // Compute current and peak RPS
      if (res?.currentRps != null) {
        setCurrentRps(Number(res.currentRps.toFixed(2)));
      } else if (normalized.length > 0) {
        const latest = normalized[normalized.length - 1];
        setCurrentRps(Number((latest.rps || 0).toFixed(2)));
      } else {
        setCurrentRps(0);
      }

      if (res?.peakRps != null) {
        setPeakRps(Number(res.peakRps.toFixed(2)));
      } else if (normalized.length > 0) {
        const max = Math.max(...normalized.map((d) => d.rps || 0));
        setPeakRps(Number(max.toFixed(2)));
      } else {
        setPeakRps(0);
      }
    } catch (err) {
      console.warn('Failed to load throughput:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThroughput();
  }, [currentOrg?.id]);

  const maxRps = Math.max(...dataPoints.map((d) => d.rps || 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Throughput & RPS Volume</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time requests per second and batch span ingestion volume over time.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchThroughput} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <Card>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Rate</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {currentRps} RPS
          </div>
          <div style={{ fontSize: '11px', color: currentRps > 0 ? 'var(--ok)' : 'var(--text-dim)', marginTop: '2px' }}>
            {currentRps > 0 ? 'Active ingestion rate' : 'Idle ingestion'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peak Ingestion Rate</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            {peakRps} RPS
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {peakRps > 0 ? 'Recorded peak window' : 'No load spikes recorded'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Batch Ingestion Safeguard</div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--ok)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
            Active
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Buffered memory queue enabled</div>
        </Card>
      </div>

      {/* Throughput Curve */}
      <Card>
        <h2 className="text-section-title" style={{ fontSize: '15px', marginBottom: '16px' }}>
          Throughput Timeline (Requests per Second)
        </h2>

        {dataPoints.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No throughput data points recorded for this workspace window.
          </div>
        ) : (
          <div
            style={{
              height: '240px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '6px',
              padding: '10px 0 24px',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {dataPoints.map((pt, i) => {
              const barHeight = (pt.rps / maxRps) * 160;
              const formattedTime = typeof pt.time === 'string' && pt.time.includes(' ')
                ? pt.time.split(' ')[1]?.slice(0, 5) || pt.time
                : (pt.time || 'N/A');

              return (
                <div
                  key={i}
                  style={{
                    flex: '0 0 auto',
                    minWidth: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    gap: '6px',
                  }}
                >
                  <div
                    title={`${pt.time}: ${Number(pt.rps).toFixed(2)} RPS (${pt.request_count || 0} reqs/min)`}
                    style={{
                      width: '16px',
                      height: `${Math.max(6, barHeight)}px`,
                      backgroundColor: 'var(--accent)',
                      borderRadius: '3px 3px 0 0',
                      boxShadow: '0 0 8px rgba(224, 176, 80, 0.25)',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--text-dim)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap', marginTop: '4px' }}>
                    {formattedTime}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
