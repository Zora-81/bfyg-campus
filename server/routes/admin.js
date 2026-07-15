// 管理后台路由
const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

// 用户列表（分页 + 搜索）
router.get('/users', authRequired, adminRequired, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const role = req.query.role || '';
  const status = req.query.status || '';
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (search) {
    where.push('(u.username LIKE ? OR u.nickname LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role) {
    where.push('u.role = ?');
    params.push(role);
  }
  if (status) {
    where.push('u.status = ?');
    params.push(status);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.get(`SELECT COUNT(*) as cnt FROM users u ${whereClause}`, params);
  const users = db.all(
    `SELECT id, username, nickname, avatar_url, role, status, created_at
     FROM users u ${whereClause}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json({
    users,
    total: total.cnt,
    page,
    totalPages: Math.ceil(total.cnt / limit)
  });
});

// 修改用户状态/角色
router.patch('/users/:id', authRequired, adminRequired, (req, res) => {
  const userId = parseInt(req.params.id);
  const { status, role } = req.body;

  const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (status) {
    db.run('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
  }
  if (role) {
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  }

  const updated = db.get(
    'SELECT id, username, nickname, avatar_url, role, status, created_at FROM users WHERE id = ?',
    [userId]
  );
  console.log(`[admin] ${req.user.username} 修改了用户 ${updated.username}: status=${status} role=${role}`);
  res.json({ user: updated });
});

// 数据看板统计
router.get('/stats', authRequired, adminRequired, (req, res) => {
  const userCount = db.get('SELECT COUNT(*) as cnt FROM users');
  const activeToday = db.get(
    "SELECT COUNT(DISTINCT author_id) as cnt FROM messages WHERE created_at >= datetime('now','-1 day')"
  );
  const msgCount = db.get('SELECT COUNT(*) as cnt FROM messages');
  const msgToday = db.get(
    "SELECT COUNT(*) as cnt FROM messages WHERE created_at >= datetime('now','-1 day')"
  );
  const channelCount = db.get('SELECT COUNT(*) as cnt FROM channels');

  // 最近 7 天消息趋势
  const trend = db.all(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM messages
    WHERE created_at >= datetime('now','-7 days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `);

  // 最近活动
  const recent = db.all(`
    SELECT m.content, m.created_at, u.username, u.nickname, c.name as channel_name
    FROM messages m
    JOIN users u ON m.author_id = u.id
    JOIN channels c ON m.channel_id = c.id
    ORDER BY m.id DESC LIMIT 10
  `);

  res.json({
    stats: {
      userCount: userCount.cnt,
      activeToday: activeToday.cnt,
      msgCount: msgCount.cnt,
      msgToday: msgToday.cnt,
      channelCount: channelCount.cnt
    },
    trend,
    recent
  });
});

// ── 帖子审核 ──────────────────────────────────────

// 获取帖子列表（分页 + 频道筛选 + 搜索）
router.get('/posts', authRequired, adminRequired, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const channelId = parseInt(req.query.channelId) || 0;
  const search = req.query.search || '';
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (channelId > 0) {
    where.push('m.channel_id = ?');
    params.push(channelId);
  }
  if (search) {
    where.push('m.content LIKE ?');
    params.push(`%${search}%`);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.get(`SELECT COUNT(*) as cnt FROM messages m ${whereClause}`, params);
  const posts = db.all(`
    SELECT m.*, u.username, u.nickname, c.name as channel_name
    FROM messages m
    JOIN users u ON m.author_id = u.id
    JOIN channels c ON m.channel_id = c.id
    ${whereClause}
    ORDER BY m.id DESC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  res.json({
    posts,
    total: total.cnt,
    page,
    totalPages: Math.ceil(total.cnt / limit)
  });
});

// 删除帖子
router.delete('/posts/:id', authRequired, adminRequired, (req, res) => {
  const msgId = parseInt(req.params.id);
  const msg = db.get('SELECT * FROM messages WHERE id = ?', [msgId]);
  if (!msg) return res.status(404).json({ error: '帖子不存在' });

  db.run('DELETE FROM messages WHERE id = ?', [msgId]);
  console.log(`[admin] ${req.user.username} 删除了帖子 ${msgId}`);
  res.json({ success: true });
});

// 批量删除
router.post('/posts/batch-delete', authRequired, adminRequired, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要删除的帖子' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
  console.log(`[admin] ${req.user.username} 批量删除了 ${ids.length} 个帖子`);
  res.json({ success: true, deleted: ids.length });
});

// 获取所有频道（供审核筛选用）
router.get('/channels', authRequired, adminRequired, (req, res) => {
  const channels = db.all('SELECT id, name FROM channels ORDER BY id');
  res.json({ channels });
});

module.exports = router;
