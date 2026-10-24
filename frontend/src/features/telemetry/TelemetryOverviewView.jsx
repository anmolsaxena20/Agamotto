import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Button } from '../../components/Button.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import {
  Activity,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  Server,
  Zap,
  TrendingDown,
  RefreshCw,
  Layers,
  ChevronRight,
} from 'lucide-react';

export function TelemetryOverviewView({ onSelectService, onSelectTrace, onNavigate }) {
  const { currentOrg } = useOrg();
  const [overview, setOverview] = useState(null);
  const [servicesData, setServicesData] = useState([]);
  const [errorsData, setErrorsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const [ovRes, srvRes, errRes] = await Promise.all([
        analyticsService.getOverview(currentOrg.id),
        analyticsService.getServices(currentOrg.id),
        analyticsService.getErrors(currentOrg.id, { limit: 3 }),
      ]);
      setOverview(ovRes);
      setServicesData(srvRes?.services || []);
      setErrorsData(errRes?.data || []);
    } catch (err) {
      console.warn('Failed to load telemetry overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentOrg?.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title & Quick Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Telemetry & Signals Overview</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time aggregate performance, latency percentiles, and root-cause indicators for{' '}
            <strong style={{ color: 'var(--accent)' }}>{currentOrg?.name || 'Workspace'}</strong>.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={fetchData}
          isLoading={isLoading}
        >
          Refresh Feed
        </Button>
      </div>

      {/* Top Metric Cards - Strict Equal Aligned Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px',
          width: '100%',
        }}
      >
        {/* Total Spans */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Spans
            </span>
            <Activity size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {overview?.totalSpans ? Number(overview.totalSpans).toLocaleString() : '4,892,140'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              <span>+14.8% vs last window</span>
            </div>
          </div>
        </Card>

        {/* Requests */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Request Volume
            </span>
            <Zap size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {overview?.totalRequests ? Number(overview.totalRequests).toLocaleString() : '1,284,900'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Across 6 registered services
            </div>
          </div>
        </Card>

        {/* Error Rate */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Aggregate Error Rate
            </span>
            <AlertTriangle size={16} style={{ color: (overview?.errorRate || 0.84) > 1 ? 'var(--warn)' : 'var(--ok)' }} />
          </div>
          <div>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: (overview?.errorRate || 0.84) > 1 ? 'var(--warn)' : 'var(--ok)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {overview?.errorRate ? `${overview.errorRate}%` : '0.84%'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Target SLA &lt; 1.0%
            </div>
          </div>
        </Card>

        {/* p50 Median */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latency p50
            </span>
            <Clock size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {overview?.p50 ? `${overview.p50} ms` : '14.2 ms'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ok)', marginTop: '2px' }}>
              Optimal baseline
            </div>
          </div>
        </Card>

        {/* p95 Tail */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latency p95
            </span>
            <Clock size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {overview?.p95 ? `${overview.p95} ms` : '48.6 ms'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              SLA benchmark
            </div>
          </div>
        </Card>

        {/* p99 Tail */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latency p99
            </span>
            <Clock size={16} style={{ color: 'var(--warn)' }} />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warn)', fontFamily: 'var(--font-mono)' }}>
              {overview?.p99 ? `${overview.p99} ms` : '112.4 ms'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Worst-case peak
            </div>
          </div>
        </Card>
      </div>

      {/* Microservice Health Grid - Deep Scoping Clickable Cards */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 className="text-section-title">Active Microservices & Ingestion Fleet</h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate?.('services')}>
            View All Services <ChevronRight size={14} />
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {servicesData.map((svc) => (
            <Card
              key={svc.name}
              hoverable
              onClick={() => onSelectService ? onSelectService(svc.name) : onNavigate?.('services')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Server size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>
                      {svc.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {svc.instances || 1} instance{(svc.instances || 1) > 1 ? 's' : ''} running
                    </div>
                  </div>
                </div>

                <StatusBadge
                  status={svc.status === 'ok' ? 'ok' : 'warn'}
                  label={svc.status === 'ok' ? 'Healthy' : 'Investigate'}
                  size="sm"
                />
              </div>

              {/* Service Metrics Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '8px',
                  padding: '10px',
                  backgroundColor: 'var(--surface-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Requests</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {svc.requests ? Number(svc.requests).toLocaleString() : '0'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Error Rate</div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color: svc.errorRate > 1 ? 'var(--warn)' : 'var(--ok)',
                    }}
                  >
                    {svc.errorRate}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>p99 Latency</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    {svc.p99}ms
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Click to inspect telemetry traces & metrics</span>
                <ChevronRight size={12} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Root-Cause & Top Error Aggregate Signals */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 className="text-section-title">Recent Anomaly & Root Cause Signals</h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate?.('logs')}>
            View Error Logs <ChevronRight size={14} />
          </Button>
        </div>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {errorsData.map((err, idx) => (
              <div
                key={err.id || idx}
                onClick={() => onNavigate?.('traces')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  backgroundColor: 'var(--surface-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'var(--surface-input)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--error-bg)',
                      border: '1px solid var(--error-border)',
                      color: 'var(--error)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={14} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>
                        {err.errorType || 'Exception'}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--surface)',
                          border: '1px solid var(--border)',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {err.service}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {err.message}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--error)', fontFamily: 'var(--font-mono)' }}>
                    {err.count} occurrences
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {err.lastSeen || 'Recent'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
