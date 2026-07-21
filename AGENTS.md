# AGENTS.md

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **baofeng-campus** (API base `https://r683ebwu.ap-southeast.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->

## 混合后端说明

当前项目同时运行两套后端：

1. **InsForge BaaS**（线上主数据平台）：Auth / Postgres / Storage / Realtime / AI Gateway。
2. **Express + Socket.io + SQLite**（`server/`）：提供实时聊天房间、@提醒、通知推送等实时能力，端口 3000。

前端通过 `js/if-client.js` 连接 InsForge；聊天实时层目前仍走本地 Express，后续会逐步迁移到 InsForge Realtime。

## 部署约定

- 前端：`_build.mjs` → `web_build/` → `wrangler pages deploy web_build --project-name=baofeng-campus --branch main`
- Worker：`cd worker && wrangler deploy`
- `CLOUDFLARE_API_TOKEN` 由执行命令时通过环境变量注入，禁止硬编码或提交到仓库。
