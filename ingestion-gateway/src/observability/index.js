import os from 'node:os';
import grpc from '@grpc/grpc-js';
import { context, logs, metrics, propagation, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk;
let shuttingDown = false;

function configuration() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const apiKey = process.env.AGAMOTTO_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error('Missing required observability configuration: OTEL_EXPORTER_OTLP_ENDPOINT and AGAMOTTO_API_KEY');
  }
  const url = endpoint.includes('://') ? new URL(endpoint) : new URL(`https://${endpoint}`);
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must be a gRPC authority, not an RPC path');
  const metadata = new grpc.Metadata();
  metadata.set('x-api-key', apiKey);
  return {
    url: url.port ? `${url.hostname}:${url.port}` : `${url.hostname}:${url.protocol === 'http:' ? '80' : '443'}`,
    credentials: url.protocol === 'http:' ? grpc.credentials.createInsecure() : grpc.credentials.createSsl(),
    metadata,
    timeoutMillis: Number.parseInt(process.env.OTEL_EXPORT_TIMEOUT_MS || '10000', 10),
  };
}

function registerRuntimeMetrics(serviceName) {
  const meter = metrics.getMeter(`${serviceName}.runtime`);

  meter.createObservableGauge('process.memory.usage', (observable) => {
    const mem = process.memoryUsage();
    observable.observe(mem.heapUsed, { 'memory.type': 'heap_used' });
    observable.observe(mem.heapTotal, { 'memory.type': 'heap_total' });
    observable.observe(mem.rss, { 'memory.type': 'rss' });
    observable.observe(os.totalmem() - os.freemem(), { 'memory.type': 'system_used' });
    observable.observe(os.totalmem(), { 'memory.type': 'system_total' });
  });

  let prevCpu = process.cpuUsage();
  let prevTime = Date.now();

  meter.createObservableGauge('process.cpu.utilization', (observable) => {
    const currentCpu = process.cpuUsage(prevCpu);
    const currentTime = Date.now();
    const elapsedMicros = (currentTime - prevTime) * 1000;

    if (elapsedMicros > 0) {
      const totalUsageMicros = currentCpu.user + currentCpu.system;
      const cpuPercent = (totalUsageMicros / (elapsedMicros * os.cpus().length)) * 100;
      observable.observe(Math.min(100, Math.max(0, Number(cpuPercent.toFixed(2)))));
    }

    prevCpu = process.cpuUsage();
    prevTime = currentTime;
  });
}

export async function startTelemetry({ serviceName, serviceVersion }) {
  if (sdk) return sdk;
  const config = configuration();
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    ...(serviceVersion ? { 'service.version': serviceVersion } : {}),
    ...(process.env.NODE_ENV ? { 'deployment.environment.name': process.env.NODE_ENV } : {}),
    ...(process.env.HOSTNAME ? { 'service.instance.id': process.env.HOSTNAME } : {}),
  });

  const traceExporter = new OTLPTraceExporter({
    url: config.url,
    credentials: config.credentials,
    metadata: config.metadata,
    timeoutMillis: config.timeoutMillis,
  });

  const metricExporter = new OTLPMetricExporter({
    url: config.url,
    credentials: config.credentials,
    metadata: config.metadata,
    timeoutMillis: config.timeoutMillis,
  });

  const logExporter = new OTLPLogExporter({
    url: config.url,
    credentials: config.credentials,
    metadata: config.metadata,
    timeoutMillis: config.timeoutMillis,
  });

  sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
    spanProcessors: [new BatchSpanProcessor({ exporter: traceExporter, maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
    metricReaders: [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10), exportTimeoutMillis: 10000 })],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: logExporter, maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
  });

  await Promise.resolve(sdk.start());
  hookConsole(serviceName);
  registerRuntimeMetrics(serviceName);
  return sdk;
}

let originalConsole;

function hookConsole(serviceName) {
  if (originalConsole) return;
  const otelLogger = logs.getLogger(serviceName);
  originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const emitFromConsole = (severityText, orig, args) => {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const message = args.map(arg => typeof arg === 'string' ? arg : arg instanceof Error ? arg.stack || arg.message : JSON.stringify(arg)).join(' ');
    otelLogger.emit({ severityText, body: message, attributes: spanContext ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {} });
    orig.apply(console, args);
  };
  console.log = (...args) => emitFromConsole('INFO', originalConsole.log, args);
  console.info = (...args) => emitFromConsole('INFO', originalConsole.info, args);
  console.warn = (...args) => emitFromConsole('WARN', originalConsole.warn, args);
  console.error = (...args) => emitFromConsole('ERROR', originalConsole.error, args);
}

function unhookConsole() {
  if (!originalConsole) return;
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  originalConsole = undefined;
}

export async function shutdownTelemetry() {
  if (!sdk || shuttingDown) return;
  shuttingDown = true;
  unhookConsole();
  try { await sdk.shutdown(); } finally { sdk = undefined; shuttingDown = false; }
}

export function injectGrpcContext(metadata, activeContext = context.active()) {
  propagation.inject(activeContext, metadata, { set: (carrier, key, value) => carrier.set(key, String(value)) });
  return metadata;
}

export function extractGrpcContext(metadata) {
  return propagation.extract(context.active(), metadata, { get: (carrier, key) => carrier.get(key).map(String), keys: carrier => carrier.getMap ? Object.keys(carrier.getMap()) : [] });
}

export function logger(serviceName) {
  const otelLogger = logs.getLogger(serviceName);
  const out = originalConsole || console;
  return (severityText, body, attributes = {}) => {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const record = { severityText, body, attributes: { ...attributes, ...(spanContext ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {}) } };
    otelLogger.emit(record);
    const targetMethod = severityText === 'ERROR' ? out.error : severityText === 'WARN' ? out.warn : out.log;
    targetMethod.call(console, JSON.stringify({ service: serviceName, severity: severityText, message: body, ...record.attributes }));
  };
}
