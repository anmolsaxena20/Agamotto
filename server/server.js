import 'dotenv/config';
import { validateEnv } from './src/config/env.js';
import { shutdownTelemetry, startTelemetry } from './src/observability/index.js';

validateEnv();
await startTelemetry({ serviceName: 'server' });
const { createApp } = await import('./src/app.js');

const app = createApp();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const httpServer = app.listen(port, () => {
  console.log(`server listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => httpServer.close(() => shutdownTelemetry().finally(() => process.exit(0))));
}
