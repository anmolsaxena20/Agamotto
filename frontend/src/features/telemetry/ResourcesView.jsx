import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Modal } from '../../components/Modal.jsx';
import { analyticsService } from '../../services/apiServices.js';
import { useOrg } from '../../context/OrgContext.jsx';
import {
  Cpu,
  HardDrive,
  RefreshCw,
  ChevronRight,
  Activity,
  Layers,
  ExternalLink,
  Gauge,
  Terminal,
  Server,
  Layers2,
} from 'lucide-react';

/**
 * Normalizes raw memory bytes to Megabytes (1 MB = 1024 * 1024 bytes)
 */
function bytesToMb(bytes) {
  if (!bytes || isNaN(bytes)) return 0;
  return Number((Number(bytes) / (1024 * 1024)).toFixed(2));
}

export function ResourcesView({ onSelectService, onSelectTrace, onNavigate }) {
  const { currentOrg } = useOrg();
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedService, setSelectedService] = useState(null);

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

      const getOrCreate = (sName) => {
        if (!serviceMap.has(sName)) {
          serviceMap.set(sName, {
            service: sName,
            cpuPercent: 0,
            memoryMb: 0,
            rssBytes: 0,
            heapUsedBytes: 0,
            heapTotalBytes: 0,
            systemTotalBytes: 0,
            memoryLimitMb: 512,
            v8Spaces: {},
            lastUpdated: null,
          });
        }
        return serviceMap.get(sName);
      };

      // 1. Process overview gauges with attribute awareness
      rawOverview.forEach((item) => {
        const sName = item.service_name || 'unknown';
        const record = getOrCreate(sName);
        const metric = item.metric_name || '';
        const val = Number(item.latest_value || 0);
        if (item.last_updated) record.lastUpdated = item.last_updated;

        let attrs = {};
        try {
          attrs = typeof item.attributes_json === 'string' ? JSON.parse(item.attributes_json) : (item.attributes_json || {});
        } catch {}

        const memType = attrs['memory.type'] || '';
        const v8Space = attrs['v8js.heap.space.name'] || '';

        if (metric.includes('cpu') || metric.includes('eventloop')) {
          record.cpuPercent = Number((val > 1 ? val : val * 100).toFixed(2));
        } else if (metric === 'process.memory.usage') {
          if (memType === 'rss') {
            record.rssBytes = val;
          } else if (memType === 'heap_used') {
            record.heapUsedBytes = val;
          } else if (memType === 'heap_total') {
            record.heapTotalBytes = val;
          } else if (memType === 'system_total' && val > 0) {
            record.systemTotalBytes = val;
          }
        } else if (metric === 'v8js.memory.heap.used' && v8Space) {
          if (!record.v8Spaces[v8Space]) record.v8Spaces[v8Space] = { usedBytes: 0, sizeBytes: 0 };
          record.v8Spaces[v8Space].usedBytes = val;
        } else if (metric === 'v8js.memory.heap.space.size' && v8Space) {
          if (!record.v8Spaces[v8Space]) record.v8Spaces[v8Space] = { usedBytes: 0, sizeBytes: 0 };
          record.v8Spaces[v8Space].sizeBytes = val;
        }
      });

      // 2. Overlay latest CPU reading from timeseries if available
      if (rawCpu.length > 0) {
        const latestCpu = new Map();
        rawCpu.forEach((c) => {
          const sName = c.service_name || 'unknown';
          latestCpu.set(sName, c);
        });
        latestCpu.forEach((c, sName) => {
          const record = getOrCreate(sName);
          const cpuVal = Number(c.avg_cpu_pct || c.max_cpu_pct || 0);
          record.cpuPercent = Number((cpuVal > 1 ? cpuVal : cpuVal * 100).toFixed(2));
        });
      }

      // 3. Overlay latest memory reading from timeseries if available
      if (rawMem.length > 0) {
        rawMem.forEach((m) => {
          const sName = m.service_name || 'unknown';
          const record = getOrCreate(sName);
          let attrs = {};
          try {
            attrs = typeof m.attributes_json === 'string' ? JSON.parse(m.attributes_json) : (m.attributes_json || {});
          } catch {}

          const bytes = Number(m.avg_bytes || m.max_bytes || 0);
          const memType = attrs['memory.type'] || '';
          const v8Space = attrs['v8js.heap.space.name'] || '';

          if (memType === 'rss' && bytes > 0) {
            record.rssBytes = bytes;
          } else if (memType === 'heap_used' && bytes > 0) {
            record.heapUsedBytes = bytes;
          } else if (memType === 'system_total' && bytes > 0) {
            record.systemTotalBytes = bytes;
          } else if (v8Space && bytes > 0) {
            if (!record.v8Spaces[v8Space]) record.v8Spaces[v8Space] = { usedBytes: 0, sizeBytes: 0 };
            record.v8Spaces[v8Space].usedBytes = bytes;
          }
        });
      }

      // 4. Compute realistic footprint & ceiling per service
      serviceMap.forEach((record) => {
        // Compute total V8 heap from spaces if process.memory.usage was absent
        const v8SpacesSum = Object.values(record.v8Spaces).reduce((sum, sp) => sum + (sp.usedBytes || 0), 0);
        const v8SizeSum = Object.values(record.v8Spaces).reduce((sum, sp) => sum + (sp.sizeBytes || 0), 0);

        if (record.rssBytes > 0) {
          record.memoryMb = bytesToMb(record.rssBytes);
        } else if (v8SpacesSum > 0) {
          record.memoryMb = bytesToMb(v8SpacesSum);
        } else if (record.heapUsedBytes > 0) {
          record.memoryMb = bytesToMb(record.heapUsedBytes);
        } else {
          record.memoryMb = 0;
        }

        // Set realistic container memory ceiling
        if (record.systemTotalBytes > 0) {
          record.memoryLimitMb = Math.round(bytesToMb(record.systemTotalBytes));
        } else if (v8SizeSum > 0) {
          // Provide realistic headroom around V8 allocated heap (minimum 512 MB)
          record.memoryLimitMb = Math.max(512, Math.round(bytesToMb(v8SizeSum * 2)));
        } else if (record.heapTotalBytes > 0) {
          record.memoryLimitMb = Math.max(512, Math.round(bytesToMb(record.heapTotalBytes * 2)));
        } else {
          record.memoryLimitMb = 512;
        }
      });

      // 5. Fallback to active registered services if telemetry had 0 rows
      if (serviceMap.size === 0) {
        const srvRes = await analyticsService.getServices(currentOrg.id).catch(() => ({ data: [] }));
        const list = Array.isArray(srvRes?.data) ? srvRes.data : (srvRes?.services || []);
        list.forEach((s) => {
          const sName = s.service_name || s.name || 'unknown';
          getOrCreate(sName);
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

  const handleServiceClick = (svc) => {
    setSelectedService(svc);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">System Resources & Fleet Utilization</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time CPU percentage and RSS/heap memory utilization footprints across active containers. Click any container for deep analysis.
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {services.map((svc) => {
            const memPercent = Math.min(100, Math.round((svc.memoryMb / (svc.memoryLimitMb || 512)) * 100));
            const cpuColor = svc.cpuPercent > 80 ? 'var(--error)' : svc.cpuPercent > 50 ? 'var(--warn)' : 'var(--ok)';
            const memColor = memPercent > 85 ? 'var(--error)' : memPercent > 65 ? 'var(--warn)' : 'var(--accent)';

            return (
              <div
                key={svc.service}
                onClick={() => handleServiceClick(svc)}
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative',
                }}
                className="group"
              >
                <Card
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    transition: 'border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '15px' }}>
                        {svc.service}
                      </span>
                      <ChevronRight
                        size={14}
                        style={{
                          color: 'var(--text-dim)',
                          transition: 'transform 0.15s ease, color 0.15s ease',
                        }}
                      />
                    </div>
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                      Inspect deep analytics &rarr;
                    </span>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Deep Analysis Modal */}
      {selectedService && (
        <Modal
          isOpen={Boolean(selectedService)}
          onClose={() => setSelectedService(null)}
          title={`Deep Resource Inspection · ${selectedService.service}`}
          maxWidth="640px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Quick Status Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                padding: '16px',
                backgroundColor: 'var(--surface-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  CPU Load
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                  {selectedService.cpuPercent.toFixed(2)}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  RAM Footprint
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: '2px' }}>
                  {selectedService.memoryMb.toFixed(2)} MB
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Memory Limit
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', marginTop: '2px' }}>
                  {selectedService.memoryLimitMb || 512} MB
                </div>
              </div>
            </div>

            {/* V8 Heap Spaces Breakdown */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Layers size={15} style={{ color: 'var(--accent)' }} />
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  V8 Heap & Memory Architecture
                </h4>
              </div>

              {Object.keys(selectedService.v8Spaces || {}).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(selectedService.v8Spaces).map(([spaceName, sp]) => {
                    const usedMb = bytesToMb(sp.usedBytes);
                    const sizeMb = bytesToMb(sp.sizeBytes);
                    const pct = sizeMb > 0 ? Math.min(100, Math.round((usedMb / sizeMb) * 100)) : 0;

                    return (
                      <div
                        key={spaceName}
                        style={{
                          backgroundColor: 'var(--surface-input)',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                            {spaceName.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {usedMb.toFixed(2)} MB {sizeMb > 0 ? `/ ${sizeMb.toFixed(2)} MB (${pct}%)` : ''}
                          </span>
                        </div>
                        <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct || (usedMb > 0 ? 100 : 0)}%`,
                              height: '100%',
                              backgroundColor: 'var(--accent)',
                              borderRadius: '2px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--surface-input)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Process RSS:</strong> {selectedService.memoryMb.toFixed(2)} MB
                  </p>
                  <p style={{ margin: 0, fontSize: '12px' }}>
                    Process gauges active. Detailed V8 sub-space breakdown initializes automatically as GC cycles occur.
                  </p>
                </div>
              )}
            </div>

            {/* Cross-Telemetry Action Center */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cross-Telemetry Investigations
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Server}
                  onClick={() => {
                    const s = selectedService.service;
                    setSelectedService(null);
                    if (onSelectService) onSelectService(s);
                  }}
                >
                  Open Microservices View
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={Activity}
                  onClick={() => {
                    setSelectedService(null);
                    if (onNavigate) onNavigate('traces');
                  }}
                >
                  Inspect Traces
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={Terminal}
                  onClick={() => {
                    setSelectedService(null);
                    if (onNavigate) onNavigate('logs');
                  }}
                >
                  Live Telemetry Logs
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
