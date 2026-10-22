import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { context, logs, propagation, trace } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';

const require = createRequire(import.meta.url);
const moduleDirectory = path.dirname(require.resolve('@opentelemetry/otlp-transformer'));
const { ProtobufTraceSerializer } = require(path.join(moduleDirectory, 'trace/protobuf/trace.cjs'));
const { ProtobufMetricsSerializer } = require(path.join(moduleDirectory, 'metrics/protobuf/metrics.cjs'));
const { ProtobufLogsSerializer } = require(path.join(moduleDirectory, 'logs/protobuf/logs.cjs'));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, '..', '..', 'proto', 'agamotto_telemetry.proto');

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
  return {
    target: url.port ? `${url.hostname}:${url.port}` : `${url.hostname}:${url.protocol === 'http:' ? '80' : '443'}`,
    credentials: url.protocol === 'http:' ? grpc.credentials.createInsecure() : grpc.credentials.createSsl(),
    apiKey,
    timeoutMs: Number.parseInt(process.env.OTEL_EXPORT_TIMEOUT_MS || '10000', 10),
  };
}

class AgamottoGrpcExporter {
  constructor(method, serialize) {
    this.method = method;
    this.serialize = serialize;
    this.config = configuration();
    const definition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const descriptor = grpc.loadPackageDefinition(definition);
    this.client = new descriptor.agamotto.telemetry.AgamottoIngestion(this.config.target, this.config.credentials);
  }

  export(items, callback) {
    let bytes;
    try { bytes = this.serialize(items); } catch (error) { callback({ code: ExportResultCode.FAILED, error }); return; }
    const metadata = new grpc.Metadata();
    metadata.set('x-api-key', this.config.apiKey);
    this.client[this.method]({ otlp_export_request: Buffer.from(bytes) }, metadata, { deadline: Date.now() + this.config.timeoutMs }, error => {
      callback(error ? { code: ExportResultCode.FAILED, error } : { code: ExportResultCode.SUCCESS });
    });
  }

  async shutdown() { this.client.close(); }
  async forceFlush() {}
  selectAggregationTemporality() { return AggregationTemporality.CUMULATIVE; }
}

export class AgamottoTraceExporter extends AgamottoGrpcExporter {
  constructor() { super('ExportTraces', spans => ProtobufTraceSerializer.serializeRequest(spans)); }
}
export class AgamottoMetricExporter extends AgamottoGrpcExporter {
  constructor() { super('ExportMetrics', metrics => ProtobufMetricsSerializer.serializeRequest(metrics)); }
}
export class AgamottoLogExporter extends AgamottoGrpcExporter {
  constructor() { super('ExportLogs', logs => ProtobufLogsSerializer.serializeRequest(logs)); }
}

export async function startTelemetry({ serviceName, serviceVersion }) {
  if (sdk) return sdk;
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    ...(serviceVersion ? { 'service.version': serviceVersion } : {}),
    ...(process.env.NODE_ENV ? { 'deployment.environment.name': process.env.NODE_ENV } : {}),
    ...(process.env.HOSTNAME ? { 'service.instance.id': process.env.HOSTNAME } : {}),
  });
  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor({ exporter: new AgamottoTraceExporter(), maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new AgamottoMetricExporter(), exportIntervalMillis: Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10), exportTimeoutMillis: 10000 })],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new AgamottoLogExporter(), maxQueueSize: 2048, maxExportBatchSize: 512, scheduledDelayMillis: 1000, exportTimeoutMillis: 10000 })],
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
    // Console output remains structured but is deliberately not re-ingested as a log record.
    console[severityText === 'ERROR' ? 'error' : severityText === 'WARN' ? 'warn' : 'log'](JSON.stringify({ service: serviceName, severity: severityText, message: body, ...record.attributes }));
  };
}

