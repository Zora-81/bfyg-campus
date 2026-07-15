// 服务入口 — Express + Socket.io
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

// ===== 初始化数据库 =====
async function start() {
  await db.initDatabase();
  db.startAutoSave();

  // 自动种子数据（首次运行）
  const userCount = db.get('SELECT COUNT(*) as cnt FROM users');
  if (userCount.cnt === 0) {
    console.log('[server] 首次运行，写入种子数据...');
    require('./seed-auto')(db);
  }

  // ===== Express =====
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  // 安全响应头（无需外部依赖）
  app.use((req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json());

  // CORS：默认同源部署无需跨域；拆域部署时通过 ALLOWED_ORIGIN 配置前端域名
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
  if (ALLOWED_ORIGIN) {
    console.log('[cors] 已启用跨域，允许来源:', ALLOWED_ORIGIN);
  }

  // 静态文件服务（容器/云托管中由本服务直接提供，无外部 Nginx 时也能运行）
  const staticDir = process.env.STATIC_DIR || path.join(__dirname, '..', 'html');
  app.use(express.static(staticDir));
  app.use('/images', express.static(path.join(__dirname, '..', 'images')));
  app.use('/css', express.static(path.join(__dirname, '..', 'css')));
  app.use('/js', express.static(path.join(__dirname, '..', 'js')));

  // 健康检查
  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // API 路由
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/channels', require('./routes/channels'));
  app.use('/api/messages', require('./routes/messages').router);
  app.use('/api/upload', require('./routes/upload'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/admin', require('./routes/admin'));
  // 上传文件目录：必须与 upload.js 的落盘路径一致（跟随 PERSIST_DIR），
  // 否则持久化卷挂载后图片会 404。
  const uploadsStaticDir = process.env.PERSIST_DIR
    ? path.join(process.env.PERSIST_DIR, 'uploads')
    : path.join(__dirname, 'uploads');
  app.use('/uploads', express.static(uploadsStaticDir));

  // SPA fallback — 所有非 /api 请求返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(staticDir, 'index.html'));
    }
  });

  // ===== Socket.io =====
  // 同源部署默认不开放跨域；拆域时通过 ALLOWED_ORIGIN 配置
  const ioOpts = {};
  if (ALLOWED_ORIGIN) {
    ioOpts.cors = { origin: ALLOWED_ORIGIN.split(','), methods: ['GET', 'POST'] };
  }
  const io = new Server(server, ioOpts);

  // 消息频率限制
  const rateLimits = new Map(); // userId -> {channelId: [{timestamp}]}

  function checkRateLimit(userId, channelId) {
    const now = Date.now();
    if (!rateLimits.has(userId)) {
      rateLimits.set(userId, new Map());
    }
    const userLimits = rateLimits.get(userId);
    if (!userLimits.has(channelId)) {
      userLimits.set(channelId, []);
    }
    const timestamps = userLimits.get(channelId);
    // 清理 1 秒前的记录
    const recent = timestamps.filter(t => now - t < 1000);
    userLimits.set(channelId, recent);
    if (recent.length >= 3) return false; // 每秒最多 3 条
    recent.push(now);
    return true;
  }

  // Socket 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('未登录'));
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.userId = payload.id;
      socket.username = payload.username;
      socket.userRole = payload.role;
      next();
    } catch (e) {
      return next(new Error('登录已过期'));
    }
  });

  // 在线用户追踪
  const onlineUsers = new Map(); // socketId -> {userId, username}
  const channelRooms = new Map(); // channelId -> Set<socketId>

  io.on('connection', (socket) => {
    const userId = socket.userId;
    onlineUsers.set(socket.id, { userId, username: socket.username });
    console.log(`[ws] ${socket.username} (id=${userId}) 上线`);

    // 通知所有人有人上线
    io.emit('user-online', { userId, username: socket.username });

    // 加入频道
    socket.on('join-channel', (channelId) => {
      const room = `channel:${channelId}`;
      socket.join(room);
      if (!channelRooms.has(channelId)) {
        channelRooms.set(channelId, new Set());
      }
      channelRooms.get(channelId).add(socket.id);
      console.log(`[ws] ${socket.username} 进入频道 ${channelId}`);
    });

    // 离开频道
    socket.on('leave-channel', (channelId) => {
      const room = `channel:${channelId}`;
      socket.leave(room);
      if (channelRooms.has(channelId)) {
        channelRooms.get(channelId).delete(socket.id);
      }
      console.log(`[ws] ${socket.username} 离开频道 ${channelId}`);
    });

    // 发送消息
    socket.on('send-message', (data) => {
      const { channelId, content, contentType } = data;
      const type = contentType || 'text';
      if (!channelId || !content || (type === 'text' && content.trim().length === 0)) return;

      // 频率限制
      if (!checkRateLimit(userId, channelId)) {
        socket.emit('error-msg', '发送太快，请稍候');
        return;
      }

      // 数据层统一存储「原始文本」（不转义）。HTML 转义责任交给前端渲染时统一处理，
      // 避免双重转义、并保留可被搜索/编辑/通知引用的原始内容。
      const safe = content.trim().substring(0, type === 'text' ? 2000 : 500);

      db.run(
        'INSERT INTO messages (channel_id, author_id, content, content_type) VALUES (?,?,?,?)',
        [channelId, userId, safe, type]
      );
      const msgId = db.lastId();

      const msg = db.get(`
        SELECT m.*, u.username, u.nickname, u.avatar_url
        FROM messages m JOIN users u ON m.author_id = u.id
        WHERE m.id = ?
      `, [msgId]);

      // 广播给频道内所有人
      io.to(`channel:${channelId}`).emit('new-message', msg);

      // ── @提醒 ─────────────────────────────────
      if (type === 'text') {
        const mentionRegex = /@(\S+?)(?=\s|$)/g;
        const mentioned = [];
        let m;
        while ((m = mentionRegex.exec(content.trim())) !== null) {
          mentioned.push(m[1]);
        }
        if (mentioned.length > 0) {
          const uniqueMentions = [...new Set(mentioned)];
          uniqueMentions.forEach(mentionedUsername => {
            const target = db.get('SELECT id, username FROM users WHERE username = ?', [mentionedUsername]);
            if (target && target.id !== userId) {
              db.run(
                'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)',
                [target.id, 'mention',
                 socket.username + ' 在频道中@了你',
                 content.trim().substring(0, 100),
                 '/channel/' + channelId]
              );
              // 如果被@用户在线，实时推送通知
              const nId = db.lastId();
              onlineUsers.forEach((user, sockId) => {
                if (user.userId === target.id) {
                  io.to(sockId).emit('new-notification', {
                    id: nId,
                    type: 'mention',
                    title: socket.username + ' @了你',
                    body: content.trim().substring(0, 50)
                  });
                }
              });
            }
          });
        }
      }
    });

    // 断开连接
    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);

      // 从所有频道房间移除
      channelRooms.forEach((sockets, chId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) channelRooms.delete(chId);
      });

      console.log(`[ws] ${socket.username} 离线`);
      io.emit('user-offline', { userId });
    });
  });

  // 进程退出时保存数据库
  process.on('SIGINT', () => {
    console.log('\n[server] 正在关闭...');
    db.stopAutoSave();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    db.stopAutoSave();
    process.exit(0);
  });

  server.listen(PORT, () => {
    console.log(`\n  🏫 宝丰一高校园频道服务已启动`);
    console.log(`  📡 HTTP:        http://localhost:${PORT}`);
    console.log(`  🔌 WebSocket:   ws://localhost:${PORT}`);
    console.log(`  👤 测试账号:    admin / admin123\n`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
