import 'dotenv/config';
import express from 'express';
import { Resend } from 'resend';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '5000', 10);
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

app.use(express.json({ limit: '64kb' }));

app.get('/healthz', (_request, response) => {
  response.json({ status: 'ok', service: 'email-service' });
});

app.post('/send', async (request, response, next) => {
  const { from, to, subject, html, text } = request.body ?? {};

  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    typeof subject !== 'string' ||
    (typeof html !== 'string' && typeof text !== 'string')
  ) {
    response.status(400).json({
      error: 'from, to, subject, and html or text are required',
    });
    return;
  }

  if (!resend) {
    response.status(503).json({ error: 'RESEND_API_KEY is not configured' });
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    });

    if (error) {
      response.status(502).json({ error: error.message });
      return;
    }

    response.status(202).json({ id: data?.id });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'internal server error' });
});

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

app.listen(port, () => {
  console.log(`email-service listening on port ${port}`);
});
