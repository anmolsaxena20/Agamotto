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
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  const tracer = trace.getTracer('server.http');
  const meter = metrics.getMeter('server.http');
  const requestCounter = meter.createCounter('http.server.request.count');
  const duration = meter.createHistogram('http.server.request.duration', { unit: 'ms' });

  app.use((req, res, next) => {
    const parent = propagation.extract(context.active(), req.headers, { get: (carrier, key) => carrier[key] });
    const span = tracer.startSpan(`${req.method} ${req.path}`, { kind: SpanKind.SERVER }, parent);
    const started = performance.now();
    res.once('finish', () => {
      const attributes = { 'http.request.method': req.method, 'http.response.status_code': res.statusCode, 'url.path': req.route?.path || req.path };
      requestCounter.add(1, attributes);
      duration.record(performance.now() - started, attributes);
      span.setAttribute('http.response.status_code', res.statusCode);
      if (res.statusCode >= 500) span.setStatus({ code: 2 });
      span.end();
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
  app.use('/permissions', permissionRoutes);
  app.use('/internal', internalRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use(errorHandler);

  return app;
}
