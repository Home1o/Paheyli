'use strict';

const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const dbModule = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../auth');
const { sendOTPEmail } = require('../mailer');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@themargin.com').toLowerCase();
const ADMIN_PASS  =  process.env.ADMIN_PASSWORD || 'Admin@Margin2025!';

function db() { return dbModule.db; }

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function storeOTP(email) {
  const code      = generateOTP();
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await db().prepare(`DELETE FROM otps WHERE email = ?`).run(email);
  await db().prepare(`INSERT INTO otps (email, code, expires_at) VALUES (?, ?, ?)`).run(email.toLowerCase(), code, expiresAt);
  return code;
}

async function verifyOTP(email, inputCode) {
  email = email.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const row = await db().prepare(`SELECT * FROM otps WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1`).get(email, now);
  if (!row) return { ok: false, error: 'No valid code found. Request a new one.' };
  if (row.code !== inputCode.trim()) return { ok: false, error: 'Incorrect code. Try again.' };
  await db().prepare(`UPDATE otps SET used = 1 WHERE id = ?`).run(row.id);
  return { ok: true };
}

router.post('/register', async (req, res) => {
  try {
    let { email, name, password } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'All fields are required.' });
    email = email.trim().toLowerCase(); name = name.trim();
    if (email === ADMIN_EMAIL) return res.status(400).json({ error: 'This email is reserved.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (await db().prepare(`SELECT id FROM users WHERE email = ?`).get(email))
      return res.status(409).json({ error: 'An account already exists with that email.' });
    const hash = await bcrypt.hash(password, 12);
    await db().prepare(`INSERT INTO users (email, name, password, is_admin, verified) VALUES (?, ?, ?, 0, 0)`).run(email, name, hash);
    const code = await storeOTP(email);
    await sendOTPEmail(email, code);
    res.json({ ok: true, message: 'Account created. Check your email for a verification code.' });
  } catch (err) { console.error('[register]', err); res.status(500).json({ error: 'Registration failed.' }); }
});

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Please fill in all fields.' });
    email = email.trim().toLowerCase();

    if (email === ADMIN_EMAIL) {
      if (password !== ADMIN_PASS) return res.status(401).json({ error: 'Incorrect password.' });
      let admin = await db().prepare(`SELECT * FROM users WHERE email = ?`).get(email);
      if (!admin) {
        const hash = await bcrypt.hash(password, 12);
        await db().prepare(`INSERT INTO users (email, name, password, is_admin, verified) VALUES (?, 'Admin', ?, 1, 1)`).run(email, hash);
        admin = await db().prepare(`SELECT * FROM users WHERE email = ?`).get(email);
      }
      return res.json({ ok: true, token: signToken(admin), user: { email: admin.email, name: admin.name, isAdmin: true, verified: true } });
    }

    const user = await db().prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (!user) return res.status(401).json({ error: 'No account found with that email.' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Incorrect password.' });
    if (!user.verified) {
      const code = await storeOTP(email);
      await sendOTPEmail(email, code);
      return res.status(403).json({ error: 'Email not verified.', needsVerify: true, email });
    }
    res.json({ ok: true, token: signToken(user), user: { email: user.email, name: user.name, isAdmin: false, verified: true } });
  } catch (err) { console.error('[login]', err); res.status(500).json({ error: 'Login failed.' }); }
});

router.post('/verify-otp', async (req, res) => {
  try {
    let { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });
    email = email.trim().toLowerCase();
    const result = await verifyOTP(email, code);
    if (!result.ok) return res.status(400).json({ error: result.error });
    await db().prepare(`UPDATE users SET verified = 1 WHERE email = ?`).run(email);
    const user = await db().prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    res.json({ ok: true, token: signToken(user), user: { email: user.email, name: user.name, isAdmin: false, verified: true } });
  } catch (err) { console.error('[verify-otp]', err); res.status(500).json({ error: 'Verification failed.' }); }
});

router.post('/resend-otp', async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    email = email.trim().toLowerCase();
    if (!await db().prepare(`SELECT id FROM users WHERE email = ?`).get(email))
      return res.status(404).json({ error: 'No account with that email.' });
    const code = await storeOTP(email);
    await sendOTPEmail(email, code);
    res.json({ ok: true });
  } catch (err) { console.error('[resend-otp]', err); res.status(500).json({ error: 'Could not send code.' }); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/rename', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name required.' });
  const trimmed = name.trim();
  if (trimmed.length < 2)  return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  if (trimmed.length > 40) return res.status(400).json({ error: 'Name too long (max 40 characters).' });
  try {
    const oldUser = await db().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!oldUser) return res.status(404).json({ error: 'User not found.' });
    const oldName   = oldUser.name;
    const userEmail = oldUser.email.toLowerCase();
    await db().prepare('UPDATE users SET name = ? WHERE id = ?').run(trimmed, req.user.id);
    await db().prepare('UPDATE comments SET author = ? WHERE author_email = ?').run(trimmed, userEmail);
    await db().prepare('UPDATE discussions SET author = ? WHERE author_email = ?').run(trimmed, userEmail);
    await db().prepare('UPDATE branches SET author = ? WHERE author_email = ?').run(trimmed, userEmail);
    await db().prepare('UPDATE points SET user_name = ? WHERE user_name = ?').run(trimmed, oldName);
    await db().prepare('UPDATE leaves SET user_name = ? WHERE user_email = ?').run(trimmed, userEmail);
    const updatedUser = await db().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ ok: true, token: signToken(updatedUser), name: trimmed });
  } catch (e) {
    console.error('[rename]', e.message);
    res.status(500).json({ error: 'Could not update name.' });
  }
});

router.post('/delete-account', requireAuth, async (req, res) => {
  const email = req.user.email.toLowerCase();
  try {
    await db().prepare('DELETE FROM otps        WHERE email        = ?').run(email);
    await db().prepare('DELETE FROM comments    WHERE author_email = ?').run(email);
    await db().prepare('DELETE FROM discussions WHERE author_email = ?').run(email);
    await db().prepare('DELETE FROM branches    WHERE author_email = ?').run(email);
    await db().prepare('DELETE FROM leaves      WHERE user_email   = ?').run(email);
    await db().prepare('DELETE FROM points      WHERE user_name    = ?').run(req.user.name);
    await db().prepare('DELETE FROM users       WHERE email        = ?').run(email);
    console.log('[delete-account] Deleted:', email);
    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-account]', e.message);
    res.status(500).json({ error: 'Could not delete account.' });
  }
});

router.post('/admin-delete-user', requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  const em = email.trim().toLowerCase();
  try {
    await db().prepare('DELETE FROM otps        WHERE email        = ?').run(em);
    await db().prepare('DELETE FROM comments    WHERE author_email = ?').run(em);
    await db().prepare('DELETE FROM discussions WHERE author_email = ?').run(em);
    await db().prepare('DELETE FROM branches    WHERE author_email = ?').run(em);
    await db().prepare('DELETE FROM leaves      WHERE user_email   = ?').run(em);
    await db().prepare('DELETE FROM points      WHERE user_email   = ?').run(em);
    const r = await db().prepare('DELETE FROM users WHERE email = ?').run(em);
    if (r.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true, message: `Deleted user: ${em}` });
  } catch (e) {
    console.error('[admin-delete-user]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
