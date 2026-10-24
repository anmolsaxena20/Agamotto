import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { mapOtlpTraces, mapOtlpLogs, mapOtlpMetrics } from './otlp-mapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = path.resolve(__dirname, '..', 'proto');
const PROTO_PATH = path.resolve(PROTO_DIR, 'opentelemetry', 'proto', 'collector', 'all.proto');

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
    try {
      const organizationId = await validateKey(apiKey(call));
      if (!organizationId) {
        return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid ingestion key' });
      }

      const rows = mapper(call.request);
      const rawPayload = Buffer.from(JSON.stringify(call.request));
      await store.writeBatch({ organizationId, signal, payload: rawPayload });
      if (rows.length > 0) {
        await writer(organizationId, rows);
      }
      return callback(null, { partial_success: null });
    } catch {
      return callback({ code: grpc.status.UNAVAILABLE, message: 'Telemetry storage is temporarily unavailable' });
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
