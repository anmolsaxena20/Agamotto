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
      setDataPoints(res?.data || []);
      if (res?.currentRps != null) setCurrentRps(res.currentRps);
      if (res?.peakRps != null) setPeakRps(res.peakRps);
    } catch (err) {
      console.warn('Failed to load throughput:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchThroughput();
  }, [currentOrg?.id]);

  const maxRps = Math.max(...dataPoints.map((d) => d.rps || 0), 100);

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
              height: '220px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {dataPoints.map((pt, i) => {
              const barHeight = (pt.rps / maxRps) * 180;
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
                    gap: '6px',
                  }}
                >
                  <div
                    title={`${pt.time}: ${pt.rps} RPS (${pt.spansPerSec || 0} spans/sec)`}
                    style={{
                      width: '100%',
                      maxWidth: '24px',
                      height: `${Math.max(6, barHeight)}px`,
                      backgroundColor: 'var(--accent)',
                      borderRadius: '3px 3px 0 0',
                      boxShadow: '0 0 10px rgba(224, 176, 80, 0.2)',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: 'var(--text-dim)', transform: 'rotate(-45deg)' }}>
                    {pt.time}
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
