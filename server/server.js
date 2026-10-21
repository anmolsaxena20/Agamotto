import 'dotenv/config';
import { createApp } from './src/app.js';
import { validateEnv } from './src/config/env.js';

validateEnv();

const app = createApp();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.listen(port, () => {
  console.log(`server listening on port ${port}`);
});