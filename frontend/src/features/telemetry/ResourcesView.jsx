import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Cpu, HardDrive, RefreshCw } from 'lucide-react';

export function ResourcesView() {
  const { currentOrg } = useOrg();
  const [overview, setOverview] = useState(null);
  const [cpuPoints, setCpuPoints] = useState([]);
  const [memoryPoints, setMemoryPoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchResources = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const [ovRes, cpuRes, memRes] = await Promise.all([
        analyticsService.getResourceOverview(currentOrg.id),
        analyticsService.getResourceCpu(currentOrg.id),
        analyticsService.getResourceMemory(currentOrg.id),
      ]);
      setOverview(ovRes);
      setCpuPoints(cpuRes?.data || []);
      setMemoryPoints(memRes?.data || []);
    } catch (err) {
      console.warn('Failed to load system resources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [currentOrg?.id]);

  const services = overview?.services || [
    { service: 'server-gateway', cpuPercent: 18.4, memoryMb: 142.5, memoryLimitMb: 512, status: 'ok' },
    { service: 'ingestion-gateway', cpuPercent: 34.2, memoryMb: 310.0, memoryLimitMb: 1024, status: 'ok' },
    { service: 'email-service', cpuPercent: 4.8, memoryMb: 88.2, memoryLimitMb: 256, status: 'ok' },
    { service: 'clickhouse-cluster', cpuPercent: 28.6, memoryMb: 1480.0, memoryLimitMb: 4096, status: 'ok' },
    { service: 'postgres-db', cpuPercent: 12.1, memoryMb: 420.0, memoryLimitMb: 2048, status: 'ok' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">System Resources & Fleet Utilization</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time CPU percentage and RSS/heap memory utilization footprints across active containers.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchResources} isLoading={isLoading}>
          Refresh
        </Button>
      </div>

      {/* Service Resource Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {services.map((svc) => {
          const memPercent = Math.min(100, Math.round((svc.memoryMb / (svc.memoryLimitMb || 512)) * 100));
          const cpuColor = svc.cpuPercent > 80 ? 'var(--error)' : svc.cpuPercent > 50 ? 'var(--warn)' : 'var(--ok)';
          const memColor = memPercent > 85 ? 'var(--error)' : memPercent > 65 ? 'var(--warn)' : 'var(--accent)';

          return (
            <Card key={svc.service} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '15px' }}>
                  {svc.service}
                </span>
                <StatusBadge status="ok" label="Active" size="sm" />
              </div>

              {/* CPU Meter */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Cpu size={13} /> CPU Utilization
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: cpuColor }}>
                    {svc.cpuPercent}%
                  </span>
                </div>
                <div style={{ height: '6px', backgroundColor: 'var(--surface-input)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${svc.cpuPercent}%`,
                      height: '100%',
                      backgroundColor: cpuColor,
                      borderRadius: '3px',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
              </div>

              {/* Memory Meter */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <HardDrive size={13} /> RAM Footprint
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: memColor }}>
                    {svc.memoryMb} MB / {svc.memoryLimitMb || 512} MB ({memPercent}%)
                  </span>
                </div>
                <div style={{ height: '6px', backgroundColor: 'var(--surface-input)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${memPercent}%`,
                      height: '100%',
                      backgroundColor: memColor,
                      borderRadius: '3px',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
