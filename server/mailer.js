'use strict';

async function sendOTPEmail(email, code) {
  // ALWAYS log OTP to console first — visible in Render logs no matter what
  console.log('========================================');
  console.log(`OTP FOR: ${email}`);
  console.log(`CODE:    ${code}`);
  console.log('========================================');

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  console.log('[mailer] SMTP_HOST:', SMTP_HOST || 'NOT SET');
  console.log('[mailer] SMTP_PORT:', SMTP_PORT || 'NOT SET');
  console.log('[mailer] SMTP_USER:', SMTP_USER || 'NOT SET');
  console.log('[mailer] SMTP_PASS:', SMTP_PASS ? `SET (${SMTP_PASS.length} chars)` : 'NOT SET');

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('[mailer] SMTP not configured — OTP only in logs above.');
    return;
  }

  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT) || 587,
      secure: parseInt(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    console.log('[mailer] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[mailer] SMTP connection OK');

    await transporter.sendMail({
      from:    `"The Margin" <${SMTP_USER}>`,
      to:      email,
      subject: 'Your verification code — The Margin',
      text:    `Your verification code is: ${code}\n\nIt expires in 10 minutes.`,
      html:    `
        <div style="font-family:Georgia,serif;max-width:420px;margin:auto;padding:32px">
          <h2 style="font-size:1.4rem;margin-bottom:8px">The<span style="color:#d4782e">.</span>Margin</h2>
          <p style="color:#666;margin-bottom:24px">Your email verification code:</p>
          <div style="background:#f5f1eb;border:2px dashed #d4782e;border-radius:6px;padding:20px;text-align:center;margin-bottom:24px">
            <span style="font-family:monospace;font-size:2.4rem;font-weight:700;color:#d4782e;letter-spacing:.3em">${code}</span>
          </div>
          <p style="color:#999;font-size:.85rem">Expires in 10 minutes. If you did not request this, ignore this email.</p>
        </div>
      `
    });

    console.log(`[mailer] Email sent successfully to ${email}`);

  } catch (err) {
    console.error('[mailer] SMTP FAILED:', err.message);
    console.error('[mailer] Full error:', err);
    // Don't rethrow — OTP is already logged above, registration should still succeed
  }
}

module.exports = { sendOTPEmail };
