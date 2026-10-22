import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { context, trace, SpanKind } from '@opentelemetry/api';
import { injectGrpcContext } from '../observability/index.js';

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

export function sendOtpEmail(email, type, name = '') {
  return new Promise((resolve, reject) => {
    const span = trace.getTracer('server.grpc').startSpan('email.EmailService/SendOtp', { kind: SpanKind.CLIENT });
    const metadata = injectGrpcContext(new grpc.Metadata(), trace.setSpan(context.active(), span));
    client.SendOtp({ email, type, name }, metadata, (err, response) => {
      if (err) span.recordException(err);
      span.end();
      if (err) {
        return reject(err);
      }
      resolve({
        otpHash: response.otp_hash,
        expiresAt: Number(response.expires_at),
      });
    });
  });
}

export function checkEmailServiceHealth() {
  return new Promise((resolve, reject) => {
    const metadata = injectGrpcContext(new grpc.Metadata());
    client.HealthCheck({}, metadata, (err, response) => {
      if (err) {
        return reject(err);
      }
      resolve(response);
    });
  });
}
