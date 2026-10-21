import crypto from 'node:crypto';

const SIGNUP_SUBJECT = 'Verify your Agamotto account';
const RESET_SUBJECT = 'Reset your Agamotto password';

function otpBlock(otp) {
  return `
    <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
      <span style="letter-spacing:14px;font-size:38px;font-weight:700;color:#00ff88;font-family:'Courier New',monospace;">${otp}</span>
    </div>
  `;
}

function wrap(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#07070d;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#07070d;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;background:linear-gradient(145deg,#0f0f1a 0%,#161628 100%);border-radius:20px;border:1px solid rgba(0,255,136,0.12);box-shadow:0 24px 64px rgba(0,0,0,0.4);">
          <tr>
            <td style="padding:44px 44px 0;text-align:center;">
              <div style="width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:linear-gradient(135deg,#00ff88 0%,#00cc6a 100%);box-shadow:0 8px 32px rgba(0,255,136,0.3);line-height:56px;font-size:28px;">&#128065;</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:600;margin:0 0 4px;letter-spacing:-0.3px;">Agamotto</h1>
              <div style="width:40px;height:2px;background:linear-gradient(90deg,transparent,#00ff88,transparent);margin:12px auto 0;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 44px 44px;">
              ${content}
              <p style="color:#4a4a60;font-size:12px;line-height:1.5;margin:32px 0 0;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">
                This code expires in <strong style="color:#6a6a80;">10 minutes</strong>. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 44px 32px;text-align:center;">
              <p style="color:#2a2a40;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} Agamotto &middot; Observability Platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function signupTemplate(name, otp) {
  const displayName = name || 'there';
  return {
    subject: SIGNUP_SUBJECT,
    html: wrap(`
      <p style="color:#c0c0d0;font-size:15px;line-height:1.7;margin:0 0 4px;">Hi <strong style="color:#ffffff;">${displayName}</strong>,</p>
      <p style="color:#8a8aa0;font-size:14px;line-height:1.7;margin:0;">Enter the code below to verify your email and activate your account:</p>
      ${otpBlock(otp)}
      <p style="color:#8a8aa0;font-size:13px;line-height:1.6;margin:0;">If you didn't create an Agamotto account, no action is needed.</p>
    `),
  };
}

export function resetTemplate(name, otp) {
  const displayName = name || 'there';
  return {
    subject: RESET_SUBJECT,
    html: wrap(`
      <p style="color:#c0c0d0;font-size:15px;line-height:1.7;margin:0 0 4px;">Hi <strong style="color:#ffffff;">${displayName}</strong>,</p>
      <p style="color:#8a8aa0;font-size:14px;line-height:1.7;margin:0;">We received a request to reset your password. Use the code below:</p>
      ${otpBlock(otp)}
      <p style="color:#8a8aa0;font-size:13px;line-height:1.6;margin:0;">If you didn't request a password reset, please secure your account immediately.</p>
    `),
  };
}
