import React, { useState, useEffect, useCallback } from 'react';
import { TopBar } from './components/TopBar.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { OverviewView } from './views/OverviewView.jsx';
import { TracesView } from './views/TracesView.jsx';
import { SpansView } from './views/SpansView.jsx';
import { LogsView } from './views/LogsView.jsx';
import { MetricsView } from './views/MetricsView.jsx';
import { TopologyView } from './views/TopologyView.jsx';
import { ErrorsView } from './views/ErrorsView.jsx';
import { TraceWaterfallModal } from './views/TraceWaterfallModal.jsx';
import { SimulateModal } from './components/SimulateModal.jsx';
import { SettingsView } from '../settings/SettingsView.jsx';
import { observabilityApi } from '../../services/observabilityApi.js';

export function ObservabilityApp({ user, organization, onSignOut }) {
  const [activeView, setActiveView] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get('view') || window.location.hash.replace('#', '');
      if (viewParam) return viewParam;
    } catch (_) {}
    return 'settings';
  });
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedService, setSelectedService] = useState('all');
  const [isLive, setIsLive] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [activeTraceId, setActiveTraceId] = useState(null);

  // Observability Telemetry State
  const [overview, setOverview] = useState({ data: {} });
  const [traces, setTraces] = useState([]);
  const [spans, setSpans] = useState([]);
  const [logs, setLogs] = useState([]);
  const [metricsData, setMetricsData] = useState({});
  const [latencyTimeseries, setLatencyTimeseries] = useState([]);
  const [throughputTimeseries, setThroughputTimeseries] = useState([]);
  const [servicesBreakdown, setServicesBreakdown] = useState([]);
  const [topology, setTopology] = useState({});
  const [errors, setErrors] = useState([]);

  // Fetch telemetry data from server
  const fetchTelemetry = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [
        overviewRes,
        tracesRes,
        spansRes,
        logsRes,
        metricsRes,
        latencyTimeseriesRes,
        throughputTimeseriesRes,
        servicesRes,
        topologyRes,
        errorsRes,
      ] = await Promise.all([
        observabilityApi.getOverview({ timeRange }).catch(() => ({ data: {} })),
        observabilityApi.getTraces({ service: selectedService, limit: 50 }).catch(() => ({ data: [] })),
        observabilityApi.getSpans({ service: selectedService, limit: 50 }).catch(() => ({ data: [] })),
        observabilityApi.getLogs({ service: selectedService, limit: 50 }).catch(() => ({ data: [] })),
        observabilityApi.getMetrics({ service: selectedService }).catch(() => ({ data: {} })),
        observabilityApi.getLatencyTimeseries({ service: selectedService }).catch(() => ({ data: [] })),
        observabilityApi.getThroughput({ service: selectedService }).catch(() => ({ data: [] })),
        observabilityApi.getServices().catch(() => ({ data: [] })),
        observabilityApi.getTopology().catch(() => ({ data: {} })),
        observabilityApi.getErrors().catch(() => ({ data: [] })),
      ]);

      setOverview(overviewRes || { data: {} });
      setTraces(tracesRes.data || []);
      setSpans(spansRes.data || []);
      setLogs(logsRes.data || []);
      setMetricsData(metricsRes || {});
      setLatencyTimeseries(latencyTimeseriesRes.data || []);
      setThroughputTimeseries(throughputTimeseriesRes.data || []);
      setServicesBreakdown(servicesRes.data || []);
      setTopology(topologyRes || {});
      setErrors(errorsRes.data || []);
    } catch (err) {
      console.warn('Telemetry fetch error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedService, timeRange]);

  // Initial load
  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  // Live Auto-Refresh polling (every 5 seconds)
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLive, fetchTelemetry]);

  const servicesList = overview.data?.services || [
    'server',
    'email-service',
    'ingestion-gateway',
    'gateway-api',
    'order-service',
    'payment-service',
    'inventory-service',
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Global Top Bar */}
      <TopBar
        services={servicesList}
        selectedService={selectedService}
        onSelectService={setSelectedService}
        timeRange={timeRange}
        onSelectTimeRange={setTimeRange}
        isLive={isLive}
        onToggleLive={() => setIsLive(!isLive)}
        onOpenSimulate={() => setIsSimulateOpen(true)}
        onRefresh={fetchTelemetry}
        isRefreshing={isRefreshing}
        user={user}
        organization={organization}
        onSignOut={onSignOut}
        onNavigateSettings={() => setActiveView('settings')}
      />

      {/* Main Container with Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          counts={{
            traces: traces.length,
            spans: spans.length,
            logs: logs.length,
            errors: errors.length,
          }}
        />

        {/* View Workspace */}
        <main
          style={{
            flex: 1,
            padding: '24px 32px',
            maxWidth: '1600px',
            margin: '0 auto',
            width: '100%',
            overflowX: 'hidden',
          }}
        >
          {activeView === 'overview' && (
            <OverviewView
              overview={overview}
              latencyTimeseries={latencyTimeseries}
              throughputTimeseries={throughputTimeseries}
              servicesBreakdown={servicesBreakdown}
              onNavigateToTraces={() => setActiveView('traces')}
              onNavigateToErrors={() => setActiveView('errors')}
              onSelectService={(svc) => setSelectedService(svc)}
            />
          )}

          {activeView === 'traces' && (
            <TracesView
              traces={traces}
              services={servicesList}
              selectedService={selectedService}
              onSelectService={setSelectedService}
              onOpenTraceWaterfall={(tId) => setActiveTraceId(tId)}
            />
          )}

          {activeView === 'spans' && (
            <SpansView
              spans={spans}
              services={servicesList}
              onOpenTraceWaterfall={(tId) => setActiveTraceId(tId)}
            />
          )}

          {activeView === 'logs' && (
            <LogsView
              logs={logs}
              services={servicesList}
              selectedService={selectedService}
              onSelectService={setSelectedService}
              onOpenTraceWaterfall={(tId) => setActiveTraceId(tId)}
            />
          )}

          {activeView === 'metrics' && (
            <MetricsView
              metricsData={metricsData}
              latencyTimeseries={latencyTimeseries}
              throughputTimeseries={throughputTimeseries}
              services={servicesList}
            />
          )}

          {activeView === 'topology' && (
            <TopologyView
              topology={topology}
              onSelectService={(svc) => {
                setSelectedService(svc);
                setActiveView('traces');
              }}
              onNavigateToTraces={() => setActiveView('traces')}
            />
          )}

          {activeView === 'errors' && (
            <ErrorsView
              errors={errors}
              onOpenTraceWaterfall={(tId) => setActiveTraceId(tId)}
            />
          )}

          {(activeView === 'settings' || activeView === 'members') && (
            <SettingsView
              user={user}
              organization={organization}
              services={servicesList}
            />
          )}
        </main>
      </div>

      {/* Trace Waterfall Modal */}
      {activeTraceId && (
        <TraceWaterfallModal
          traceId={activeTraceId}
          onClose={() => setActiveTraceId(null)}
          onNavigateToLogs={(tId) => {
            setActiveTraceId(null);
            setActiveView('logs');
          }}
        />
      )}

      {/* Traffic & Chaos Simulation Modal */}
      <SimulateModal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        services={servicesList}
        onDispatched={(traceId) => {
          fetchTelemetry();
          if (traceId) {
            setActiveTraceId(traceId);
          }
        }}
      />
    </div>
  );
}
