// 消息路由
const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// HTML 转义（防 XSS）
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 获取消息（分页，每页 50 条）
router.get('/:channelId', authRequired, (req, res) => {
  const channelId = parseInt(req.params.channelId);
  const before = parseInt(req.query.before) || 0; // 消息 ID 游标分页
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);

  let sql = `
    SELECT m.*, u.username, u.nickname, u.avatar_url
    FROM messages m
    JOIN users u ON m.author_id = u.id
    WHERE m.channel_id = ?
  `;
  const params = [channelId];

  if (before > 0) {
    sql += ' AND m.id < ?';
    params.push(before);
  }

  sql += ' ORDER BY m.id DESC LIMIT ?';
  params.push(limit);

  const messages = db.all(sql, params);
  // 反转回正序
  messages.reverse();

  // 标记 pinned 消息
  const pinned = messages.filter(m => m.is_pinned);
  const regular = messages.filter(m => !m.is_pinned);

  res.json({ messages: regular, pinned, total: messages.length });
});

// ── 发送消息（REST 兜底，与 WebSocket send-message 行为一致）──
const postRateLimits = new Map(); // userId -> {channelId: [timestamps]}
function checkPostRateLimit(userId, channelId) {
  const now = Date.now();
  if (!postRateLimits.has(userId)) postRateLimits.set(userId, new Map());
  const userLimits = postRateLimits.get(userId);
  if (!userLimits.has(channelId)) userLimits.set(channelId, []);
  const ts = userLimits.get(channelId).filter(t => now - t < 1000);
  userLimits.set(channelId, ts);
  if (ts.length >= 3) return false; // 每秒最多 3 条
  ts.push(now);
  return true;
}

router.post('/:channelId', authRequired, (req, res) => {
  const channelId = parseInt(req.params.channelId);
  const { content, contentType } = req.body || {};
  const type = contentType || 'text';
  if (!channelId || !content || (type === 'text' && content.trim().length === 0)) {
    return res.status(400).json({ error: '内容和频道不能为空' });
  }
  // 公告频道仅限管理员发言
  const ch = db.get('SELECT type FROM channels WHERE id = ?', [channelId]);
  if (ch && ch.type === 'announcement' && req.user.role !== 'admin') {
    return res.status(403).json({ error: '公告频道仅限管理员发言' });
  }
  if (!checkPostRateLimit(req.user.id, channelId)) {
    return res.status(429).json({ error: '发送太快，请稍候' });
  }
  // 数据层统一存储原始文本（不转义），转义责任交给前端渲染
  const safe = content.trim().substring(0, type === 'text' ? 2000 : 500);
  db.run(
    'INSERT INTO messages (channel_id, author_id, content, content_type) VALUES (?,?,?,?)',
    [channelId, req.user.id, safe, type]
  );
  const msgId = db.lastId();
  const msg = db.get(`
    SELECT m.*, u.username, u.nickname, u.avatar_url
    FROM messages m JOIN users u ON m.author_id = u.id
    WHERE m.id = ?
  `, [msgId]);
  res.status(201).json({ message: msg });
});

// 删除消息（仅作者或 admin）
router.delete('/:id', authRequired, (req, res) => {
  const msgId = parseInt(req.params.id);
  const msg = db.get('SELECT * FROM messages WHERE id = ?', [msgId]);

  if (!msg) {
    return res.status(404).json({ error: '消息不存在' });
  }

  if (msg.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权删除此消息' });
  }

  db.run('DELETE FROM messages WHERE id = ?', [msgId]);
  console.log(`[messages] 消息 ${msgId} 已被 ${req.user.username} 删除`);
  res.json({ success: true });
});

// 编辑消息（仅作者，存原始文本）
router.patch('/:id', authRequired, (req, res) => {
  const msgId = parseInt(req.params.id);
  const msg = db.get('SELECT * FROM messages WHERE id = ?', [msgId]);
  if (!msg) return res.status(404).json({ error: '消息不存在' });
  if (msg.author_id !== req.user.id) {
    return res.status(403).json({ error: '只能编辑自己的消息' });
  }
  const { content } = req.body || {};
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: '内容不能为空' });
  }
  const safe = content.trim().substring(0, 2000);
  db.run('UPDATE messages SET content = ? WHERE id = ?', [safe, msgId]);
  const updated = db.get(`
    SELECT m.*, u.username, u.nickname, u.avatar_url
    FROM messages m JOIN users u ON m.author_id = u.id
    WHERE m.id = ?
  `, [msgId]);
  res.json({ message: updated });
});

// 置顶 / 取消置顶（作者或 admin，切换 is_pinned）
router.patch('/:id/pin', authRequired, (req, res) => {
  const msgId = parseInt(req.params.id);
  const msg = db.get('SELECT * FROM messages WHERE id = ?', [msgId]);
  if (!msg) return res.status(404).json({ error: '消息不存在' });
  if (msg.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权操作' });
  }
  const newPin = msg.is_pinned ? 0 : 1;
  db.run('UPDATE messages SET is_pinned = ? WHERE id = ?', [newPin, msgId]);
  res.json({ success: true, is_pinned: !!newPin });
});

module.exports = { router, escapeHtml };
