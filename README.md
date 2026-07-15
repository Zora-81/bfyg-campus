# 宝丰一高校园频道

校园社交平台 —— 登录(银河背景+3D轮播+流星雨) + QQ频道风格实时聊天 + 后台管理。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | 原生 HTML/CSS/JS + Socket.io 客户端 |
| 后端 | Node.js + Express + Socket.io |
| 数据库 | SQLite (sql.js WASM) |
| 认证 | JWT + bcrypt |
| 部署 | Docker + Nginx |

## 项目结构

```
├── html/
│   ├── index.html          # 主页面（登录+频道聊天）
│   └── admin.html          # 后台管理（用户/帖子/看板）
├── css/
│   ├── style.css           # 主样式 + 设计 token 体系
│   └── admin.css           # 后台管理专属样式
├── js/
│   ├── app.js              # 主逻辑（聊天/认证/轮播/通知）
│   ├── admin.js            # 后台管理逻辑
│   ├── shooting-stars.js   # 登录页流星雨动画
│   └── main-bg.js          # 聊天背景漂浮光点
├── images/
│   ├── school-badge-new.png  # 校徽
│   ├── school-night.jpg     # 学校夜景（登录页背景）
│   └── campus-01~04.jpg     # 校园风光（登录轮播卡片）
├── server/
│   ├── index.js            # Express + Socket.io 主入口
│   ├── db.js               # SQLite 数据库封装
│   ├── seed-auto.js        # 自动种子数据
│   ├── middleware/auth.js   # JWT 鉴权中间件
│   └── routes/             # REST API 路由
│       ├── auth.js         # 注册/登录
│       ├── channels.js     # 频道管理
│       ├── messages.js     # 消息收发
│       ├── upload.js       # 图片/文件上传
│       ├── notifications.js # 通知系统
│       └── admin.js        # 后台管理 API
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── docs/
    └── 2026-06-26-production-architecture.md
```

## 功能

- 注册/登录（JWT 认证，支持中文用户名）
- 多频道实时文字聊天（Socket.io）
- 图片/文件上传预览
- @成员提醒 + 通知系统（铃铛未读）
- 响应式设计（移动端折叠侧栏）
- 后台管理：用户管理 / 帖子审核 / 数据看板

## 本地运行

```bash
cd server
npm install
node index.js
# 访问 http://localhost:3000
```

默认管理账号：`admin` / `admin123`

## 部署

> ⚠️ 部署前必须准备 `.env` 文件：复制 `.env.example` 为 `.env`，并设置一个足够强且随机的 `JWT_SECRET`。仓库内的 `docker-compose.yml` 不再硬编码密钥。

```bash
cp .env.example .env      # 编辑并填入真实 JWT_SECRET
docker-compose up -d --build
```

- Nginx 接管 80 端口，静态文件 + API 反向代理 + WebSocket 升级。
- 数据库 `data.db` 与上传文件 `uploads/` 通过命名卷 `server-data` 持久化到 `/app/data`，
  **不会**再覆盖容器内应用代码（旧配置挂载到 `/app` 会导致启动失败）。
- 升级时重新 `docker-compose up -d --build` 即可，数据卷不受影响。

### 健康检查

```bash
curl http://localhost/health   # 应返回 {"status":"ok",...}
```
