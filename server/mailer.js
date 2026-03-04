'use strict';

async function sendOTPEmail(email, code) {
  // ALWAYS log OTP — visible in Render logs
  console.log('========================================');
  console.log(`OTP FOR: ${email}`);
  console.log(`CODE:    ${code}`);
  console.log('========================================');

  const { SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    console.log('[mailer] SMTP not configured — OTP only in logs above.');
    return;
  }

  try {
    const nodemailer = require('nodemailer');

    // Try port 465 (SSL) first — more likely to work on Render
    const transporter = nodemailer.createTransport({
      service: 'gmail',   // lets nodemailer auto-configure Gmail settings
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS   // 16-char app password
      }
    });

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
  }
}

module.exports = { sendOTPEmail };
