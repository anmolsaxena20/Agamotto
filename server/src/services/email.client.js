import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { context, metrics, trace, SpanKind } from '@opentelemetry/api';
import { injectGrpcContext, logger } from '../observability/index.js';

const log = logger('server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, '..', '..', 'proto', 'email.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const emailProto = protoDescriptor.email;

const host = process.env.EMAIL_SERVICE_HOST || 'localhost';
const port = process.env.EMAIL_SERVICE_PORT || '5000';
const target = `${host}:${port}`;

const client = new emailProto.EmailService(target, grpc.credentials.createInsecure());

const tracer = trace.getTracer('server.grpc');
const meter = metrics.getMeter('server.grpc');
const rpcClientCounter = meter.createCounter('rpc.client.request.count');
const rpcClientDuration = meter.createHistogram('rpc.client.duration', { unit: 'ms' });

export function sendOtpEmail(email, type, name = '') {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const span = tracer.startSpan('email.EmailService/SendOtp', { kind: SpanKind.CLIENT });
    const metadata = injectGrpcContext(new grpc.Metadata(), trace.setSpan(context.active(), span));
    client.SendOtp({ email, type, name }, metadata, (err, response) => {
      const elapsed = performance.now() - started;
      const status = err ? 'error' : 'success';
      const attrs = { 'rpc.service': 'email.EmailService', 'rpc.method': 'SendOtp', 'rpc.status': status };
      rpcClientCounter.add(1, attrs);
      rpcClientDuration.record(elapsed, attrs);
      if (err) span.recordException(err);
      span.end();
      if (err) {
        log('ERROR', `Failed to send OTP email: ${err.message}`, { 'rpc.method': 'SendOtp', email, error: err.message });
        return reject(err);
      }
      log('INFO', 'Successfully requested OTP email delivery', { 'rpc.method': 'SendOtp', email });
      resolve({
        otpHash: response.otp_hash,
        expiresAt: Number(response.expires_at),
      });
    });
  });
}

export function sendTeamInvitationEmail({ email, inviterName, workspaceName, roleName, inviteUrl }) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const span = tracer.startSpan('email.EmailService/SendInvitation', { kind: SpanKind.CLIENT });
    const metadata = injectGrpcContext(new grpc.Metadata(), trace.setSpan(context.active(), span));
    client.SendInvitation(
      {
        email,
        inviter_name: inviterName || '',
        workspace_name: workspaceName || '',
        role_name: roleName || '',
        invite_url: inviteUrl || '',
      },
      metadata,
      (err, response) => {
        const elapsed = performance.now() - started;
        const status = err ? 'error' : 'success';
        const attrs = { 'rpc.service': 'email.EmailService', 'rpc.method': 'SendInvitation', 'rpc.status': status };
        rpcClientCounter.add(1, attrs);
        rpcClientDuration.record(elapsed, attrs);
        if (err) span.recordException(err);
        span.end();
        if (err) {
          log('ERROR', `Failed to send team invitation email: ${err.message}`, { 'rpc.method': 'SendInvitation', email, error: err.message });
          return reject(err);
        }
        log('INFO', 'Successfully requested team invitation email delivery', { 'rpc.method': 'SendInvitation', email });
        resolve(response);
      }
    );
  });
}

export function checkEmailServiceHealth() {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const metadata = injectGrpcContext(new grpc.Metadata());
    client.HealthCheck({}, metadata, (err, response) => {
      const elapsed = performance.now() - started;
      const status = err ? 'error' : 'success';
      const attrs = { 'rpc.service': 'email.EmailService', 'rpc.method': 'HealthCheck', 'rpc.status': status };
      rpcClientCounter.add(1, attrs);
      rpcClientDuration.record(elapsed, attrs);
      if (err) {
        return reject(err);
      }
      resolve(response);
    });
  });
}
