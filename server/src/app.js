import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import cors from 'cors';
import { context, metrics, propagation, trace, SpanKind } from '@opentelemetry/api';
import { configurePassport } from './config/passport.js';
import authRoutes from './routes/auth.routes.js';
import orgRoutes from './routes/org.routes.js';
import permissionRoutes from './routes/permission.routes.js';
import internalRoutes from './routes/internal.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './observability/index.js';

export function createApp() {
  const app = express();
  const log = logger('server');
  const tracer = trace.getTracer('server.http');
  const meter = metrics.getMeter('server.http');
  const requestCounter = meter.createCounter('http.server.request.count');
  const duration = meter.createHistogram('http.server.request.duration', { unit: 'ms' });

  app.use((req, res, next) => {
    const parent = propagation.extract(context.active(), req.headers, { get: (carrier, key) => carrier[key] });
    const span = tracer.startSpan(`${req.method} ${req.path}`, { kind: SpanKind.SERVER }, parent);
    const started = performance.now();
    res.once('finish', () => {
      const elapsed = performance.now() - started;
      const attributes = { 'http.request.method': req.method, 'http.response.status_code': res.statusCode, 'url.path': req.route?.path || req.path };
      requestCounter.add(1, attributes);
      duration.record(elapsed, attributes);
      span.setAttribute('http.response.status_code', res.statusCode);
      if (res.statusCode >= 500) span.setStatus({ code: 2 });
      span.end();
      const severity = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
      log(severity, `${req.method} ${req.originalUrl || req.path} ${res.statusCode} ${elapsed.toFixed(1)}ms`, {
        ...attributes,
        duration_ms: Number(elapsed.toFixed(2)),
      });
    });
    context.with(trace.setSpan(parent, span), next);
  });

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: process.env.FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  configurePassport();
  app.use(passport.initialize());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'server' });
  });

  app.use('/auth', authRoutes);
  app.use('/orgs', orgRoutes);
  app.use('/orgs/:orgId/analytics', analyticsRoutes);
  app.use('/permissions', permissionRoutes);
  app.use('/internal', internalRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use(errorHandler);

  return app;
}
