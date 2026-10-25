import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { Resend } from 'resend';
import { generateOtp } from './src/otp.js';
import { signupTemplate, resetTemplate } from './src/templates.js';
import { context, metrics, trace, SpanKind } from '@opentelemetry/api';
import { extractGrpcContext, shutdownTelemetry, startTelemetry, logger } from './src/observability/index.js';

await startTelemetry({ serviceName: 'email-service' });

const tracer = trace.getTracer('email-service.grpc');
const meter = metrics.getMeter('email-service.grpc');
const log = logger('email-service');

const rpcServerCounter = meter.createCounter('rpc.server.request.count');
const rpcServerDuration = meter.createHistogram('rpc.server.duration', { unit: 'ms' });
const emailSentCounter = meter.createCounter('email.sent.count');
const emailFailureCounter = meter.createCounter('email.failure.count');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, 'proto', 'email.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const emailProto = protoDescriptor.email;

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const fromEmail = process.env.EMAIL_FROM || 'Agamotto <onboarding@resend.dev>';
const port = process.env.PORT || '5000';

async function sendOtp(call, callback) {
  const { email, type, name } = call.request;

  if (!email) {
    log('WARN', 'SendOtp rejected: email is required');
    emailFailureCounter.add(1, { reason: 'missing_email' });
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Email is required',
    });
  }

  const { otp, hash, expiresAt } = generateOtp();

  const template = type === 'forgot-password' || type === 'reset'
    ? resetTemplate(name, otp)
    : signupTemplate(name, otp);

  if (!resend) {
    log('WARN', 'RESEND_API_KEY not configured; email delivery was skipped', { email, type: type || 'signup' });
    emailSentCounter.add(1, { template: type || 'signup', skipped: 'true' });
    return callback(null, {
      otp_hash: hash,
      expires_at: expiresAt,
    });
  }

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: template.subject,
      html: template.html,
    });

    if (error) {
      log('ERROR', `Resend delivery failed: ${error.message}`, { email, type: type || 'signup', error: error.message });
      emailFailureCounter.add(1, { reason: 'resend_error' });
      return callback({
        code: grpc.status.INTERNAL,
        message: error.message,
      });
    }

    log('INFO', 'OTP email delivered successfully', { email, type: type || 'signup' });
    emailSentCounter.add(1, { template: type || 'signup' });
    return callback(null, {
      otp_hash: hash,
      expires_at: expiresAt,
    });
  } catch (err) {
    log('ERROR', `SendOtp threw an exception: ${err.message}`, { email, type: type || 'signup', error: err.message });
    emailFailureCounter.add(1, { reason: 'exception' });
    return callback({
      code: grpc.status.INTERNAL,
      message: err.message,
    });
  }
}

function healthCheck(_call, callback) {
  callback(null, { status: 'SERVING' });
}

function startServer() {
  const server = new grpc.Server();
  server.addService(emailProto.EmailService.service, {
    SendOtp: (call, callback) => withGrpcSpan(call, 'email.EmailService/SendOtp', callback, wrappedCb => sendOtp(call, wrappedCb)),
    HealthCheck: (call, callback) => withGrpcSpan(call, 'email.EmailService/HealthCheck', callback, wrappedCb => healthCheck(call, wrappedCb)),
  });

  const bindAddress = `0.0.0.0:${port}`;
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      log('ERROR', `Failed to bind email-service gRPC server: ${err.message}`, { error: err.message });
      process.exit(1);
    }
    log('INFO', `email-service gRPC listening on port ${boundPort}`, { port: boundPort });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => server.tryShutdown(() => shutdownTelemetry().finally(() => process.exit(0))));
    }
  });
}

function withGrpcSpan(call, name, callback, handler) {
  const parent = extractGrpcContext(call.metadata);
  const span = tracer.startSpan(name, { kind: SpanKind.SERVER }, parent);
  const started = performance.now();
  const wrappedCallback = (err, resp) => {
    const elapsed = performance.now() - started;
    const status = err ? 'error' : 'success';
    const attrs = { 'rpc.service': 'email.EmailService', 'rpc.method': name, 'rpc.status': status };
    rpcServerCounter.add(1, attrs);
    rpcServerDuration.record(elapsed, attrs);
    if (err) {
      span.recordException(err instanceof Error ? err : new Error(err.message || String(err)));
      span.setStatus({ code: 2, message: err.message });
    }
    span.end();
    return callback(err, resp);
  };
  return context.with(trace.setSpan(parent, span), () => handler(wrappedCallback));
}

startServer();
