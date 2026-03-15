'use strict';

// Load .env before anything else
if (require('fs').existsSync('.env')) {
  require('fs').readFileSync('.env', 'utf8')
    .split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const [key, ...rest] = line.split('=');
      if (key && !(key in process.env)) process.env[key] = rest.join('=').trim();
    });
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');

// Wait for DB to be ready before loading anything that uses it
const { dbReady, getLeaderboard } = require('./db');

dbReady.then(() => {

  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Load routes AFTER db is initialised
  app.use('/api/auth',        require('./routes/auth'));
  app.use('/api/posts',       require('./routes/posts'));
  app.use('/api/discussions', require('./routes/discussions'));

  app.get('/api/leaderboard', (req, res) => {
    res.json(getLeaderboard());
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const PORT = parseInt(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`\n  The Margin is running → http://localhost:${PORT}`);
    console.log(`  Admin: ${process.env.ADMIN_EMAIL || 'admin@themargin.com'}`);
    console.log(`  DB:    db/margin.sqlite`);
    if (!process.env.SMTP_HOST) {
      console.log(`  OTP:   codes printed to this console (no SMTP configured)\n`);
    }
  });

}).catch(err => {
  console.error('[db] Failed to initialise database:', err);
  process.exit(1);
});

import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Add this route 👇
app.get("/api/health", async (req, res) => {
  try {
    await client.execute("SELECT 1");
    res.status(200).json({ status: "✅ Turso is working" });
  } catch (e) {
    res.status(500).json({ status: "❌ Failed", error: e.message });
  }
});
