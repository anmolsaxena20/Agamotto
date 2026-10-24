import 'dotenv/config';
import http from 'node:http';
import { context, propagation, trace, SpanKind, metrics } from '@opentelemetry/api';
import { shutdownTelemetry, startTelemetry, logger } from './src/observability/index.js';
import { createTelemetryStore } from './src/clickhouse.js';
import { createKeyValidator } from './src/authenticate.js';
import { createIngestionGrpcServer, grpcCredentials } from './src/grpc-server.js';
import { createAnalyticsHandler } from './src/analytics-routes.js';

await startTelemetry({ serviceName: 'ingestion-gateway' });

const log = logger('ingestion-gateway');

const port = Number.parseInt(process.env.PORT || '4318', 10);
const grpcPort = Number.parseInt(process.env.GRPC_PORT || '4317', 10);
const store = createTelemetryStore();
await store.initialize();
const grpcServer = createIngestionGrpcServer({ store, validateKey: createKeyValidator() });
const analytics = createAnalyticsHandler(store);

const tracer = trace.getTracer('ingestion-gateway.http');
const meter = metrics.getMeter('ingestion-gateway.http');
const requestCounter = meter.createCounter('http.server.request.count');
const requestDuration = meter.createHistogram('http.server.request.duration', { unit: 'ms' });
const server = http.createServer((req, res) => {
  const started = performance.now();
  const parent = propagation.extract(context.active(), req.headers, { get: (carrier, key) => carrier[key] });
  const span = tracer.startSpan(`${req.method} ${req.url}`, { kind: SpanKind.SERVER }, parent);
  res.once('finish', () => {
    const elapsed = performance.now() - started;
    const attrs = { 'http.request.method': req.method, 'http.response.status_code': res.statusCode };
    requestCounter.add(1, attrs);
    requestDuration.record(elapsed, attrs);
    span.end();
    const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    log(severity, `${req.method} ${req.url} ${res.statusCode} ${elapsed.toFixed(1)}ms`, {
      ...attrs,
      duration_ms: Number(elapsed.toFixed(2)),
    });
  });
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
  log('INFO', `ingestion-gateway HTTP health endpoint listening on port ${port}`, { port });
});

await new Promise((resolve, reject) => grpcServer.bindAsync(`0.0.0.0:${grpcPort}`, grpcCredentials(), error => error ? reject(error) : resolve()));
grpcServer.start();
log('INFO', `ingestion-gateway telemetry gRPC server listening on port ${grpcPort}`, { grpcPort });

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  grpcServer.tryShutdown(() => server.close(() => store.close().finally(() => shutdownTelemetry()).finally(() => process.exit(0))));
});
