const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_ADDRESS = process.env.RESEND_FROM || 'BillAI Admin <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  if (process.env.RESEND_API_KEY && resend) {
    try {
      const data = await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      console.log(`✉️ [Mailer] Real email dispatched via Resend to ${to}. ID: ${data.id || JSON.stringify(data)}`);
      return data;
    } catch (err) {
      console.error(`❌ [Mailer Error] Resend dispatch failed for ${to}:`, err.message);
      console.log(`[Mailer Fallback Log]\nTo: ${to}\nSubject: ${subject}`);
      return { id: 'fallback-' + Date.now(), error: err.message };
    }
  } else {
    console.warn('⚠️ [Mailer Notice] RESEND_API_KEY is missing in env. Email logged to console:');
    console.log(`----------------------------------------`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML snippet preview:\n${html.slice(0, 300)}...`);
    console.log(`----------------------------------------`);
    return { id: 'console-fallback-' + Date.now() };
  }
}

async function sendVerificationEmail(email, token) {
  const verifyUrl = process.env.CLIENT_URL
    ? `${process.env.CLIENT_URL}/verify?token=${token}`
    : `http://localhost:5173/verify?token=${token}`;

  return await sendEmail({
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

  return await sendEmail({
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
}

module.exports = {
  sendVerificationEmail,
  sendInviteEmail,
};
