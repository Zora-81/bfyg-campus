# 消息撤回功能设计（2026-07-20）

> 目标：频道内消息支持撤回。普通成员只能撤回**自己**发送且**1 分钟内**的消息；管理员可随时撤回**任何**消息。当前无任何撤回功能，从零实现。

## 1. 权限规则（核心）

| 角色 | 可撤回范围 | 时间限制 |
|------|-----------|----------|
| 普通成员 | 仅自己发送的消息 | 发送后 **60 秒**内 |
| 管理员（role=admin） | 任何人的消息 | 无限制（随时） |

- 越权尝试（别人的消息 / 自己的但超 1 分钟 / 非管理员）→ **前端不显示撤回按键** + **后端 RLS 二次拦截**（防绕过）。
- 公告频道已有「仅管理员发言」限制，撤回规则与之叠加：在公告频道非管理员只能撤自己 1 分钟内，管理员可撤任意。

## 2. 交互与 UI（长按浮现撤回按键）

- **触发方式**：
  - 移动端：长按消息气泡约 `500ms` 触发。
  - 桌面端：右键（`contextmenu`）或长按 `500ms` 触发。
- **浮现元素**：在消息气泡旁（右侧或右上角）出现一个轻量「撤回」小工具条/按钮，**仅当当前用户有权撤回这条消息时才出现**。
- **点击「撤回」** → 执行撤回；点击空白/其他处自动消失。
- 不改动现有底部 👁/♥/💬/🔁 互动栏（沿用方案：不内联到互动栏）。
- 评论（parent_id 非空的回复）本期**不提供撤回**（YAGNI，避免子回复 orphan），仅顶层消息支持。

## 3. 数据模型（软删除 + 角色可见性）

在 `public.messages` 表新增字段（迁移 SQL）：

```sql
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_recalled  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recalled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recalled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

- 撤回 = `UPDATE` 该消息 `is_recalled=true, recalled_at=now(), recalled_by=<uid>`。
- **可见性规则**（实现"其他人不可见、管理员除外"的关键）：
  - 普通成员：渲染前若 `msg.is_recalled && !isAdmin` → 该消息**不渲染**（等同彻底删除）。
  - 管理员：`is_recalled=true` 的消息仍渲染，显示为灰色「**XXX 撤回了一条消息**」占位（XXX=撤回者昵称）。
- 不物理删除行 → 可追溯、可逆、实时同步简单。

## 4. 后端 API 与 RLS

- InsForge CLI 拒绝 `CREATE FUNCTION`，撤回走**直表 UPDATE**（同现有直插表思路）：
  - `PATCH /api/database/records/messages?id=eq.<msgId>`
  - body：`{ "is_recalled": true, "recalled_at": "<ISO8601>", "recalled_by": "<uid>" }`
  - 认证头：`apikey` + `Authorization: Bearer <accessToken>`（复用 `if-client.js` 现有封装）。
- **RLS 策略**（新迁移）：在 `messages` 上新增 UPDATE 策略，`WITH CHECK` 限定只有以下情况可把 `is_recalled` 置真：
  - `auth.uid() = author_id AND NOW() - created_at < interval '1 minute'`（自己 + 1 分钟内）
  - `OR public.is_admin()`（管理员）
- 前端计时器仅作体验优化，后端 RLS 为真正安全闸门。

## 5. 实时同步

- 依赖 InsForge Realtime 对 `messages` 表的 **UPDATE 事件**（CDC）。现有 `new_message` 事件说明客户端已订阅该表，UPDATE 同理投递。
- 所有订阅该频道的客户端收到 UPDATE → 前端定位对应节点：
  - 普通成员：从 `channelMessages` 数组与 DOM 移除该节点。
  - 管理员：节点就地变为「已撤回」灰色占位。
- 撤回者自己：乐观更新，点击后立即本地隐藏/占位，不等回包；失败则 toast 并回滚。

## 6. 前端渲染改动

- `buildMessageGroup(msg)` 开头增加判断：
  - `if (msg.is_recalled && !isAdmin(currentUser)) return null;`（非管理员看不到已撤回消息）
  - `if (msg.is_recalled && isAdmin(currentUser))` → 渲染灰色占位卡片，跳过原内容/互动栏。
- 给消息 `msg-group` 绑定：长按（pointer/touch 500ms）+ 右键 `contextmenu` → 检测权限后浮现「撤回」按键。
- 新增 `canRecall(msg)` 工具：`(currentUser.id===msg.author_id && 时间差<60s) || currentUser.role==='admin'`。
- 新增 `recallMessage(msgId)`：调 PATCH → 乐观更新 → 发/等实时事件。
- 1 分钟倒计时：消息渲染时若 `canRecall` 为真且是"自己+限时"情形，启动一个 `setTimeout(60s)` 让撤回按键到时自动消失（重渲染该节点或仅移除按键）。

## 7. 边界与异常

- 网络失败：`recallMessage` catch → toast「撤回失败」+ 回滚乐观隐藏。
- 并行/重复点击：撤回中加锁（如 `msg._recalling` 标志），防止重复 PATCH。
- 实时事件缺失兜底：若个别客户端未收到 UPDATE，下次 `renderMessages()`（切频道/刷新）会按 `is_recalled` 重新过滤，最终一致。
- 管理员撤回后普通成员已在屏上的旧节点：依赖实时 UPDATE 移除；若实时未达，切频道重载即消失（已物理置位）。

## 8. 测试清单

1. 普通成员撤自己 **1 分钟内**消息 → 成功，他人实时看不到。
2. 普通成员撤自己 **超 1 分钟** → 不显示按键；若强制造 HTTP 请求，后端 RLS 拒。
3. 普通成员长按 **他人**消息 → 不显示撤回按键。
4. 管理员撤 **任意人 / 任意时间**消息 → 成功。
5. 管理员视图：被撤回消息显示「XXX 撤回了一条消息」灰色占位。
6. 公告频道：非管理员只能撤自己 1 分钟内；管理员可撤任意。
7. 移动端长按触发、桌面端右键/长按触发均正常；点击空白消失。
8. 网络失败有 toast 且不破坏消息列表。

## 9. 交付步骤（实现阶段）

1. 迁移 SQL：`migrations/2026-07-20-message-recall.sql`（加字段 + RLS 策略）。
2. `js/app.js`：canRecall / recallMessage / 长按&右键绑定 / buildMessageGroup 可见性分支 / 管理员占位渲染 / 实时 UPDATE 监听。
3. `css/style.css`：撤回小工具条样式 + 已撤回占位样式。
4. `node _build.mjs` 构建 → `wrangler pages deploy` 上线（参考部署笔记）。
5. 迁移用 InsForge CLI 执行。
