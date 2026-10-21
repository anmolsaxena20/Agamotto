import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import cors from 'cors';
import { configurePassport } from './config/passport.js';
import authRoutes from './routes/auth.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

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

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use(errorHandler);

  return app;
}
