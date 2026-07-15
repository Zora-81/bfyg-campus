// 频道路由
const express = require('express');
const db = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

// 获取频道列表（含成员数和当前用户是否已加入）
router.get('/', authRequired, (req, res) => {
  const channels = db.all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count,
      EXISTS(SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = ?) as joined
    FROM channels c
    ORDER BY c.type ASC, c.id ASC
  `, [req.user.id]);

  res.json({ channels });
});

// 创建频道（仅 admin）
router.post('/', authRequired, adminRequired, (req, res) => {
  const { name, description, type } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: '频道名不能为空' });
  }

  const existing = db.get('SELECT id FROM channels WHERE name = ?', [name.trim()]);
  if (existing) {
    return res.status(409).json({ error: '频道名已存在' });
  }

  db.run(
    'INSERT INTO channels (name, description, type, created_by) VALUES (?,?,?,?)',
    [name.trim(), description || '', type || 'public', req.user.id]
  );
  const channel = db.get('SELECT * FROM channels WHERE name = ?', [name.trim()]);

  // 创建者自动加入
  db.run('INSERT OR IGNORE INTO channel_members (user_id, channel_id) VALUES (?,?)',
    [req.user.id, channel.id]);

  console.log(`[channels] ${req.user.username} 创建了频道: ${name}`);
  res.status(201).json({ channel: { ...channel, member_count: 1, joined: true } });
});

// 加入频道
router.post('/:id/join', authRequired, (req, res) => {
  const channelId = parseInt(req.params.id);

  const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
  if (!channel) {
    return res.status(404).json({ error: '频道不存在' });
  }

  db.run(
    'INSERT OR IGNORE INTO channel_members (user_id, channel_id) VALUES (?,?)',
    [req.user.id, channelId]
  );

  console.log(`[channels] ${req.user.username} 加入了 #${channel.name}`);
  res.json({ success: true });
});

module.exports = router;
