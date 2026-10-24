import React, { useState } from 'react';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { Input } from '../../components/Input.jsx';
import { Copy, Check, Code, Eye, RefreshCw } from 'lucide-react';

export function EmailTemplateView() {
  const [userName, setUserName] = useState('Doctor Strange');
  const [otpCode, setOtpCode] = useState('782941');
  const [verifyUrl, setVerifyUrl] = useState('https://agamotto.io/verify?otp=782941');
  const [companyName, setCompanyName] = useState('Agamotto Telemetry');
  const [companyUrl, setCompanyUrl] = useState('https://agamotto.io');
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedRendered, setCopiedRendered] = useState(false);

  // Exact raw HTML template with {{VARIABLES}}
  const RAW_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Verify Your Email</title>
    <style>
      /* -------------------------------------------------
         Email Global Styles – OTP Verification
         ------------------------------------------------- */
      :root {
        --color-bg: #0a0e14;
        --color-card-bg: rgba(255,255,255,0.07);
        --color-primary: #00d1b2;
        --color-primary-dark: #009e8a;
        --color-text: #e5e7eb;
        --color-muted: #9ca3af;
        --color-success: #34d399;
        --color-error: #f87171;
        --radius: 0.75rem;
        --shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      body, table, td, a {
        -webkit-text-size-adjust:100%;
        -ms-text-size-adjust:100%;
      }
      body {
        margin:0;
        padding:0;
        width:100%!important;
        background-color:var(--color-bg);
        font-family:'Inter',Helvetica,Arial,sans-serif;
        line-height:1.5;
        color:var(--color-text);
      }
      table{border-collapse:collapse!important;}
      .email-wrapper{width:100%;max-width:600px;margin:2rem auto;padding:0 1rem;}
      .email-card{background:var(--color-card-bg);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
      .email-header{background:linear-gradient(135deg,var(--color-primary),var(--color-primary-dark));color:#fff;text-align:center;padding:2rem 1rem;}
      .email-header h1{margin:0;font-size:1.75rem;font-weight:600;}
      .email-body{padding:2rem 1.5rem;}
      .email-body p{margin:0 0 1rem;font-size:1rem;color:var(--color-muted);}
      .email-body .otp-code{
        display:block;margin:1.5rem auto;width:fit-content;padding:0.75rem 1.5rem;
        font-size:2rem;font-weight:700;letter-spacing:0.1em;background:var(--color-success);
        color:#fff;border-radius:var(--radius);box-shadow:0 2px 6px rgba(0,0,0,0.2);
      }
      .button-wrapper{text-align:center;margin:2rem 0;}
      .button{
        display:inline-block;background:var(--color-primary);color:#fff;text-decoration:none;
        font-weight:600;padding:0.75rem 1.5rem;border-radius:var(--radius);
        transition:background .2s ease-in-out;
      }
      .button:hover{background:var(--color-primary-dark);}
      .email-footer{text-align:center;font-size:0.85rem;color:var(--color-muted);padding:1rem;}
      .email-footer a{color:var(--color-primary);text-decoration:underline;}
      @media only screen and (max-width:480px){
        .email-header h1{font-size:1.5rem;}
        .email-body .otp-code{font-size:1.75rem;}
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-card">
        <!-- Header -->
        <div class="email-header">
          <h1>Verify Your Email</h1>
        </div>

        <!-- Body -->
        <div class="email-body">
          <p>Hello <strong>{{USER_NAME}}</strong>,</p>

          <p>
            We're excited to have you on board! To complete your sign‑up, please enter the one‑time password (OTP)
            below. This code will expire in <strong>10 minutes</strong>.
          </p>

          <!-- OTP Code -->
          <span class="otp-code">{{OTP_CODE}}</span>

          <p>
            If you prefer, you can also verify your account by clicking the button below. It will automatically apply
            the OTP for you.
          </p>

          <!-- Call‑to‑Action Button -->
          <div class="button-wrapper">
            <a href="{{VERIFY_URL}}" class="button">Verify My Account</a>
          </div>

          <p>
            <em>Tip:</em> If you didn’t request this email, you can safely ignore it – your account remains secure and
            no changes will be made.
          </p>
        </div>

        <!-- Footer -->
        <div class="email-footer">
          <p>© {{CURRENT_YEAR}} <a href="{{COMPANY_URL}}">{{COMPANY_NAME}}</a>. All rights reserved.</p>
          <p><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a> | <a href="{{PRIVACY_URL}}">Privacy Policy</a></p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  // Rendered with live test values
  const getRenderedHtml = () => {
    return RAW_TEMPLATE
      .replace(/{{USER_NAME}}/g, userName)
      .replace(/{{OTP_CODE}}/g, otpCode)
      .replace(/{{VERIFY_URL}}/g, verifyUrl)
      .replace(/{{COMPANY_NAME}}/g, companyName)
      .replace(/{{COMPANY_URL}}/g, companyUrl)
      .replace(/{{CURRENT_YEAR}}/g, String(new Date().getFullYear()))
      .replace(/{{UNSUBSCRIBE_URL}}/g, `${companyUrl}/unsubscribe`)
      .replace(/{{PRIVACY_URL}}/g, `${companyUrl}/privacy`);
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(RAW_TEMPLATE);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const handleCopyRendered = () => {
    navigator.clipboard.writeText(getRenderedHtml());
    setCopiedRendered(true);
    setTimeout(() => setCopiedRendered(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-page-title">Email Verification Template</h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Production OTP email template with <code>{'{{USER_NAME}}'}</code>, <code>{'{{OTP_CODE}}'}</code>, and action button.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" icon={copiedRaw ? Check : Copy} onClick={handleCopyRaw}>
            {copiedRaw ? 'Template Copied!' : 'Copy Raw Template HTML'}
          </Button>
          <Button variant="primary" icon={copiedRendered ? Check : Copy} onClick={handleCopyRendered}>
            {copiedRendered ? 'Rendered Copied!' : 'Copy Rendered HTML'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left: Interactive Variables & Switcher */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="text-section-title" style={{ fontSize: '15px' }}>Template Variables</h2>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button
                variant={viewMode === 'preview' ? 'primary' : 'ghost'}
                size="sm"
                icon={Eye}
                onClick={() => setViewMode('preview')}
              >
                Preview
              </Button>
              <Button
                variant={viewMode === 'code' ? 'primary' : 'ghost'}
                size="sm"
                icon={Code}
                onClick={() => setViewMode('code')}
              >
                Code
              </Button>
            </div>
          </div>

          <Input
            label="USER_NAME"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          <Input
            label="OTP_CODE"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            maxLength={6}
          />

          <Input
            label="VERIFY_URL"
            value={verifyUrl}
            onChange={(e) => setVerifyUrl(e.target.value)}
          />

          <Input
            label="COMPANY_NAME"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />

          <Input
            label="COMPANY_URL"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
          />
        </Card>

        {/* Right: Preview or Raw Code */}
        <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              {viewMode === 'preview' ? 'Live Email Rendering' : 'Raw HTML Template with Placeholders'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {viewMode === 'preview' ? 'Rendered in sandbox viewport' : 'Ready for email service template engine'}
            </span>
          </div>

          {viewMode === 'preview' ? (
            <div
              style={{
                width: '100%',
                height: '620px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                backgroundColor: '#0a0e14',
              }}
            >
              <iframe
                title="Verify Email Preview"
                srcDoc={getRenderedHtml()}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            </div>
          ) : (
            <pre
              style={{
                width: '100%',
                height: '620px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--surface-input)',
                color: 'var(--text)',
                padding: '16px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                lineHeight: '1.5',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {RAW_TEMPLATE}
            </pre>
          )}
        </Card>
      </div>
    </div>
  );
}
