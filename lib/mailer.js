const nodemailer = require('nodemailer');

// Initialize Nodemailer SMTP transporter
let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || (process.env.SMTP_USER ? `BillAI Admin <${process.env.SMTP_USER}>` : 'BillAI Admin <noreply@billai.local>');

async function sendEmail({ to, subject, html }) {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      console.log(`✉️ [Mailer] Email dispatched via Nodemailer to ${to}. MessageId: ${info.messageId}`);
      return { success: true, id: info.messageId, provider: 'nodemailer' };
    } catch (err) {
      console.error(`❌ [Mailer Error] Nodemailer dispatch failed for ${to}:`, err.message);
      return { success: false, error: err.message, provider: 'nodemailer' };
    }
  } else {
    console.warn('⚠️ [Mailer Notice] SMTP credentials (SMTP_USER / SMTP_PASS) not configured in .env. Email details logged to console:');
    console.log(`----------------------------------------`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML preview:\n${html.replace(/<[^>]+>/g, ' ').slice(0, 300)}...`);
    console.log(`----------------------------------------`);
    return { success: true, id: 'console-fallback-' + Date.now(), provider: 'console' };
  }
}

async function sendVerificationEmail(email, token) {
  const verifyUrl = process.env.CLIENT_URL
    ? `${process.env.CLIENT_URL}/verify?token=${token}`
    : `http://localhost:5173/verify?token=${token}`;

  const result = await sendEmail({
    to: email,
    subject: 'Verify your BillAI Admin Account',
    html: `
      <h2>Welcome to BillAI!</h2>
      <p>Please verify your email address to activate your admin account.</p>
      <p><a href="${verifyUrl}" style="background: #38bdf8; color: #0f172a; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email Address</a></p>
      <p>Or click this link: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This verification link will expire in 24 hours.</p>
    `,
  });

  return { ...result, verifyUrl };
}

async function sendInviteEmail(email, billaiKey, teamName, inviteToken) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001/v1/groq/chat/completions';
  const inviteUrl = inviteToken
    ? (process.env.CLIENT_URL
        ? `${process.env.CLIENT_URL}/accept-invite?token=${inviteToken}`
        : `http://localhost:5173/accept-invite?token=${inviteToken}`)
    : null;

  const psSnippet = `Invoke-RestMethod -Uri "${gatewayUrl}" -Method Post -Headers @{ "X-BillAI-Key" = "${billaiKey}"; "Authorization" = "Bearer YOUR_GROQ_API_KEY" } -ContentType "application/json" -Body '{"model": "openai/gpt-oss-20b", "messages": [{"role": "user", "content": "Hello world"}]}'`;

  const acceptSection = inviteUrl
    ? `
      <h3>Step 1: Accept Your Invitation</h3>
      <p>Click the button below to accept your invitation and activate your access:</p>
      <p style="margin: 16px 0;">
        <a href="${inviteUrl}" style="background: #38bdf8; color: #0f172a; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation</a>
      </p>
      <p>Or visit: <a href="${inviteUrl}">${inviteUrl}</a></p>
      <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
    `
    : '';

  const result = await sendEmail({
    to: email,
    subject: `You have been invited to ${teamName || 'a team'} on BillAI`,
    html: `
      <h2>You've been added to ${teamName || 'a team'} on BillAI</h2>
      ${acceptSection}
      <p>Here is your unique BillAI API key for proxying Groq LLM requests:</p>
      <div style="background: #1e293b; color: #38bdf8; padding: 12px; font-family: monospace; border-radius: 6px; margin: 12px 0;">
        ${billaiKey}
      </div>
      <h3>Quickstart PowerShell Instructions:</h3>
      <p>Run the following command in PowerShell to send a test request through the BillAI Gateway:</p>
      <pre style="background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; font-family: monospace; font-size: 13px;">${psSnippet}</pre>
      <p style="color: #94a3b8; font-size: 13px; margin-top: 8px;">
        <em>Note: <code>YOUR_GROQ_API_KEY</code> must be replaced with your own real Groq API key.</em>
      </p>
    `,
  });

  return { ...result, inviteUrl };
}

module.exports = {
  sendVerificationEmail,
  sendInviteEmail,
};
