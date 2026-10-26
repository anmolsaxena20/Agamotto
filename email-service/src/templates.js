import crypto from 'node:crypto';

export const TEMPLATE_IDS = {
  VERIFICATION: 'verification-template',
  PASSWORD_RESET: 'password-reset',
  TEAM_INVITATION: 'team-invitation',
};

const SIGNUP_SUBJECT = 'Verify your account';
const RESET_SUBJECT = 'Reset your password';
const INVITATION_SUBJECT = (workspaceName) => `You've been invited to join ${workspaceName || 'Agamotto'}`;

function otpBlock(otp) {
  return `
    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <span style="letter-spacing:12px;font-size:36px;font-weight:700;color:#fbbf24;font-family:'Courier New',Consolas,monospace;">${otp}</span>
    </div>
  `;
}

function wrap(content, footerNote = 'Expires in 10 minutes') {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0e12;font-family:'Segoe UI',Roboto,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0d0e12;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;background:#13151b;border-radius:16px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 64px rgba(0,0,0,0.5);">
          <tr>
            <td style="padding:36px 36px 0;display:flex;align-items:center;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <div style="display:inline-block;vertical-align:middle;width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);margin-right:10px;"></div>
                    <span style="display:inline-block;vertical-align:middle;color:#ffffff;font-size:16px;font-weight:600;letter-spacing:-0.2px;">Agamotto</span>
                  </td>
                  <td align="right">
                    <span style="color:#64748b;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.8px;">Observability</span>
                  </td>
                </tr>
              </table>
              <div style="height:1px;background:rgba(255,255,255,0.06);margin-top:20px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 36px;">
              ${content}
              <div style="margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;">
                <span style="color:#64748b;font-size:12px;">Security Note</span>
                <span style="color:#94a3b8;font-size:12px;float:right;">${footerNote}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;text-align:center;">
              <p style="color:#475569;font-size:11px;margin:0;">&copy; ${new Date().getFullYear()} Agamotto &middot; OpenTelemetry Observability Platform</p>
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
  return verificationTemplate(name, otp);
}

export function verificationTemplate(name, otp) {
  const displayName = name || 'there';
  return {
    templateId: TEMPLATE_IDS.VERIFICATION,
    subject: SIGNUP_SUBJECT,
    variables: { otp: String(otp), name: displayName },
    html: wrap(`
      <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 12px;letter-spacing:-0.3px;">Verify your account</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px;">
        Welcome to Agamotto. Enter the single-use verification code below to confirm your email and access your observability workspaces:
      </p>
      ${otpBlock(otp)}
      <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;">
        If you didn't create an Agamotto account or request this verification code, you can safely ignore this message.
      </p>
    `, 'Expires in 10 minutes'),
  };
}

export function resetTemplate(name, otp) {
  return passwordResetTemplate(name, otp);
}

export function passwordResetTemplate(name, otp) {
  const displayName = name || 'there';
  return {
    templateId: TEMPLATE_IDS.PASSWORD_RESET,
    subject: RESET_SUBJECT,
    variables: { otp: String(otp), name: displayName },
    html: wrap(`
      <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 12px;letter-spacing:-0.3px;">Reset your password</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px;">
        We received a request to reset the password for your Agamotto account. Enter the verification code below to authorize the password change:
      </p>
      ${otpBlock(otp)}
      <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;">
        If you didn't request a password reset, please review your security settings or ignore this email.
      </p>
    `, 'Valid for 10 minutes'),
  };
}

export function teamInvitationTemplate({ inviterName, workspaceName, roleName, inviteUrl }) {
  const inviter = inviterName || 'A team member';
  const workspace = workspaceName || 'your organization';
  const role = roleName || 'Member';
  const url = inviteUrl || 'http://localhost:5173/login';

  return {
    templateId: TEMPLATE_IDS.TEAM_INVITATION,
    subject: INVITATION_SUBJECT(workspace),
    variables: {
      workspace_name: workspace,
      inviter_name: inviter,
      role_name: role,
      invite_url: url,
    },
    html: wrap(`
      <h2 style="color:#ffffff;font-size:20px;font-weight:600;margin:0 0 12px;letter-spacing:-0.3px;">
        You've been invited to join <span style="color:#fbbf24;">${workspace}</span>
      </h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
        <strong style="color:#ffffff;">${inviter}</strong> has invited you to join the <strong style="color:#ffffff;">${workspace}</strong> organization on Agamotto to collaborate on distributed trace waterfalls, microservice metrics, and telemetry log analysis.
      </p>
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px 20px;margin:20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="color:#64748b;font-size:13px;padding-bottom:8px;">Workspace</td>
            <td align="right" style="color:#ffffff;font-size:13px;font-weight:500;padding-bottom:8px;">${workspace}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px;">Role Assigned</td>
            <td align="right" style="color:#fbbf24;font-size:13px;font-weight:600;">${role}</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 12px;">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#0f1117;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;box-shadow:0 4px 14px rgba(245,158,11,0.3);">
          Accept Invitation &rarr;
        </a>
      </div>
    `, 'Invitation Active'),
  };
}
