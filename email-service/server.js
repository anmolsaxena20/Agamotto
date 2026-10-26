import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { Resend } from 'resend';
import { generateOtp } from './src/otp.js';
import {
  TEMPLATE_IDS,
  verificationTemplate,
  passwordResetTemplate,
  teamInvitationTemplate,
  signupTemplate,
  resetTemplate,
} from './src/templates.js';
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

/**
 * Sends an email using Resend hosted templates with local HTML fallback
 */
async function sendWithResend({ to, subject, templateId, variables, fallbackHtml, purpose }) {
  if (!resend) {
    log('WARN', 'RESEND_API_KEY not configured; email delivery was simulated', { to, purpose });
    emailSentCounter.add(1, { template: templateId, skipped: 'true' });
    return { success: true };
  }

  // 1. Attempt to send using Resend hosted template
  try {
    const templatePayload = {
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      template: {
        id: templateId,
        variables: variables || {},
      },
    };

    const { data, error } = await resend.emails.send(templatePayload);

    if (!error) {
      log('INFO', `Delivered email using Resend template: ${templateId}`, { to, templateId, emailId: data?.id });
      emailSentCounter.add(1, { template: templateId, method: 'hosted_template' });
      return { success: true, id: data?.id };
    }

    log('WARN', `Resend hosted template delivery returned error: ${error.message}; attempting HTML fallback`, {
      to,
      templateId,
      error: error.message,
    });
  } catch (templateErr) {
    log('WARN', `Exception with Resend hosted template: ${templateErr.message}; falling back to raw HTML`, {
      to,
      templateId,
      error: templateErr.message,
    });
  }

  // 2. Fallback to sending rendered HTML
  try {
    const htmlPayload = {
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: fallbackHtml,
    };

    const { data, error } = await resend.emails.send(htmlPayload);

    if (error) {
      log('ERROR', `Resend HTML fallback delivery failed: ${error.message}`, { to, templateId, error: error.message });
      emailFailureCounter.add(1, { reason: 'resend_error' });
      throw new Error(error.message);
    }

    log('INFO', `Delivered email using fallback HTML for template: ${templateId}`, { to, templateId, emailId: data?.id });
    emailSentCounter.add(1, { template: templateId, method: 'fallback_html' });
    return { success: true, id: data?.id };
  } catch (err) {
    log('ERROR', `Resend email delivery threw exception: ${err.message}`, { to, templateId, error: err.message });
    emailFailureCounter.add(1, { reason: 'exception' });
    throw err;
  }
}

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

  const isPasswordReset = type === 'forgot-password' || type === 'reset' || type === 'password-reset';
  const templateConfig = isPasswordReset
    ? passwordResetTemplate(name, otp)
    : verificationTemplate(name, otp);

  try {
    await sendWithResend({
      to: email,
      subject: templateConfig.subject,
      templateId: templateConfig.templateId,
      variables: templateConfig.variables,
      fallbackHtml: templateConfig.html,
      purpose: isPasswordReset ? 'password-reset' : 'verification',
    });

    log('INFO', 'OTP email delivered successfully', { email, templateId: templateConfig.templateId });
    return callback(null, {
      otp_hash: hash,
      expires_at: expiresAt,
    });
  } catch (err) {
    return callback({
      code: grpc.status.INTERNAL,
      message: err.message,
    });
  }
}

async function sendInvitation(call, callback) {
  const { email, inviter_name, workspace_name, role_name, invite_url } = call.request;

  if (!email) {
    log('WARN', 'SendInvitation rejected: email is required');
    emailFailureCounter.add(1, { reason: 'missing_email' });
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Email is required',
    });
  }

  const templateConfig = teamInvitationTemplate({
    inviterName: inviter_name,
    workspaceName: workspace_name,
    roleName: role_name,
    inviteUrl: invite_url,
  });

  try {
    await sendWithResend({
      to: email,
      subject: templateConfig.subject,
      templateId: templateConfig.templateId,
      variables: templateConfig.variables,
      fallbackHtml: templateConfig.html,
      purpose: 'team-invitation',
    });

    log('INFO', 'Team invitation email delivered successfully', { email, workspace: workspace_name, role: role_name });
    return callback(null, {
      success: true,
      message: `Invitation successfully sent to ${email}`,
    });
  } catch (err) {
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
    SendInvitation: (call, callback) => withGrpcSpan(call, 'email.EmailService/SendInvitation', callback, wrappedCb => sendInvitation(call, wrappedCb)),
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
