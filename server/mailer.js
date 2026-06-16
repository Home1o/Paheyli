'use strict';

async function sendOTPEmail(email, code) {
  // ALWAYS log OTP to Render logs
  console.log('========================================');
  console.log(`OTP FOR: ${email}`);
  console.log(`CODE:    ${code}`);
  console.log('========================================');

  const { BREVO_API_KEY, BREVO_SENDER } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER) {
    console.log('[mailer] Brevo not configured — OTP only in logs above.');
    return;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender:   { name: 'The Margin', email: BREVO_SENDER },
        to:       [{ email }],
        subject:  'Your verification code — The Margin',
        textContent: `Your verification code is: ${code}\n\nIt expires in 10 minutes.`,
        htmlContent: `
          <div style="font-family:Georgia,serif;max-width:420px;margin:auto;padding:32px">
            <h2 style="font-size:1.4rem;margin-bottom:8px">The<span style="color:#d4782e">.</span>Margin</h2>
            <p style="color:#666;margin-bottom:24px">Your email verification code:</p>
            <div style="background:#f5f1eb;border:2px dashed #d4782e;border-radius:6px;padding:20px;text-align:center;margin-bottom:24px">
              <span style="font-family:monospace;font-size:2.4rem;font-weight:700;color:#d4782e;letter-spacing:.3em">${code}</span>
            </div>
            <p style="color:#999;font-size:.85rem">Expires in 10 minutes. If you did not request this, ignore this email.</p>
          </div>
        `
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[mailer] Brevo error:', JSON.stringify(data));
    } else {
      console.log(`[mailer] Email sent to ${email} via Brevo`);
    }
  } catch (err) {
    console.error('[mailer] Brevo FAILED:', err.message);
  }
}

module.exports = { sendOTPEmail };
