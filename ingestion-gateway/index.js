import 'dotenv/config';
import http from 'node:http';
import { context, propagation, trace, SpanKind, metrics } from '@opentelemetry/api';
import { shutdownTelemetry, startTelemetry } from './src/observability/index.js';
import { createTelemetryStore } from './src/clickhouse.js';
import { createKeyValidator } from './src/authenticate.js';
import { createIngestionGrpcServer, grpcCredentials } from './src/grpc-server.js';
import { createAnalyticsHandler } from './src/analytics-routes.js';

await startTelemetry({ serviceName: 'ingestion-gateway' });

const port = Number.parseInt(process.env.PORT || '4318', 10);
const grpcPort = Number.parseInt(process.env.GRPC_PORT || '4317', 10);
const store = createTelemetryStore();
await store.initialize();
const grpcServer = createIngestionGrpcServer({ store, validateKey: createKeyValidator() });
const analytics = createAnalyticsHandler(store);

const tracer = trace.getTracer('ingestion-gateway.http');
const meter = metrics.getMeter('ingestion-gateway.http');
const requestCounter = meter.createCounter('http.server.request.count');
const server = http.createServer((req, res) => {
  const parent = propagation.extract(context.active(), req.headers, { get: (carrier, key) => carrier[key] });
  const span = tracer.startSpan(`${req.method} ${req.url}`, { kind: SpanKind.SERVER }, parent);
  res.once('finish', () => { requestCounter.add(1, { 'http.request.method': req.method, 'http.response.status_code': res.statusCode }); span.end(); });
  return context.with(trace.setSpan(parent, span), () => {
  if (req.url.startsWith('/v1/organizations/')) return analytics(req, res);
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ingestion-gateway' }));
    return;
  }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not implemented' }));
  });
});

server.listen(port, () => {
  console.log(`ingestion-gateway HTTP health endpoint listening on port ${port}`);
});

await new Promise((resolve, reject) => grpcServer.bindAsync(`0.0.0.0:${grpcPort}`, grpcCredentials(), error => error ? reject(error) : resolve()));
grpcServer.start();
console.log(`ingestion-gateway telemetry gRPC server listening on port ${grpcPort}`);

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  grpcServer.tryShutdown(() => server.close(() => store.close().finally(() => shutdownTelemetry()).finally(() => process.exit(0))));
});
