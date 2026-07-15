// 通知路由
const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取未读通知数
router.get('/unread-count', authRequired, (req, res) => {
  const row = db.get(
    'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  res.json({ count: row.cnt });
});

// 获取通知列表（最近 50 条）
router.get('/', authRequired, (req, res) => {
  const notifications = db.all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50',
    [req.user.id]
  );
  res.json({ notifications });
});

// 标记单条已读
router.patch('/:id/read', authRequired, (req, res) => {
  const nId = parseInt(req.params.id);
  db.run(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [nId, req.user.id]
  );
  res.json({ success: true });
});

// 全部标记已读
router.patch('/read-all', authRequired, (req, res) => {
  db.run(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  res.json({ success: true });
});

module.exports = router;
