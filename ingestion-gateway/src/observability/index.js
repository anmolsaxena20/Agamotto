import grpc from '@grpc/grpc-js';
import { context, logs, propagation, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';

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
    spanProcessors: [new BatchSpanProcessor({ exporter: traceExporter, maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
    metricReaders: [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10), exportTimeoutMillis: 10000 })],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: logExporter, maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
  });

  await Promise.resolve(sdk.start());
  return sdk;
}

export async function shutdownTelemetry() {
  if (!sdk || shuttingDown) return;
  shuttingDown = true;
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
  return (severityText, body, attributes = {}) => {
    const spanContext = trace.getSpan(context.active())?.spanContext();
    const record = { severityText, body, attributes: { ...attributes, ...(spanContext ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {}) } };
    otelLogger.emit(record);
    console[severityText === 'ERROR' ? 'error' : severityText === 'WARN' ? 'warn' : 'log'](JSON.stringify({ service: serviceName, severity: severityText, message: body, ...record.attributes }));
  };
}
