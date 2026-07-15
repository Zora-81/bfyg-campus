// 认证路由 — 注册 / 登录 / 获取当前用户
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ── API 级限流（防爆破）──
const loginHits = new Map();    // ip -> [timestamps]
const registerHits = new Map();

function makeLimiter(map, max, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const hits = map.get(ip) || [];
    const recent = hits.filter(t => now - t < windowMs);
    if (recent.length >= max) {
      const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    recent.push(now);
    map.set(ip, recent);
    next();
  };
}
const loginLimiter = makeLimiter(loginHits, 10, 60 * 1000);          // 登录 10 次/分钟
const registerLimiter = makeLimiter(registerHits, 5, 10 * 60 * 1000); // 注册 5 次/10 分钟

// 注册
router.post('/register', registerLimiter, (req, res) => {
  const { username, password, nickname } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度 2-20 位' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }

  const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ error: '用户名已被注册' });
  }

  const hash = bcrypt.hashSync(password, 12);
  db.run(
    'INSERT INTO users (username, password_hash, nickname) VALUES (?,?,?)',
    [username, hash, nickname || username]
  );

  const user = db.get('SELECT id, username, nickname, avatar_url, role, status FROM users WHERE username = ?', [username]);
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log(`[auth] 新用户注册: ${username} (id=${user.id})`);
  res.json({ token, user });
});

// 登录
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.status === 'banned') {
    return res.status(403).json({ error: '该账号已被封禁' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  console.log(`[auth] 用户登录: ${username}`);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      role: user.role,
      status: user.status
    }
  });
});

// 获取当前用户
router.get('/me', authRequired, (req, res) => {
  const user = db.get(
    'SELECT id, username, nickname, avatar_url, role, status FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// 修改个人资料（昵称 / 头像）
router.patch('/me', authRequired, (req, res) => {
  const { nickname, avatar_url } = req.body || {};
  const fields = [];
  const params = [];
  if (nickname !== undefined) {
    const n = String(nickname).trim();
    if (n.length === 0 || n.length > 30) {
      return res.status(400).json({ error: '昵称需 1-30 字符' });
    }
    fields.push('nickname = ?');
    params.push(n);
  }
  if (avatar_url !== undefined) {
    fields.push('avatar_url = ?');
    params.push(String(avatar_url).substring(0, 500));
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: '没有要更新的字段' });
  }
  db.run('UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?', [...params, req.user.id]);
  const user = db.get(
    'SELECT id, username, nickname, avatar_url, role, status FROM users WHERE id = ?',
    [req.user.id]
  );
  res.json({ user });
});

module.exports = router;
