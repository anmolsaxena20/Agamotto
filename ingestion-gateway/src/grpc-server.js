import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { metrics } from '@opentelemetry/api';
import { mapOtlpTraces, mapOtlpLogs, mapOtlpMetrics } from './otlp-mapper.js';
import { logger } from './observability/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = path.resolve(__dirname, '..', 'proto');
const PROTO_PATH = path.resolve(PROTO_DIR, 'opentelemetry', 'proto', 'collector', 'all.proto');

const log = logger('ingestion-gateway');
const meter = metrics.getMeter('ingestion-gateway.grpc');
const rpcServerCounter = meter.createCounter('rpc.server.request.count');
const rpcServerDuration = meter.createHistogram('rpc.server.duration', { unit: 'ms' });

function apiKey(call) {
  const values = call.metadata.get('x-api-key');
  return typeof values[0] === 'string' ? values[0] : null;
}

export function createIngestionGrpcServer({ store, validateKey }) {
  const definition = protoLoader.loadSync(PROTO_PATH, {
    includeDirs: [PROTO_DIR],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(definition);
  const server = new grpc.Server();

  const handleStandardExport = (signal, mapper, writer) => async (call, callback) => {
    const started = performance.now();
    const respond = (err, resp) => {
      const elapsed = performance.now() - started;
      const status = err ? 'error' : 'success';
      const statusCode = err?.code ?? grpc.status.OK;
      const attrs = { 'rpc.service': signal, 'rpc.status': status, 'rpc.status_code': statusCode };
      rpcServerCounter.add(1, attrs);
      rpcServerDuration.record(elapsed, attrs);
      return callback(err, resp);
    };

    try {
      const organizationId = await validateKey(apiKey(call));
      if (!organizationId) {
        log('WARN', 'gRPC export request rejected: unauthenticated', { 'rpc.service': signal });
        return respond({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid ingestion key' });
      }

      const rows = mapper(call.request);
      const rawPayload = Buffer.from(JSON.stringify(call.request));
      await store.writeBatch({ organizationId, signal, payload: rawPayload });
      if (rows.length > 0) {
        await writer(organizationId, rows);
      }
      log('INFO', `Successfully ingested ${signal} export`, { 'rpc.service': signal, organization_id: organizationId, count: rows.length });
      return respond(null, { partial_success: null });
    } catch (err) {
      log('ERROR', `Telemetry storage is temporarily unavailable during ${signal} export: ${err.message}`, { 'rpc.service': signal, error: err.message });
      return respond({ code: grpc.status.UNAVAILABLE, message: 'Telemetry storage is temporarily unavailable' });
    }
  };

  server.addService(descriptor.opentelemetry.proto.collector.trace.v1.TraceService.service, {
    Export: handleStandardExport('traces', mapOtlpTraces, store.writeTraceSpans),
  });

  server.addService(descriptor.opentelemetry.proto.collector.metrics.v1.MetricsService.service, {
    Export: handleStandardExport('metrics', mapOtlpMetrics, store.writeMetricSamples),
  });

  server.addService(descriptor.opentelemetry.proto.collector.logs.v1.LogsService.service, {
    Export: handleStandardExport('logs', mapOtlpLogs, store.writeLogs),
  });

  return server;
}

export function grpcCredentials() {
  const cert = process.env.GRPC_TLS_CERT_PATH;
  const key = process.env.GRPC_TLS_KEY_PATH;
  if (cert && key) return grpc.ServerCredentials.createSsl(null, [{ cert_chain: readFileSync(cert), private_key: readFileSync(key) }]);
  if (process.env.NODE_ENV === 'production') throw new Error('GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH are required in production');
  return grpc.ServerCredentials.createInsecure();
}
