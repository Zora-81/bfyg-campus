// JWT 鉴权中间件
const jwt = require('jsonwebtoken');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] 生产环境必须设置环境变量 JWT_SECRET，已拒绝启动。');
    console.error('请在部署平台配置 JWT_SECRET（强随机值，如：openssl rand -hex 32）。');
    process.exit(1);
  }
  console.warn('[WARN] 未设置 JWT_SECRET，使用内置弱密钥——仅限本地开发，生产环境务必设置！');
  JWT_SECRET = 'bfyg-campus-dev-secret'; // 仅开发兜底；生产已在上方 exit 拦截
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { authRequired, adminRequired, JWT_SECRET };
