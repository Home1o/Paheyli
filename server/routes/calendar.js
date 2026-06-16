'use strict';

// Calendar API (ported from Cadence).
// Every row is scoped to the authenticated user's email, so each account
// gets its own private calendar, tasks, habits, projects and completions.

const router    = require('express').Router();
const dbModule  = require('../db');
const { requireAuth } = require('../auth');

function db() { return dbModule.db; }

// All calendar routes require a logged-in, verified user.
router.use(requireAuth);
router.use((req, res, next) => {
  if (!req.user || !req.user.email) return res.status(401).json({ error: 'Login required.' });
  req.email = req.user.email.toLowerCase();
  next();
});

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error('[calendar]', e); res.status(500).json({ error: e.message }); }
};

/* ─── row mappers ─────────────────────────────────────────────────────────── */
const rowToItem = (r) => ({
  id: r.id,
  title: r.title,
  type: r.type,
  date: r.date || null,
  time: r.time || '',
  endTime: r.end_time || '',
  notes: r.notes || '',
  recurrence: JSON.parse(r.recurrence || '{"type":"none","days":[]}'),
  backlog: !!r.backlog,
  priority: r.priority || 'none',
  projectId: r.project_id || null,
  habitIcon: r.habit_icon || 'flame'
});
const rowToProject = (r) => ({ id: r.id, name: r.name, color: r.color, description: r.description || '' });

/* ─── items ───────────────────────────────────────────────────────────────── */
router.get('/items', wrap(async (req, res) => {
  const rows = await db().prepare(
    `SELECT * FROM cal_items WHERE user_email = ? ORDER BY created_at`
  ).all(req.email);
  res.json(rows.map(rowToItem));
}));

router.put('/items', wrap(async (req, res) => {
  const it = req.body || {};
  if (!it.id || !it.title) return res.status(400).json({ error: 'id and title are required.' });
  const rec = JSON.stringify(it.recurrence || { type: 'none', days: [] });
  await db().prepare(
    `INSERT INTO cal_items
       (user_email,id,title,type,date,time,end_time,notes,recurrence,backlog,priority,project_id,habit_icon,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))
     ON CONFLICT(user_email,id) DO UPDATE SET
       title=excluded.title, type=excluded.type, date=excluded.date, time=excluded.time,
       end_time=excluded.end_time, notes=excluded.notes, recurrence=excluded.recurrence,
       backlog=excluded.backlog, priority=excluded.priority, project_id=excluded.project_id,
       habit_icon=excluded.habit_icon, updated_at=strftime('%s','now')`
  ).run(
    req.email, it.id, it.title, it.type || 'task', it.date || null, it.time || '', it.endTime || '',
    it.notes || '', rec, it.backlog ? 1 : 0, it.priority || 'none',
    it.projectId || null, it.habitIcon || 'flame'
  );
  res.json(it);
}));

router.delete('/items/:id', wrap(async (req, res) => {
  await db().prepare(`DELETE FROM cal_completions WHERE user_email = ? AND item_id = ?`).run(req.email, req.params.id);
  await db().prepare(`DELETE FROM cal_items WHERE user_email = ? AND id = ?`).run(req.email, req.params.id);
  res.status(204).end();
}));

/* ─── projects ────────────────────────────────────────────────────────────── */
router.get('/projects', wrap(async (req, res) => {
  const rows = await db().prepare(
    `SELECT * FROM cal_projects WHERE user_email = ? ORDER BY created_at`
  ).all(req.email);
  res.json(rows.map(rowToProject));
}));

router.put('/projects', wrap(async (req, res) => {
  const p = req.body || {};
  if (!p.id || !p.name) return res.status(400).json({ error: 'id and name are required.' });
  await db().prepare(
    `INSERT INTO cal_projects (user_email,id,name,color,description) VALUES (?,?,?,?,?)
     ON CONFLICT(user_email,id) DO UPDATE SET
       name=excluded.name, color=excluded.color, description=excluded.description`
  ).run(req.email, p.id, p.name, p.color || '#5b4bdb', p.description || '');
  res.json(p);
}));

router.delete('/projects/:id', wrap(async (req, res) => {
  await db().prepare(
    `UPDATE cal_items SET project_id = NULL WHERE user_email = ? AND project_id = ?`
  ).run(req.email, req.params.id);
  await db().prepare(`DELETE FROM cal_projects WHERE user_email = ? AND id = ?`).run(req.email, req.params.id);
  res.status(204).end();
}));

/* ─── completions ─────────────────────────────────────────────────────────── */
router.get('/completions', wrap(async (req, res) => {
  const rows = await db().prepare(
    `SELECT item_id, date, status FROM cal_completions WHERE user_email = ?`
  ).all(req.email);
  const map = {};
  for (const r of rows) map[`${r.item_id}|${r.date}`] = r.status;
  res.json(map);
}));

router.post('/completions', wrap(async (req, res) => {
  const { itemId, date, status } = req.body || {};
  if (!itemId || !date) return res.status(400).json({ error: 'itemId and date are required.' });
  if (status === 'done' || status === 'skip') {
    await db().prepare(
      `INSERT INTO cal_completions (user_email,item_id,date,status) VALUES (?,?,?,?)
       ON CONFLICT(user_email,item_id,date) DO UPDATE SET status=excluded.status`
    ).run(req.email, itemId, date, status);
  } else {
    await db().prepare(
      `DELETE FROM cal_completions WHERE user_email = ? AND item_id = ? AND date = ?`
    ).run(req.email, itemId, date);
  }
  res.status(204).end();
}));

module.exports = router;
