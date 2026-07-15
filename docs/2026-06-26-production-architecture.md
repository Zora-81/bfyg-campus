# 宝丰一高校园频道 — 生产化架构设计

> 日期: 2026-06-26 | 版本: v1.0 | 作者: Finley

## 1. 规模定位

- 目标用户: 100 人（班级/社团级别）→ 可扩展至全校
- 核心场景: 文字聊天 + 频道管理 + 后台管理
- 部署: Oracle Cloud Tokyo ARM 免费实例

## 2. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | 原生 HTML/CSS/JS | 现有项目，无框架依赖 |
| 后端 | Node.js 22 + Express 4 | REST API + WebSocket |
| 数据库 | SQLite (better-sqlite3) | 零配置，百人无压力 |
| 实时通信 | Socket.io 4 | WebSocket 降级兼容 |
| 认证 | JWT + bcrypt | 7天过期，12轮加密 |
| 静态服务 | Nginx | 反向代理 /api → :3000 |
| 容器化 | Docker + docker-compose | 一键部署 |

## 3. 数据库表结构

### users
```
id            INTEGER PRIMARY KEY AUTOINCREMENT
username      TEXT UNIQUE NOT NULL    — 3-20位，允许中文/英文/数字
password_hash TEXT NOT NULL           — bcrypt 12轮
nickname      TEXT NOT NULL           — 显示昵称
avatar_url    TEXT                    — 头像URL，默认校徽
role          TEXT DEFAULT 'student'  — student | moderator | admin
status        TEXT DEFAULT 'active'   — active | banned
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

### channels
```
id            INTEGER PRIMARY KEY AUTOINCREMENT
name          TEXT UNIQUE NOT NULL    — 频道名
description   TEXT                    — 频道描述
type          TEXT DEFAULT 'public'   — public | announcement
created_by    INTEGER REFERENCES users(id)
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

### messages
```
id            INTEGER PRIMARY KEY AUTOINCREMENT
channel_id    INTEGER REFERENCES channels(id) NOT NULL
author_id     INTEGER REFERENCES users(id) NOT NULL
content       TEXT NOT NULL
is_pinned     INTEGER DEFAULT 0
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

### channel_members
```
user_id       INTEGER REFERENCES users(id)
channel_id    INTEGER REFERENCES channels(id)
joined_at     DATETIME DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (user_id, channel_id)
```

## 4. API 设计

### REST 接口
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /api/auth/register | 无 | 注册 |
| POST | /api/auth/login | 无 | 登录，返回 JWT |
| GET | /api/auth/me | JWT | 获取当前用户 |
| GET | /api/channels | JWT | 频道列表 + 成员数 |
| POST | /api/channels | JWT/admin | 创建频道 |
| POST | /api/channels/:id/join | JWT | 加入频道 |
| GET | /api/messages/:channelId | JWT | 获取消息（分页） |
| DELETE | /api/messages/:id | JWT | 删除消息 |
| GET | /api/admin/users | JWT/admin | 用户列表 |
| PATCH | /api/admin/users/:id | JWT/admin | 修改用户 |
| GET | /api/admin/stats | JWT/admin | 数据统计 |

### Socket.io 事件
```
客户端 → 服务端:
  join-channel    (channelId)        — 加入频道房间
  leave-channel   (channelId)        — 离开房间
  send-message    {channelId, content}

服务端 → 客户端:
  new-message     {msg对象}          — 广播给频道所有人
  user-online     {userId, username} — 上线广播
  user-offline    {userId}           — 离线广播
```

## 5. 安全策略

- 密码 bcrypt 12 轮哈希，数据库不存明文
- JWT 7 天过期，挂在 Authorization: Bearer 头
- 消息内容服务端 HTML 转义防 XSS
- 消息频率限制: 每人每频道每秒最多 3 条
- admin 接口双重鉴权（JWT + role check）

## 6. 部署架构

```
用户浏览器
    │
    ▼
Nginx :80
  ├─ /api/*  ──proxy──▶  Node :3000 (Express + Socket.io)
  └─ /*      ──serve──   /app/html (静态文件)
                          │
                          ▼
                     SQLite (server/data.db)
```
