# 宝丰一高校园频道 · CloudBase 云托管部署指南

> 部署目标：**CloudBase 云托管（容器服务）**，不是云函数。
> 代码已做好云托管适配，本指南带你把「网站项目」真正推上线。

---

## 0. 为什么是「云托管」而不是「云函数」

- 本站是 **Express + Socket.io** 全栈服务，有**长连接实时聊天**和**本地文件上传**。
- CloudBase **云函数**不支持长连接、也不持久化本地文件 → 跑不了你的站。
- 正确路线：**CloudBase 云托管（容器服务）**——把整个 Node 服务跑在容器里，平台提供域名、负载均衡、TLS、文件持久卷。

---

## 1. 代码已做的云托管适配（已提交，无需你再改）

| 文件 | 改动 | 作用 |
|------|------|------|
| `server/index.js` | 生产模式由 Node 直接 serve 前端静态 | 不再依赖外部 Nginx；修复 SPA 回退引用未定义 `staticDir` 导致 `/` 崩 500 的 bug |
| `server/db.js` | 数据库路径支持 `PERSIST_DIR` 环境变量 | `data.db` 可落到持久卷，容器重启不丢数据 |
| `server/routes/upload.js` | 上传目录支持 `PERSIST_DIR` | `uploads/` 可落到持久卷 |
| `.dockerignore` | 新增 | 排除 node_modules/docs 等，减小构建包 |
| `Dockerfile` | 已有（node:22-alpine） | 构建即用；已加 `RUN cp node_modules/animejs/lib/anime.min.js /app/js/anime.min.js` 把 anime.js 浏览器版复制进前端目录 |
| `js/anime.min.js` | 新增（手动放入） | anime.js v3.2.2 浏览器版，由 `html/index.html` 在 `app.js` 前引入，驱动登录弹窗/消息/侧栏/通知等 DOM 动画 |

> 本地默认行为不变：`PERSIST_DIR` 不设置时，`data.db` 和 `uploads/` 仍在 `server/` 目录下。

> **打包注意**：`js/anime.min.js` 是手动放进 `js/` 的源码文件（**不在** `node_modules/`），打 `deploy.zip` 时**不要**把它排除——否则线上前端会 404 找不到 anime，弹窗/动画退化（代码已做渐进增强，不会白屏但无动画）。排除清单里的 `node_modules/` 已足够，无需额外排除 `js/`。

---

## 2. 前置条件

- 腾讯云账号（你已认证）
- 一个 CloudBase 环境（新建或已有，记下**环境 ID**）
- 本机代码已就绪（`C:\Users\86150\Desktop\网站项目`）

---

## 3. 方式一：控制台上传代码包（最稳，推荐）

### 3.1 打包

在项目根目录执行，排除不必要文件：

```bash
cd C:\Users\86150\Desktop\网站项目
# Windows（PowerShell）用 7-Zip 或 WinRAR 手动压缩，排除：
#   node_modules/  .workbuddy/  docs/  server/data.db  server/uploads/  .git/
# 或 Linux/Mac / Git Bash：
zip -r deploy.zip . -x "node_modules/*" ".workbuddy/*" "docs/*" "server/data.db" "server/uploads/*" ".git/*"
```

### 3.2 创建云托管服务

1. 打开 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) → 选择你的环境 → 左侧「云托管」。
2. 首次使用按提示开通云托管。
3. 「服务管理」→ 新建服务，名称 `bfyg-campus` → 创建。

### 3.3 新建版本（上传代码包）

1. 进入 `bfyg-campus` 服务 → 「新建版本」。
2. 来源选择「**代码包**」→ 上传 `deploy.zip`。
3. 平台用仓库里的 `Dockerfile` 自动构建镜像（约 1–2 分钟）。

### 3.4 版本配置（关键）

- **监听端口**：`3000`（与 Dockerfile `EXPOSE` 一致）
- **环境变量**（务必设置）：
  - `NODE_ENV` = `production`
  - `JWT_SECRET` = 一段随机长字符串，例如 `openssl rand -hex 32` 生成（**不要用代码默认弱密钥**）
  - `PERSIST_DIR` = `/data`（数据落持久卷）
- **实例数**：建议 `1`（SQLite 单文件不适合多实例并发写）

### 3.5 挂载持久卷（数据安全，必做）

在版本「存储挂载」中：

- 类型：文件系统（CFS）/ 云托管持久化存储
- 挂载源：新建一个文件系统（容量 1 GB 足够起步）
- **容器路径**：`/data`

这样 `data.db` 和 `uploads/` 都落在 `/data`，容器重启/重建数据不丢。

### 3.6 公网访问

- 版本部署成功后，开启「公网访问」。
- 平台分配域名（形如 `*.apigw.*.tencentcs.com` 或自定义域名）。
- 记下该域名，它就是你的校园网站地址。

---

## 4. 方式二：CLI 一键（更快，仍是你的账号）

```bash
npm i -g @cloudbase/cli
tcb login            # 浏览器弹出，你扫码授权（这步我替不了）
cd C:\Users\86150\Desktop\网站项目
# 打包同上（见 3.1）
tcb run deploy --service bfyg-campus --zip deploy.zip
```

> CLI 仍需你在控制台设置**环境变量 + 挂持久卷**（这两步 CLI 不自动）。

---

## 5. 验证

部署后：

- 健康检查：`https://你的域名/health` → 返回 `{"status":"ok",...}`
- 首页：`https://你的域名/`
- 默认管理员账号：`admin` / `admin123`（首次启动自动 seed）
- 测试链路：**注册 → 登录 → 建频道 → 发消息 → 刷新页面/重启容器后数据仍在**（验证持久卷生效）

---

## 6. 注意事项

- **SQLite + 多实例**：云托管扩到多实例时，多容器写同一文件会冲突。务必保持**单实例**，或后续迁移到 CloudBase 云数据库（MySQL / 文档型）。
- **JWT_SECRET**：务必用强随机值，否则 token 可被伪造。
- **备份**：持久卷里的 `data.db` 定期下载备份（控制台文件系统处可下载）。
- **冗余清理**：之前误建的 `baofeng-campus`（云函数版）与本部署无关，可删除。

---

## 7. 回滚 / 本地验证

- 云托管每个版本独立，出问题可在控制台「版本管理」切回上一版。
- 本地用 Docker 验证构建：
  ```bash
  docker build -t bfyg .
  docker run -p 3000:3000 -e NODE_ENV=production bfyg
  # 浏览器打开 http://localhost:3000
  ```
