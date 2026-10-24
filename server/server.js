import 'dotenv/config';
import { validateEnv } from './src/config/env.js';
import { shutdownTelemetry, startTelemetry, logger } from './src/observability/index.js';

validateEnv();
await startTelemetry({ serviceName: 'server' });
const { createApp } = await import('./src/app.js');

const log = logger('server');
const app = createApp();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const httpServer = app.listen(port, () => {
  log('INFO', `server listening on port ${port}`, { port });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => httpServer.close(() => shutdownTelemetry().finally(() => process.exit(0))));
}
