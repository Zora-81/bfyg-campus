# 宝丰一高校园频道

校园社交平台 —— 登录页（学校夜景 + 动漫流星雨）+ QQ 频道风格实时聊天 + 后台管理。

线上地址：**https://bfgzlt.cc.cd**

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | 原生 HTML/CSS/JS | `html/` `css/` `js/` `images/`，构建后输出到 `web_build/` |
| 前端部署 | Cloudflare Pages | `bfgzlt.cc.cd` |
| API 代理 | Cloudflare Worker | `api.bfgzlt.cc.cd`，转发到 InsForge 并做内容审核 |
| 实时聊天 | Express + Socket.io | `server/` 提供房间、@提醒、通知推送 |
| 数据 & 认证 | InsForge (Postgres + Auth + Storage) | 用户/频道/消息/文件存储；Express 本地 DB 正在逐步迁移 |
| 构建 | Node.js + `_build.mjs` | 拉平路径、文件名加版本哈希、复制 `_headers` |

## 项目结构

```
├── html/
│   ├── index.html            # 主页面（登录 + 频道聊天）
│   └── admin.html            # 后台管理
├── css/
│   ├── style.css             # 主样式
│   └── admin.css             # 后台样式
├── js/
│   ├── app.js                # 主逻辑（聊天/认证/轮播/通知）
│   ├── admin.js              # 后台管理逻辑
│   ├── if-client.js          # InsForge SDK 封装（Auth/DB/Storage/Realtime）
│   ├── shooting-stars.js     # 登录页流星雨动画
│   └── main-bg.js            # 聊天背景漂浮光点
├── images/                   # 校徽、校园照片、图标
├── server/                   # Express + Socket.io + SQLite 服务
│   ├── index.js              # 服务入口
│   ├── db.js                 # SQLite 封装
│   ├── seed-auto.js          # 初始化数据
│   ├── middleware/auth.js    # JWT 鉴权
│   └── routes/               # REST API 路由
├── worker/                   # Cloudflare Worker 反代
│   ├── index.js
│   └── wrangler.toml
├── _build.mjs                # 前端构建脚本
├── deploy.sh / deploy.bat    # 一键部署脚本
└── docs/
    ├── plans/                # 进行中/待实现的设计方案
    └── archive/              # 过期文档与调研产物
```

## 本地开发

```bash
# 1. 启动 Express 后端（端口 3000）
cd server
npm install
node index.js

# 2. 直接打开 html/index.html 即可预览前端
#    登录后前端会连到 localhost:3000
```

## 部署上线

> 需要 `CLOUDFLARE_API_TOKEN` 环境变量（不提交到仓库）。

```bash
# 方式一：一键脚本
CLOUDFLARE_API_TOKEN=xxx ./deploy.sh

# 方式二：分步执行
node _build.mjs
wrangler pages deploy web_build --project-name=baofeng-campus --branch main
cd worker && wrangler deploy
```

部署完成后：
- 前端 `bfgzlt.cc.cd`：浏览器**硬刷新**（Ctrl/Cmd+Shift+R）看效果。
- Worker `api.bfgzlt.cc.cd`：秒级生效，通常无需刷新。

## 设计/规划文档

- 进行中方案：`docs/plans/`
- 过期归档：`docs/archive/`
