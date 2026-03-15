'use strict';

const { createClient } = require('@libsql/client');

// Uses Turso when env vars set, falls back to local SQLite for dev
const client = createClient(
  process.env.TURSO_URL && process.env.TURSO_TOKEN
    ? { url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN }
    : { url: 'file:./db/margin.sqlite' }
);

const state = { db: null };

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL, password TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`,
  `CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    code TEXT NOT NULL, expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
    read_time INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`,
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_id INTEGER NOT NULL,
    user_email TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (post_id, user_email))`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL, author TEXT NOT NULL,
    author_email TEXT NOT NULL COLLATE NOCASE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`,
  `CREATE TABLE IF NOT EXISTS discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL, author_email TEXT NOT NULL COLLATE NOCASE,
    tags TEXT NOT NULL DEFAULT '[]', is_open INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`,
  `CREATE TABLE IF NOT EXISTS discussion_likes (
    discussion_id INTEGER NOT NULL,
    user_email TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (discussion_id, user_email))`,
  `CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discussion_id INTEGER NOT NULL, parent_id INTEGER,
    author TEXT NOT NULL, author_email TEXT NOT NULL COLLATE NOCASE,
    text TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'branch',
    depth INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`,
  `CREATE TABLE IF NOT EXISTS leaves (
    branch_id INTEGER NOT NULL, user_name TEXT NOT NULL,
    user_email TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (branch_id, user_email))`,
  `CREATE TABLE IF NOT EXISTS merge_votes (
    branch_id INTEGER NOT NULL,
    user_email TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (branch_id, user_email))`,
  `CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL, amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))`
];

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_otps_email      ON otps(email)`,
  `CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_post   ON comments(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_disc_likes      ON discussion_likes(discussion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_branches_disc   ON branches(discussion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_branches_parent ON branches(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_leaves_branch   ON leaves(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_merge_branch    ON merge_votes(branch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_points_user     ON points(user_name)`
];

// prepare() shim — mimics better-sqlite3 sync API using deasync to block on Turso async calls
function prepare(sql) {
  function runSync(params) {
    let result, error;
    client.execute({ sql, args: params })
      .then(r => { result = r; })
      .catch(e => { error = e; });
    require('deasync').loopWhile(() => result === undefined && error === undefined);
    if (error) { console.error('[db]', sql, error.message); throw error; }
    return result;
  }
  return {
    get(...args) {
      const params = args.flat().map(v => v === undefined ? null : v);
      const r = runSync(params);
      if (!r.rows.length) return undefined;
      return Object.fromEntries(Object.keys(r.rows[0]).map(k => [k, r.rows[0][k]]));
    },
    all(...args) {
      const params = args.flat().map(v => v === undefined ? null : v);
      const r = runSync(params);
      return r.rows.map(row => Object.fromEntries(Object.keys(row).map(k => [k, row[k]])));
    },
    run(...args) {
      const params = args.flat().map(v => v === undefined ? null : v);
      const r = runSync(params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
    }
  };
}

const dbReady = (async () => {
  try {
    for (const t of tables) await client.execute(t);
    for (const i of indexes) await client.execute(i);
    state.db = { prepare };

    const { rows } = await client.execute('SELECT COUNT(*) AS n FROM posts');
    if (Number(rows[0].n) === 0) {
      console.log('[db] Seeding initial posts...');
      const now = Math.floor(Date.now() / 1000);
      await client.batch([
        { sql: `INSERT INTO posts (title,excerpt,content,tags,read_time,created_at) VALUES (?,?,?,?,?,?)`,
          args: ['Welcome to The Margin','A space for ideas that live between disciplines.',
            '<p>Welcome to <strong>The Margin</strong>.</p>',JSON.stringify(['welcome','meta']),2,now-172800] },
        { sql: `INSERT INTO posts (title,excerpt,content,tags,read_time,created_at) VALUES (?,?,?,?,?,?)`,
          args: ['The Attention Economy and Why You Feel Exhausted','Every app is optimised to capture your attention.',
            '<p>Your attention is finite.</p>',JSON.stringify(['technology','culture']),4,now-86400] },
        { sql: `INSERT INTO posts (title,excerpt,content,tags,read_time,created_at) VALUES (?,?,?,?,?,?)`,
          args: ['On Slowness as a Competitive Advantage','In a world optimised for speed, moving deliberately has become rare.',
            '<p>Speed is celebrated everywhere.</p>',JSON.stringify(['philosophy','productivity']),3,now-43200] }
      ]);
      console.log('[db] Seed complete.');
    }
    console.log('[db] Ready', process.env.TURSO_URL ? '(Turso cloud)' : '(local SQLite)');
    return state.db;
  } catch(e) {
    console.error('[db] Failed to initialise database:', e);
    throw e;
  }
})();

function getUserPoints(userName) {
  const row = state.db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM points WHERE user_name=?`).get(userName);
  return row ? row.total : 0;
}
function addPoints(userName, amount, reason) {
  if (!userName || userName === 'Admin' || amount === 0) return;
  state.db.prepare(`INSERT INTO points (user_name,amount,reason) VALUES (?,?,?)`).run(userName, amount, reason);
}
function getLeafEmails(branchId) {
  return state.db.prepare(`SELECT user_email FROM leaves WHERE branch_id=?`).all(branchId).map(r => r.user_email);
}
function getMergeVoters(branchId) {
  return state.db.prepare(`SELECT user_email FROM merge_votes WHERE branch_id=?`).all(branchId).map(r => r.user_email);
}
function buildBranchTree(discussionId, parentId) {
  const rows = parentId == null
    ? state.db.prepare(`SELECT * FROM branches WHERE discussion_id=? AND parent_id IS NULL ORDER BY created_at ASC`).all(discussionId)
    : state.db.prepare(`SELECT * FROM branches WHERE discussion_id=? AND parent_id=? ORDER BY created_at ASC`).all(discussionId, parentId);
  return rows.map(b => ({
    ...b,
    leaves:     getLeafEmails(b.id),
    mergeVotes: getMergeVoters(b.id),
    children:   buildBranchTree(b.discussion_id, b.id)
  }));
}
function getLeaderboard() {
  return state.db.prepare(`SELECT user_name AS name, SUM(amount) AS total FROM points GROUP BY user_name ORDER BY total DESC LIMIT 10`).all();
}

module.exports = {
  get db() { return state.db; },
  dbReady,
  getUserPoints,
  addPoints,
  buildBranchTree,
  getLeaderboard
};
