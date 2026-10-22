import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { decodeTraceSpans } from './otlp-trace-decoder.js';
import { decodeLogRecords } from './otlp-log-decoder.js';
import { decodeMetricSamples } from './otlp-metric-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, '..', 'proto', 'agamotto_telemetry.proto');

function apiKey(call) {
  const values = call.metadata.get('x-api-key');
  return typeof values[0] === 'string' ? values[0] : null;
}

export function createIngestionGrpcServer({ store, validateKey }) {
  const definition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
  const descriptor = grpc.loadPackageDefinition(definition);
  const server = new grpc.Server();
  const handle = signal => async (call, callback) => {
    try {
      const organizationId = await validateKey(apiKey(call));
      if (!organizationId) return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid ingestion key' });
      const payload = call.request.otlp_export_request;
      if (!(payload instanceof Uint8Array) || payload.length === 0) return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Missing OTLP export request payload' });
      if (payload.length > Number.parseInt(process.env.MAX_OTLP_BATCH_BYTES || '4194304', 10)) return callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: 'OTLP batch exceeds configured limit' });
      await store.writeBatch({ organizationId, signal, payload });
      if (signal === 'traces') await store.writeTraceSpans(organizationId, decodeTraceSpans(payload));
      if (signal === 'logs') await store.writeLogs(organizationId, decodeLogRecords(payload));
      if (signal === 'metrics') await store.writeMetricSamples(organizationId, decodeMetricSamples(payload));
      return callback(null, {});
    } catch (error) {
      // Deliberately never include payloads, API keys, or database credentials.
      return callback({ code: grpc.status.UNAVAILABLE, message: 'Telemetry storage is temporarily unavailable' });
    }
  };
  server.addService(descriptor.agamotto.telemetry.AgamottoIngestion.service, {
    ExportTraces: handle('traces'),
    ExportMetrics: handle('metrics'),
    ExportLogs: handle('logs'),
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
