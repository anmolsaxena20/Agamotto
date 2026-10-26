import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import { Cpu, HardDrive, RefreshCw } from 'lucide-react';

export function ResourcesView() {
  const { currentOrg } = useOrg();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchResources = async () => {
    if (!currentOrg?.id) return;
    setIsLoading(true);
    try {
      const [ovRes, cpuRes, memRes] = await Promise.all([
        analyticsService.getResourceOverview(currentOrg.id).catch(() => ({ data: [] })),
        analyticsService.getResourceCpu(currentOrg.id).catch(() => ({ data: [] })),
        analyticsService.getResourceMemory(currentOrg.id).catch(() => ({ data: [] })),
      ]);

      const rawOverview = Array.isArray(ovRes?.data) ? ovRes.data : (ovRes?.services || []);
      const rawCpu = Array.isArray(cpuRes?.data) ? cpuRes.data : [];
      const rawMem = Array.isArray(memRes?.data) ? memRes.data : [];

      const serviceMap = new Map();

      // Process overview gauges with attribute awareness
      rawOverview.forEach((item) => {
        const sName = item.service_name || 'unknown';
        if (!serviceMap.has(sName)) {
          serviceMap.set(sName, { service: sName, cpuPercent: 0, memoryMb: 0, heapMb: 0, memoryLimitMb: 1024 });
        }
        const record = serviceMap.get(sName);
        const metric = item.metric_name || '';
        const val = Number(item.latest_value || 0);
        let attrs = {};
        try {
          attrs = typeof item.attributes_json === 'string' ? JSON.parse(item.attributes_json) : (item.attributes_json || {});
        } catch {}

        const memType = attrs['memory.type'] || '';

        if (metric.includes('cpu') || metric.includes('eventloop')) {
          record.cpuPercent = Number((val > 1 ? val : val * 100).toFixed(2));
        } else if (metric.includes('memory') || metric.includes('heap')) {
          const mb = val > 1000000 ? val / (1024 * 1024) : val;
          if (memType === 'rss') {
            record.memoryMb = Number(mb.toFixed(2));
          } else if (memType === 'heap_used' || metric.includes('heap')) {
            record.heapMb = Number(mb.toFixed(2));
            if (!record.memoryMb) record.memoryMb = Number(mb.toFixed(2));
          } else if (memType === 'system_total' && mb > 0) {
            record.memoryLimitMb = Math.round(mb);
          } else if (!record.memoryMb) {
            record.memoryMb = Number(mb.toFixed(2));
          }
        }
      });

      // Overlay latest cpu reading if timeseries is available
      if (rawCpu.length > 0) {
        // Group by service and take the latest timestamp
        const latestCpuByService = new Map();
        rawCpu.forEach((c) => {
          const sName = c.service_name || 'unknown';
          latestCpuByService.set(sName, c);
        });
        latestCpuByService.forEach((c, sName) => {
          if (!serviceMap.has(sName)) {
            serviceMap.set(sName, { service: sName, cpuPercent: 0, memoryMb: 0, heapMb: 0, memoryLimitMb: 1024 });
          }
          const cpuVal = Number(c.avg_cpu_pct || c.max_cpu_pct || 0);
          serviceMap.get(sName).cpuPercent = Number((cpuVal > 1 ? cpuVal : cpuVal * 100).toFixed(2));
        });
      }

      // Overlay latest memory reading if timeseries is available
      if (rawMem.length > 0) {
        const latestMemByService = new Map();
        rawMem.forEach((m) => {
          const sName = m.service_name || 'unknown';
          let attrs = {};
          try {
            attrs = typeof m.attributes_json === 'string' ? JSON.parse(m.attributes_json) : (m.attributes_json || {});
          } catch {}
          if (attrs['memory.type'] === 'rss' || !latestMemByService.has(sName)) {
            latestMemByService.set(sName, m);
          }
        });
        latestMemByService.forEach((m, sName) => {
          if (!serviceMap.has(sName)) {
            serviceMap.set(sName, { service: sName, cpuPercent: 0, memoryMb: 0, heapMb: 0, memoryLimitMb: 1024 });
          }
          const bytes = Number(m.avg_bytes || m.max_bytes || 0);
          const mb = bytes > 1000000 ? bytes / (1024 * 1024) : bytes;
          if (mb > 0) serviceMap.get(sName).memoryMb = Number(mb.toFixed(2));
        });
      }

      // If metrics table had no active data yet, populate with active registered services with 0 usage (no fake mock data!)
      if (serviceMap.size === 0) {
        const srvRes = await analyticsService.getServices(currentOrg.id).catch(() => ({ data: [] }));
        const list = Array.isArray(srvRes?.data) ? srvRes.data : (srvRes?.services || []);
        list.forEach((s) => {
          const sName = s.service_name || s.name || 'unknown';
          serviceMap.set(sName, {
            service: sName,
            cpuPercent: 0,
            memoryMb: 0,
            heapMb: 0,
            memoryLimitMb: 1024,
          });
        });
      }

      setServices(Array.from(serviceMap.values()));
    } catch (err) {
      console.warn('Failed to load system resources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [currentOrg?.id]);

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
      {services.length === 0 ? (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Cpu size={36} style={{ color: 'var(--text-dim)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            No System Resource Metrics Detected
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
            {isLoading
              ? 'Querying node and container resource metric samples...'
              : 'Container CPU and memory utilization metrics will appear here when telemetry gauges are reported by your ingestion pipeline.'}
          </p>
        </Card>
      ) : (
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
                      {svc.cpuPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--surface-input)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, svc.cpuPercent)}%`,
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
                      {svc.memoryMb.toFixed(2)} MB / {svc.memoryLimitMb || 512} MB ({memPercent}%)
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
      )}
    </div>
  );
}
