'use strict';

const router   = require('express').Router();
const dbModule = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../auth');

function db() { return dbModule.db; }

async function formatPost(row, userEmail) {
  userEmail = (userEmail || '').toLowerCase();
  const likes    = await db().prepare(`SELECT user_email FROM post_likes WHERE post_id=?`).all(row.id);
  const likeEmails = likes.map(r => r.user_email);
  const comments = await db().prepare(`SELECT id,author,author_email,text,created_at FROM comments WHERE post_id=? ORDER BY created_at ASC`).all(row.id);
  return {
    id:        row.id,
    title:     row.title,
    excerpt:   row.excerpt,
    content:   row.content,
    tags:      JSON.parse(row.tags || '[]'),
    readTime:  row.read_time,
    createdAt: row.created_at * 1000,
    likes:     likeEmails,
    liked:     userEmail ? likeEmails.includes(userEmail) : false,
    comments:  comments.map(c => ({ id: c.id, author: c.author, authorEmail: c.author_email, text: c.text, createdAt: c.created_at * 1000 }))
  };
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, tag } = req.query;
    const userEmail = req.user?.email || null;
    let rows;
    if (q && q.trim().length >= 2) {
      const like = `%${q.trim().toLowerCase()}%`;
      rows = await db().prepare(`SELECT * FROM posts WHERE lower(title) LIKE ? OR lower(excerpt) LIKE ? OR lower(tags) LIKE ? ORDER BY created_at DESC`).all(like, like, like);
    } else if (tag) {
      rows = await db().prepare(`SELECT * FROM posts WHERE lower(tags) LIKE ? ORDER BY created_at DESC`).all(`%"${tag.toLowerCase()}"%`);
    } else {
      rows = await db().prepare(`SELECT * FROM posts ORDER BY created_at DESC`).all();
    }
    res.json(await Promise.all(rows.map(r => formatPost(r, userEmail))));
  } catch (err) { console.error('[GET /posts]', err); res.status(500).json({ error: 'Could not load posts.' }); }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const row = await db().prepare(`SELECT * FROM posts WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Post not found.' });
    res.json(await formatPost(row, req.user?.email));
  } catch (err) { console.error('[GET /posts/:id]', err); res.status(500).json({ error: 'Could not load post.' }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, tags, readTime } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' });
    const tagsArr = Array.isArray(tags) ? tags : (tags||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
    const info = await db().prepare(`INSERT INTO posts (title,excerpt,content,tags,read_time) VALUES (?,?,?,?,?)`).run(
      title.trim(), (excerpt||'').trim()||title.trim().slice(0,120), content.trim(), JSON.stringify(tagsArr), parseInt(readTime)||3);
    const newPost = await db().prepare(`SELECT * FROM posts WHERE id=?`).get(info.lastInsertRowid);
    if (!newPost) return res.status(500).json({ error: 'Post created but could not be retrieved.' });
    res.status(201).json(await formatPost(newPost, req.user.email));
  } catch (err) { console.error('[POST /posts]', err); res.status(500).json({ error: 'Could not create post.' }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, tags, readTime } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' });
    if (!await db().prepare(`SELECT id FROM posts WHERE id=?`).get(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
    const tagsArr = Array.isArray(tags) ? tags : (tags||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
    await db().prepare(`UPDATE posts SET title=?,excerpt=?,content=?,tags=?,read_time=? WHERE id=?`).run(
      title.trim(), (excerpt||'').trim()||title.trim().slice(0,120), content.trim(), JSON.stringify(tagsArr), parseInt(readTime)||3, req.params.id);
    const updated = await db().prepare(`SELECT * FROM posts WHERE id=?`).get(req.params.id);
    res.json(await formatPost(updated, req.user.email));
  } catch (err) { console.error('[PUT /posts/:id]', err); res.status(500).json({ error: 'Could not update post.' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!await db().prepare(`SELECT id FROM posts WHERE id=?`).get(req.params.id)) return res.status(404).json({ error: 'Post not found.' });
    await db().prepare(`DELETE FROM posts WHERE id=?`).run(req.params.id);
    await db().prepare(`DELETE FROM comments WHERE post_id=?`).run(req.params.id);
    await db().prepare(`DELETE FROM post_likes WHERE post_id=?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) { console.error('[DELETE /posts/:id]', err); res.status(500).json({ error: 'Could not delete post.' }); }
});

router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const postId    = req.params.id;
    const userEmail = req.user.email.toLowerCase();
    const existing  = await db().prepare(`SELECT 1 FROM post_likes WHERE post_id=? AND user_email=?`).get(postId, userEmail);
    if (existing) {
      await db().prepare(`DELETE FROM post_likes WHERE post_id=? AND user_email=?`).run(postId, userEmail);
    } else {
      await db().prepare(`INSERT INTO post_likes (post_id,user_email) VALUES (?,?)`).run(postId, userEmail);
    }
    const likes = await db().prepare(`SELECT user_email FROM post_likes WHERE post_id=?`).all(postId);
    const likeEmails = likes.map(r => r.user_email);
    res.json({ ok: true, liked: !existing, likeCount: likeEmails.length, likes: likeEmails });
  } catch (err) { console.error('[POST /posts/:id/like]', err); res.status(500).json({ error: 'Could not toggle like.' }); }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
    const postId = req.params.id;
    if (!await db().prepare(`SELECT id FROM posts WHERE id=?`).get(postId)) return res.status(404).json({ error: 'Post not found.' });
    const info    = await db().prepare(`INSERT INTO comments (post_id,author,author_email,text) VALUES (?,?,?,?)`).run(
      postId, req.user.name, req.user.email.toLowerCase(), text.trim());
    const comment = await db().prepare(`SELECT * FROM comments WHERE id=?`).get(info.lastInsertRowid);
    if (!comment) return res.status(500).json({ error: 'Comment created but could not be retrieved.' });
    res.status(201).json({ id: comment.id, author: comment.author, authorEmail: comment.author_email, text: comment.text, createdAt: comment.created_at * 1000 });
  } catch (err) { console.error('[POST /posts/:id/comments]', err); res.status(500).json({ error: 'Could not post comment.' }); }
});

router.delete('/:id/comments/:cid', requireAuth, async (req, res) => {
  try {
    const comment = await db().prepare(`SELECT * FROM comments WHERE id=? AND post_id=?`).get(req.params.cid, req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    const isOwner = comment.author_email === req.user.email.toLowerCase();
    if (!req.user.isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed.' });
    await db().prepare(`DELETE FROM comments WHERE id=?`).run(req.params.cid);
    res.json({ ok: true });
  } catch (err) { console.error('[DELETE /comments/:cid]', err); res.status(500).json({ error: 'Could not delete comment.' }); }
});

module.exports = router;
