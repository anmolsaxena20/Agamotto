import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { Resend } from 'resend';
import { generateOtp } from './src/otp.js';
import { signupTemplate, resetTemplate } from './src/templates.js';

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
    console.warn(`RESEND_API_KEY not configured. OTP for ${email} is ${otp}`);
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
      return callback({
        code: grpc.status.INTERNAL,
        message: error.message,
      });
    }

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

function healthCheck(_call, callback) {
  callback(null, { status: 'SERVING' });
}

function startServer() {
  const server = new grpc.Server();
  server.addService(emailProto.EmailService.service, {
    SendOtp: sendOtp,
    HealthCheck: healthCheck,
  });

  const bindAddress = `0.0.0.0:${port}`;
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`email-service gRPC listening on port ${boundPort}`);
  });
}

startServer();
